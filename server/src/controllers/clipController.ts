import {assertRenderQuotaMaximum,assertRenderUsageCount} from '../shared/renderQuotaSnapshot.js';
import {ProEditorService} from '../services/proEditorService.js';
import {parseCandidateCreation,lookupCandidateCreation,closeCandidateCreation} from '../db/repositories/candidateCreationRepository.js';
import {prepareCandidateCreation} from '../db/repositories/clipRepository.js';
import {closeSavedRenderSubmission} from '../db/repositories/renderSubmissionCloseRepository.js';
import {parseRenderSubmission, lookupRenderSubmission} from '../db/repositories/renderSubmissionRepository.js';
import {enqueueRenderJob, assertRenderAdmissionEnabled} from '../db/repositories/renderAdmissionRepository.js';
import {editorRenderSnapshot} from '../shared/editorRenderSnapshot.js';
import {createPreviewMeasuredEnvelope} from '../services/itemShotPlanService.js';
import {newCaptionDefaults} from '../shared/newCaptionDefaults.js';
import {shotPlanOptions} from '../shared/shotPlanOptions.js';
import {candidateCompositionOptions,projectAutoCandidate} from '../shared/automaticLayoutCandidate.js';
import {storedScenePlanWindow} from '../shared/storedScenePlanWindow.js';
import {legacyFit43Plan,legacyPolicyFallback} from '../shared/automaticLayoutPolicy.js';
import {expandSceneLayoutProject} from '../shared/sceneLayoutOverrides.js';
import {assertSelectionSourceCurrent} from '../services/selectionSourceGuardService.js';

import { assertPanelViewsAssigned } from '../shared/panelLayouts.js';
import { parseRenderResolutionStrict } from '../shared/renderResolution.js';
import { isMongoConfigured, getMongoDb } from '../db/mongoClient.js';
import { dataRepository, ownerContext } from '../db/repositories/dataRepository.js';
import { Response } from 'express';
import { AuthenticatedRequest, isValidUUID, ClipCandidateStatus, ClipAspectRatio, ClipEditorUpdateDTO } from '../types/index.js';
import { ClipAnalysisService, activeClipAnalysisSet } from '../services/clipAnalysisService.js';
import { ClipRenderService, isClipRenderActive, launchInlineRender } from '../services/clipRenderService.js';
import { CaptionService } from '../services/captionService.js';
import { mergeExtendedCues, maxCueEnd, hasAuthoritativeCaptionCues } from '../services/captionExtendMerge.js';
import { WaveformService } from '../services/waveformService.js';
import { ThumbnailService } from '../services/thumbnailService.js';
import { SmartReframeService, activeReframeAnalysisSet } from '../services/smartReframeService.js';
import { SubjectTrackerService, validateTrackRequest } from '../services/subjectTrackerService.js';
import { ProducerPlanningService } from '../services/producerPlanningService.js';
import { ProducerRenderService } from '../services/producerRenderService.js';
import { GenreIntelligenceService } from '../services/genreIntelligenceService.js';
import { EntitlementService } from '../services/entitlementService.js';

