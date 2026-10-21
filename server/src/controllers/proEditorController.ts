import { Response } from 'express';
import { AuthenticatedRequest, isValidUUID } from '../types/index.js';
import { ProEditorService } from '../services/proEditorService.js';
import { ClipRenderService } from '../services/clipRenderService.js';
import { NleExportService } from '../services/nleExportService.js';
import { dataRepository } from '../db/repositories/dataRepository.js';
import { logger } from '../utils/logger.js';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

/**
 * POST /api/clips/:clipId/editor-project
 * Initializes or fetches an existing multi-track EditorProject for the clip.
 */
export const getOrCreateClipEditorProject = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const clipId = req.params.clipId;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!clipId || !isValidUUID(clipId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid clip UUID required.' });
    return;
  }

  try {
    const project = await ProEditorService.getOrCreateEditorProject(clipId, userId, req.body || {});
    res.status(200).json({ status: 'ok', data: project });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      status: 'error',
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || 'Failed to initialize editor project.',
    });
  }
};

/**
 * GET /api/editor-projects/:id
 * Fetches an EditorProject by ID.
 */
export const getEditorProject = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const projectId = req.params.id;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!projectId || !isValidUUID(projectId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid project UUID required.' });
    return;
  }

  try {
    const project = await ProEditorService.getEditorProject(projectId, userId);
    res.status(200).json({ status: 'ok', data: project });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      status: 'error',
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || 'Failed to fetch editor project.',
    });
  }
};

/**
 * PATCH /api/editor-projects/:id
 * Updates an EditorProject with debounced timeline changes.
 */
export const updateEditorProject = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const projectId = req.params.id;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!projectId || !isValidUUID(projectId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid project UUID required.' });
    return;
  }

  try {
    const updated = await ProEditorService.updateEditorProject(projectId, userId, req.body || {});
    res.status(200).json({ status: 'ok', data: updated });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      status: 'error',
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || 'Failed to update editor project.',
    });
  }
};

/**
 * POST /api/editor-projects/:id/split
 * Splits a clip at the playhead position into two non-destructive items.
 */
export const splitEditorItem = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const projectId = req.params.id;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!projectId || !isValidUUID(projectId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid project UUID required.' });
    return;
  }

  try {
    const updated = await ProEditorService.splitItem(projectId, userId, req.body);
    res.status(200).json({ status: 'ok', data: updated });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      status: 'error',
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || 'Failed to split item.',
    });
  }
};

/**
 * POST /api/editor-projects/:id/ripple-delete
 * Deletes an item and closes the gap on the timeline.
 */
export const rippleDeleteEditorItem = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const projectId = req.params.id;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!projectId || !isValidUUID(projectId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid project UUID required.' });
    return;
  }

  try {
    const updated = await ProEditorService.rippleDelete(projectId, userId, req.body);
    res.status(200).json({ status: 'ok', data: updated });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      status: 'error',
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || 'Failed to ripple delete item.',
    });
  }
};

/**
 * POST /api/editor-projects/:id/duplicate
 * Duplicates a selected item on the timeline.
 */
export const duplicateEditorItem = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const projectId = req.params.id;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!projectId || !isValidUUID(projectId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid project UUID required.' });
    return;
  }

  try {
    const updated = await ProEditorService.duplicateItem(projectId, userId, req.body);
    res.status(200).json({ status: 'ok', data: updated });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      status: 'error',
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || 'Failed to duplicate item.',
    });
  }
};

/**
 * POST /api/editor-projects/:id/freeze
 * Inserts a still freeze frame segment.
 */
export const freezeEditorItem = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const projectId = req.params.id;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!projectId || !isValidUUID(projectId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid project UUID required.' });
    return;
  }

  try {
    const updated = await ProEditorService.freezeFrame(projectId, userId, req.body);
    res.status(200).json({ status: 'ok', data: updated });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      status: 'error',
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || 'Failed to freeze frame.',
    });
  }
};

