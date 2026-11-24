import {coreProcessingDispatchEnabled,runsBackgroundWorkers} from '../services/runtimePolicy.js';
import {AppError} from '../types/index.js';
import {transcriptReviewCode} from '../shared/transcriptReviewErrors.js';
import {insertProjectWithinQuota, projectQuotaPolicy} from '../db/repositories/projectQuotaRepository.js';
import {workLifecycle} from '../services/queue/workLifecycle.js';
import {assertTranscriptReusable} from '../services/transcriptSourceBindingService.js';
import {withNewProjectFraming} from '../shared/newProjectFraming.js';
import { isMongoConfigured, getMongoDb,getMongoClient } from '../db/mongoClient.js';
import { dataRepository,ownerContext } from '../db/repositories/dataRepository.js';
import { Response } from 'express';
import crypto from 'crypto';
import {
  AuthenticatedRequest,
  isValidUUID,
  VALID_PLATFORMS,
  OutputPlatform,
  PROCESSABLE_STATUSES,
} from '../types/index.js';
import { deletePrefix, projectObjectPrefix, sourceObjectKey, signSourceUpload, headObject, signObjectGet } from '../services/objectStorageService.js';
import { UploadLifecycleService } from '../services/uploadLifecycleService.js';
import { ProjectPosterService } from '../services/projectPosterService.js';
import { deleteProjectRecords } from '../db/repositories/deletionRepository.js';
import { admitProjectDeletion, DELETION_MARKER_FIELD } from '../services/deletionAdmissionService.js';
import { claimProjectProcessing,releaseUnadmittedProcessing } from '../db/repositories/projectRepository.js';
import { UrlIngestionService } from '../services/urlIngestionService.js';
import { registerPublicId } from '../middleware/publicIdMiddleware.js';
import { GenreIntelligenceService } from '../services/genreIntelligenceService.js';
import { ClipPreferences } from '../types/index.js';
import { EntitlementService } from '../services/entitlementService.js';
import { CreditWalletService } from '../services/creditWalletService.js';
import { CreditPricingService } from '../services/billing/creditPricingService.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import { createProjectRetention } from '../shared/projectRetention.js';

const ALLOWED_MIME_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-msvideo',
  'video/x-matroska',
  'video/avi',
  'video/mkv',
];

/**
 * GET /api/projects
 * List all projects belonging to the authenticated user with pagination
 */
export const listProjects = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!isMongoConfigured) {
    res.status(503).json({
      status: 'error',
      code: 'SERVICE_UNAVAILABLE',
      message: 'Database service is not configured. Please configure MongoDB credentials.',
    });
    return;
  }

  const limitParam = parseInt(String(req.query.limit || '50'), 10);
  const offsetParam = parseInt(String(req.query.offset || '0'), 10);
  const limit = Math.min(Math.max(1, isNaN(limitParam) ? 50 : limitParam), 100);
  const offset = Math.max(0, isNaN(offsetParam) ? 0 : offsetParam);

  try {
    const { data, count, error } = await dataRepository
      .from('projects')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      logger.error('Failed to list projects from MongoDB', {
        requestId: req.requestId,
        userId,
        error: error.message,
      });
      res.status(500).json({ status: 'error', code: 'DB_ERROR', message: 'Failed to retrieve projects.' });
      return;
    }

    const rawList = data || [];
    // Listing is read-only. Failed projects may contain recoverable sources/transcripts.
    // Cleanup belongs to an explicit, separately authorized lifecycle operation.
    // Sign existing HD posters inline so the dashboard needs no extra request per card.
    const projectsWithPosters = await Promise.all(rawList.map(withPosterUrl));

    res.status(200).json({
      status: 'ok',
      projects: projectsWithPosters,
      total: count ?? rawList.length,
      limit,
      offset,
    });
  } catch (err) {
    logger.error('Unexpected error listing projects', {
      requestId: req.requestId,
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ status: 'error', code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' });
  }
};

/**
 * GET /api/projects/:id
 * Retrieve a specific project owned by the authenticated user
 */
export const getProject = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
    const { data, error } = await dataRepository
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      logger.error('Failed to fetch project from MongoDB', {
        requestId: req.requestId,
        projectId,
        userId,
        error: error.message,
      });
      res.status(500).json({ status: 'error', code: 'DB_ERROR', message: 'Failed to fetch project.' });
      return;
    }

    if (!data) {
      res.status(404).json({ status: 'error', code: 'NOT_FOUND', message: 'Project not found or access denied.' });
      return;
    }

    res.status(200).json({ status: 'ok', project: await withPosterUrl(data) });
  } catch (err) {
    logger.error('Unexpected error fetching project', {
      requestId: req.requestId,
      projectId,
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ status: 'error', code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' });
  }
};

/** PATCH /api/projects/:id: editable project metadata only. */
export const updateProject = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const projectId = req.params.id;
  if (!req.user?.id) { res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'Authentication required.' }); return; }
  if (!projectId || !isValidUUID(projectId)) { res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid project UUID required.' }); return; }
  const updates: Record<string, any> = {};
  if (typeof req.body?.title === 'string') {
    const value = req.body.title.trim();
    if (!value || value.length > 255) { res.status(400).json({ status: 'error', code: 'INVALID_TITLE', message: 'Title must be 1 to 255 characters.' }); return; }
    updates.title = value;
  }
  if (typeof req.body?.notes === 'string') updates.notes = req.body.notes.trim().slice(0, 2000);
  const rawPreferences = req.body?.clip_preferences || req.body?.clipPreferences;
  if (rawPreferences) {
    updates.clip_preferences = GenreIntelligenceService.normalizePreferences(rawPreferences, req.body?.notes);
  }
  if (!Object.keys(updates).length) { res.status(400).json({ status: 'error', code: 'INVALID_UPDATE', message: 'No editable fields supplied.' }); return; }
  const { data, error } = await dataRepository.from('projects').update(updates).eq('id', projectId).select().maybeSingle();
  if (error) { res.status(503).json({ status: 'error', code: 'DATABASE_UNAVAILABLE', message: 'Project update failed.' }); return; }
  if (!data) { res.status(404).json({ status: 'error', code: 'PROJECT_NOT_FOUND', message: 'Project not found.' }); return; }
  res.status(200).json({ status: 'ok', project: data });
};