import { logger } from '../utils/logger.js';
import { ClipPosterService } from '../services/clipPosterService.js';
import { config } from '../config/index.js';
import { HookRegenerationService } from '../services/hookRegenerationService.js';

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

  if (activeClipAnalysisSet.has(projectId)) {
    res.status(409).json({ status: 'error', code: 'CLIP_ANALYSIS_ACTIVE', message: 'Clip analysis is already in progress.' });
    return;
  }

  if (!isMongoConfigured) {
    res.status(503).json({
      status: 'error',
      code: 'SERVICE_UNAVAILABLE',
      message: 'Database service is not configured.',
    });
    return;
  }

  try {
    const customNotes = typeof req.body?.customNotes === 'string' ? req.body.customNotes : undefined;
    const rawPreferences = req.body?.clip_preferences || req.body?.clipPreferences;
    const normalizedPreferences = rawPreferences
      ? GenreIntelligenceService.normalizePreferences(rawPreferences, customNotes)
      : undefined;

    if (normalizedPreferences) {
      await dataRepository
        .from('projects')
        .update({ clip_preferences: normalizedPreferences })
        .eq('id', projectId)
        .eq('user_id', userId);
    }

    const clipService = new ClipAnalysisService();
    const candidates = await clipService.analyzeAndPersistClips({
      projectId,
      userId,
      customNotes,
      preferences: normalizedPreferences,
      clipPreferences: normalizedPreferences,
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

    if (err.code === 'SOURCE_TOO_SHORT_FOR_CLIP_SETTINGS') {
      res.status(400).json({ status: 'error', code: err.code, message: err.message });
      return;
    }

    if(err.code==='CLIP_SELECTION_CONTEXT_CHANGED'||err.code==='TRANSCRIPT_WORD_TEXT_REVIEW_REQUIRED'||err.code==='TRANSCRIPT_REVIEW_REQUIRED'||err.code==='TRANSCRIPT_SOURCE_REVIEW_REQUIRED'||err.code==='CLIP_SEGMENTS_INVALID'){
      res.status(409).json({status:'error',code:err.code,message:err.message});
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
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
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

  if (!isMongoConfigured) {
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

  if (!isMongoConfigured) {
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

/**
 * POST /api/projects/:id/clips
 * Creates a real clip record from an AI candidate and kicks off background 9:16 rendering
 */
export const createProjectClip = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

  // Default to smart framing: renders auto-generate the active-speaker track
    // (see ClipRenderService.ensureReframeTrackAtRender); 'center' stays
    // available via an explicit request.
    const {
    candidateId,
    aspectRatio = '9:16',
    cropMode = 'smart',
    caption_enabled,
    caption_style,
    caption_config,
  } = req.body || {};

  if (!candidateId || !isValidUUID(candidateId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid candidate UUID is required.' });
    return;
  }

  const validRatios: ClipAspectRatio[] = ['9:16', '1:1', '16:9'];
  if (aspectRatio && !validRatios.includes(aspectRatio)) {
    res.status(400).json({
      status: 'error',
      code: 'INVALID_ASPECT_RATIO',
      message: `Invalid aspect ratio. Supported ratios: ${validRatios.join(', ')}`,
    });
    return;
  }

  try {
    const creation=parseCandidateCreation(req.body,projectId);
    if(creation){
      if(req.body.cancel_only){res.status(200).json(await closeCandidateCreation(userId,creation));return;}
      const prior=await lookupCandidateCreation(userId,creation);
      if(prior?.cancelled){res.status(409).json({status:'error',code:'CREATION_INTENT_CANCELLED',message:'This saved creation request was closed. No new clip was created.'});return;}
      if(prior?.clip||req.body.recover_only||req.body.prepare_only&&prior){
        if(!prior){res.status(404).json({status:'error',code:'CREATION_INTENT_NOT_FOUND',message:'This creation request has not been confirmed.'});return;}
        res.status(200).json(prior);return;
      }
      assertRenderAdmissionEnabled();
      if(!req.body.prepare_only&&!creation.preparation){res.status(409).json({status:'error',code:'CREATION_PREPARATION_REQUIRED',message:'Prepare and save the creation inputs before admission.'});return;}
    }
    // Check monthly clip render limit against plan entitlement
    const entitlements = await EntitlementService.resolveUserEntitlements(userId, req.user?.email);
    if (!entitlements.isUnlimited) {
      assertRenderQuotaMaximum(entitlements.limits.maxClipRenders);
      const db = await getMongoDb();
      const currentMonthStart = new Date();
      currentMonthStart.setUTCDate(1);
      currentMonthStart.setUTCHours(0, 0, 0, 0);

      const renderCount = await db.collection('render_jobs').countDocuments({
        user_id: userId,
        $or: [
          { created_at: { $gte: currentMonthStart } },
          { created_at: { $gte: currentMonthStart.toISOString() } },
        ],
      });

      assertRenderUsageCount(renderCount);
      if (renderCount >= entitlements.limits.maxClipRenders) {
        res.status(403).json({
          status: 'error',
          code: 'MONTHLY_RENDER_LIMIT_EXCEEDED',
          message: `Your ${entitlements.displayName} plan allows up to ${entitlements.limits.maxClipRenders} clip renders per month. Please upgrade your plan to render more clips.`,
          limit: entitlements.limits.maxClipRenders,
          current: renderCount,
        });
        return;
      }
    }

    // Keep generated defaults within plan access; never crop an untracked person by default.
    if (caption_style && !EntitlementService.isPresetAllowed(entitlements, String(caption_style))) {
      res.status(403).json({
        status: 'error',
        code: 'PRESET_RESTRICTED',
        message: `The subtitle preset "${caption_style}" is not available on your current ${entitlements.displayName} plan. Please upgrade to access this preset.`,
        preset: caption_style,
        allowedPresets: entitlements.allowedSubtitlePresets,
      });
      return;
    }

    const hasSmartReframe = EntitlementService.isFeatureAllowed(entitlements, 'smartReframe');
    const effectiveCropMode = cropMode === 'smart' && !hasSmartReframe ? 'fit' : cropMode;
    const initialCaption = newCaptionDefaults(caption_style,caption_config,{freshSelection:true});
    const effectiveCaptionStyle = EntitlementService.isPresetAllowed(entitlements,initialCaption.captionStyle)
      ? initialCaption.captionStyle : 'simple';
    const effectiveCaptionConfig = effectiveCaptionStyle===initialCaption.captionStyle
      ? initialCaption.captionConfig : {presetId:effectiveCaptionStyle};

    const creationContext=creation?{intent:creation,buildEditor:(clip:any,transcript:any,preferences:any)=>ProEditorService.buildInitialCandidateEditor(clip,userId,transcript,preferences),policy:{planId:entitlements.planId,isUnlimited:entitlements.isUnlimited,
      maxClipRenders:entitlements.limits.maxClipRenders,watermarkRequired:entitlements.watermarkRequired,
      features:entitlements.features,allowedSubtitlePresets:entitlements.allowedSubtitlePresets}}:undefined;
    if(creationContext&&req.body.prepare_only){
      const {data:candidate,error}=await dataRepository.from('clip_candidates').select('metadata').eq('id',candidateId).eq('project_id',projectId).eq('user_id',userId).maybeSingle();
      if(error)throw Object.assign(new Error('Candidate read is unavailable.'),{statusCode:503,code:'DATABASE_UNAVAILABLE'});
      if(!candidate){res.status(404).json({status:'error',code:'CANDIDATE_NOT_FOUND',message:'Clip candidate not found.'});return;}
      await assertSelectionSourceCurrent(userId,projectId,candidate.metadata?.selection_source_receipt);
      res.status(200).json(await prepareCandidateCreation(projectId,candidateId,userId,aspectRatio,effectiveCropMode,
        {caption_enabled,caption_style:effectiveCaptionStyle,caption_config:effectiveCaptionConfig},creationContext));return;
    }
    const result = await ClipRenderService.createClipFromCandidate(
      projectId,
      userId,
      candidateId,
      aspectRatio,
      effectiveCropMode,
      { caption_enabled, caption_style: effectiveCaptionStyle, caption_config: effectiveCaptionConfig },
      creationContext
    );

    res.status(202).json({
      status: 'ok',
      ...(creation?{creationId:creation.id,preparation:creation.preparation,replayed:result.replayed===true}:{}),
      message: 'Clip created and rendering queued.',
      clip: result.clip,
      renderJob: result.renderJob,
    });
  } catch (err: any) {
    const code = err.code || 'INTERNAL_ERROR';
    const status = Number.isInteger(err.statusCode)&&err.statusCode>=400&&err.statusCode<=599?err.statusCode:
      code === 'PROJECT_NOT_FOUND' || code === 'CANDIDATE_NOT_FOUND'
        ? 404
        : code === 'RENDER_ALREADY_ACTIVE' || code === 'TRANSCRIPT_SOURCE_REVIEW_REQUIRED'
        ? 409
        : code === 'INVALID_TIMESTAMPS' || code === 'INVALID_UUID' || code === 'SOURCE_VIDEO_NOT_FOUND'
        ? 400
        : code === 'SERVICE_UNAVAILABLE'
        ? 503
        : 500;

    logger.error('Failed to create clip', {
      requestId: req.requestId,
      projectId,
      candidateId,
      error: err.message,
      code,
    });

    res.status(status).json({
      status: 'error',
      code: (status) >= 500 ? 'INTERNAL_ERROR' : (code),
      message: (status) >= 500 ? 'Internal server error' : (err.message || 'Failed to create clip.'),
    });
  }
};

/** Dedicated cheap read. Forced mode cannot admit, prepare, or close. Keep
 * conflicting caller flags so the shared parser rejects rather than widens. */
export const recoverProjectClipCreation=async(req:AuthenticatedRequest,res:Response):Promise<void>=>{
  const recoveryRequest=Object.create(req) as AuthenticatedRequest;
  recoveryRequest.body={...req.body,recover_only:true};
  await createProjectClip(recoveryRequest,res);
};

/**
 * GET /api/projects/:id/clips
 * Returns all rendered/queued clips for the given project
 */
export const getProjectClips = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

  try {
    const rawClips = await ClipRenderService.getProjectClips(projectId, userId);
    // Sign existing poster frames inline; clips without one fetch /clips/:id/poster lazily.
    const clips = await Promise.all(
      rawClips.map(async (clip: any) =>
        clip.thumbnail_url ? clip : { ...clip, thumbnail_url: await ClipPosterService.signedUrlIfReady(clip) }
      )
    );
    res.status(200).json({
      status: 'ok',
      projectId,
      count: clips.length,
      clips,
    });
  } catch (err: any) {
    logger.error('Failed to fetch project clips', {
      requestId: req.requestId,
      projectId,
      userId,
      error: err.message,
    });
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to fetch project clips.',
    });
  }
};

/**
 * GET /api/clips/:clipId
 * Fetches a single clip and its latest render job status/progress
 */
export const getClip = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const clipId = req.params.clipId;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!clipId || !isValidUUID(clipId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid clip UUID is required.' });
    return;
  }

  try {
    const clip = await ClipRenderService.getClip(clipId, userId);
    res.status(200).json({
      status: 'ok',
      clip,
    });
  } catch (err: any) {
    const code = err.code || 'INTERNAL_ERROR';
    const status = code === 'CLIP_NOT_FOUND' ? 404 : 500;
    res.status(status).json({
      status: 'error',
      code: (status) >= 500 ? 'INTERNAL_ERROR' : (code),
      message: (status) >= 500 ? 'Internal server error' : (err.message || 'Failed to fetch clip.'),
    });
  }
};

/**
/**
 * POST /api/clips/:clipId/render
 * Initiates re-render with current saved editor configuration
 */
export const renderClip = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const clipId = req.params.clipId;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!clipId || !isValidUUID(clipId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid clip UUID is required.' });
    return;
  }

  try {
    const submission = parseRenderSubmission(req.body,clipId);
    if(req.body?.cancel_only===true && submission){
      const result=await closeSavedRenderSubmission(userId,clipId,submission);
      if(!result)throw new Error('Saved request close did not return a verifiable result.');
      if(result.cancelled){res.status(200).json({status:'ok',cancelled:true,submissionId:submission.id});return;}
      const prior=result.receipt;
      if(!prior)throw new Error('Saved request close did not return a verifiable result.');
      res.status(200).json({status:'ok',clipId,jobId:prior.job.id,renderVersion:prior.renderVersion,editorVersion:prior.job.editor_version,replayed:true});
      return;
    }
    const recovered = await lookupRenderSubmission(userId,clipId,submission);
    if (recovered) {
      res.status(200).json({status:'ok',clipId,jobId:recovered.job.id,renderVersion:recovered.renderVersion,
        editorVersion:recovered.job.editor_version,replayed:true});
      return;
    }
    if (req.body?.recover_only === true) {
      res.status(404).json({status:'error',code:'RENDER_SUBMISSION_NOT_FOUND',message:'No committed receipt was found for this saved request. No new render was started.'});
      return;
    }
    assertRenderAdmissionEnabled();
    // Check monthly clip render limit against plan entitlement
    const entitlements = await EntitlementService.resolveUserEntitlements(userId, req.user?.email);
    if (!entitlements.isUnlimited) {
      assertRenderQuotaMaximum(entitlements.limits.maxClipRenders);
      const db = await getMongoDb();
      const currentMonthStart = new Date();
      currentMonthStart.setUTCDate(1);
      currentMonthStart.setUTCHours(0, 0, 0, 0);

      const renderCount = await db.collection('render_jobs').countDocuments({
        user_id: userId,
        $or: [
          { created_at: { $gte: currentMonthStart } },
          { created_at: { $gte: currentMonthStart.toISOString() } },
        ],
      });

      assertRenderUsageCount(renderCount);
      if (renderCount >= entitlements.limits.maxClipRenders) {
        res.status(403).json({
          status: 'error',
          code: 'MONTHLY_RENDER_LIMIT_EXCEEDED',
          message: `Your ${entitlements.displayName} plan allows up to ${entitlements.limits.maxClipRenders} clip renders per month. Please upgrade your plan to render more clips.`,
          limit: entitlements.limits.maxClipRenders,
          current: renderCount,
        });
        return;
      }
    }

    const clip = await ClipRenderService.getClip(clipId, userId);
    if (submission && (Number(clip.render_version??1)!==submission.expectedRenderVersion || Number(clip.editor_version??1)!==submission.expectedEditorVersion)) {
      throw Object.assign(new Error('Saved inputs changed before this submission was admitted. Review the clip before starting another request.'),{statusCode:409,code:'RENDER_INPUT_CHANGED'});
    }
    await assertSelectionSourceCurrent(userId,clip.project_id,(clip as any).selection_source_receipt,clip.source_storage_path);
    // Gate the actual Studio/Quick render entry point before queuing. This check
    // deliberately fails closed on repository errors, not a swallowed snapshot read.
    const { data: panelProject, error: panelReadError } = await dataRepository.from('editor_projects')
      .select('*').eq('clip_id', clipId).eq('user_id', userId).maybeSingle();
    if (panelReadError) throw panelReadError;
    if (panelProject) assertPanelViewsAssigned(expandSceneLayoutProject(panelProject));

    if (isClipRenderActive(clipId)) {
      res.status(409).json({
        status: 'error',
        code: 'RENDER_ALREADY_ACTIVE',
        message: 'A render job is already running for this clip.',
      });
      return;
    }

    // Commercial gate: validate subtitle preset entitlement
    const targetPreset = req.body?.caption_style || clip.caption_style;
    if (targetPreset && !EntitlementService.isPresetAllowed(entitlements, String(targetPreset))) {
      res.status(403).json({
        status: 'error',
        code: 'PRESET_RESTRICTED',
        message: `The subtitle preset "${targetPreset}" is not available on your current ${entitlements.displayName} plan. Please upgrade to access this preset.`,
        preset: targetPreset,
        allowedPresets: entitlements.allowedSubtitlePresets,
      });
      return;
    }

    // Export resolution chosen in the export dialog. Unknown values are
    // rejected rather than silently rendered at another size.
    let requestedResolution: string | null = null;
    const bodyResolution = req.body?.render_resolution ?? req.body?.resolution;
    if (bodyResolution !== undefined && bodyResolution !== null && bodyResolution !== '') {
      requestedResolution = parseRenderResolutionStrict(bodyResolution);
      if (!requestedResolution) {
        res.status(400).json({
          status: 'error',
          code: 'INVALID_RESOLUTION',
          message: 'render_resolution must be one of 720p, 1080p, 1440p, 2160p (4K).',
        });
        return;
      }
    }

    const {job:newJob,renderVersion:nextRenderVersion,replayed} = await enqueueRenderJob({
      submission,clipId,userId,
      expectedRenderVersion:Number(clip.render_version??1),
      expectedEditorVersion:Number(clip.editor_version??1),
      expectedEditorProject:editorRenderSnapshot(panelProject),
      settings:{
        ...(req.body?.caption_enabled!==undefined?{caption_enabled:Boolean(req.body.caption_enabled)}:{}),
        ...(req.body?.caption_style?{caption_style:String(req.body.caption_style)}:{}),
        ...(requestedResolution?{render_resolution:requestedResolution}:{}),
      },
    });

    // Launch rendering asynchronously (deferred to the sweep when at concurrency cap)
    if (!replayed) launchInlineRender(clipId, userId, newJob.id);

    res.status(replayed ? 200 : 202).json({
      status: 'ok',
      message: 'Clip rendering started with saved editor configuration.',
      clipId,
      renderVersion: nextRenderVersion,
      editorVersion: newJob.editor_version,
      replayed: Boolean(replayed),
      jobId: newJob.id,
    });
  } catch (err: any) {
    const code = err.code || 'INTERNAL_ERROR';
    const status =
      err.statusCode || (code === 'CLIP_NOT_FOUND' ? 404 : code === 'RENDER_ALREADY_ACTIVE' ? 409 : 500);

    res.status(status).json({
      status: 'error',
      code: (status) >= 500 ? 'INTERNAL_ERROR' : (code),
      message: (status) >= 500 ? 'Internal server error' : (err.message || 'Failed to trigger render.'),
    });
  }
};

/**
 * DELETE /api/clips/:clipId
 * Deletes a clip, removes rendered file from storage, cascades jobs
 */
export const deleteClip = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const clipId = req.params.clipId;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!clipId || !isValidUUID(clipId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid clip UUID is required.' });
    return;
  }

  try {
    await ClipRenderService.deleteClip(clipId, userId);
    res.status(200).json({
      status: 'ok',
      message: 'Clip deleted successfully.',
    });
  } catch (err: any) {
    const code = err.code || 'INTERNAL_ERROR';
    const status = code === 'CLIP_NOT_FOUND' ? 404 : 500;
    res.status(status).json({
      status: 'error',
      code: (status) >= 500 ? 'INTERNAL_ERROR' : (code),
      message: (status) >= 500 ? 'Internal server error' : (err.message || 'Failed to delete clip.'),
    });
  }
};

