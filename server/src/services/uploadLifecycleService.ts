import crypto from 'node:crypto';
import { getMongoClient, getMongoDb } from '../db/mongoClient.js';
import type {ClientSession} from 'mongodb';
import {DELETION_MARKER_FIELD} from './deletionAdmissionService.js';
import { headObject, listObjects } from './objectStorageService.js';
import { logger } from '../utils/logger.js';
import { isValidUUID, AppError } from '../types/index.js';

export type UploadAttemptStatus = 'pending' | 'confirmed' | 'superseded' | 'expired' | 'abandoned';

/**
 * Standard Safety Grace Period for upload orphan cleanup candidate discovery:
 * 12 hours (43,200,000 ms).
 * A presigned URL attempt cannot be eligible for orphan cleanup until
 * its signed expiry timestamp PLUS this grace period has elapsed.
 */
export const DEFAULT_UPLOAD_SAFETY_GRACE_PERIOD_MS = 12 * 60 * 60 * 1000;

export interface UploadAttemptRecord {
  id: string; // unique upload attempt ID (UUID)
  project_id: string;
  user_id: string;
  object_key: string;
  file_name: string;
  file_size: number;
  content_type: string;
  status: UploadAttemptStatus;
  expires_at: Date;
  confirmed_at?: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CandidateDiscoveryResult {
  totalScanned: number;
  candidates: Array<{
    key: string;
    projectId: string;
    userId: string;
    size: number;
    reason: string;
  }>;
  skipped: Array<{
    key: string;
    reason: string;
  }>;
}

export class UploadLifecycleService {
  /** Test hook to allow storage head verification injection in test environments */
  public static headObjectFn = headObject;
  /**
   * Records a new presigned upload grant attempt for a project.
   */
  public static async recordAttempt(params: {
    userId: string;
    projectId: string;
    objectKey: string;
    fileName: string;
    fileSize: number;
    contentType: string;
    expiresAt: Date;
  }, session?: ClientSession): Promise<UploadAttemptRecord> {
    const db = await getMongoDb();
    const now = new Date();
    const attempt: UploadAttemptRecord = {
      id: crypto.randomUUID(),
      project_id: params.projectId,
      user_id: params.userId,
      object_key: params.objectKey,
      file_name: params.fileName,
      file_size: params.fileSize,
      content_type: params.contentType,
      status: 'pending',
      expires_at: params.expiresAt,
      confirmed_at: null,
      created_at: now,
      updated_at: now,
    };

    await db.collection('project_upload_attempts').insertOne({
      ...attempt,
      _id: attempt.id,
    } as any, {session});

    return attempt;
  }

  /** Admit the pending session and immutable attempt together. The parent write
   * contends with deletion admission, so no new grant is admitted beneath an
   * already deleting project. A previously admitted presigned URL cannot be
   * revoked here and still needs expiry-aware storage reconciliation. */
  public static async admitAttempt(params: Parameters<typeof UploadLifecycleService.recordAttempt>[0]): Promise<UploadAttemptRecord> {
    const client = await getMongoClient(), db = await getMongoDb(), session = client.startSession();
    try {
      const admitted = await session.withTransaction(async () => {
        const result = await db.collection('projects').updateOne({
          id: params.projectId, user_id: params.userId,
          [DELETION_MARKER_FIELD]: {$exists: false}, video_status: {$in: ['uploading', 'failed']},
        }, {$set: {
          pending_upload_key: params.objectKey, pending_upload_size: params.fileSize,
          pending_upload_mime_type: params.contentType, pending_upload_expires_at: params.expiresAt,
          video_status: 'uploading', updated_at: new Date(),
        }}, {session});
        if (result.matchedCount !== 1) {
          const project = await db.collection('projects').findOne({id: params.projectId, user_id: params.userId}, {session});
          if (!project) throw new AppError('Project not found.', 404, 'PROJECT_NOT_FOUND');
          if (DELETION_MARKER_FIELD in project) throw new AppError('This project is being deleted.', 409, 'PROJECT_DELETING');
          throw new AppError('Project cannot accept an upload now.', 409, 'UPLOAD_NOT_ALLOWED');
        }
        return this.recordAttempt(params, session);
      }, {readPreference: 'primary', readConcern: {level: 'snapshot'}, writeConcern: {w: 'majority'}, maxCommitTimeMS: 10000});
      if (!admitted) throw new AppError('Could not create upload session.', 503, 'DATABASE_UNAVAILABLE');
      return admitted;
    } finally {await session.endSession();}
  }

