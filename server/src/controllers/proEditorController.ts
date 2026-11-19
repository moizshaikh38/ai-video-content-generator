import {closeSavedRenderSubmission} from '../db/repositories/renderSubmissionCloseRepository.js';
import {parseRenderSubmission, lookupRenderSubmission} from '../db/repositories/renderSubmissionRepository.js';
import {assertRenderPlanPreflight} from '../services/renderPlanPreflight.js';
import {enqueueRenderJob, assertRenderAdmissionEnabled} from '../db/repositories/renderAdmissionRepository.js';
import {editorRenderSnapshot} from '../shared/editorRenderSnapshot.js';
import {sendSafeControllerError} from '../utils/safeControllerError.js';
import {assertSelectionSourceCurrent} from '../services/selectionSourceGuardService.js';
import {expandSceneLayoutProject} from '../shared/sceneLayoutOverrides.js';
import { assertPanelViewsAssigned } from '../shared/panelLayouts.js';
import { parseRenderResolutionStrict } from '../shared/renderResolution.js';
import { Response } from 'express';
import { AuthenticatedRequest, isValidUUID } from '../types/index.js';
import { ProEditorService } from '../services/proEditorService.js';
import { ClipRenderService, launchInlineRender } from '../services/clipRenderService.js';
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
    sendSafeControllerError(res, err, {message: 'Failed to initialize editor project.'});
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
    sendSafeControllerError(res, err, {message: 'Failed to fetch editor project.'});
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
    const updated = await ProEditorService.updateEditorProject(projectId, userId, req.body || {}, {clientSupplied:true});
    res.status(200).json({ status: 'ok', data: updated });
  } catch (err: any) {
    sendSafeControllerError(res, err, {message: 'Failed to update editor project.'});
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
    sendSafeControllerError(res, err, {message: 'Failed to split item.'});
  }
};

/**
 * POST /api/editor-projects/:id/ripple-delete
 * Deletes an item and closes the gap on the timeline.
 */
/**
 * POST /api/editor-projects/:id/remove-fillers
 * Preview (default) or confirmed temporal filler-word removal via ripple cuts.
 */