/**
 * POST /api/editor-projects/:id/snapshot
 * Exports the current frame as an image.
 */
export const captureEditorSnapshot = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const projectId = req.params.id;
  const timestamp = Number(req.body.timestamp || 0);

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!projectId || !isValidUUID(projectId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid project UUID required.' });
    return;
  }

  try {
    const project = await ProEditorService.getEditorProject(projectId, userId);
    const { data: clip } = await dataRepository
      .from('clips')
      .select('*')
      .eq('id', project.clip_id)
      .single();

    const tmpOut = path.join(os.tmpdir(), `vireo-snap-${crypto.randomUUID()}.png`);
    await ProEditorService.captureSnapshot(clip.source_storage_path, timestamp, tmpOut);

    res.download(tmpOut, `snapshot-${Math.round(timestamp)}s.png`, () => {
      try {
        fs.unlinkSync(tmpOut);
      } catch {}
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message || 'Snapshot capture failed.' });
  }
};

/**
 * POST /api/editor-projects/:id/render
 * Initiates render job for an EditorProject, delegating to ClipRenderService
 */
export const renderEditorProject = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const projectId = req.params.id;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!projectId || !isValidUUID(projectId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid project UUID required.' });
    return;
  }

  try {
    const project = await ProEditorService.getEditorProject(projectId, userId);

    // Fetch next render version
    const { data: clip } = await dataRepository
      .from('clips')
      .select('render_version')
      .eq('id', project.clip_id)
      .eq('user_id', userId)
      .maybeSingle();

    const nextRenderVersion = (clip?.render_version || 0) + 1;

    // Update clip status
    await dataRepository
      .from('clips')
      .update({
        render_status: 'rendering',
        render_version: nextRenderVersion,
        render_error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', project.clip_id);

    // Create a new render job row
    const { data: newJob } = await dataRepository
      .from('render_jobs')
      .insert({
        clip_id: project.clip_id,
        user_id: userId,
        status: 'queued',
        progress: 0,
        stage: 'queued',
        attempts: 1,
      })
      .select()
      .maybeSingle();

    // Launch rendering asynchronously
    ClipRenderService.renderClipJob(project.clip_id, userId, newJob?.id).catch((err) => {
      logger.error('ProEditor render job error', { projectId, clipId: project.clip_id, error: err.message });
    });

    res.status(202).json({
      status: 'ok',
      message: 'Editor project render queued successfully.',
      data: {
        job_id: newJob?.id,
        project_id: projectId,
        clip_id: project.clip_id,
        status: 'queued',
        render_version: nextRenderVersion,
      },
    });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      status: 'error',
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || 'Failed to trigger render for editor project.',
    });
  }
};

/**
 * GET or POST /api/clips/:clipId/export/nle-xml
 * Generates and returns Premiere Pro / DaVinci Resolve XML or FCPXML
 */
export const exportClipNleXml = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const clipId = req.params.clipId;
  const format = ((req.query.format as string) || req.body?.format || 'premiere') as 'premiere' | 'fcpxml';

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!clipId || !isValidUUID(clipId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid clip UUID required.' });
    return;
  }

  try {
    const project = await ProEditorService.getOrCreateEditorProject(clipId, userId, req.body?.project || {});
    const { data: clip } = await dataRepository
      .from('clips')
      .select('*')
      .eq('id', clipId)
      .eq('user_id', userId)
      .maybeSingle();

    const nleResult = NleExportService.generatePremiereAndFcpxml(project, clip || undefined);
    const filename = `${nleResult.filenameBase}.${format === 'fcpxml' ? 'fcpxml' : 'xml'}`;
    const xmlContent = format === 'fcpxml' ? nleResult.fcpxml : nleResult.premiereXml;

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(xmlContent);
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      status: 'error',
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || 'Failed to export NLE XML.',
    });
  }
};