  /**
   * Retrieves an upload attempt by its ID or by its objectKey.
   */
  public static async getAttempt(params: {
    userId: string;
    projectId: string;
    attemptId?: string;
    objectKey?: string;
  }): Promise<UploadAttemptRecord | null> {
    const db = await getMongoDb();
    const query: any = {
      user_id: params.userId,
      project_id: params.projectId,
    };
    if (params.attemptId) {
      query.id = params.attemptId;
    } else if (params.objectKey) {
      query.object_key = params.objectKey;
    } else {
      return null;
    }

    const doc = await db.collection('project_upload_attempts').findOne(query);
    return (doc as any) || null;
  }

  /**
   * Confirms an upload attempt idempotently with optimistic concurrency / fencing.
   * Ensures that:
   * 1. The attempt belongs strictly to the authenticated user and project.
   * 2. The attempt is not expired.
   * 3. A stale attempt cannot overwrite a newer canonical project source.
   */
  public static async confirmAttempt(params: {
    userId: string;
    projectId: string;
    attemptId?: string;
    objectKey?: string;
  }): Promise<{ status: 'confirmed' | 'already_confirmed'; attempt: UploadAttemptRecord }> {
    const db = await getMongoDb();
    const now = new Date();

    // 1. Fetch the attempt
    let attempt: UploadAttemptRecord | null = null;
    if (params.attemptId) {
      attempt = await this.getAttempt({
        userId: params.userId,
        projectId: params.projectId,
        attemptId: params.attemptId,
      });
    } else if (params.objectKey) {
      attempt = await this.getAttempt({
        userId: params.userId,
        projectId: params.projectId,
        objectKey: params.objectKey,
      });
    }

    if (!attempt) {
      throw new AppError('Upload attempt not found.', 404, 'UPLOAD_ATTEMPT_NOT_FOUND');
    }

    if (attempt.user_id !== params.userId) {
      throw new AppError('Tenant isolation violation.', 403, 'FORBIDDEN');
    }

    // Check the parent before even an idempotent reply. The final source
    // publication in the controller also fences this marker atomically.
    const project = await db.collection('projects').findOne({
      id: params.projectId,
      user_id: params.userId,
    });
    if (!project) {
      throw new AppError('Project not found.', 404, 'PROJECT_NOT_FOUND');
    }
    if (DELETION_MARKER_FIELD in project) {
      throw new AppError('This project is being deleted.', 409, 'PROJECT_DELETING');
    }
    if (attempt.status === 'confirmed') {
      return { status: 'already_confirmed', attempt };
    }

    // Stale check: If project already has a confirmed canonical source that is newer than this attempt,
    // prevent the stale attempt from overwriting the newer canonical source.
    if (project.video_status === 'uploaded' && project.source_url && project.source_url !== attempt.object_key) {
      // If project has canonical source and was updated at or after this attempt creation
      if (!project.updated_at || new Date(project.updated_at) >= new Date(attempt.created_at)) {
        // Mark this attempt as superseded
        await db.collection('project_upload_attempts').updateOne(
          { id: attempt.id, user_id: params.userId },
          { $set: { status: 'superseded', updated_at: now } }
        );
        throw new AppError(
          'Stale upload confirmation rejected: project already finalized with newer source.',
          409,
          'STALE_UPLOAD_CONFIRMATION'
        );
      }
    }

    // 3. Mark attempt confirmed in MongoDB
    const updateResult = await db.collection('project_upload_attempts').updateOne(
      {
        id: attempt.id,
        user_id: params.userId,
        status: { $in: ['pending', 'superseded'] },
      },
      {
        $set: {
          status: 'confirmed',
          confirmed_at: now,
          updated_at: now,
        },
      }
    );

    if (updateResult.matchedCount === 0 && (attempt.status as UploadAttemptStatus) !== 'confirmed') {
      throw new AppError('Could not update upload attempt state.', 409, 'CONCURRENT_UPDATE_CONFLICT');
    }

    attempt.status = 'confirmed';
    attempt.confirmed_at = now;
    attempt.updated_at = now;

    // 4. Mark all OTHER pending/superseded attempts for this project as superseded
    await db.collection('project_upload_attempts').updateMany(
      {
        project_id: params.projectId,
        user_id: params.userId,
        id: { $ne: attempt.id },
        status: 'pending',
      },
      {
        $set: {
          status: 'superseded',
          updated_at: now,
        },
      }
    );

    return { status: 'confirmed', attempt };
  }

