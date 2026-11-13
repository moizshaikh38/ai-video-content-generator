import crypto from 'node:crypto';
import { getMongoDb } from '../mongoClient.js';
import { UserConcurrencySlotRecord, AppError } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

export const MAX_USER_CONCURRENT_JOBS = 20;

export class ConcurrencySlotRepository {
  /**
   * Initializes the deterministic 20-slot pool for a user if not present.
   */
  public static async ensureUserSlots(userId: string, totalSlots = MAX_USER_CONCURRENT_JOBS): Promise<void> {
    const db = await getMongoDb();
    const slots = db.collection<UserConcurrencySlotRecord>('user_concurrency_slots');

    const count = await slots.countDocuments({ user_id: userId });
    if (count >= totalSlots) return;

    const now = new Date();
    const ops = [];
    for (let i = 1; i <= totalSlots; i++) {
      const slotId = `${userId}:slot_${i}`;
      ops.push({
        updateOne: {
          filter: { _id: slotId },
          update: {
            $setOnInsert: {
              _id: slotId,
              user_id: userId,
              slot_number: i,
              status: 'available' as const,
              acquired_by_instance: null,
              attempt_id: null,
              reservation_id: null,
              slot_token: null,
              leased_until: null,
              created_at: now,
              updated_at: now,
            },
          },
          upsert: true,
        },
      });
    }

    if (ops.length > 0) {
      await slots.bulkWrite(ops, { ordered: false }).catch(() => undefined);
    }
  }

  /**
   * Phase 1: Atomically acquires an available or expired slot for the user.
   * If all 20 slots are actively held, returns acquired: false with 429 error.
   */
  public static async acquireSlot(params: {
    userId: string;
    attemptId: string;
    instanceId: string;
    leaseMs?: number;
  }): Promise<{ acquired: boolean; slot?: UserConcurrencySlotRecord; error?: string; errorCode?: string }> {
    const { userId, attemptId, instanceId, leaseMs = 15_000 } = params;
    await this.ensureUserSlots(userId);

    const db = await getMongoDb();
    const slots = db.collection<UserConcurrencySlotRecord>('user_concurrency_slots');
    const now = new Date();

    // 1. Idempotency: Check if this attemptId already holds a slot
    const existing = await slots.findOne({
      user_id: userId,
      attempt_id: attemptId,
      status: { $in: ['reserved_pending_tx', 'active'] },
    });

    if (existing && existing.leased_until && existing.leased_until > now) {
      return { acquired: true, slot: existing };
    }

    // 2. Atomic CAS acquisition matching available or expired slot
    const newToken = crypto.randomUUID();
    const leasedUntil = new Date(now.getTime() + leaseMs);

    const result = await slots.findOneAndUpdate(
      {
        user_id: userId,
        $or: [
          { status: 'available' },
          { status: { $in: ['reserved_pending_tx', 'active'] }, leased_until: { $lt: now } },
        ],
      },
      {
        $set: {
          status: 'reserved_pending_tx',
          acquired_by_instance: instanceId,
          attempt_id: attemptId,
          reservation_id: null,
          slot_token: newToken,
          leased_until: leasedUntil,
          updated_at: now,
        },
      },
      { returnDocument: 'after' }
    );

    if (!result) {
      return {
        acquired: false,
        errorCode: 'CONCURRENCY_LIMIT_EXCEEDED',
        error: `CONCURRENCY_LIMIT_EXCEEDED: Maximum of ${MAX_USER_CONCURRENT_JOBS} concurrent jobs active for user.`,
      };
    }

    return { acquired: true, slot: result };
  }

  /**
   * Phase 2: Links an acquired slot to a committed financial reservation and promotes to active.
   */
  public static async linkReservation(params: {
    slotId: string;
    slotToken: string;
    reservationId: string;
    leaseMs?: number;
  }): Promise<boolean> {
    const { slotId, slotToken, reservationId, leaseMs = 45_000 } = params;
    const db = await getMongoDb();
    const slots = db.collection<UserConcurrencySlotRecord>('user_concurrency_slots');
    const now = new Date();
    const leasedUntil = new Date(now.getTime() + leaseMs);

    const result = await slots.updateOne(
      {
        _id: slotId,
        slot_token: slotToken,
        status: 'reserved_pending_tx',
      },
      {
        $set: {
          status: 'active',
          reservation_id: reservationId,
          leased_until: leasedUntil,
          updated_at: now,
        },
      }
    );

    return result.matchedCount === 1;
  }