/**
 * POST /api/projects
 * Create a new video project with strict validation
 */
export const createProject = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!isMongoConfigured) {
    res.status(503).json({
      status: 'error',
      code: 'SERVICE_UNAVAILABLE',
      message: 'Database service is not configured. Project creation requires MongoDB connection.',
    });
    return;
  }

  const {
    id,
    title,
    source_type = 'upload',
    source_url,
    storage_path,
    file_size,
    mime_type,
    notes = '',
  } = req.body || {};

  if (!title || typeof title !== 'string' || !title.trim()) {
    res.status(400).json({ status: 'error', code: 'INVALID_TITLE', message: 'Project title is required.' });
    return;
  }

  if (source_type !== 'upload') {
    res.status(400).json({ status: 'error', code: 'UNSUPPORTED_SOURCE', message: 'Only direct video uploads are supported.' });
    return;
  }

  if (title.trim().length > 255) {
    res.status(400).json({ status: 'error', code: 'TITLE_TOO_LONG', message: 'Project title cannot exceed 255 characters.' });
    return;
  }

  if (id && !isValidUUID(id)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Supplied project ID must be a valid UUID.' });
    return;
  }

  // Validate user entitlements for project creation
  const entitlements = await EntitlementService.resolveUserEntitlements(userId, req.user?.email);

  // Validate file size limit against plan entitlements and server cap
  if (file_size !== undefined && file_size !== null) {
    const bytes = Number(file_size);
    const effectiveMaxBytes = Math.min(config.maxVideoBytes, entitlements.limits.maxFileSizeBytes);
    if (isNaN(bytes) || bytes < 0 || bytes > effectiveMaxBytes) {
      res.status(400).json({
        status: 'error',
        code: 'FILE_SIZE_EXCEEDED',
        message: `Video file exceeds your plan limit of ${Math.round(entitlements.limits.maxFileSizeBytes / (1024 * 1024))} MB.`,
        limit_bytes: effectiveMaxBytes,
      });
      return;
    }
  }

  // Validate monthly project creation limit
  if (!entitlements.isUnlimited) {
    const db = await getMongoDb();
    const currentMonthStart = new Date();
    currentMonthStart.setUTCDate(1);
    currentMonthStart.setUTCHours(0, 0, 0, 0);

    const projectCount = await db.collection('projects').countDocuments({
      user_id: userId,
      $or: [
        { created_at: { $gte: currentMonthStart } },
        { created_at: { $gte: currentMonthStart.toISOString() } },
      ],
    });

    if (projectCount >= entitlements.limits.maxProjects) {
      res.status(403).json({
        status: 'error',
        code: 'MONTHLY_PROJECT_LIMIT_EXCEEDED',
        message: `Your ${entitlements.displayName} plan allows up to ${entitlements.limits.maxProjects} projects per month. Please upgrade your plan to create more projects.`,
        limit: entitlements.limits.maxProjects,
        current: projectCount,
      });
      return;
    }
  }

  // Validate MIME type if supplied
  if (mime_type && !ALLOWED_MIME_TYPES.includes(mime_type.toLowerCase())) {
    res.status(400).json({
      status: 'error',
      code: 'INVALID_MIME_TYPE',
      message: 'Invalid video file format. Supported formats are MP4, MOV, WEBM, AVI, and MKV.',
    });
    return;
  }

  if (storage_path || source_url) {
    res.status(400).json({ status: 'error', code: 'UPLOAD_REQUIRED', message: 'Use the signed upload endpoint for video files.' });
    return;
  }

  const rawPreferences = req.body?.clip_preferences || req.body?.clipPreferences;
  let normalizedPreferences: ClipPreferences | undefined = undefined;
  normalizedPreferences = GenreIntelligenceService.normalizePreferences(withNewProjectFraming(rawPreferences||{}), notes);

  const internalProjectId = id || crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const projectRecord: any = {
    id: internalProjectId,
    created_at: createdAt,
    retention_policy: createProjectRetention(entitlements.planId, createdAt),
    user_id: userId,
    title: title.trim(),
    source_type,
    source_url: null,
    video_status: 'uploading',
    notes: String(notes || '').trim().slice(0, 2000),
    ...(normalizedPreferences ? { clip_preferences: normalizedPreferences } : {}),
  };

  try {
    const data = await insertProjectWithinQuota(userId, projectRecord, projectQuotaPolicy(entitlements));

    // Register the public ID for URL-safe external references
    try {
      const publicId = await registerPublicId(internalProjectId, 'projects', userId);
      res.status(201).json({ status: 'ok', project: { ...data, public_id: publicId } });
    } catch {
      // Public ID registration is best-effort; the project is already created
      res.status(201).json({ status: 'ok', project: data });
    }
  } catch (err) {
    logger.error('Unexpected error creating project', {
      requestId: req.requestId,
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    const failure = err as any;
    const status = failure.statusCode || 500;
    res.status(status).json({status: 'error', code: status < 500 ? failure.code : 'INTERNAL_ERROR', message: status < 500 ? failure.message : 'An unexpected error occurred.'});
  }
};

/**
 * POST /api/projects/ingest-url
 * Ingests a public video URL: validates URL & SSRF, downloads to temp disk with byte limit,
 * probes video streams with FFmpeg, uploads to R2, and creates a project in 'uploaded' status.
 */
export const ingestProjectUrl = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
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

  const {
    url,
    title,
    notes,
    id,
    clip_preferences,
    clipPreferences,
    startTimeSec,
    endTimeSec,
    start_time_sec,
    end_time_sec,
  } = req.body || {};

  if (!url || typeof url !== 'string' || !url.trim()) {
    res.status(400).json({ status: 'error', code: 'INVALID_URL', message: 'Valid video URL is required.' });
    return;
  }

  if (id && !isValidUUID(id)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Supplied project ID must be a valid UUID.' });
    return;
  }

  // Validate user entitlements for project creation via URL ingestion
  const entitlements = await EntitlementService.resolveUserEntitlements(userId, req.user?.email);
  if (!entitlements.isUnlimited) {
    const db = await getMongoDb();
    const currentMonthStart = new Date();
    currentMonthStart.setUTCDate(1);
    currentMonthStart.setUTCHours(0, 0, 0, 0);

    const projectCount = await db.collection('projects').countDocuments({
      user_id: userId,
      $or: [
        { created_at: { $gte: currentMonthStart } },
        { created_at: { $gte: currentMonthStart.toISOString() } },
      ],
    });

    if (projectCount >= entitlements.limits.maxProjects) {
      res.status(403).json({
        status: 'error',
        code: 'MONTHLY_PROJECT_LIMIT_EXCEEDED',
        message: `Your ${entitlements.displayName} plan allows up to ${entitlements.limits.maxProjects} projects per month. Please upgrade your plan to create more projects.`,
        limit: entitlements.limits.maxProjects,
        current: projectCount,
      });
      return;
    }
  }

  try {
    const rawPreferences = clip_preferences || clipPreferences;
    const startSec = typeof startTimeSec === 'number' ? startTimeSec : (typeof start_time_sec === 'number' ? start_time_sec : undefined);
    const endSec = typeof endTimeSec === 'number' ? endTimeSec : (typeof end_time_sec === 'number' ? end_time_sec : undefined);

    const result = await UrlIngestionService.ingestUrlToProject({
      userId,
      creationPlanId: entitlements.planId,
      projectQuota: projectQuotaPolicy(entitlements),
      projectId: id,
      url: url.trim(),
      title: typeof title === 'string' ? title.trim() : undefined,
      notes: typeof notes === 'string' ? notes.trim() : undefined,
      clipPreferences: rawPreferences,
      startTimeSec: startSec,
      endTimeSec: endSec,
    });

    if (rawPreferences) {
      const normalized = GenreIntelligenceService.normalizePreferences(withNewProjectFraming(rawPreferences), notes);
      await dataRepository
        .from('projects')
        .update({ clip_preferences: normalized })
        .eq('id', result.projectId)
        .eq('user_id', userId);
    }

    const { data: project } = await dataRepository
      .from('projects')
      .select('*')
      .eq('id', result.projectId)
      .eq('user_id', userId)
      .single();

    res.status(201).json({
      status: 'ok',
      project,
      message: 'Video URL successfully ingested into project.',
    });
  } catch (err: any) {
    const status = err.statusCode || 500;
    const code = err.code || 'INGESTION_FAILED';
    const message = err.message || 'Failed to ingest video URL.';

    logger.error('Error during URL ingestion', {
      requestId: req.requestId,
      userId,
      code,
      error: message,
    });

    res.status(status).json({
      status: 'error',
      code: status >= 500 ? 'INTERNAL_ERROR' : code,
      message: status >= 500 ? 'Internal server error' : message,
    });
  }
}

