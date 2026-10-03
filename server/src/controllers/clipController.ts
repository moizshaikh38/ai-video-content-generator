import { Response } from 'express';
import { AuthenticatedRequest, isValidUUID, ClipCandidateStatus } from '../types/index.js';
import { ClipAnalysisService } from '../services/clipAnalysisService.js';
import { isServerSupabaseConfigured } from '../utils/supabase.js';
import { logger } from '../utils/logger.js';

/**
 * POST /api/projects/:id/analyze-clips
 * Triggers AI clip analysis for a transcribed project and returns grounded clip candidates
 */
export const analyzeProjectClips = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const projectId = req.params.id;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!projectId || !isValidUUID(projectId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid project UUID is required.' });
    return;
  }

  if (!isServerSupabaseConfigured) {
    res.status(503).json({
      status: 'error',
      code: 'SERVICE_UNAVAILABLE',
      message: 'Database service is not configured.',
    });
    return;
  }

  try {
    const customNotes = typeof req.body?.customNotes === 'string' ? req.body.customNotes : undefined;
    const clipService = new ClipAnalysisService();
    const candidates = await clipService.analyzeAndPersistClips({
      projectId,
      userId,
      customNotes,
    });

    res.status(200).json({
      status: 'ok',
      projectId,
      count: candidates.length,
      candidates,
    });
  } catch (err: any) {
    logger.error('Clip analysis request failed', {
      requestId: req.requestId,
      projectId,
      userId,
      error: err.message,
      code: err.code,
    });

    if (err.code === 'CLIP_ANALYSIS_ACTIVE') {
      res.status(409).json({
        status: 'error',
        code: 'CLIP_ANALYSIS_ACTIVE',
        message: 'Clip analysis is already in progress for this video. Please wait for the current run to finish.',
      });
      return;
    }

    if (err.code === 'PROJECT_NOT_FOUND') {
      res.status(404).json({
        status: 'error',
        code: 'PROJECT_NOT_FOUND',
        message: 'Project not found or access denied.',
      });
      return;
    }

    if (err.code === 'TRANSCRIPT_NOT_FOUND') {
      res.status(404).json({
        status: 'error',
        code: 'TRANSCRIPT_NOT_FOUND',
        message: 'Transcript is not available yet. Please transcribe the video before finding clips.',
      });
      return;
    }

    if (err.code === 'CLIP_SEGMENTS_UNAVAILABLE') {
      res.status(400).json({
        status: 'error',
        code: 'CLIP_SEGMENTS_UNAVAILABLE',
        message: 'Transcript contains no timestamped segments. Cannot find clips without segment boundaries.',
      });
      return;
    }

    res.status(500).json({
      status: 'error',
      code: 'CLIP_ANALYSIS_FAILED',
      message: err.message || 'Failed to analyze video clips.',
    });
  }
};

/**
 * GET /api/projects/:id/clip-candidates
 * Returns all persisted clip candidates for the project, sorted by engagement_score DESC
 */
export const getProjectClipCandidates = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const projectId = req.params.id;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!projectId || !isValidUUID(projectId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid project UUID is required.' });
    return;
  }

  if (!isServerSupabaseConfigured) {
    res.status(503).json({
      status: 'error',
      code: 'SERVICE_UNAVAILABLE',
      message: 'Database service is not configured.',
    });
    return;
  }

  try {
    const candidates = await ClipAnalysisService.getCandidates(projectId, userId);
    res.status(200).json({
      status: 'ok',
      projectId,
      count: candidates.length,
      candidates,
    });
  } catch (err: any) {
    if (err.code === 'PROJECT_NOT_FOUND') {
      res.status(404).json({
        status: 'error',
        code: 'NOT_FOUND',
        message: 'Project not found or access denied.',
      });
      return;
    }

    logger.error('Failed to get clip candidates', {
      requestId: req.requestId,
      projectId,
      userId,
      error: err.message,
    });
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred while fetching clip candidates.',
    });
  }
};

/**
 * PATCH /api/projects/:id/clip-candidates/:candidateId
 * Update candidate status ('suggested' | 'selected' | 'dismissed')
 */
export const updateProjectClipCandidate = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const projectId = req.params.id;
  const candidateId = req.params.candidateId;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!projectId || !isValidUUID(projectId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid project UUID is required.' });
    return;
  }

  if (!candidateId || !isValidUUID(candidateId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid candidate UUID is required.' });
    return;
  }

  const { status, ...rest } = req.body || {};

  // Reject unexpected arbitrary fields for security
  if (Object.keys(rest).length > 0) {
    res.status(400).json({
      status: 'error',
      code: 'INVALID_PAYLOAD',
      message: 'Only "status" field may be updated.',
    });
    return;
  }

  const validStatuses: ClipCandidateStatus[] = ['suggested', 'selected', 'dismissed'];
  if (!status || !validStatuses.includes(status)) {
    res.status(400).json({
      status: 'error',
      code: 'INVALID_STATUS',
      message: `Invalid status "${status}". Allowed values: ${validStatuses.join(', ')}`,
    });
    return;
  }

  if (!isServerSupabaseConfigured) {
    res.status(503).json({
      status: 'error',
      code: 'SERVICE_UNAVAILABLE',
      message: 'Database service is not configured.',
    });
    return;
  }

  try {
    const candidate = await ClipAnalysisService.updateCandidateStatus(
      projectId,
      candidateId,
      userId,
      status
    );

    res.status(200).json({
      status: 'ok',
      candidate,
    });
  } catch (err: any) {
    if (err.code === 'CANDIDATE_NOT_FOUND' || err.code === 'PROJECT_NOT_FOUND') {
      res.status(404).json({
        status: 'error',
        code: 'NOT_FOUND',
        message: 'Clip candidate not found or access denied.',
      });
      return;
    }

    logger.error('Failed to update clip candidate', {
      requestId: req.requestId,
      projectId,
      candidateId,
      userId,
      error: err.message,
    });
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred while updating clip candidate.',
    });
  }
};
