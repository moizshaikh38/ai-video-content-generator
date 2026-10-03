import { Response } from 'express';
import { AuthenticatedRequest, isValidUUID, ClipCandidateStatus, ClipAspectRatio } from '../types/index.js';
import { ClipAnalysisService } from '../services/clipAnalysisService.js';
import { ClipRenderService } from '../services/clipRenderService.js';
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

  const { candidateId, aspectRatio = '9:16', cropMode = 'center' } = req.body || {};

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
    const result = await ClipRenderService.createClipFromCandidate(
      projectId,
      userId,
      candidateId,
      aspectRatio,
      cropMode
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
    const clips = await ClipRenderService.getProjectClips(projectId, userId);
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
 * POST /api/clips/:clipId/render
 * Initiates re-render or retries a failed clip
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
    // Launch rendering asynchronously
    ClipRenderService.renderClipJob(clipId, userId).catch((err) => {
      logger.error('Background re-render caught error', { clipId, error: err.message });
    });

    res.status(202).json({
      status: 'ok',
      message: 'Clip rendering started.',
      clipId,
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
      code === 'CLIP_NOT_FOUND' ? 404 : code === 'CLIP_NOT_READY' ? 400 : 500;
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
      code === 'CLIP_NOT_FOUND' ? 404 : code === 'CLIP_NOT_READY' ? 400 : 500;
    res.status(status).json({
      status: 'error',
      code,
      message: err.message || 'Failed to generate download URL.',
    });
  }
};