/**
 * Pre-ingest URL metadata probe returning provider, chapters, duration, and auto-genre in ~1s.
 */
export async function probeProjectUrl(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { url } = req.body || {};
  if (!url || typeof url !== 'string' || !url.trim()) {
    res.status(400).json({ status: 'error', code: 'INVALID_URL', message: 'Valid video URL is required.' });
    return;
  }

  try {
    const probe = await UrlIngestionService.probeUrlMetadata(url.trim(),15000,req.user?.id);
    res.status(200).json({
      status: 'ok',
      probe,
    });
  } catch (err: any) {
    logger.error('Failed to probe video URL metadata', { error: err.message, url });
    const status = err.statusCode || 500;
    const code = err.code || 'PROBE_FAILED';
    const message = err.message || 'Failed to probe video URL.';
    res.status(status).json({
      status: 'error',
      code: status >= 500 ? 'INTERNAL_ERROR' : code,
      message: status >= 500 ? 'Internal server error' : message,
    });
  }
};

/** Short lived, owner-scoped upload grant. The browser receives only a URL and headers. */
export const createProjectUploadUrl = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const projectId = req.params.id;
  if (!userId) { res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'Authentication required.' }); return; }
  if (!projectId || !isValidUUID(projectId)) { res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid project UUID required.' }); return; }
  const { fileName, fileSize, contentType } = req.body || {};
  if (typeof fileName !== 'string' || typeof contentType !== 'string' || !ALLOWED_MIME_TYPES.includes(contentType.toLowerCase())) {
    res.status(400).json({ status: 'error', code: 'INVALID_FILE', message: 'A supported video filename and MIME type are required.' }); return;
  }
  const entitlements = await EntitlementService.resolveUserEntitlements(userId, req.user?.email);
  const size = Number(fileSize);
  const effectiveMaxBytes = Math.min(config.maxVideoBytes, entitlements.limits.maxFileSizeBytes);
  if (!Number.isSafeInteger(size) || size <= 0 || size > effectiveMaxBytes) {
    res.status(400).json({ status: 'error', code: 'FILE_SIZE_EXCEEDED', message: `Video must be between 1 byte and ${Math.round(effectiveMaxBytes / (1024 * 1024))} MB.`, limit_bytes: effectiveMaxBytes }); return;
  }
  const { data: project, error } = await dataRepository.from('projects').select('*').eq('id', projectId).maybeSingle();
  if (error || !project) { res.status(404).json({ status: 'error', code: 'PROJECT_NOT_FOUND', message: 'Project not found.' }); return; }
  if (DELETION_MARKER_FIELD in project) {
    res.status(409).json({status: 'error', code: 'PROJECT_DELETING', message: 'This project is being deleted.'}); return;
  }
  if (!['uploading', 'failed'].includes(project.video_status)) {
    res.status(409).json({ status: 'error', code: 'UPLOAD_NOT_ALLOWED', message: 'Project cannot accept an upload now.' }); return;
  }
  const key = sourceObjectKey(userId, projectId, fileName);
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  const uploadUrl = await signSourceUpload(key, contentType);

  // Admit the parent session and immutable attempt in one transaction.
  const attempt = await UploadLifecycleService.admitAttempt({
    userId,
    projectId,
    objectKey: key,
    fileName,
    fileSize: size,
    contentType,
    expiresAt,
  });

  res.status(200).json({ status: 'ok', uploadUrl, headers: { 'Content-Type': contentType }, expiresInSeconds: 900, attemptId: attempt.id, objectKey: key });
};

