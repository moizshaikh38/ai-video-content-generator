import { isMongoConfigured, getMongoDb } from '../db/mongoClient.js';
import { dataRepository, ownerContext } from '../db/repositories/dataRepository.js';
import { Response } from 'express';
import { AuthenticatedRequest, isValidUUID, ClipCandidateStatus, ClipAspectRatio, ClipEditorUpdateDTO } from '../types/index.js';
import { ClipAnalysisService, activeClipAnalysisSet } from '../services/clipAnalysisService.js';
import { ClipRenderService, isClipRenderActive, launchInlineRender } from '../services/clipRenderService.js';
import { CaptionService } from '../services/captionService.js';
import { mergeExtendedCues, maxCueEnd } from '../services/captionExtendMerge.js';
import { WaveformService } from '../services/waveformService.js';
import { ThumbnailService } from '../services/thumbnailService.js';
import { SmartReframeService, activeReframeAnalysisSet } from '../services/smartReframeService.js';
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
    // Check monthly clip render limit against plan entitlement
    const entitlements = await EntitlementService.resolveUserEntitlements(userId, req.user?.email);
    if (!entitlements.isUnlimited) {
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

    // Fall back gracefully from 'smart' to 'center' crop if plan does not include Smart Reframe
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
    const effectiveCropMode = cropMode === 'smart' && !hasSmartReframe ? 'center' : cropMode;

    const result = await ClipRenderService.createClipFromCandidate(
      projectId,
      userId,
      candidateId,
      aspectRatio,
      effectiveCropMode,
      { caption_enabled, caption_style, caption_config }
    );

    res.status(202).json({
      status: 'ok',
      message: 'Clip created and rendering queued.',
      clip: result.clip,
      renderJob: result.renderJob,
    });
  } catch (err: any) {
    const code = err.code || 'INTERNAL_ERROR';
    const status =
      code === 'PROJECT_NOT_FOUND' || code === 'CANDIDATE_NOT_FOUND'
        ? 404
        : code === 'RENDER_ALREADY_ACTIVE'
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
      code,
      message: err.message || 'Failed to create clip.',
    });
  }
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
      code,
      message: err.message || 'Failed to fetch clip.',
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
    // Check monthly clip render limit against plan entitlement
    const entitlements = await EntitlementService.resolveUserEntitlements(userId, req.user?.email);
    if (!entitlements.isUnlimited) {
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

    const nextRenderVersion = Number(clip.render_version || 1) + 1;

    // Snapshot the editor-project version being rendered so the studio can
    // tell a stale download (editor saved newer than the render) apart from a
    // current one, without fragile timestamp comparisons.
    let renderedEditorVersion: number | null = null;
    let renderedEditorSavedAt: string | null = null;
    try {
      const { data: edProj } = await dataRepository
        .from('editor_projects')
        .select('version, updated_at')
        .eq('clip_id', clipId)
        .eq('user_id', userId)
        .maybeSingle();
      renderedEditorVersion = edProj?.version ?? null;
      renderedEditorSavedAt = edProj?.updated_at ?? null;
    } catch { /* non-fatal: leave null */ }

    // Increment render version and queue clip with optional subtitle setting update
    const clipUpdate: Record<string, any> = {
      render_version: nextRenderVersion,
      render_status: 'queued',
      rendered_editor_version: renderedEditorVersion,
      rendered_editor_saved_at: renderedEditorSavedAt,
      updated_at: new Date().toISOString(),
    };
    if (req.body?.caption_enabled !== undefined) {
      clipUpdate.caption_enabled = Boolean(req.body.caption_enabled);
    }
    if (req.body?.caption_style) {
      clipUpdate.caption_style = String(req.body.caption_style);
    }
    await dataRepository
      .from('clips')
      .update(clipUpdate)
      .eq('id', clipId);

    // Create a new render job row for tracking
    const { data: newJob } = await dataRepository
      .from('render_jobs')
      .insert({
        clip_id: clipId,
        user_id: userId,
        status: 'queued',
        progress: 0,
        stage: 'queued',
        attempts: 1,
      })
      .select()
      .maybeSingle();

    // Launch rendering asynchronously (deferred to the sweep when at concurrency cap)
    launchInlineRender(clipId, userId, newJob?.id);

    res.status(202).json({
      status: 'ok',
      message: 'Clip rendering started with saved editor configuration.',
      clipId,
      renderVersion: nextRenderVersion,
      jobId: newJob?.id,
    });
  } catch (err: any) {
    const code = err.code || 'INTERNAL_ERROR';
    const status =
      code === 'CLIP_NOT_FOUND' ? 404 : code === 'RENDER_ALREADY_ACTIVE' ? 409 : 500;

    res.status(status).json({
      status: 'error',
      code,
      message: err.message || 'Failed to trigger render.',
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
      code,
      message: err.message || 'Failed to delete clip.',
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
    const result = await ClipRenderService.getSignedPreviewUrl(clipId, userId);
    res.status(200).json({
      status: 'ok',
      ...result,
    });
  } catch (err: any) {
    const code = err.code || 'INTERNAL_ERROR';
    const status =
      code === 'CLIP_NOT_FOUND' ? 404 : code === 'CLIP_NOT_READY' ? 400 : code === 'WATERMARK_REQUIRED_RERENDER' ? 403 : 500;
    res.status(status).json({
      status: 'error',
      code,
      message: err.message || 'Failed to generate preview URL.',
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
      code === 'CLIP_NOT_FOUND' ? 404 : code === 'CLIP_NOT_READY' ? 400 : code === 'WATERMARK_REQUIRED_RERENDER' ? 403 : 500;
    res.status(status).json({
      status: 'error',
      code,
      message: err.message || 'Failed to generate download URL.',
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
      code,
      message: err.message || 'Failed to load clip editor data.',
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
      code,
      message: err.message || 'Failed to generate clip waveform.',
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
    res.status(500).json({ status: 'error', code, message: err.message || 'Failed to generate asset waveform.' });
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
      code,
      message: err.message || 'Failed to generate clip thumbnails.',
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
      code === 'CLIP_NOT_FOUND'
        ? 404
        : code === 'INVALID_TRIM' || code === 'TRIM_TOO_SHORT' || code === 'INVALID_ASPECT_RATIO' || code === 'INVALID_CAPTION_STYLE' || code === 'INVALID_CAPTION_POSITION' || code === 'EXTEND_BEYOND_SOURCE'
        ? 400
        : 500;

    res.status(status).json({
      status: 'error',
      code,
      message: err.message || 'Failed to update editor configuration.',
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
      code,
      message: err.message || 'Failed to reset editor configuration.',
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
      if (captionItem?.caption && Array.isArray(captionItem.caption.cues) && captionItem.caption.cues.length > 0) {
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
                const fresh = CaptionService.extractCuesForClipSettings(transcript, clip, undefined, { preserveCase: true });
                const merged = mergeExtendedCues(cuesOut, fresh.cues as any, coveredEnd);
                if (merged.appended > 0) cuesOut = merged.cues as any;
              }
            }
          } catch {
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

    // Same extraction the export uses, so preview cues match the burned-in captions.
    const { timingMode, cues } = CaptionService.extractCuesForClipSettings(transcript, clip, undefined, { preserveCase: true });

    res.status(200).json({
      status: 'ok',
      timingMode,
      cues,
    });
  } catch (err: any) {
    const code = err.code || 'INTERNAL_ERROR';
    const status = (code === 'CLIP_NOT_FOUND' || code === 'NOT_FOUND' || err.status === 404) ? 404 : 500;
    res.status(status).json({
      status: 'error',
      code,
      message: err.message || 'Failed to fetch clip captions.',
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
      code,
      message: err.message || 'Failed to start smart reframe analysis.',
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
    const track = await SmartReframeService.getReframeTrack(clipId, userId);

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

    // Return safe data without exposing server paths
    res.status(200).json({
      status: track.status,
      detectedFaceCount: track.detected_face_count || 0,
      dominantTrackId: track.dominant_track_id,
      smoothedKeyframes: track.smoothed_keyframes || [],
      analysisVersion: track.analysis_version,
      analyzedTrimStart: track.analyzed_trim_start,
      analyzedTrimEnd: track.analyzed_trim_end,
      analyzedAspectRatio: track.analyzed_aspect_ratio,
      isStale: Boolean(track.isStale),
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
      code,
      message: err.message || 'Failed to fetch reframe track.',
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
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || 'Failed to generate producer plan.',
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
      res.status(500).json({ status: 'error', message: error.message });
      return;
    }

    res.status(200).json({ status: 'ok', data: plans || [] });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message || 'Failed to fetch producer plans.' });
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
    res.status(500).json({ status: 'error', message: err.message || 'Failed to fetch plan.' });
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
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || 'Failed to revise producer plan.',
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
      code: err.code || 'PREVIEW_FAILED',
      message: err.message || 'Failed to generate preview render.',
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
    const result = await ProducerRenderService.applyPlanToClip(planId, userId);
    res.status(200).json({
      status: 'ok',
      message: 'Producer plan successfully applied to clip.',
      data: result,
    });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({
      status: 'error',
      code: err.code || 'APPLY_FAILED',
      message: err.message || 'Failed to apply producer plan to clip.',
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
    res.status(500).json({ status: 'error', message: err.message || 'Failed to delete plan.' });
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
      .json({ status: 'error', code: err.code || 'HOOK_GENERATION_FAILED', message: err.message || 'Hook generation failed.' });
  }
};