/**
 * GET /api/clips/:clipId/preview-url
 * Returns short-lived signed preview URL
 */
export const getClipPreviewUrl = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const clipId = req.params.clipId;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!clipId || !isValidUUID(clipId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid clip UUID is required.' });
    return;
  }

  try {
    const values = [req.query.render_version, req.query.editor_version, req.query.job_id];
    let expected: {renderVersion: number; editorVersion: number; jobId: string} | undefined;
    if (values.some(value => value !== undefined)) {
      const [render, editor, job] = values;
      if (typeof render !== 'string' || !/^[1-9]\d*$/.test(render) || !Number.isSafeInteger(Number(render)) ||
          typeof editor !== 'string' || !/^[1-9]\d*$/.test(editor) || !Number.isSafeInteger(Number(editor)) ||
          typeof job !== 'string' || !isValidUUID(job)) {
        res.status(400).json({status: 'error', code: 'INVALID_RENDER_RECEIPT', message: 'A complete valid render receipt is required.'});
        return;
      }
      expected = {renderVersion: Number(render), editorVersion: Number(editor), jobId: job};
    }
    const result = await ClipRenderService.getSignedPreviewUrl(clipId, userId, expected);
    res.status(200).json({
      status: 'ok',
      ...result,
    });
  } catch (err: any) {
    const code = err.code || 'INTERNAL_ERROR';
    const status =
      err.statusCode || (code === 'CLIP_NOT_FOUND' ? 404 : code === 'CLIP_NOT_READY' ? 400 : code === 'WATERMARK_REQUIRED_RERENDER' ? 403 : 500);
    res.status(status).json({
      status: 'error',
      code: (status) >= 500 ? 'INTERNAL_ERROR' : (code),
      message: (status) >= 500 ? 'Internal server error' : (err.message || 'Failed to generate preview URL.'),
    });
  }
};