export const confirmProjectUpload = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const projectId = req.params.id;
  if (!userId) { res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'Authentication required.' }); return; }
  if (!projectId || !isValidUUID(projectId)) { res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid project UUID required.' }); return; }
  const { data: project, error } = await dataRepository.from('projects').select('*').eq('id', projectId).maybeSingle();
  if (error || !project) { res.status(404).json({ status: 'error', code: 'PROJECT_NOT_FOUND', message: 'Project not found.' }); return; }

  // A deleting parent must never return an idempotent upload success.
  if (DELETION_MARKER_FIELD in project) {
    res.status(409).json({status: 'error', code: 'PROJECT_DELETING', message: 'This project is being deleted.'}); return;
  }

  // Accept optional attemptId or objectKey in request body for explicit fencing
  const { attemptId, objectKey } = req.body || {};
  const targetKey = objectKey || project.pending_upload_key;

  if (project.video_status === 'uploaded' && project.source_url && !project.pending_upload_key) {
    if (!targetKey || targetKey === project.source_url) {
      res.status(200).json({ status: 'ok', project }); return;
    }
  }

  if (!project.pending_upload_key || !project.pending_upload_size || !project.pending_upload_mime_type ||
      !project.pending_upload_expires_at || new Date(project.pending_upload_expires_at).getTime() < Date.now()) {
    res.status(409).json({ status: 'error', code: 'UPLOAD_SESSION_EXPIRED', message: 'Request a new upload URL.' }); return;
  }

  // Fencing check: If an explicit targetKey or attemptId is provided and does not match the active session,
  // reject as a stale or mismatched confirmation
  if (targetKey && targetKey !== project.pending_upload_key) {
    res.status(409).json({ status: 'error', code: 'STALE_UPLOAD_CONFIRMATION', message: 'Confirmation does not match active upload session.' }); return;
  }

  const object = await headObject('source', project.pending_upload_key);
  if (object.size !== project.pending_upload_size || object.size > config.maxVideoBytes ||
      object.contentType.toLowerCase() !== project.pending_upload_mime_type.toLowerCase()) {
    res.status(400).json({ status: 'error', code: 'UPLOAD_MISMATCH', message: 'Uploaded file does not match the signed upload session.' }); return;
  }

  // Confirm the attempt in UploadLifecycleService
  const attemptResult = await UploadLifecycleService.confirmAttempt({
    userId,
    projectId,
    attemptId,
    objectKey: project.pending_upload_key,
  });

  // Atomic Compare-And-Swap (CAS) update on the projects collection
  // Requirements:
  // 1. Matches project ID and authenticated user ID (tenant isolation).
  // 2. Matches pending_upload_key === targetKey (strictly matches the confirmed attempt's key).
  // 3. Matches video_status in ['uploading', 'pending'].
  // 4. Sets canonical source only if all conditions match.
  // 5. Inspects affected modifiedCount (CAS fencing).
  const db = await getMongoDb();
  const casResult = await db.collection('projects').findOneAndUpdate(
    {
      id: projectId,
      user_id: userId,
      pending_upload_key: project.pending_upload_key,
      [DELETION_MARKER_FIELD]: {$exists: false},
      video_status: { $in: ['uploading', 'pending'] },
    },
    {
      $set: {
        source_url: project.pending_upload_key,
        source_object_key: project.pending_upload_key,
        pending_upload_key: null,
        pending_upload_size: null,
        pending_upload_mime_type: null,
        pending_upload_expires_at: null,
        video_status: 'uploaded',
        updated_at: new Date(),
      },
    },
    { returnDocument: 'after', projection: { _id: 0 } }
  );

  if (!casResult) {
    // CAS condition did not match. Inspect current project record to determine why.
    const currentProject = await db.collection('projects').findOne({ id: projectId, user_id: userId }, { projection: { _id: 0 } });
    if (!currentProject) {
      res.status(404).json({ status: 'error', code: 'PROJECT_NOT_FOUND', message: 'Project not found.' });
      return;
    }

    if (DELETION_MARKER_FIELD in currentProject) {
      res.status(409).json({status: 'error', code: 'PROJECT_DELETING', message: 'This project is being deleted.'}); return;
    }

    // Check if another request or retry already confirmed this exact key (Idempotent success)
    if (currentProject.video_status === 'uploaded' && currentProject.source_url === project.pending_upload_key) {
      res.status(200).json({ status: 'ok', project: currentProject });
      return;
    }

    // Check if another upload was granted (pending_upload_key changed) or confirmed with newer source
    if (currentProject.source_url && currentProject.source_url !== project.pending_upload_key) {
      res.status(409).json({
        status: 'error',
        code: 'STALE_UPLOAD_CONFIRMATION',
        message: 'Project canonical source was already updated by another upload.',
      });
      return;
    }

    // Otherwise concurrent update conflict
    res.status(409).json({
      status: 'error',
      code: 'CONCURRENT_UPDATE_CONFLICT',
      message: 'Project upload status changed concurrently. Please refresh and retry.',
    });
    return;
  }

  res.status(200).json({ status: 'ok', project: casResult });
};

export const getProjectSourcePreviewUrl = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user?.id) { res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'Authentication required.' }); return; }
  const projectId = req.params.id;
  if (!projectId || !isValidUUID(projectId)) { res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid project UUID required.' }); return; }
  const { data: project } = await dataRepository.from('projects').select('source_url').eq('id', projectId).maybeSingle();
  if (!project) { res.status(404).json({ status: 'error', code: 'PROJECT_NOT_FOUND', message: 'Project not found.' }); return; }
  if (!project.source_url) { res.status(409).json({ status: 'error', code: 'SOURCE_NOT_READY', message: 'Source video is not uploaded.' }); return; }
  const signedUrl = await signObjectGet('source', project.source_url);
  res.status(200).json({ status: 'ok', signedUrl, expiresInSeconds: 300 });
};

/** Adds a short-lived signed `poster_url` when the project already has a poster. */
async function withPosterUrl<T extends { poster_key?: string | null } | null>(project: T): Promise<T> {
  if (!project?.poster_key) return project;
  try {
    return { ...project, poster_url: await signObjectGet('clips', project.poster_key) };
  } catch {
    return project;
  }
}

/**
 * GET /api/projects/:id/poster
 * Signed URL for the project's HD poster frame (uploaded videos), generated on first request.
 */
