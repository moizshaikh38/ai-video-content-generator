import crypto from 'node:crypto';
import { getMongoDb } from '../db/mongoClient.js';
import { OutboxEventRecord, AppError } from '../types/index.js';
import { logger } from '../utils/logger.js';

export class OutboxService {
  /**
   * Phase 1: Atomically claims a pending or expired dispatch event for a dispatcher instance.
   */
  public static async claimForDispatch(
    dispatcherId: string,
    leaseMs = 30_000
  ): Promise<OutboxEventRecord | null> {
    const db = await getMongoDb();
    const outbox = db.collection<OutboxEventRecord>('outbox_events');
    const now = new Date();
    const leasedUntil = new Date(now.getTime() + leaseMs);
    const token = crypto.randomUUID();

    const result = await outbox.findOneAndUpdate(
      {
        $or: [
          { status: 'pending', next_attempt_at: { $lte: now } },
          { status: 'claimed_for_dispatch', dispatcher_leased_until: { $lt: now } },
        ],
        attempts: { $lt: 5 },
      },
      {
        $set: {
          status: 'claimed_for_dispatch',
          dispatcher_id: dispatcherId,
          dispatcher_claim_token: token,
          dispatcher_claimed_at: now,
          dispatcher_leased_until: leasedUntil,
          updated_at: now,
        },
        $inc: { attempts: 1 },
      },
      { returnDocument: 'after' }
    );

    return result;
  }

  /**
   * Extends the dispatcher claim lease if queueing/dispatching takes longer than expected.
   */
  public static async extendDispatchLease(
    eventId: string,
    dispatcherClaimToken: string,
    leaseMs = 30_000
  ): Promise<boolean> {
    const db = await getMongoDb();
    const outbox = db.collection<OutboxEventRecord>('outbox_events');
    const now = new Date();
    const leasedUntil = new Date(now.getTime() + leaseMs);

    const result = await outbox.updateOne(
      {
        _id: eventId,
        status: 'claimed_for_dispatch',
        dispatcher_claim_token: dispatcherClaimToken,
      },
      {
        $set: {
          dispatcher_leased_until: leasedUntil,
          updated_at: now,
        },
      }
    );

    return result.matchedCount === 1;
  }

  /**
   * Phase 2: Execution worker claims the task directly from the dispatcher's handoff.
   * Completely eliminates the pre-dispatch crash window.
   */
  public static async claimWorkerExecution(params: {
    eventId: string;
    dispatcherClaimToken: string;
    workerId: string;
    leaseMs?: number;
  }): Promise<{ claimed: boolean; workerClaimToken?: string; event?: OutboxEventRecord }> {
    const { eventId, dispatcherClaimToken, workerId, leaseMs = 45_000 } = params;
    const db = await getMongoDb();
    const outbox = db.collection<OutboxEventRecord>('outbox_events');
    const now = new Date();
    const leasedUntil = new Date(now.getTime() + leaseMs);
    const workerToken = crypto.randomUUID();

    const result = await outbox.findOneAndUpdate(
      {
        _id: eventId,
        status: 'claimed_for_dispatch',
        dispatcher_claim_token: dispatcherClaimToken,
      },
      {
        $set: {
          status: 'claimed_by_worker',
          worker_id: workerId,
          worker_claim_token: workerToken,
          worker_claimed_at: now,
          worker_leased_until: leasedUntil,
          dispatcher_id: null,
          dispatcher_claim_token: null,
          dispatcher_leased_until: null,
          updated_at: now,
        },
      },
      { returnDocument: 'after' }
    );

    if (!result) {
      return { claimed: false };
    }

    return { claimed: true, workerClaimToken: workerToken, event: result };
  }