export const removeEditorProjectFillers = async (
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
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid editor project UUID required.' });
    return;
  }

  try {
    const result = await ProEditorService.removeFillers(projectId, userId, {
      confirmed: req.body?.confirmed === true,
      includeTier2: req.body?.includeTier2 !== false,
    });
    res.status(200).json({ status: 'ok', ...result });
  } catch (err: any) {
    const code = err.code || 'FILLER_REMOVAL_FAILED';
    const status = err.statusCode || (code === 'NO_WORD_TIMINGS' ? 400 : code === 'PROJECT_NOT_FOUND' ? 404 : 500);
    sendSafeControllerError(res, err, {status, code, message: 'Filler removal failed.'});
  }
};

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
    sendSafeControllerError(res, err, {message: 'Failed to ripple delete item.'});
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
    sendSafeControllerError(res, err, {message: 'Failed to duplicate item.'});
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
    sendSafeControllerError(res, err, {message: 'Failed to freeze frame.'});
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
    sendSafeControllerError(res, err, {status: 500, message: 'Snapshot capture failed.'});
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
    if(req.body?.submission_id===undefined)assertRenderAdmissionEnabled();
    const project = await ProEditorService.getEditorProject(projectId, userId);
    if(!project.clip_id||!isValidUUID(project.clip_id)){res.status(404).json({status:'error',code:'CLIP_NOT_FOUND',message:'Editor project has no valid owning clip.'});return;}

    let submission;
    if(req.body?.submission_id!==undefined){
      if(req.body.caption_enabled!==undefined||req.body.caption_style!==undefined||req.body.platform!==undefined){
        res.status(400).json({status:'error',code:'INVALID_RENDER_SUBMISSION',message:'Keyed editor-project renders accept resolution and saved revision preconditions only.'});return;
      }
      const normalized={...req.body};
      if(normalized.resolution!==undefined){
        if(normalized.render_resolution!==undefined&&normalized.render_resolution!==normalized.resolution){res.status(400).json({status:'error',code:'INVALID_RENDER_SUBMISSION',message:'Conflicting render resolutions.'});return;}
        normalized.render_resolution=normalized.resolution;delete normalized.resolution;
      }
      submission=parseRenderSubmission(normalized,project.clip_id,projectId);
      if(req.body.cancel_only===true&&submission){
        const result=await closeSavedRenderSubmission(userId,project.clip_id,submission);
        if(!result)throw new Error('Saved request close did not return a verifiable result.');
        if(result.cancelled){res.status(200).json({status:'ok',cancelled:true,submissionId:submission.id});return;}
        const prior=result.receipt;if(!prior)throw new Error('Saved request close did not return a receipt.');
        res.status(200).json({status:'ok',data:{job_id:prior.job.id,project_id:projectId,clip_id:project.clip_id,status:'queued',render_version:prior.renderVersion,editor_version:prior.job.editor_version,replayed:true}});return;
      }
      const prior=await lookupRenderSubmission(userId,project.clip_id,submission);
      if(prior){res.status(200).json({status:'ok',data:{job_id:prior.job.id,project_id:projectId,clip_id:project.clip_id,status:'queued',render_version:prior.renderVersion,editor_version:prior.job.editor_version,replayed:true}});return;}
      if(req.body.recover_only===true){res.status(404).json({status:'error',code:'RENDER_SUBMISSION_NOT_FOUND',message:'No committed receipt was found. No new render was started.'});return;}
      assertRenderAdmissionEnabled();
    }else if(req.body?.recover_only!==undefined||req.body?.cancel_only!==undefined||req.body?.expected_render_version!==undefined||req.body?.expected_editor_version!==undefined){
      res.status(400).json({status:'error',code:'INVALID_RENDER_SUBMISSION',message:'A saved submission key is required.'});return;
    }

    assertPanelViewsAssigned(expandSceneLayoutProject(project));

    // Fetch next render version
    const { data: clip, error: clipReadError } = await dataRepository
      .from('clips')
      .select('render_version, editor_version, project_id, source_storage_path, selection_source_receipt, caption_style')
      .eq('id', project.clip_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (clipReadError) throw clipReadError;
    if (!clip) throw Object.assign(new Error('Clip not found.'),{statusCode:404,code:'CLIP_NOT_FOUND'});
    if(submission&&(Number(clip.render_version??1)!==submission.expectedRenderVersion||Number(clip.editor_version??1)!==submission.expectedEditorVersion)){
      throw Object.assign(new Error('Saved inputs changed before this submission was admitted.'),{statusCode:409,code:'RENDER_INPUT_CHANGED'});
    }
    const quotaPolicy=await assertRenderPlanPreflight(userId, req.user?.email, clip.caption_style);
    await assertSelectionSourceCurrent(userId,clip.project_id,clip.selection_source_receipt,clip.source_storage_path);

    let requestedResolution: string | null = null;
    const bodyResolution = req.body?.render_resolution ?? req.body?.resolution;
    if (bodyResolution !== undefined && bodyResolution !== null && bodyResolution !== '') {
      requestedResolution = parseRenderResolutionStrict(bodyResolution);
      if (!requestedResolution) {
        res.status(400).json({
          status: 'error',
          code: 'INVALID_RESOLUTION',
          message: 'resolution must be one of 720p, 1080p, 1440p, 2160p (4K).',
        });
        return;
      }
    }

    const {job:newJob,renderVersion:nextRenderVersion,replayed} = await enqueueRenderJob({
      submission,clipId:project.clip_id,userId,quotaPolicy,
      expectedRenderVersion:Number(clip.render_version??1),
      expectedEditorVersion:Number(clip.editor_version??1),
      expectedEditorProject:editorRenderSnapshot(project),
      settings:requestedResolution?{render_resolution:requestedResolution}:{},
    });

    // Launch rendering asynchronously (deferred to the sweep when at concurrency cap)
    if(!replayed)launchInlineRender(project.clip_id, userId, newJob.id);

    res.status(replayed?200:202).json({
      status: 'ok',
      message: 'Editor project render queued successfully.',
      data: {
        job_id: newJob.id,
        project_id: projectId,
        clip_id: project.clip_id,
        status: 'queued',
        render_version: nextRenderVersion,
        editor_version: newJob.editor_version,
        replayed:Boolean(replayed),
      },
    });
  } catch (err: any) {
    sendSafeControllerError(res, err, {message: 'Failed to trigger render for editor project.'});
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
    sendSafeControllerError(res, err, {message: 'Failed to export NLE XML.'});
  }
};