export const getProjectPoster = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'Authentication required.' }); return; }
  const projectId = req.params.id;
  if (!projectId || !isValidUUID(projectId)) { res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid project UUID required.' }); return; }
  const { data: project } = await dataRepository
    .from('projects')
    .select('id, user_id, source_type, source_url, video_status, duration_seconds, poster_key')
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!project) { res.status(404).json({ status: 'error', code: 'PROJECT_NOT_FOUND', message: 'Project not found.' }); return; }
  const url = await ProjectPosterService.getPosterUrl(project);
  if (!url) { res.status(404).json({ status: 'error', code: 'POSTER_UNAVAILABLE', message: 'No poster frame is available for this project yet.' }); return; }
  // Signed URLs live 5 minutes; let the browser reuse the JSON briefly.
  res.setHeader('Cache-Control', 'private, max-age=240');
  res.status(200).json({ status: 'ok', url, expiresInSeconds: 300 });
};

/**
 * DELETE /api/projects/:id
 * Delete a project belonging to the authenticated user and clean up storage assets
 */
export const deleteProject = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
    // 1. Fetch project to check ownership and get storage path
    const { data: project, error: fetchError } = await dataRepository
      .from('projects')
      .select('id, user_id, source_url')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError) {
      logger.error('Failed to query project for deletion', {
        requestId: req.requestId,
        projectId,
        userId,
        error: fetchError.message,
      });
      res.status(500).json({ status: 'error', code: 'DB_ERROR', message: 'Failed to access project for deletion.' });
      return;
    }

    if (!project) {
      res.status(404).json({ status: 'error', code: 'NOT_FOUND', message: 'Project not found or access denied.' });
      return;
    }

    // Admit deletion BEFORE any storage prefix listing: the marker (project
    // + all clips, one transaction) fences clip poster/render publication
    // that could land after the listing. If storage cleanup fails below,
    // marker + records stay in place and the project remains retryable.
    const admitted = await admitProjectDeletion(userId, projectId);
    if (!admitted) {
      res.status(404).json({ status: 'error', code: 'NOT_FOUND', message: 'Project not found or access denied.' });
      return;
    }

    const prefix = projectObjectPrefix(userId, projectId);
    await deletePrefix('source', prefix);
    await deletePrefix('clips', prefix);

    await deleteProjectRecords(userId, projectId);

    res.status(200).json({ status: 'ok', message: 'Project and associated assets deleted successfully.' });
  } catch (err) {
    logger.error('Unexpected error deleting project', {
      requestId: req.requestId,
      projectId,
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ status: 'error', code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' });
  }
};

/**
 * POST /api/projects/:id/process
 * Start video processing and transcription pipeline with state machine checks & recovery
 */
export const processProject = async (req: AuthenticatedRequest, res: Response): Promise<void> => processProjectRequest(req,res);
async function processProjectRequest(req:AuthenticatedRequest,res:Response,queuedSource?:string):Promise<void>{
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
    // 1. Fetch project and verify ownership
    const { data: project, error: fetchError } = await dataRepository
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError) {
      logger.error('Failed to fetch project for processing', {
        requestId: req.requestId,
        projectId,
        userId,
        error: fetchError.message,
      });
      res.status(500).json({ status: 'error', code: 'DB_ERROR', message: 'Failed to access project.' });
      return;
    }

    if (!project) {
      res.status(404).json({ status: 'error', code: 'NOT_FOUND', message: 'Project not found or access denied.' });
      return;
    }

    if(queuedSource!==undefined&&(project.source_url!==queuedSource||project.deletion_started_at)){res.status(409).json({status:'error',code:'PROCESSING_ATTEMPT_CHANGED',message:'Queued source is no longer current.'});return;}

    const resumeAttempt=req.headers['x-processing-attempt-id'] as string;
    if(resumeAttempt&&isValidUUID(resumeAttempt)&&project.source_url){const {readProcessingCompletion}=await import('../services/transcription/processingCompletion.js');const done=await readProcessingCompletion(await getMongoDb(),userId,projectId,project.source_url,resumeAttempt);if(done){res.status(200).json({status:'ok',message:'Processing attempt completed.',projectId,processingAttemptId:resumeAttempt,video_status:'transcribed',completionIsCurrent:done.completionIsCurrent,credits_charged:done.settledAmount});return;}}

    // Explicit reconciliation never starts work or spends another reservation.
    // No-token claims can be fenced safely; admitted worker stop is not inferred.
    if(req.body?.recover_only===true){
      if(!resumeAttempt||!isValidUUID(resumeAttempt)||project.processing_attempt_id!==resumeAttempt){res.status(409).json({status:'error',code:'PROCESSING_ATTEMPT_CHANGED',message:'Recovery requires the current processing attempt.'});return;}
      try{const reconciled=await releaseUnadmittedProcessing(userId,projectId,project.source_url,resumeAttempt);res.status(200).json({status:'ok',message:'Unstarted reservation reconciled. No new processing started.',projectId,processingAttemptId:resumeAttempt,projectChanged:reconciled.changed,video_status:reconciled.project?.video_status??null});}catch{res.status(409).json({status:'error',code:'PROCESSING_STOP_REVIEW_REQUIRED',message:'This attempt may own active work. Stop and reconcile its worker before recovery; no new processing was started.'});}return;
    }

    // Completed-attempt readback and explicit reconciliation above do not
    // launch media work. New admission must not reserve credits in API-only
    // mode while a durable remote processing dispatcher is not implemented.
    if(coreProcessingDispatchEnabled()&&queuedSource===undefined){
      if(!project.source_url||!['upload','url'].includes(project.source_type)||!['uploaded','failed','transcribed','completed'].includes(project.video_status)){
        res.status(409).json({status:'error',code:'PROCESSING_ATTEMPT_CHANGED',message:'Project is not ready for queued processing.'});return;
      }
      const attemptId=resumeAttempt&&isValidUUID(resumeAttempt)?resumeAttempt:crypto.randomUUID();
      const {enqueueCoreProcessing}=await import('../db/repositories/coreProcessingDispatchRepository.js');
      const job=await enqueueCoreProcessing(await getMongoClient(),await getMongoDb(),{userId,projectId,sourceUrl:project.source_url,attemptId,email:req.user?.email});
      res.status(202).json({status:'ok',message:'Processing queued. No credits reserved until worker admission.',projectId,processingAttemptId:attemptId,processingJobId:job.id,video_status:project.video_status,credits_reserved:0,queued:true});return;
    }
    if (!runsBackgroundWorkers()) {
      res.status(503).json({status:'error',code:'PROCESSING_DISPATCH_UNAVAILABLE',message:'Video processing requires an available processing worker. No new processing was started and no credits were reserved.'});
      return;
    }

  const selectedProvider = (config.transcriptionProvider || 'groq').toLowerCase().trim();
  const isProviderConfigured =
    selectedProvider === 'openrouter' ? Boolean(config.openrouterApiKey) : Boolean(config.groqApiKey);

  if (!isProviderConfigured) {
    const keyName = selectedProvider === 'openrouter' ? 'OPENROUTER_API_KEY' : 'GROQ_API_KEY';
    res.status(503).json({
      status: 'error',
      code: 'TRANSCRIPTION_PROVIDER_NOT_CONFIGURED',
      message: `Transcription provider "${selectedProvider}" is not configured. Please set ${keyName} in server environment.`,
    });
    return;
  }


    // 2. State machine & concurrency checks (H6, H9)
    const currentStatus = project.video_status;

    if (currentStatus === 'processing' || currentStatus === 'transcribing') {
      {
        res.status(409).json({
          status: 'error',
          code: 'PROCESSING_ACTIVE',
          message: 'Video is currently being processed. Please wait for the current run to finish.',
          projectId,
          video_status: currentStatus,
        });
        return;
      }
    } else if (!PROCESSABLE_STATUSES.includes(currentStatus as any) && currentStatus !== 'transcribed' && currentStatus !== 'completed') {
      res.status(400).json({
        status: 'error',
        code: 'INVALID_STATUS',
        message: `Project cannot be processed in status '${currentStatus}'. Upload a video first.`,
        projectId,
        video_status: currentStatus,
      });
      return;
    }

    // 3. Validate source type & presence of source_url
    if (project.source_type !== 'upload' && project.source_type !== 'url') {
      res.status(400).json({
        status: 'error',
        code: 'UNSUPPORTED_SOURCE',
        message: 'Processing supports direct uploads and ingested video URLs.',
      });
      return;
    }

    if (!project.source_url) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_SOURCE_FILE',
        message: 'Project does not have an uploaded video file associated with it.',
      });
      return;
    }

    // 3b. Validate duration against plan entitlement if known
    const entitlements = await EntitlementService.resolveUserEntitlements(userId, req.user?.email);
    if (!entitlements.isUnlimited && project.duration_seconds && project.duration_seconds > entitlements.limits.maxUploadDurationSeconds) {
      res.status(403).json({
        status: 'error',
        code: 'DURATION_LIMIT_EXCEEDED',
        message: `Video duration (${Math.round(project.duration_seconds)}s) exceeds your plan limit of ${entitlements.limits.maxUploadDurationSeconds}s.`,
        limit_seconds: entitlements.limits.maxUploadDurationSeconds,
        video_seconds: project.duration_seconds,
      });
      return;
    }

    const { processProjectVideo, isProjectProcessingActive } = await import('../services/videoProcessingService.js');
    if (isProjectProcessingActive(projectId)) {
      res.status(409).json({ status: 'error', code: 'PROCESSING_ACTIVE', message: 'Video processing is already active.' });
      return;
    }

    // 4. Concurrency-safe atomic credit reservation & cross-workflow transcript reuse
    const db = await getMongoDb();
    let existingTranscript = await db.collection('transcripts').findOne({ project_id: projectId, user_id: userId });

    // Cross-workflow match: check other projects belonging to the SAME user with the same source_url
    if (!existingTranscript && project.source_url) {
      const matchProject = await db.collection('projects').findOne({
        user_id: userId,
        source_url: project.source_url,
        id: { $ne: projectId },
      });
      if (matchProject) {
        const sourceTranscript = await db.collection('transcripts').findOne({
          project_id: matchProject.id,
          user_id: userId,
        });
        if (sourceTranscript && (sourceTranscript.segments?.length || sourceTranscript.transcript_text)) {
          await assertTranscriptReusable(sourceTranscript,project.source_url);
          // Clone transcript to this project so subsequent queries find it
          const session=(await (await import('../db/mongoClient.js')).getMongoClient()).startSession();try{await session.withTransaction(async()=>{
          const target=await db.collection('projects').updateOne({id:projectId,user_id:userId,source_url:project.source_url,processing_run_token:null,video_status:{$nin:['processing','transcribing']}},{$inc:{processing_write_serial:1}},{session});
          if(target.matchedCount!==1)throw new AppError('Project changed before transcript reuse.',409,'PROCESSING_ATTEMPT_CHANGED');
          await db.collection('transcripts').updateOne(
            { project_id: projectId, user_id: userId },
            {
              $setOnInsert: {
                id: crypto.randomUUID(),
                project_id: projectId,
                user_id: userId,
                transcript_text: sourceTranscript.transcript_text,
                text: sourceTranscript.text,
                language: sourceTranscript.language,
                duration_seconds: sourceTranscript.duration_seconds,
                segments: sourceTranscript.segments,
                words: sourceTranscript.words,
                quality_assessment: sourceTranscript.quality_assessment,
                transcription_provenance: sourceTranscript.transcription_provenance,
                transcription_timing_issues: sourceTranscript.transcription_timing_issues,
                source_binding: sourceTranscript.source_binding,
                av_start_offset_sec: sourceTranscript.av_start_offset_sec,
                created_at: new Date(),
                updated_at: new Date(),
              },
            },
            { upsert: true,session }
          );
          })}finally{await session.endSession()}
          existingTranscript = sourceTranscript;
        }
      }
    }
    if(existingTranscript)await assertTranscriptReusable(existingTranscript,project.source_url);
    const isReusedTranscript = Boolean(existingTranscript);

    const durationForEstimate = Number(project.duration_seconds) > 0 ? Number(project.duration_seconds) : 60;
    const creditEstimate = isReusedTranscript
      ? { credits: 0, units: 0, rateDescription: 'Reused transcript (0 credits)' }
      : CreditPricingService.calculateCoreProcessingCost(durationForEstimate);
    const creditsToReserve = creditEstimate.credits;

    const rawAttemptId = req.headers['x-processing-attempt-id'] as string;
    const attemptId = rawAttemptId && isValidUUID(rawAttemptId) ? rawAttemptId : crypto.randomUUID();

    const creditReservation = await CreditWalletService.reserveCredits({
      userId,
      attemptId,
      operationId: 'core_video_processing',
      amount: creditsToReserve,
      userEmail: req.user?.email,
      ttlMinutes: 60,
      metadata: {
        projectId,
        sourceUrl:project.source_url,
        sourceDurationSeconds: project.duration_seconds || null,
        isReusedTranscript,
      },
    });

    if (!creditReservation.allowed) {
      logger.warn('User insufficient credits for video processing', {
        userId,
        projectId,
        requiredCredits: creditsToReserve,
        availableCredits: creditReservation.wallet.available_credits,
      });
      res.status(403).json({
        status: 'error',
        code: 'INSUFFICIENT_CREDITS',
        message: creditReservation.errorMessage || 'Insufficient credits to process video.',
        required_credits: creditsToReserve,
        available_credits: creditReservation.wallet.available_credits,
        missing_credits: Math.max(0, creditsToReserve - creditReservation.wallet.available_credits),
      });
      return;
    }

    if (creditReservation.idempotent) {
      res.status(202).json({
        status: 'ok',
        message: 'Processing attempt already accepted.',
        projectId,
        processingAttemptId: attemptId,
        video_status: project.video_status,
        credits_reserved: creditReservation.reservation?.amount || 0,
      });
      return;
    }

    // Shadow legacy UsageService reservation for historical audit tracking without rejecting customer
    const { computeProcessingEstimateMinutes, UsageService } = await import('../services/usageService.js');
    try {
      const estimatedMinutes = computeProcessingEstimateMinutes((project as any).duration_seconds);
      await UsageService.reserveQuota(userId, projectId, attemptId, estimatedMinutes, req.user?.email);
    } catch (legacyErr) {
      logger.warn('Legacy UsageService reservation notice', { projectId, err: legacyErr });
    }

    let claimed: boolean;
    try {
      claimed = await claimProjectProcessing(userId, projectId, currentStatus,
        new Date(project.updated_at || project.created_at),{attemptId,sourceUrl:project.source_url,previousAttemptId:(project as any).processing_attempt_id??null,previousRunToken:(project as any).processing_run_token??null});
    } catch (error) {
      await releaseUnadmittedProcessing(userId,projectId,project.source_url,attemptId).catch(()=>undefined);
      await UsageService.releaseReservation(attemptId, 'Project processing claim failed').catch(() => undefined);
      throw error;
    }
    if (!claimed) {
      await releaseUnadmittedProcessing(userId,projectId,project.source_url,attemptId).catch(()=>undefined);
      await UsageService.releaseReservation(attemptId, 'Another processing run started first').catch(() => undefined);
      res.status(409).json({ status: 'error', code: 'PROCESSING_ACTIVE', message: 'Video processing has already started.' });
      return;
    }

    // 5. Initiate processing pipeline asynchronously
    // Run pipeline in background with unique processing_attempt_id
    if(queuedSource!==undefined){
      const result=await processProjectVideo(projectId,userId,project.source_url,attemptId);
      res.status(result.status==='transcribed'?200:409).json({status:result.status==='transcribed'?'ok':'error',projectId,processingAttemptId:attemptId,video_status:result.status,...(result.reviewCode?{code:result.reviewCode}:{})});return;
    }
    void workLifecycle.run('project-processing-outcome',()=>processProjectVideo(projectId, userId, project.source_url, attemptId)
      .then((result) => {
        if (result.status === 'transcribed') {
          logger.info(`Background pipeline completed for project ${projectId} (attempt: ${attemptId})`, { projectId, userId });
        } else {
          logger.warn(`Background pipeline failed for project ${projectId} (attempt: ${attemptId})`, { projectId, error: result.error });
        }
      })
      .catch(async(err) => {
        // The processing service owns release after admission. An outer duplicate
        // rejection is not permission to release the current worker's reservation.
        logger.error(`Background pipeline unexpected error for project ${projectId} (attempt: ${attemptId})`, {
          projectId,
          error: err instanceof Error ? err.message : String(err),
        });
      })).catch(err=>logger.error('Processing launch stopped before admission',{projectId,error:String(err)}));

    res.status(202).json({
      status: 'ok',
      message: 'Video processing started.',
      projectId,
      processingAttemptId: attemptId,
      video_status: 'processing',
      credits_reserved: creditsToReserve,
    });
  } catch (err) {
    logger.error('Unexpected error initiating project processing', {
      requestId: req.requestId,
      projectId,
      userId,
      error: err instanceof Error ? err.message : String(err),
    });

    const reviewCode=transcriptReviewCode((err as any)?.code);
    if(reviewCode){
      res.status(409).json({status:'error',code:reviewCode,message:err instanceof Error?err.message:'Transcript and source need review before processing.'});
      return;
    }
    res.status(503).json({
      status: 'error',
      code: 'DATABASE_UNAVAILABLE',
      message: 'Could not start video processing. Please try again.',
    });
  }
}