  /**
   * Renews the slot lease during worker heartbeat.
   */
  public static async renewLease(params: {
    slotId: string;
    slotToken: string;
    leaseMs?: number;
  }): Promise<boolean> {
    const { slotId, slotToken, leaseMs = 45_000 } = params;
    const db = await getMongoDb();
    const slots = db.collection<UserConcurrencySlotRecord>('user_concurrency_slots');
    const now = new Date();
    const leasedUntil = new Date(now.getTime() + leaseMs);

    const result = await slots.updateOne(
      {
        _id: slotId,
        slot_token: slotToken,
        status: 'active',
      },
      {
        $set: {
          leased_until: leasedUntil,
          updated_at: now,
        },
      }
    );

    return result.matchedCount === 1;
  }

  /**
   * Releases a slot back to available upon settlement or refund.
   * Matches slot_token to prevent stale worker release races.
   */
  public static async releaseSlot(params: {
    slotId: string;
    slotToken: string;
  }): Promise<boolean> {
    const { slotId, slotToken } = params;
    const db = await getMongoDb();
    const slots = db.collection<UserConcurrencySlotRecord>('user_concurrency_slots');
    const now = new Date();

    const result = await slots.updateOne(
      {
        _id: slotId,
        slot_token: slotToken,
      },
      {
        $set: {
          status: 'available',
          acquired_by_instance: null,
          attempt_id: null,
          reservation_id: null,
          slot_token: null,
          leased_until: null,
          updated_at: now,
        },
      }
    );

    return result.matchedCount === 1;
  }

  /**
   * Background sweeper to reclaim abandoned slots safely with database authoritative cross-check.
   */
  public static async sweepExpiredSlots(
    isReservationActiveCheck?: (attemptId: string) => Promise<boolean>
  ): Promise<{ recoveredPending: number; recoveredActive: number }> {
    const db = await getMongoDb();
    const slots = db.collection<UserConcurrencySlotRecord>('user_concurrency_slots');
    const now = new Date();

    const expired = await slots.find({
      status: { $in: ['reserved_pending_tx', 'active'] },
      leased_until: { $lt: now },
    }).toArray();

    let recoveredPending = 0;
    let recoveredActive = 0;

    for (const s of expired) {
      if (s.status === 'reserved_pending_tx') {
        // Check if underlying reservation transaction committed
        let isActive = false;
        if (s.attempt_id && isReservationActiveCheck) {
          isActive = await isReservationActiveCheck(s.attempt_id).catch(() => false);
        }
        if (isActive) {
          // Tx committed! Promote slot to active
          await slots.updateOne(
            { _id: s._id, slot_token: s.slot_token },
            {
              $set: {
                status: 'active',
                leased_until: new Date(now.getTime() + 45_000),
                updated_at: now,
              },
            }
          );
        } else {
          // Tx 1 never committed. Reset slot to available
          await slots.updateOne(
            { _id: s._id, slot_token: s.slot_token },
            {
              $set: {
                status: 'available',
                acquired_by_instance: null,
                attempt_id: null,
                reservation_id: null,
                slot_token: null,
                leased_until: null,
                updated_at: now,
              },
            }
          );
          recoveredPending++;
        }
      } else if (s.status === 'active') {
        let isActive = false;
        if (s.attempt_id && isReservationActiveCheck) {
          isActive = await isReservationActiveCheck(s.attempt_id).catch(() => false);
        }
        if (!isActive) {
          await slots.updateOne(
            { _id: s._id, slot_token: s.slot_token },
            {
              $set: {
                status: 'available',
                acquired_by_instance: null,
                attempt_id: null,
                reservation_id: null,
                slot_token: null,
                leased_until: null,
                updated_at: now,
              },
            }
          );
          recoveredActive++;
        }
      }
    }

    return { recoveredPending, recoveredActive };
  }
}