/**
 * GET /api/clips/:clipId/download-url
 * Returns short-lived signed download URL with download filename header
 */
export const getClipDownloadUrl = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const clipId = req.params.clipId;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!clipId || !isValidUUID(clipId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid clip UUID is required.' });
    return;
  }

  try {
    const result = await ClipRenderService.getSignedDownloadUrl(clipId, userId);
    res.status(200).json({
      status: 'ok',
      ...result,
    });
  } catch (err: any) {
    const code = err.code || 'INTERNAL_ERROR';
    const status =
      err.statusCode || (code === 'CLIP_NOT_FOUND' ? 404 : code === 'CLIP_NOT_READY' ? 400 : code === 'WATERMARK_REQUIRED_RERENDER' ? 403 : 500);
    res.status(status).json({
      status: 'error',
      code: (status) >= 500 ? 'INTERNAL_ERROR' : (code),
      message: (status) >= 500 ? 'Internal server error' : (err.message || 'Failed to generate download URL.'),
    });
  }
};

/**
 * GET /api/clips/:clipId/editor
 * Returns safe editor data bundle (metadata, editor config, caption timing mode, presets, preview)
 */
export const getClipEditorData = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const clipId = req.params.clipId;
  // Editor state mutates in place; never let a client cache serve a stale copy.
  res.set('Cache-Control', 'no-store');

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!clipId || !isValidUUID(clipId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid clip UUID is required.' });
    return;
  }

  try {
    const data = await ClipRenderService.getClipEditorData(clipId, userId);
    res.status(200).json({
      status: 'ok',
      ...data,
    });
  } catch (err: any) {
    const code = err.code || 'INTERNAL_ERROR';
    const status = code === 'CLIP_NOT_FOUND' ? 404 : 500;
    res.status(status).json({
      status: 'error',
      code: (status) >= 500 ? 'INTERNAL_ERROR' : (code),
      message: (status) >= 500 ? 'Internal server error' : (err.message || 'Failed to load clip editor data.'),
    });
  }
};

/**
 * GET /api/clips/:clipId/waveform
 * Returns normalized audio peaks for the clip's source window (cached, see WaveformService).
 */
export const getClipWaveform = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const clipId = req.params.clipId;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }
  if (!clipId || !isValidUUID(clipId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid clip UUID is required.' });
    return;
  }

  try {
    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const result = await WaveformService.getWaveformForClip(clipId, userId, { forceRefresh });
    res.status(200).json({ status: 'ok', ...result });
  } catch (err: any) {
    const code = err.code || 'INTERNAL_ERROR';
    const status = code === 'CLIP_NOT_FOUND' ? 404 : code === 'SOURCE_PATH_MISSING' ? 400 : 500;
    // Waveform is a non-critical visualization; report the failure but keep it distinct
    // from the editor data load so the client can fall back to a placeholder.
    res.status(status).json({
      status: 'error',
      code: (status) >= 500 ? 'INTERNAL_ERROR' : (code),
      message: (status) >= 500 ? 'Internal server error' : (err.message || 'Failed to generate clip waveform.'),
    });
  }
};

/**
 * GET /api/audio-assets/:assetId/waveform
 * Returns normalized audio peaks for an uploaded audio asset (music / SFX), cached by asset.
 */