/**
 * GET /api/projects/:id/transcript
 * Retrieve stored transcript for a project owned by the user
 */
export const getProjectTranscript = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
    // 1. Verify project ownership first
    const { data: project, error: projectError } = await dataRepository
      .from('projects')
      .select('id, user_id')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (projectError) {
      logger.error('Failed to verify project ownership', {
        requestId: req.requestId,
        projectId,
        error: projectError.message,
      });
      res.status(500).json({ status: 'error', code: 'DB_ERROR', message: 'Failed to verify project access.' });
      return;
    }

    if (!project) {
      res.status(404).json({ status: 'error', code: 'NOT_FOUND', message: 'Project not found or access denied.' });
      return;
    }

    // 2. Fetch transcript
    const { data: transcript, error: transcriptError } = await dataRepository
      .from('transcripts')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (transcriptError) {
      logger.error('Failed to fetch transcript', {
        requestId: req.requestId,
        projectId,
        error: transcriptError.message,
      });
      res.status(500).json({ status: 'error', code: 'DB_ERROR', message: 'Failed to fetch transcript.' });
      return;
    }

    if (!transcript) {
      res.status(404).json({ status: 'error', code: 'TRANSCRIPT_NOT_FOUND', message: 'Transcript not found for this project.' });
      return;
    }

    res.status(200).json({
      status: 'ok',
      transcript,
    });
  } catch (err) {
    logger.error('Unexpected error fetching transcript', {
      requestId: req.requestId,
      projectId,
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ status: 'error', code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' });
  }
};

/**
 * POST /api/projects/:id/generate-content
 * Generate platform-specific AI content
 */
export const generateProjectContent = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const projectId = req.params.id;
  const platform = req.body?.platform || req.query?.platform;
  const customNotes = req.body?.customNotes;

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

  if (platform && !VALID_PLATFORMS.includes(platform as OutputPlatform)) {
    res.status(400).json({
      status: 'error',
      code: 'INVALID_PLATFORM',
      message: `Invalid platform. Supported platforms: ${VALID_PLATFORMS.join(', ')}.`,
    });
    return;
  }

  if (!config.openrouterApiKey) {
    res.status(503).json({
      status: 'error',
      code: 'PROVIDER_NOT_CONFIGURED',
      message: 'OpenRouter AI service is not configured. Please set OPENROUTER_API_KEY.',
    });
    return;
  }

  try {
    const overrideTone = typeof req.body?.overrideTone === 'string' ? req.body.overrideTone.slice(0, 200) : undefined;
    const overrideLanguage = typeof req.body?.overrideLanguage === 'string' ? req.body.overrideLanguage.slice(0, 100) : undefined;
    const overrideCTA = typeof req.body?.overrideCTA === 'string' ? req.body.overrideCTA.slice(0, 300) : undefined;
    const overrides = (overrideTone || overrideLanguage || overrideCTA) ? { overrideTone, overrideLanguage, overrideCTA } : undefined;

    const { contentGenerationService } = await import('../services/contentGenerationService.js');
    const result = await contentGenerationService.generateContentForProject({
      projectId,
      userId,
      platform: platform as OutputPlatform | undefined,
      customNotes: typeof customNotes === 'string' ? customNotes.trim().slice(0, 2000) : undefined,
      overrides,
    });

    res.status(200).json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Error generating content for project', {
      requestId: req.requestId,
      projectId,
      userId,
      error: message,
    });

    if (message.includes('Transcript is not available yet')) {
      res.status(400).json({
        status: 'error',
        code: 'TRANSCRIPT_REQUIRED',
        message: 'Transcript is not available yet. Please complete transcription first.',
      });
      return;
    }

    if (message.includes('Project not found')) {
      res.status(404).json({
        status: 'error',
        code: 'NOT_FOUND',
        message: 'Project not found or access denied.',
      });
      return;
    }

    res.status(500).json({
      status: 'error',
      code: 'GENERATION_FAILED',
      message: 'Failed to generate content.',
    });
  }
};