  /**
   * Renews the execution worker's lease during active processing.
   */
  public static async pulseWorkerHeartbeat(params: {
    eventId: string;
    workerId: string;
    workerClaimToken: string;
    leaseMs?: number;
  }): Promise<boolean> {
    const { eventId, workerId, workerClaimToken, leaseMs = 45_000 } = params;
    const db = await getMongoDb();
    const outbox = db.collection<OutboxEventRecord>('outbox_events');
    const now = new Date();
    const leasedUntil = new Date(now.getTime() + leaseMs);

    const result = await outbox.updateOne(
      {
        _id: eventId,
        status: 'claimed_by_worker',
        worker_id: workerId,
        worker_claim_token: workerClaimToken,
      },
      {
        $set: {
          worker_leased_until: leasedUntil,
          updated_at: now,
        },
      }
    );

    return result.matchedCount === 1;
  }

  /**
   * Finalizes an outbox event as completed upon successful execution.
   */
  public static async completeEvent(params: {
    eventId: string;
    workerId: string;
    workerClaimToken: string;
  }): Promise<boolean> {
    const { eventId, workerId, workerClaimToken } = params;
    const db = await getMongoDb();
    const outbox = db.collection<OutboxEventRecord>('outbox_events');
    const now = new Date();

    const result = await outbox.updateOne(
      {
        _id: eventId,
        status: 'claimed_by_worker',
        worker_id: workerId,
        worker_claim_token: workerClaimToken,
      },
      {
        $set: {
          status: 'completed',
          worker_id: null,
          worker_claim_token: null,
          worker_leased_until: null,
          updated_at: now,
        },
      }
    );

    return result.matchedCount === 1;
  }

  /**
   * Marks an outbox event as dead-lettered after exceeding max retry attempts.
   */
  public static async deadLetterEvent(
    eventId: string,
    lastError: string
  ): Promise<boolean> {
    const db = await getMongoDb();
    const outbox = db.collection<OutboxEventRecord>('outbox_events');
    const now = new Date();

    const result = await outbox.updateOne(
      { _id: eventId },
      {
        $set: {
          status: 'dead_letter',
          dispatcher_id: null,
          dispatcher_claim_token: null,
          worker_id: null,
          worker_claim_token: null,
          last_error: lastError.substring(0, 500),
          updated_at: now,
        },
      }
    );

    return result.matchedCount === 1;
  }

  /**
   * Sweeper to recover expired dispatcher claims and stalled worker claims safely.
   */
  public static async sweepRecovery(): Promise<{
    recoveredDispatchers: number;
    recoveredWorkers: number;
  }> {
    const db = await getMongoDb();
    const outbox = db.collection<OutboxEventRecord>('outbox_events');
    const now = new Date();

    // 1. Recover expired dispatcher claims
    const dispRes = await outbox.updateMany(
      {
        status: 'claimed_for_dispatch',
        dispatcher_leased_until: { $lt: now },
      },
      {
        $set: {
          status: 'pending',
          dispatcher_id: null,
          dispatcher_claim_token: null,
          dispatcher_leased_until: null,
          updated_at: now,
        },
      }
    );

    // 2. Recover expired worker claims
    const expiredWorkers = await outbox.find({
      status: 'claimed_by_worker',
      worker_leased_until: { $lt: now },
    }).toArray();

    let recoveredWorkers = 0;
    for (const evt of expiredWorkers) {
      if (evt.attempts >= evt.max_attempts) {
        await outbox.updateOne(
          { _id: evt._id, worker_claim_token: evt.worker_claim_token },
          {
            $set: {
              status: 'dead_letter',
              last_error: 'Execution attempts exhausted (sweeper timeout)',
              updated_at: now,
            },
          }
        );
      } else {
        await outbox.updateOne(
          { _id: evt._id, worker_claim_token: evt.worker_claim_token },
          {
            $set: {
              status: 'pending',
              worker_id: null,
              worker_claim_token: null,
              worker_leased_until: null,
              next_attempt_at: new Date(now.getTime() + 5_000), // 5s backoff
              updated_at: now,
            },
          }
        );
      }
      recoveredWorkers++;
    }

    return {
      recoveredDispatchers: dispRes.modifiedCount,
      recoveredWorkers,
    };
  }
}