export const getAssetWaveform = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const assetId = req.params.assetId;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }
  if (!assetId || !isValidUUID(assetId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid asset UUID is required.' });
    return;
  }

  try {
    const result = await WaveformService.getWaveformForAsset(assetId, userId);
    res.status(200).json({ status: 'ok', ...result });
  } catch (err: any) {
    const code = err.code || 'INTERNAL_ERROR';
    res.status(500).json({ status: 'error', code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
};

/**
 * GET /api/clips/:clipId/thumbnails?count=N
 * Returns a cached base64 sprite-sheet filmstrip for the clip's source window.
 */
export const getClipThumbnails = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const clipId = req.params.clipId;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }
  if (!clipId || !isValidUUID(clipId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid clip UUID is required.' });
    return;
  }

  try {
    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const count = req.query.count !== undefined ? Number(req.query.count) : undefined;
    const result = await ThumbnailService.getThumbnailsForClip(clipId, userId, { count, forceRefresh });
    res.status(200).json({ status: 'ok', ...result });
  } catch (err: any) {
    const code = err.code || 'INTERNAL_ERROR';
    const status = code === 'CLIP_NOT_FOUND' ? 404 : code === 'SOURCE_PATH_MISSING' ? 400 : 500;
    res.status(status).json({
      status: 'error',
      code: (status) >= 500 ? 'INTERNAL_ERROR' : (code),
      message: (status) >= 500 ? 'Internal server error' : (err.message || 'Failed to generate clip thumbnails.'),
    });
  }
};

/**
 * GET /api/clips/:clipId/poster
 * Signed URL of the clip's poster frame, generated on first request.
 */
export const getClipPoster = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const clipId = req.params.clipId;
  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }
  if (!clipId || !isValidUUID(clipId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid clip UUID is required.' });
    return;
  }
  const { data: clip } = await dataRepository
    .from('clips')
    .select('id, user_id, project_id, start_seconds, end_seconds, render_status, render_version, output_storage_path, source_storage_path, poster_key')
    .eq('id', clipId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!clip) {
    res.status(404).json({ status: 'error', code: 'CLIP_NOT_FOUND', message: 'Clip not found.' });
    return;
  }
  const url = await ClipPosterService.getPosterUrl(clip);
  if (!url) {
    res.status(404).json({ status: 'error', code: 'POSTER_UNAVAILABLE', message: 'No poster frame is available for this clip yet.' });
    return;
  }
  res.setHeader('Cache-Control', 'private, max-age=240');
  res.status(200).json({ status: 'ok', url, expiresInSeconds: 300 });
};

/**
 * PATCH /api/clips/:clipId/editor
 * Updates editor configuration fields securely (whitelist only)
 */
export const updateClipEditor = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const clipId = req.params.clipId;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!clipId || !isValidUUID(clipId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid clip UUID is required.' });
    return;
  }

  const allowedKeys = new Set([
    'editorProjectRevision',
    'trimStartOffset',
    'trimEndOffset',
    'aspectRatio',
    'captionEnabled',
    'captionStyle',
    'captionPosition',
    'captionConfig',
    'cropConfig',
    'overlayConfig',
    'volume',
    'muted',
  ]);

  const bodyKeys = Object.keys(req.body || {});
  const invalidKeys = bodyKeys.filter((k) => !allowedKeys.has(k));

  if (invalidKeys.length > 0) {
    res.status(400).json({
      status: 'error',
      code: 'INVALID_PAYLOAD',
      message: `Disallowed editor fields: ${invalidKeys.join(', ')}`,
    });
    return;
  }

  try {
    if (req.body.captionStyle) {
      const entitlements = await EntitlementService.resolveUserEntitlements(userId, req.user?.email);
      if (!EntitlementService.isPresetAllowed(entitlements, String(req.body.captionStyle))) {
        res.status(403).json({
          status: 'error',
          code: 'PRESET_RESTRICTED',
          message: `The subtitle preset "${req.body.captionStyle}" is not available on your current ${entitlements.displayName} plan. Please upgrade to access this preset.`,
          preset: req.body.captionStyle,
          allowedPresets: entitlements.allowedSubtitlePresets,
        });
        return;
      }
    }

    const updated = await ClipRenderService.updateClipEditorConfig(
      clipId,
      userId,
      req.body as ClipEditorUpdateDTO
    );

    res.status(200).json({
      status: 'ok',
      message: 'Clip editor configuration saved.',
      clip: updated,
    });
  } catch (err: any) {
    const code = err.code || 'INTERNAL_ERROR';
    const status =
      code === 'EDITOR_REVISION_CONFLICT' ? 409 :
      code === 'CLIP_NOT_FOUND'
        ? 404
        : code === 'INVALID_VOLUME' || code === 'INVALID_TRIM' || code === 'TRIM_TOO_SHORT' || code === 'INVALID_ASPECT_RATIO' || code === 'INVALID_CAPTION_STYLE' || code === 'INVALID_CAPTION_POSITION' || code === 'EXTEND_BEYOND_SOURCE'
        ? 400
        : 500;

    res.status(status).json({
      status: 'error',
      code: (status) >= 500 ? 'INTERNAL_ERROR' : (code),
      message: (status) >= 500 ? 'Internal server error' : (err.message || 'Failed to update editor configuration.'),
    });
  }
};

/**
 * POST /api/clips/:clipId/editor/reset
 * Resets editor configuration to baseline defaults
 */
export const resetClipEditor = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const clipId = req.params.clipId;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!clipId || !isValidUUID(clipId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid clip UUID is required.' });
    return;
  }

  try {
    const reset = await ClipRenderService.resetClipEditorConfig(clipId, userId);
    res.status(200).json({
      status: 'ok',
      message: 'Editor configuration reset to default.',
      clip: reset,
    });
  } catch (err: any) {
    const code = err.code || 'INTERNAL_ERROR';
    const status = code === 'CLIP_NOT_FOUND' ? 404 : 500;
    res.status(status).json({
      status: 'error',
      code: (status) >= 500 ? 'INTERNAL_ERROR' : (code),
      message: (status) >= 500 ? 'Internal server error' : (err.message || 'Failed to reset editor configuration.'),
    });
  }
};

/**
 * GET /api/clips/:clipId/captions
 * Returns normalized preview caption cues for this clip
 */