/**
 * GET /api/projects/:id/content
 * Retrieve all content outputs for a project owned by the authenticated user
 */
export const getProjectContent = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
    // Verify ownership
    const { data: project, error: projErr } = await dataRepository
      .from('projects')
      .select('id, user_id')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (projErr) {
      logger.error('Error verifying project ownership', {
        requestId: req.requestId,
        projectId,
        error: projErr.message,
      });
      res.status(500).json({ status: 'error', code: 'DB_ERROR', message: 'Failed to verify project access.' });
      return;
    }

    if (!project) {
      res.status(404).json({ status: 'error', code: 'NOT_FOUND', message: 'Project not found or access denied.' });
      return;
    }

    const { ContentOutputService } = await import('../services/contentOutputService.js');
    const outputs = await ContentOutputService.getOutputsForProject(projectId);

    res.status(200).json({
      status: 'ok',
      projectId,
      outputs,
    });
  } catch (err) {
    logger.error('Unexpected error fetching content outputs', {
      requestId: req.requestId,
      projectId,
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ status: 'error', code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' });
  }
};

/**
 * PATCH /api/projects/:id/content/:outputId
 * Edit / save content for a specific output item
 */
export const updateProjectContent = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const projectId = req.params.id;
  const outputId = req.params.outputId;
  const content = req.body?.content;

  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  if (!projectId || !isValidUUID(projectId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid project UUID is required.' });
    return;
  }

  if (!outputId || !isValidUUID(outputId)) {
    res.status(400).json({ status: 'error', code: 'INVALID_UUID', message: 'Valid output UUID is required.' });
    return;
  }

  if (typeof content !== 'string') {
    res.status(400).json({ status: 'error', code: 'INVALID_CONTENT', message: 'Content string is required.' });
    return;
  }

  if (content.length > 50000) {
    res.status(400).json({ status: 'error', code: 'CONTENT_TOO_LARGE', message: 'Content exceeds maximum length (50,000 characters).' });
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
    // Verify project ownership
    const { data: project } = await dataRepository
      .from('projects')
      .select('id, user_id')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!project) {
      res.status(404).json({ status: 'error', code: 'NOT_FOUND', message: 'Project not found or access denied.' });
      return;
    }

    const { ContentOutputService } = await import('../services/contentOutputService.js');
    const updated = await ContentOutputService.updateOutputContent(outputId, projectId, content);

    res.status(200).json({
      status: 'ok',
      output: updated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Error updating content output', {
      requestId: req.requestId,
      projectId,
      outputId,
      error: message,
    });
    res.status(500).json({ status: 'error', code: 'UPDATE_FAILED', message: 'Failed to update output.' });
  }
};

/** Internal worker continuation. Not an HTTP route; no request-body bypass. */
export async function executeQueuedProjectProcessing(job:any):Promise<{code:number;body:any}>{
 const req={user:{id:job.user_id,email:job.email??undefined},params:{id:job.project_id},headers:{'x-processing-attempt-id':job.attempt_id},body:{}}as unknown as AuthenticatedRequest;
 const res={code:200,body:null as any,status(n:number){this.code=n;return this;},json(value:any){this.body=value;return this;}};
 await ownerContext.run(job.user_id,()=>processProjectRequest(req,res as unknown as Response,job.source_url));
 return {code:res.code,body:res.body};
}