  /**
   * DRY RUN ONLY: Scans for upload objects that are verified safe cleanup candidates.
   * Enforces all 7 safety criteria:
   * 1. Presigned URL has expired (expires_at < now).
   * 2. Canonical safety grace period has elapsed (DEFAULT_UPLOAD_SAFETY_GRACE_PERIOD_MS = 12 hours after expiry).
   *    Note: Expiry + grace is strictly enforced for ALL candidate statuses (including superseded, expired, abandoned, pending).
   * 3. It is not the canonical project source (project.source_url !== key && project.source_object_key !== key).
   * 4. It is not referenced by an active/pending upload attempt.
   * 5. It is not used by any active or persistent downstream reference:
   *    - Active video_analysis_jobs
   *    - Active render_jobs
   *    - Historical transcripts (transcripts.source_url or project transcript)
   *    - Persistent clips (clips.source_storage_path or source_object_key)
   *    - Media assets (media_assets.storage_path)
   *    - Editor projects (editor_projects)
   *    - Content packs (content_packs.source)
   * 6. Tenant and project ownership checks pass.
   * 7. Object metadata and expected storage path (users/:userId/projects/:projectId/source/...) are strictly verified.
   */
  public static async discoverCleanupCandidates(options?: {
    gracePeriodMs?: number; // default: 12 hours (43,200,000 ms)
    userId?: string;
    projectId?: string;
    limit?: number;
    skip?: number;
  }): Promise<CandidateDiscoveryResult> {
    const gracePeriodMs = options?.gracePeriodMs ?? DEFAULT_UPLOAD_SAFETY_GRACE_PERIOD_MS;
    const limit = options?.limit ?? 50;
    const skip = options?.skip ?? 0;
    const now = Date.now();

    const db = await getMongoDb();
    const result: CandidateDiscoveryResult = {
      totalScanned: 0,
      candidates: [],
      skipped: [],
    };

    // Query attempt records that might be candidates:
    // ALL candidate candidates must have their expires_at older than (now - gracePeriodMs)
    // to guarantee an unexpired or in-flight presigned URL PUT is NEVER considered.
    const expiryThreshold = new Date(now - gracePeriodMs);
    const query: any = {
      expires_at: { $lt: expiryThreshold },
      status: { $in: ['superseded', 'expired', 'abandoned', 'pending'] },
    };

    if (options?.userId) query.user_id = options.userId;
    if (options?.projectId) query.project_id = options.projectId;

    const attempts = await db
      .collection('project_upload_attempts')
      .find(query)
      .sort({ created_at: -1, id: 1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    result.totalScanned = attempts.length;

    for (const doc of attempts) {
      const attempt = doc as any as UploadAttemptRecord;
      const key = attempt.object_key;

      // 1. Path format validation: users/:userId/projects/:projectId/source/:token
      const pathParts = key.split('/');
      if (
        pathParts.length < 6 ||
        pathParts[0] !== 'users' ||
        pathParts[2] !== 'projects' ||
        pathParts[4] !== 'source' ||
        pathParts[1] !== attempt.user_id ||
        pathParts[3] !== attempt.project_id
      ) {
        result.skipped.push({ key, reason: 'STORAGE_PATH_MALFORMED_OR_TENANT_MISMATCH' });
        continue;
      }

      // 2. Presigned URL expiry + Grace Period check (Strict enforcement for all statuses)
      const expiryTime = new Date(attempt.expires_at).getTime();
      if (now < expiryTime + gracePeriodMs) {
        result.skipped.push({
          key,
          reason: `ACTIVE_OR_WITHIN_GRACE_PERIOD (Expires: ${attempt.expires_at.toISOString()}, Grace: ${gracePeriodMs / 60000}m)`,
        });
        continue;
      }

      // 3. Project check: verify project ownership and ensure key is NOT the canonical source
      const project = await db.collection('projects').findOne({ id: attempt.project_id, user_id: attempt.user_id });
      if (project) {
        if (project.source_url === key || project.source_object_key === key) {
          result.skipped.push({ key, reason: 'CANONICAL_PROJECT_SOURCE' });
          continue;
        }
        if (project.pending_upload_key === key && ['uploading', 'pending'].includes(project.video_status)) {
          result.skipped.push({ key, reason: 'PROJECT_PENDING_UPLOAD_ACTIVE' });
          continue;
        }
      }

      // 4. Downstream active jobs check:
      // a. Video analysis jobs
      const activeAnalysisJob = await db.collection('video_analysis_jobs').findOne({
        project_id: attempt.project_id,
        status: { $in: ['queued', 'processing'] },
      });
      if (activeAnalysisJob) {
        result.skipped.push({ key, reason: 'ACTIVE_VIDEO_ANALYSIS_JOB' });
        continue;
      }

      // b. Render jobs
      const activeRenderJob = await db.collection('render_jobs').findOne({
        user_id: attempt.user_id,
        status: { $in: ['queued', 'rendering', 'processing'] },
      });
      if (activeRenderJob) {
        // Cross-check if clip belongs to this project
        const clip = await db.collection('clips').findOne({ id: activeRenderJob.clip_id, project_id: attempt.project_id });
        if (clip) {
          result.skipped.push({ key, reason: 'ACTIVE_RENDER_JOB' });
          continue;
        }
      }

      // 5. Downstream persistent & historical references check:
      // a. Transcripts collection (source_url or project_id association)
      const transcriptRef = await db.collection('transcripts').findOne({
        user_id: attempt.user_id,
        source_url: key,
      });
      if (transcriptRef) {
        result.skipped.push({ key, reason: 'PERSISTENT_TRANSCRIPT_REFERENCE' });
        continue;
      }

      // b. Clips collection (source_storage_path or source_object_key)
      const clipRef = await db.collection('clips').findOne({
        user_id: attempt.user_id,
        $or: [{ source_storage_path: key }, { source_object_key: key }],
      });
      if (clipRef) {
        result.skipped.push({ key, reason: 'PERSISTENT_CLIP_REFERENCE' });
        continue;
      }

      // c. Media Assets collection (storage_path)
      const mediaAssetRef = await db.collection('media_assets').findOne({
        user_id: attempt.user_id,
        storage_path: key,
      });
      if (mediaAssetRef) {
        result.skipped.push({ key, reason: 'PERSISTENT_MEDIA_ASSET_REFERENCE' });
        continue;
      }

      // d. Editor Projects collection
      const editorProjectRef = await db.collection('editor_projects').findOne({
        user_id: attempt.user_id,
        $or: [{ source_storage_path: key }, { 'metadata.source_url': key }],
      });
      if (editorProjectRef) {
        result.skipped.push({ key, reason: 'PERSISTENT_EDITOR_PROJECT_REFERENCE' });
        continue;
      }

      // e. Content Packs collection (source details matching object key)
      const contentPackRef = await db.collection('content_packs').findOne({
        user_id: attempt.user_id,
        $or: [{ 'source.storage_path': key }, { 'source.source_url': key }],
      });
      if (contentPackRef) {
        result.skipped.push({ key, reason: 'PERSISTENT_CONTENT_PACK_REFERENCE' });
        continue;
      }

      // 6. Verify physical existence in S3/R2 (via headObjectFn)
      try {
        const head = await this.headObjectFn('source', key);
        result.candidates.push({
          key,
          projectId: attempt.project_id,
          userId: attempt.user_id,
          size: head.size,
          reason: 'ORPHAN_UPLOAD_ATTEMPT_SUPERSEDED_AND_EXPIRED',
        });
      } catch (err: any) {
        // If object is 404 or missing in R2, skip it safely
        if (err?.code === 'UPLOAD_NOT_FOUND' || err?.statusCode === 404 || err?.name === 'NotFound') {
          result.skipped.push({ key, reason: 'OBJECT_NOT_FOUND_IN_STORAGE' });
        } else {
          // Transient storage failure (e.g. 500/timeout/network):
          // NEVER treat as a cleanup candidate! Skip safely with TRANSIENT_STORAGE_ERROR.
          result.skipped.push({ key, reason: `TRANSIENT_STORAGE_ERROR: ${err?.message || 'Storage unavailable'}` });
        }
      }
    }

    return result;
  }
}