export const getClipCaptions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const clipId = req.params.clipId;
  // Caption coverage changes with trims/extends; a cached 304 would strand the
  // editor on stale cues.
  res.set('Cache-Control', 'no-store');

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!clipId || !isValidUUID(clipId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid clip UUID is required.' });
    return;
  }

  if (!ownerContext.getStore()) {
    return ownerContext.run(userId, () => getClipCaptions(req, res));
  }

  try {
    const clip = await ClipRenderService.getClip(clipId, userId);

    // 1. Check if an EditorProject exists with custom edited/saved cues for this clip (matching generateCaptionsForClip export)
    const { data: proj } = await dataRepository
      .from('editor_projects')
      .select('*')
      .eq('clip_id', clipId)
      .eq('user_id', userId)
      .maybeSingle();

    if (proj && Array.isArray(proj.tracks)) {
      const captionTrack = proj.tracks.find((t: any) => t.type === 'CAPTION' && !t.hidden);
      const captionItem = captionTrack?.items?.[0];
      if (captionItem?.caption && hasAuthoritativeCaptionCues(captionItem.caption)) {
        let cuesOut = captionItem.caption.cues;
        // Beyond-candidate extend: saved cues are authoritative through their
        // coverage marker; if the clip's trim window now runs past it, append
        // the newly exposed span from the transcript (append-only, so user
        // edits and deletions inside the covered region are preserved).
        const itemStart = typeof captionItem.timeline_start === 'number' ? captionItem.timeline_start : 0;
        if (itemStart === 0) {
          try {
            const coveredEnd = typeof captionItem.caption.cues_covered_end === 'number'
              ? captionItem.caption.cues_covered_end
              : maxCueEnd(cuesOut);
            const effectiveDuration = Number((
              clip.end_seconds - clip.start_seconds -
              Number(clip.trim_start_offset || 0) - Number(clip.trim_end_offset || 0)
            ).toFixed(3));
            if (effectiveDuration > coveredEnd + 0.05) {
              const { data: transcript } = await dataRepository
                .from('transcripts')
                .select('*')
                .eq('project_id', clip.project_id)
                .eq('user_id', userId)
                .maybeSingle();
              if (transcript) {
                await assertSelectionSourceCurrent(userId,clip.project_id,(clip as any).selection_source_receipt,clip.source_storage_path);
                const fresh = CaptionService.extractCuesForClipSettings(transcript, clip, undefined, { preserveCase: true });
                const merged = mergeExtendedCues(cuesOut, fresh.cues as any, coveredEnd);
                if (merged.appended > 0) cuesOut = merged.cues as any;
              }
            }
          } catch (error:any) {
            if (error?.code === 'TRANSCRIPT_WORD_TEXT_REVIEW_REQUIRED' || error?.code === 'TRANSCRIPT_SOURCE_REVIEW_REQUIRED' || error?.code === 'TRANSCRIPT_REVIEW_REQUIRED') throw error;
            // Fall through with the saved cues.
          }
        }
        const hasWords = cuesOut.some((c: any) => Array.isArray(c.words) && c.words.length > 0);
        res.status(200).json({
          status: 'ok',
          timingMode: hasWords ? 'word' : 'segment',
          cues: cuesOut,
        });
        return;
      }
    }

    const { data: transcript, error: transErr } = await dataRepository
      .from('transcripts')
      .select('*')
      .eq('project_id', clip.project_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (transErr || !transcript) {
      res.status(200).json({
        status: 'ok',
        timingMode: 'segment',
        cues: [],
      });
      return;
    }

    await assertSelectionSourceCurrent(userId,clip.project_id,(clip as any).selection_source_receipt,clip.source_storage_path);
    // Same extraction the export uses, so preview cues match the burned-in captions.
    const { timingMode, cues } = CaptionService.extractCuesForClipSettings(transcript, clip, undefined, { preserveCase: true });

    res.status(200).json({
      status: 'ok',
      timingMode,
      cues,
    });
  } catch (err: any) {
    const code = err.code || 'INTERNAL_ERROR';
    const status = err.statusCode || ((code === 'CLIP_NOT_FOUND' || code === 'NOT_FOUND' || err.status === 404) ? 404 : 500);
    res.status(status).json({
      status: 'error',
      code: (status) >= 500 ? 'INTERNAL_ERROR' : (code),
      message: (status) >= 500 ? 'Internal server error' : (err.message || 'Failed to fetch clip captions.'),
    });
  }
};

/**
 * POST /api/clips/:clipId/reframe/analyze
 * Initiates smart auto-reframe face tracking analysis for a clip
 */
export const analyzeClipReframe = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const clipId = req.params.clipId;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!clipId || !isValidUUID(clipId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid clip UUID is required.' });
    return;
  }

  if (!config.smartReframeEnabled) {
    res.status(503).json({ status: 'error', code: 'REFRAME_UNAVAILABLE', message: 'Smart Reframe is not enabled on this server.' });
    return;
  }

  // Validate the request BEFORE touching billing: malformed payloads and
  // duplicate submissions must fail fast with 400/409 instead of a database
  // error (or a billing lookup) for input the client never should have sent.

  // Security guard: frontend cannot send arbitrary filesystem/commands/track data
  const disallowedKeys = ['filesystemPath', 'pythonCommand', 'ffmpegExpression', 'storagePath', 'rawTrackData'];
  const bodyKeys = Object.keys(req.body || {});
  const presentDisallowed = bodyKeys.filter((k) => disallowedKeys.includes(k));
  if (presentDisallowed.length > 0) {
    res.status(400).json({
      status: 'error',
      code: 'INVALID_PAYLOAD',
      message: `Disallowed parameter: ${presentDisallowed.join(', ')}`,
    });
    return;
  }

  // Duplicate analysis check
  if (activeReframeAnalysisSet.has(clipId)) {
    res.status(409).json({
      status: 'error',
      code: 'REFRAME_ANALYSIS_ACTIVE',
      message: 'Smart reframe analysis is already in progress for this clip.',
    });
    return;
  }

  // Entitlement verification for Smart Reframe feature
  const entitlements = await EntitlementService.resolveUserEntitlements(userId, req.user?.email);
  if (!EntitlementService.isFeatureAllowed(entitlements, 'smartReframe')) {
    res.status(403).json({
      status: 'error',
      code: 'FEATURE_NOT_PERMITTED',
      message: `Smart Reframe is not available on your current plan (${entitlements.displayName}). Please upgrade your plan to unlock Smart Reframe.`,
      feature: 'smartReframe',
      plan: entitlements.displayName,
    });
    return;
  }

  try {
    // Verify clip existence and ownership
    const clip = await ClipRenderService.getClip(clipId, userId);
    if (!clip) {
      res.status(404).json({ status: 'error', code: 'CLIP_NOT_FOUND', message: 'Clip not found.' });
      return;
    }

    // Launch analysis asynchronously in background
    SmartReframeService.analyzeClipFraming(clipId, userId).catch((err) => {
      logger.error('Background smart reframe analysis failed', { clipId, error: err.message });
    });

    res.status(202).json({
      status: 'ok',
      analysis_status: 'analyzing',
      clipId,
    });
  } catch (err: any) {
    const code = err.code || 'INTERNAL_ERROR';
    const status =
      code === 'CLIP_NOT_FOUND' ? 404 : code === 'REFRAME_ANALYSIS_ACTIVE' ? 409 : 500;
    res.status(status).json({
      status: 'error',
      code: (status) >= 500 ? 'INTERNAL_ERROR' : (code),
      message: (status) >= 500 ? 'Internal server error' : (err.message || 'Failed to start smart reframe analysis.'),
    });
  }
};

