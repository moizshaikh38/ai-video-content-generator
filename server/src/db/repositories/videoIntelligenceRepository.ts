import crypto from 'node:crypto';
import { getMongoDb } from '../mongoClient.js';
import {
  VideoIntelligenceRecord,
  VideoIntelligenceStatus,
} from '../../types/index.js';
import { logger } from '../../utils/logger.js';

export const CURRENT_ENGINE_VERSION = '1.7.0';
export const DEFAULT_LEASE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export class VideoIntelligenceRepository {
  private static collectionName = 'video_intelligence';

  /**
   * Finds a completed record by tenant userId and sourceHash.
   * If matching record exists and is completed, returns it.
   */
  public static async findBySourceHash(
    userId: string,
    sourceHash: string
  ): Promise<VideoIntelligenceRecord | null> {
    const db = await getMongoDb();
    const doc = await db.collection(this.collectionName).findOne({
      user_id: userId,
      source_hash: sourceHash,
    });
    return doc as unknown as VideoIntelligenceRecord | null;
  }

  /**
   * Finds a record by ID strictly scoped to the tenant userId.
   */
  public static async findById(
    userId: string,
    id: string
  ): Promise<VideoIntelligenceRecord | null> {
    const db = await getMongoDb();
    const doc = await db.collection(this.collectionName).findOne({
      id,
      user_id: userId,
    });
    return doc as unknown as VideoIntelligenceRecord | null;
  }

  /**
   * Atomically acquires a processing lease for a given video source identity.
   * Handles:
   * 1. Already completed -> Returns isExistingCompleted = true (zero duplicate analysis).
   * 2. Active in-flight processing -> Returns acquired = false (prevents duplicate work).
   * 3. Stale lease (crashed worker) or retryable failed job -> Atomically steals lease and returns acquired = true.
   * 4. New job -> Inserts new record with 'processing' status.
   */
  public static async acquireLease(
    userId: string,
    sourceHash: string,
    workerId: string,
    initialData: Partial<VideoIntelligenceRecord>,
    staleTimeoutMs: number = DEFAULT_LEASE_TIMEOUT_MS
  ): Promise<{
    acquired: boolean;
    record: VideoIntelligenceRecord;
    isExistingCompleted: boolean;
    leaseToken?: string;
  }> {
    const db = await getMongoDb();
    const now = new Date();
    const staleThreshold = new Date(now.getTime() - staleTimeoutMs);
    const leaseToken = crypto.randomUUID();

    // Step 1: Check existing record
    const existing = await this.findBySourceHash(userId, sourceHash);

    if (existing) {
      if (existing.status === 'completed') {
        return {
          acquired: false,
          record: existing,
          isExistingCompleted: true,
          leaseToken: existing.lease_token,
        };
      }

      // If currently processing and lease is still fresh, do not interrupt
      if (
        existing.status === 'processing' &&
        existing.locked_at &&
        new Date(existing.locked_at) > staleThreshold
      ) {
        return {
          acquired: false,
          record: existing,
          isExistingCompleted: false,
          leaseToken: existing.lease_token,
        };
      }

      // If failed and exceeded max attempts, check if forced or retryable
      const currentAttempts = existing.attempt_count || 1;
      const maxAttempts = existing.max_attempts || 3;
      if (existing.status === 'failed' && currentAttempts >= maxAttempts && !initialData.error_message) {
        return {
          acquired: false,
          record: existing,
          isExistingCompleted: false,
        };
      }

      // Step 2: Acquire lease atomically on stale/failed/queued record with fresh fencing leaseToken
      const result = await db.collection(this.collectionName).findOneAndUpdate(
        {
          id: existing.id,
          user_id: userId,
          $or: [
            { status: 'queued' },
            { status: 'failed' },
            { status: 'processing', locked_at: { $lte: staleThreshold } },
          ],
        },
        {
          $set: {
            status: 'processing' as VideoIntelligenceStatus,
            locked_at: now,
            locked_by: workerId,
            lease_token: leaseToken,
            updated_at: now,
          },
          $inc: {
            attempt_count: 1,
          },
        },
        { returnDocument: 'after' }
      );

      if (result) {
        return {
          acquired: true,
          record: result as unknown as VideoIntelligenceRecord,
          isExistingCompleted: false,
          leaseToken,
        };
      }

      // Another worker raced and acquired it
      const refreshed = await this.findBySourceHash(userId, sourceHash);
      return {
        acquired: false,
        record: refreshed || existing,
        isExistingCompleted: refreshed?.status === 'completed',
        leaseToken: refreshed?.lease_token,
      };
    }

    // Step 3: No existing record. Insert fresh record with atomic lease & fencing leaseToken
    const newId = initialData.id || crypto.randomUUID();
    const docToInsert: VideoIntelligenceRecord = {
      id: newId,
      user_id: userId,
      source_hash: sourceHash,
      source_video_url: initialData.source_video_url,
      status: 'processing',
      engine_version: initialData.engine_version || CURRENT_ENGINE_VERSION,
      source_identity: initialData.source_identity!,
      metadata: initialData.metadata!,
      attempt_count: 1,
      max_attempts: initialData.max_attempts || 3,
      locked_at: now,
      locked_by: workerId,
      lease_token: leaseToken,
      created_at: now,
      updated_at: now,
    };

    try {
      await db.collection(this.collectionName).insertOne(docToInsert as any);
      return {
        acquired: true,
        record: docToInsert,
        isExistingCompleted: false,
        leaseToken,
      };
    } catch (err: any) {
      // Catch unique index violation race condition
      if (err.code === 11000) {
        const found = await this.findBySourceHash(userId, sourceHash);
        if (found) {
          return {
            acquired: false,
            record: found,
            isExistingCompleted: found.status === 'completed',
            leaseToken: found.lease_token,
          };
        }
      }
      throw err;
    }
  }

  /**
   * Atomically renews/extends a processing lease for an active worker.
   * Uses lease token fencing: only the worker with matching workerId AND leaseToken can renew.
   * If the lease expired and another worker acquired it, returns null.
   */
  public static async renewLease(
    id: string,
    userId: string,
    workerId: string,
    leaseToken: string
  ): Promise<VideoIntelligenceRecord | null> {
    const db = await getMongoDb();
    const now = new Date();

    const result = await db.collection(this.collectionName).findOneAndUpdate(
      {
        id,
        user_id: userId,
        status: 'processing',
        locked_by: workerId,
        lease_token: leaseToken,
      },
      {
        $set: {
          locked_at: now,
          updated_at: now,
        },
      },
      { returnDocument: 'after' }
    );

    return result as unknown as VideoIntelligenceRecord | null;
  }

  /**
   * Alias for renewLease: Atomically extends active lease for workerId & leaseToken.
   */
  public static async extendLease(
    id: string,
    userId: string,
    workerId: string,
    leaseToken: string
  ): Promise<VideoIntelligenceRecord | null> {
    return this.renewLease(id, userId, workerId, leaseToken);
  }

  /**
   * Marks analysis completed atomically with the final extracted intelligence.
   * When fencing ({ workerId, leaseToken }) is provided, ensures only the current
   * active lease owner can mark completed. Stale workers are blocked.
   */
  public static async markCompleted(
    id: string,
    userId: string,
    payload: {
      audio_intelligence?: any;
      visual_intelligence?: any;
      multimodal_reasoning?: any;
      clipping_recommendations?: any;
      subtitle_handoff?: any;
      metadata?: any;
    },
    fencing?: { workerId: string; leaseToken: string }
  ): Promise<VideoIntelligenceRecord | null> {
    const db = await getMongoDb();
    const now = new Date();

    const filter: any = { id, user_id: userId };
    if (fencing) {
      filter.status = 'processing';
      filter.locked_by = fencing.workerId;
      filter.lease_token = fencing.leaseToken;
    }

    const result = await db.collection(this.collectionName).findOneAndUpdate(
      filter,
      {
        $set: {
          status: 'completed' as VideoIntelligenceStatus,
          audio_intelligence: payload.audio_intelligence,
          visual_intelligence: payload.visual_intelligence,
          multimodal_reasoning: payload.multimodal_reasoning,
          clipping_recommendations: payload.clipping_recommendations,
          subtitle_handoff: payload.subtitle_handoff,
          ...(payload.metadata ? { metadata: payload.metadata } : {}),
          locked_at: null,
          locked_by: null,
          lease_token: null,
          error_message: null,
          updated_at: now,
        },
      },
      { returnDocument: 'after' }
    );

    return result as unknown as VideoIntelligenceRecord | null;
  }

  /**
   * Marks analysis failed with an error message, releasing the lease.
   * When fencing ({ workerId, leaseToken }) is provided, ensures only the current
   * active lease owner can transition to failed. Stale workers cannot fail a job
   * taken over by a new worker.
   */
  public static async markFailed(
    id: string,
    userId: string,
    errorMessage: string,
    fencing?: { workerId: string; leaseToken: string }
  ): Promise<VideoIntelligenceRecord | null> {
    const db = await getMongoDb();
    const now = new Date();

    const filter: any = { id, user_id: userId };
    if (fencing) {
      filter.status = 'processing';
      filter.locked_by = fencing.workerId;
      filter.lease_token = fencing.leaseToken;
    }

    const result = await db.collection(this.collectionName).findOneAndUpdate(
      filter,
      {
        $set: {
          status: 'failed' as VideoIntelligenceStatus,
          error_message: errorMessage,
          locked_at: null,
          locked_by: null,
          lease_token: null,
          updated_at: now,
        },
      },
      { returnDocument: 'after' }
    );

    return result as unknown as VideoIntelligenceRecord | null;
  }

  /**
   * Invalidates / deletes a cache record to force re-analysis.
   */
  public static async invalidateCache(
    userId: string,
    sourceHash: string
  ): Promise<boolean> {
    const db = await getMongoDb();
    const res = await db.collection(this.collectionName).deleteOne({
      user_id: userId,
      source_hash: sourceHash,
    });
    return res.deletedCount > 0;
  }

  /**
   * Lists recent intelligence records for a tenant user.
   */
  public static async listByUser(
    userId: string,
    limit: number = 20
  ): Promise<VideoIntelligenceRecord[]> {
    const db = await getMongoDb();
    const docs = await db
      .collection(this.collectionName)
      .find({ user_id: userId })
      .sort({ created_at: -1 })
      .limit(limit)
      .toArray();
    return docs as unknown as VideoIntelligenceRecord[];
  }
}

