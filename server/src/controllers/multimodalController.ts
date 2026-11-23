import {headObject} from '../services/objectStorageService.js';
import {multimodalKnownSourceContradiction} from '../shared/multimodalTranscriptSource.js';
import {assertTranscriptReusable} from '../services/transcriptSourceBindingService.js';
import {multimodalSourceKey} from '../shared/multimodalSourceKey.js';
import {unverifiedMultimodalSignals} from '../shared/multimodalSignalEvidence.js';
import { Response } from 'express';
import { AuthenticatedRequest, AppError, isValidUUID } from '../types/index.js';
import { dataRepository } from '../db/repositories/dataRepository.js';
import { MultimodalTimelineService } from '../services/multimodal/multimodalTimelineService.js';
import { MomentSearchService } from '../services/multimodal/momentSearchService.js';
import { VideoAnalysisWorker } from '../services/multimodal/videoAnalysisWorker.js';
import { logger } from '../utils/logger.js';

export async function findProjectMoments(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  const projectId = req.params.id || req.params.projectId;
  const { query, targetDuration, platform, minScore } = req.body || {};

  if (!userId) {
    throw new AppError('Authentication required.', 401, 'UNAUTHORIZED');
  }

  if (!projectId || !isValidUUID(projectId)) {
    throw new AppError('Invalid project ID.', 400, 'INVALID_PROJECT_ID');
  }

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    throw new AppError('Search query is required.', 400, 'INVALID_QUERY');
  }

  // 1. Verify project ownership
  const { data: project, error: projErr } = await dataRepository
    .from('projects')
    .select('id, user_id, title, source_url, storage_path')
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle();

  if (projErr || !project) {
    throw new AppError('Project not found or access denied.', 404, 'PROJECT_NOT_FOUND');
  }

  // 2. Load existing multimodal analysis
  let analysis = await MultimodalTimelineService.getFreshAnalysis(projectId, userId);

  // If no persistent multimodal analysis yet, build an on-the-fly timeline from transcript segments
  if (!analysis) {
    const { data: transcript } = await dataRepository
      .from('transcripts')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!transcript || !transcript.transcript_text) {
      throw new AppError('Transcript not available for this project.', 404, 'TRANSCRIPT_NOT_FOUND');
    }

    const sourceKey=multimodalSourceKey(project);
    if(!sourceKey)throw new AppError('Current source cannot be verified before searching this transcript.',409,'TRANSCRIPT_SOURCE_REVIEW_REQUIRED');
    await assertTranscriptReusable(transcript,sourceKey);
    const stored=await MultimodalTimelineService.getAnalysis(projectId,userId);
    if(stored?.metadata?.source_receipt){
      const head=await headObject('source',sourceKey);
      if(multimodalKnownSourceContradiction(transcript,sourceKey,head,stored.metadata.source_receipt))throw new AppError('Current source evidence contradicts this transcript. Review the source and transcript before searching.',409,'TRANSCRIPT_SOURCE_REVIEW_REQUIRED');
    }

    const rawSegments = transcript.segments || [];
    const segments = rawSegments.map((s: any) => ({
      start: Number(s.start) || 0,
      end: Number(s.end) || 0,
      text: String(s.text || ''),
      words: s.words,
    }));

    const duration = Number(transcript.duration_seconds || 60);

    const notRun=unverifiedMultimodalSignals();for(const key of Object.keys(notRun) as Array<keyof typeof notRun>)notRun[key]={status:'not-run',method:'transcript-only-fallback'};
    const fallbackTimeline = MultimodalTimelineService.fuseTimeline({
      signalEvidence:notRun,
      projectId,
      durationSeconds: duration,
      segments,
      sceneCuts: [],
      keyframes: [],
      silenceIntervals: [],
      faceIntervals: [],
      ocrStatus: 'empty',
    });

    analysis = {
      id: 'on_demand',
      project_id: projectId,
      user_id: userId,
      status: 'completed',
      timeline: fallbackTimeline,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  // 3. Search moments matching query
  const moments = MomentSearchService.findMoments({
    timeline: analysis.timeline,
    query: {
      query: query.trim(),
      targetDuration: targetDuration ? Number(targetDuration) : undefined,
      platform,
      minScore: minScore ? Number(minScore) : undefined,
    },
  });

  res.json({
    status: 'ok',
    data: {
      query: query.trim(),
      moments,
      count: moments.length,
    },
  });
}

export async function getProjectMultimodalTimeline(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const userId = req.user?.id;
  const projectId = req.params.id || req.params.projectId;

  if (!userId) {
    throw new AppError('Authentication required.', 401, 'UNAUTHORIZED');
  }

  if (!projectId || !isValidUUID(projectId)) {
    throw new AppError('Invalid project ID.', 400, 'INVALID_PROJECT_ID');
  }

  const analysis = await MultimodalTimelineService.getFreshAnalysis(projectId, userId);
  if (!analysis) {
    const stored=await MultimodalTimelineService.getAnalysis(projectId,userId);
    if(stored)throw new AppError('Stored analysis cannot be verified against the current source and transcript. Check source access or run analysis again.',409,'MULTIMODAL_ANALYSIS_UNVERIFIED');
    throw new AppError('Multimodal analysis not found for this project.', 404, 'NOT_FOUND');
  }

  res.json({
    status: 'ok',
    data: analysis,
  });
}

export async function startMultimodalAnalysis(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const userId = req.user?.id;
  const projectId = req.params.id || req.params.projectId;

  if (!userId) {
    throw new AppError('Authentication required.', 401, 'UNAUTHORIZED');
  }

  if (!projectId || !isValidUUID(projectId)) {
    throw new AppError('Invalid project ID.', 400, 'INVALID_PROJECT_ID');
  }

  // Verify project ownership
  const { data: project, error: projErr } = await dataRepository
    .from('projects')
    .select('id, user_id')
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle();

  if (projErr || !project) {
    throw new AppError('Project not found or access denied.', 404, 'PROJECT_NOT_FOUND');
  }

  const job = await VideoAnalysisWorker.enqueueJob(projectId, userId);

  // Trigger processing asynchronously in background
  setImmediate(async () => {
    try {
      await VideoAnalysisWorker.processNext();
    } catch (e: any) {
      logger.warn(`[MultimodalController] Background analysis job run notice: ${e.message}`);
    }
  });

  res.json({
    status: 'ok',
    data: {
      job,
      message: 'Multimodal video intelligence job enqueued.',
    },
  });
}

export async function getMultimodalJobStatus(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const userId = req.user?.id;
  const projectId = req.params.id || req.params.projectId;

  if (!userId) {
    throw new AppError('Authentication required.', 401, 'UNAUTHORIZED');
  }

  if (!projectId || !isValidUUID(projectId)) {
    throw new AppError('Invalid project ID.', 400, 'INVALID_PROJECT_ID');
  }

  const job = await VideoAnalysisWorker.getJobStatus(projectId, userId);

  res.json({
    status: 'ok',
    data: {
      job: job || null,
    },
  });
}