/**
 * GET /api/clips/:clipId/reframe
 * Retrieves safe smart reframe tracking data for a clip
 */
export const getClipReframe = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const clipId = req.params.clipId;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!clipId || !isValidUUID(clipId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid clip UUID is required.' });
    return;
  }

  try {
    const track = await SmartReframeService.getReframeTrack(clipId, userId, undefined, true);

    if (!track) {
      // If no track yet, check if currently analyzing
      const isAnalyzing = activeReframeAnalysisSet.has(clipId);
      res.status(200).json({
        status: isAnalyzing ? 'analyzing' : 'pending',
        detectedFaceCount: 0,
        dominantTrackId: null,
        smoothedKeyframes: [],
        analysisVersion: 1,
        isStale: false,
        speaker1X: null,
        speaker2X: null,
      });
      return;
    }

    const {data:policyClip}=await dataRepository.from('clips').select('*').eq('id',clipId).eq('user_id',userId).maybeSingle();
    const {data:policyProject}=await dataRepository.from('editor_projects').select('tracks').eq('clip_id',clipId).eq('user_id',userId).maybeSingle();
    const retainedPlan=track.sourceObjectVerified!==false&&policyClip?.crop_config?.mode==='smart'&&policyProject?storedScenePlanWindow(policyProject,policyClip,track):null;
    const measuredOptions=shotPlanOptions({track,candidate:req.query.layoutCandidate==='review-v1'?'review-v1':req.query.layoutCandidate==='off'?undefined:policyProject&&projectAutoCandidate(policyProject)?'review-v1':policyClip?.crop_config?.automaticLayoutCandidate,layoutPolicy:policyClip?.crop_config?.layoutPolicy,duration:Number(track.metadata?.clip_duration)});
    const measuredPlanEnvelope=track.metadata?.shot_composition_candidate===true?createPreviewMeasuredEnvelope(policyClip,track,measuredOptions,options=>SmartReframeService.computeShotComposition(options),Boolean(retainedPlan)):null;
    const measuredComposition=track.metadata?.shot_composition_candidate===true?(measuredPlanEnvelope?.shots||SmartReframeService.computeShotComposition(measuredOptions)):null;
    const explicitAutoConfig=policyClip?.crop_config?.layout_mode_source==='auto'?policyClip.crop_config:
      policyProject?.tracks?.flatMap((t:any)=>t.type==='VIDEO'?t.items:[]).some((i:any)=>i.crop_config?.layout_mode_source==='auto'||i.scene_layout_overrides?.some((o:any)=>o.layout==='auto'))?{...policyClip?.crop_config,layout_mode_source:'auto'}:undefined;
    const explicitAutoPlan=SmartReframeService.explicitAutoLayoutPlan(track,explicitAutoConfig,Number(track.metadata?.clip_duration)||1);
    // Return safe data without exposing server paths
    res.status(200).json({
      status: track.status,
      measuredPlanEnvelope,
      adaptiveComposition: track.metadata?.shot_composition_candidate===true,
      detectedFaceCount: track.detected_face_count || 0,
      dominantTrackId: track.dominant_track_id,
      contentFramingDecision: track.metadata?.content_framing_decision ?? null,
      analyzedSourcePath: track.metadata?.analyzed_source_path ?? null,
      smoothedKeyframes: track.smoothed_keyframes || [],
      analysisVersion: track.analysis_version,
      analyzedTrimStart: track.analyzed_trim_start,
      analyzedTrimEnd: track.analyzed_trim_end,
      analyzedAspectRatio: track.analyzed_aspect_ratio,
      isStale: retainedPlan ? false : Boolean(track.isStale),
      // Measured two-speaker anchor positions (when analysis found credible
      // geometry); the Framing panel seeds the split layout's speaker windows
      // from these. Null = no credible measurement, use defaults.
      speaker1X: (track.metadata as any)?.speaker1X ?? null,
      speaker2X: (track.metadata as any)?.speaker2X ?? null,
      // Per-speaker split framing geometry (same helper the export path uses)
      // so the preview can mirror the exported zoom/anchors. Null = legacy
      // anchor-only split framing (no credible two-subject measurement).
      splitGeometry: SmartReframeService.computeSplitSpeakerGeometry({
        rawSamples: track.raw_samples,
        sourceWidth: track.source_width || 1920,
        sourceHeight: track.source_height || 1080,
        speaker1X: (track.metadata as any)?.speaker1X ?? undefined,
        speaker2X: (track.metadata as any)?.speaker2X ?? undefined,
      }),
      // Group framing for multi-person single-view (same helper the export
      // path uses): the preview mirrors the exported blur-fill fit. Null =
      // no credible multi-face group; tight tracking preview stays.
      // Tracking-quality floor (same rule both render paths apply): when the
      // dominant track is weak and no group frame engages, export degrades to
      // the blurred layout; the preview must mirror that instead of showing
      // a confident tight track the export will not produce.
      lowConfidenceTrack: SmartReframeService.isLowConfidenceTrack(track),
      sourceWidth: track.source_width || null,
      sourceHeight: track.source_height || null,
      shotComposition: explicitAutoPlan || legacyFit43Plan(track,Number(track.metadata?.clip_duration)||1,SmartReframeService.computeGroupFrameGeometry({rawSamples:track.raw_samples,sourceWidth:track.source_width||1920,sourceHeight:track.source_height||1080}),SmartReframeService.isLowConfidenceTrack(track)) || legacyPolicyFallback(policyClip?.crop_config?.layoutPolicy,track,Number(track.metadata?.clip_duration)||track.smoothed_keyframes?.at(-1)?.time||1) || (track.metadata?.shot_composition_candidate === true
        ? measuredComposition : null),
      groupFrame: (() => {
        const g = SmartReframeService.computeGroupFrameGeometry({
          rawSamples: track.raw_samples,
          sourceWidth: track.source_width || 1920,
          sourceHeight: track.source_height || 1080,
        });
        return g ? { ...g, sourceWidth: track.source_width || 1920, sourceHeight: track.source_height || 1080 } : null;
      })(),
    });
  } catch (err: any) {
    const code = err.code || 'INTERNAL_ERROR';
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  }
};

// ── Phase 17: Vireo Producer Endpoints ────────────────────────────

/**
 * POST /api/clips/:clipId/producer/plan
 * Generates an automated ProducerEditPlan for the clip
 */
export const generateClipProducerPlan = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const clipId = req.params.clipId;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!clipId || !isValidUUID(clipId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid clip UUID is required.' });
    return;
  }

  try {
    const plan = await ProducerPlanningService.generatePlan(clipId, userId, req.body || {});
    res.status(200).json({ status: 'ok', data: plan });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({
      status: 'error',
      code: (status) >= 500 ? 'INTERNAL_ERROR' : (err.code || 'INTERNAL_ERROR'),
      message: (status) >= 500 ? 'Internal server error' : (err.message || 'Failed to generate producer plan.'),
    });
  }
};

/**
 * GET /api/clips/:clipId/producer/plans
 * Lists all generated Producer plans for this clip
 */
export const getClipProducerPlans = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const clipId = req.params.clipId;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!clipId || !isValidUUID(clipId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid clip UUID is required.' });
    return;
  }

  try {
    const { data: plans, error } = await dataRepository
      .from('producer_plans')
      .select('*')
      .eq('clip_id', clipId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      res.status(500).json({ status: 'error', message: 'Internal server error' });
      return;
    }

    res.status(200).json({ status: 'ok', data: plans || [] });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

/**
 * GET /api/clips/:clipId/producer/plans/:planId
 * Retrieves a single ProducerEditPlan
 */
export const getClipProducerPlan = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const planId = req.params.planId;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!planId || !isValidUUID(planId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid plan UUID is required.' });
    return;
  }

  try {
    const { data: plan, error } = await dataRepository
      .from('producer_plans')
      .select('*')
      .eq('id', planId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !plan) {
      res.status(404).json({ status: 'error', code: 'PLAN_NOT_FOUND', message: 'Producer plan not found.' });
      return;
    }

    res.status(200).json({ status: 'ok', data: plan });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

/**
 * POST /api/clips/:clipId/producer/plans/:planId/revise
 * Revises a plan through natural-language instruction or operation toggles
 */
export const reviseClipProducerPlan = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const planId = req.params.planId;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!planId || !isValidUUID(planId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid plan UUID is required.' });
    return;
  }

  try {
    const revisedPlan = await ProducerPlanningService.revisePlan(planId, userId, req.body || {});
    res.status(200).json({ status: 'ok', data: revisedPlan });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({
      status: 'error',
      code: (status) >= 500 ? 'INTERNAL_ERROR' : (err.code || 'INTERNAL_ERROR'),
      message: (status) >= 500 ? 'Internal server error' : (err.message || 'Failed to revise producer plan.'),
    });
  }
};

/**
 * POST /api/clips/:clipId/producer/plans/:planId/preview
 * Renders a lightweight 720p preview video executing the plan's edits
 */
export const previewClipProducerPlan = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const planId = req.params.planId;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!planId || !isValidUUID(planId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid plan UUID is required.' });
    return;
  }

  try {
    const previewResult = await ProducerRenderService.generatePreview(planId, userId);
    res.status(200).json({ status: 'ok', data: previewResult });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({
      status: 'error',
      code: (status) >= 500 ? 'INTERNAL_ERROR' : (err.code || 'PREVIEW_FAILED'),
      message: (status) >= 500 ? 'Internal server error' : (err.message || 'Failed to generate preview render.'),
    });
  }
};

/**
 * POST /api/clips/:clipId/producer/plans/:planId/apply
 * Applies the approved Producer plan to the clip non-destructively and starts render
 */
export const applyClipProducerPlan = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const planId = req.params.planId;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!planId || !isValidUUID(planId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid plan UUID is required.' });
    return;
  }

  try {
    const result = await ProducerRenderService.applyPlanToClip(planId, userId, req.params.clipId);
    res.status(200).json({
      status: 'ok',
      message: 'Producer plan applied and render queued.',
      data: result,
    });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({
      status: 'error',
      code: (status) >= 500 ? 'INTERNAL_ERROR' : (err.code || 'APPLY_FAILED'),
      message: (status) >= 500 ? 'Internal server error' : (err.message || 'Failed to apply producer plan to clip.'),
    });
  }
};

/**
 * DELETE /api/clips/:clipId/producer/plans/:planId
 * Deletes a producer plan
 */
export const deleteClipProducerPlan = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const planId = req.params.planId;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!planId || !isValidUUID(planId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid plan UUID is required.' });
    return;
  }

  try {
    await dataRepository
      .from('producer_plans')
      .delete()
      .eq('id', planId)
      .eq('user_id', userId);

    res.status(200).json({ status: 'ok', message: 'Plan deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};


/**
 * POST /clips/:clipId/hook/regenerate - regenerates the opening hook/title text
 * for one clip from its own transcript span via the server AI provider.
 * Fails closed with HOOK_PROVIDER_UNAVAILABLE when no provider key is set;
 * never returns fabricated text.
 */
export const regenerateClipHook = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const clipId = req.params.clipId;
  res.set('Cache-Control', 'no-store');

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  try {
    const result = await HookRegenerationService.regenerateClipHook(userId, clipId);
    res.status(200).json({ status: 'ok', ...result });
  } catch (err: any) {
    res
      .status(err.statusCode || (err.code === 'CLIP_NOT_FOUND' ? 404 : 500))
      .json({ status: 'error', code: (err.statusCode || (err.code === 'CLIP_NOT_FOUND' ? 404 : 500)) >= 500 ? 'INTERNAL_ERROR' : (err.code || 'HOOK_GENERATION_FAILED'), message: (err.statusCode || (err.code === 'CLIP_NOT_FOUND' ? 404 : 500)) >= 500 ? 'Internal server error' : (err.message || 'Hook generation failed.') });
  }
};

/** POST /clips/:clipId/track-subject - follow a user-picked subject (Tracker control). Same entitlement as Smart Reframe; no billing. */
export const trackClipSubject = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const clipId = req.params.clipId;
  if (!userId) { res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' }); return; }
  if (!clipId || !isValidUUID(clipId)) { res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid clip UUID is required.' }); return; }
  const entitlements = await EntitlementService.resolveUserEntitlements(userId, req.user?.email);
  if (!EntitlementService.isFeatureAllowed(entitlements, 'smartReframe')) {
    res.status(403).json({ status: 'error', code: 'FEATURE_NOT_PERMITTED', message: `Subject tracking is not available on your current plan (${entitlements.displayName}).`, feature: 'smartReframe' });
    return;
  }
  try {
    const payload = validateTrackRequest(req.body);
    const result = await SubjectTrackerService.trackForClip(clipId, userId, payload);
    res.json({ status: 'ok', ...result });
  } catch (err: any) {
    const code = err?.code || 'TRACK_FAILED';
    const http = code === 'INVALID_PAYLOAD' ? 400 : code === 'CLIP_NOT_FOUND' ? 404 : code === 'ACCESS_DENIED' ? 403 : 500;
    res.status(http).json({ status: 'error', code: (http) >= 500 ? 'INTERNAL_ERROR' : (code), message: (http) >= 500 ? 'Internal server error' : (err?.message || 'Subject tracking failed.') });
  }
};
