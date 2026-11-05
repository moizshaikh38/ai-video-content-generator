import crypto from 'node:crypto';
import { ClientSession, MongoServerError } from 'mongodb';
import { getMongoClient, getMongoDb } from '../mongoClient.js';
import {
  CreditWalletRecord,
  CreditTransactionRecord,
  CreditReservationRecord,
  CreditTransactionType,
  CreditBalanceSummary,
  AppError,
} from '../../types/index.js';
import { logger } from '../../utils/logger.js';

export function getCurrentBillingPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function getBillingResetDate(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

/**
 * Executes an operation with a transaction if supported by the MongoDB cluster (replica set),
 * otherwise falls back to non-transactional atomic execution for standalone environments.
 */
async function withOptionalTransaction<T>(fn: (session?: ClientSession) => Promise<T>): Promise<T> {
  const client = await getMongoClient();
  let session: ClientSession | null = null;
  try {
    session = client.startSession();
    return await session.withTransaction(async () => fn(session || undefined), {
      maxCommitTimeMS: 10_000,
    }) as T;
  } catch (err: any) {
    // If transactions are not supported (e.g. Standalone Mongo in local development), run directly
    if (
      err instanceof MongoServerError &&
      (err.code === 20 || err.code === 263 || err.message?.includes('Transaction numbers are only allowed on a replica set member or mongos'))
    ) {
      return fn(undefined);
    }
    throw err;
  } finally {
    if (session) {
      await session.endSession().catch(() => undefined);
    }
  }
}

export class CreditRepository {
  /**
   * Fetches the user's unified wallet or creates one idempotently if not present.
   */
  public static async getOrCreateWallet(
    userId: string,
    workspaceId?: string | null
  ): Promise<CreditWalletRecord> {
    const db = await getMongoDb();
    const wallets = db.collection<CreditWalletRecord>('credit_wallets');

    const existing = await wallets.findOne({ user_id: userId });
    if (existing) {
      return existing;
    }

    const now = new Date();
    const initialWallet: CreditWalletRecord = {
      id: crypto.randomUUID(),
      user_id: userId,
      workspace_id: workspaceId || null,
      available_credits: 0,
      reserved_credits: 0,
      lifetime_granted: 0,
      lifetime_consumed: 0,
      period_granted: 0,
      period_consumed: 0,
      billing_period: getCurrentBillingPeriod(),
      reset_date: getBillingResetDate(),
      status: 'active',
      version: 1,
      created_at: now,
      updated_at: now,
    };

    try {
      await wallets.insertOne(initialWallet);
      return initialWallet;
    } catch (err: any) {
      if (err.code === 11000) {
        // Race condition: another thread created it
        const fetched = await wallets.findOne({ user_id: userId });
        if (fetched) return fetched;
      }
      throw err;
    }
  }

  /**
   * Grants credits to a wallet with strict idempotency and an append-only ledger transaction.
   */
  public static async grantCredits(params: {
    userId: string;
    amount: number;
    type: CreditTransactionType;
    idempotencyKey: string;
    description: string;
    billingPeriod?: string;
    workspaceId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<{ wallet: CreditWalletRecord; alreadyProcessed: boolean }> {
    const { userId, amount, type, idempotencyKey, description, billingPeriod, workspaceId, metadata } = params;

    if (amount <= 0) {
      throw new AppError('Credit grant amount must be positive.', 400, 'INVALID_CREDIT_AMOUNT');
    }

    const db = await getMongoDb();
    const transactions = db.collection<CreditTransactionRecord>('credit_transactions');
    const wallets = db.collection<CreditWalletRecord>('credit_wallets');

    // 1. Check idempotency
    const existingTx = await transactions.findOne({ idempotency_key: idempotencyKey });
    if (existingTx) {
      const wallet = await this.getOrCreateWallet(userId, workspaceId);
      return { wallet, alreadyProcessed: true };
    }

    return withOptionalTransaction(async (session) => {
      const wallet = await this.getOrCreateWallet(userId, workspaceId);
      const now = new Date();
      const currentPeriod = billingPeriod || getCurrentBillingPeriod();

      const balanceBefore = wallet.available_credits;
      const balanceAfter = balanceBefore + amount;
      const reservedBefore = wallet.reserved_credits;
      const reservedAfter = reservedBefore;

      // Update wallet
      const updateDoc: Record<string, any> = {
        $inc: {
          available_credits: amount,
          period_granted: amount,
          lifetime_granted: amount,
          version: 1,
        },
        $set: {
          billing_period: currentPeriod,
          reset_date: getBillingResetDate(),
          updated_at: now,
        },
      };

      let walletModified = false;
      try {
        await wallets.updateOne({ id: wallet.id }, updateDoc, { session });
        walletModified = true;

        // Insert ledger entry
        const txRecord: CreditTransactionRecord = {
          id: crypto.randomUUID(),
          wallet_id: wallet.id,
          user_id: userId,
          workspace_id: workspaceId || null,
          type,
          amount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          reserved_before: reservedBefore,
          reserved_after: reservedAfter,
          idempotency_key: idempotencyKey,
          description,
          metadata: metadata || {},
          created_at: now,
        };

        await transactions.insertOne(txRecord, { session });
      } catch (err) {
        if (!session && walletModified) {
          // Compensating rollback for standalone non-transactional Mongo
          await wallets.updateOne(
            { id: wallet.id },
            {
              $inc: {
                available_credits: -amount,
                period_granted: -amount,
                lifetime_granted: -amount,
              },
            }
          ).catch(() => undefined);
        }
        throw err;
      }

      const updatedWallet = await wallets.findOne({ id: wallet.id }, { session });
      return { wallet: updatedWallet || wallet, alreadyProcessed: false };
    });
  }

  /**
   * Atomically reserves credits for an in-flight operation.
   * If available balance is insufficient, fails cleanly with 403 INSUFFICIENT_CREDITS.
   */
  public static async reserveCredits(params: {
    userId: string;
    attemptId: string;
    operationId: string;
    amount: number;
    ttlMinutes?: number;
    workspaceId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<{
    allowed: boolean;
    idempotent?: boolean;
    reservation?: CreditReservationRecord;
    wallet: CreditWalletRecord;
  }> {
    const { userId, attemptId, operationId, amount, ttlMinutes = 60, workspaceId, metadata } = params;

    if (amount < 0) {
      throw new AppError('Reservation amount cannot be negative.', 400, 'INVALID_RESERVATION_AMOUNT');
    }

    const db = await getMongoDb();
    const reservations = db.collection<CreditReservationRecord>('credit_reservations');
    const wallets = db.collection<CreditWalletRecord>('credit_wallets');
    const transactions = db.collection<CreditTransactionRecord>('credit_transactions');

    // 1. Idempotency check on existing attempt_id
    const existingRes = await reservations.findOne({ attempt_id: attemptId });
    if (existingRes) {
      const wallet = await this.getOrCreateWallet(userId, workspaceId);
      return {
        allowed: existingRes.status === 'reserved' || existingRes.status === 'settled',
        idempotent: true,
        reservation: existingRes,
        wallet,
      };
    }

    // 0-credit operations do not mutate balances, but record a completed reservation
    if (amount === 0) {
      const wallet = await this.getOrCreateWallet(userId, workspaceId);
      const now = new Date();
      const zeroRes: CreditReservationRecord = {
        id: crypto.randomUUID(),
        wallet_id: wallet.id,
        user_id: userId,
        workspace_id: workspaceId || null,
        attempt_id: attemptId,
        operation_id: operationId,
        amount: 0,
        settled_amount: 0,
        status: 'settled',
        expires_at: new Date(now.getTime() + ttlMinutes * 60 * 1000),
        metadata: metadata || {},
        created_at: now,
        updated_at: now,
      };
      await reservations.insertOne(zeroRes);
      return { allowed: true, reservation: zeroRes, wallet };
    }

    return withOptionalTransaction(async (session) => {
      const wallet = await this.getOrCreateWallet(userId, workspaceId);

      // Atomic conditional deduction: available_credits must be >= amount
      const updateResult = await wallets.updateOne(
        {
          id: wallet.id,
          available_credits: { $gte: amount },
        },
        {
          $inc: {
            available_credits: -amount,
            reserved_credits: amount,
            version: 1,
          },
          $set: {
            updated_at: new Date(),
          },
        },
        { session }
      );

      if (updateResult.matchedCount === 0) {
        // Balance was lower than requested amount
        return {
          allowed: false,
          wallet,
        };
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);
      const resRecord: CreditReservationRecord = {
        id: crypto.randomUUID(),
        wallet_id: wallet.id,
        user_id: userId,
        workspace_id: workspaceId || null,
        attempt_id: attemptId,
        operation_id: operationId,
        amount,
        status: 'reserved',
        expires_at: expiresAt,
        metadata: metadata || {},
        created_at: now,
        updated_at: now,
      };

      try {
        await reservations.insertOne(resRecord, { session });

        // Append reservation transaction
        const balanceBefore = wallet.available_credits;
        const balanceAfter = balanceBefore - amount;
        const reservedBefore = wallet.reserved_credits;
        const reservedAfter = reservedBefore + amount;

        const txRecord: CreditTransactionRecord = {
          id: crypto.randomUUID(),
          wallet_id: wallet.id,
          user_id: userId,
          workspace_id: workspaceId || null,
          type: 'reservation',
          amount: -amount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          reserved_before: reservedBefore,
          reserved_after: reservedAfter,
          operation_id: operationId,
          reference_id: attemptId,
          reservation_id: resRecord.id,
          idempotency_key: `reserve_${attemptId}`,
          description: `Reserved ${amount} credits for ${operationId}`,
          metadata: metadata || {},
          created_at: now,
        };

        await transactions.insertOne(txRecord, { session });
      } catch (err) {
        if (!session) {
          // Compensating rollback for standalone non-transactional Mongo
          await wallets.updateOne(
            { id: wallet.id },
            {
              $inc: {
                available_credits: amount,
                reserved_credits: -amount,
              },
            }
          ).catch(() => undefined);
          await reservations.deleteOne({ id: resRecord.id }).catch(() => undefined);
        }
        throw err;
      }

      const updatedWallet = await wallets.findOne({ id: wallet.id }, { session });
      return {
        allowed: true,
        reservation: resRecord,
        wallet: updatedWallet || wallet,
      };
    });
  }

  /**
   * Atomically extends an existing reservation if actual/measured usage exceeds provisional estimate.
   * If wallet has sufficient available balance, reserves the additional credits.
   * If not, returns { allowed: false, errorCode: 'INSUFFICIENT_CREDITS' }.
   */
  public static async extendReservation(params: {
    attemptId: string;
    additionalAmount: number;
    reason?: string;
  }): Promise<{
    allowed: boolean;
    reservation?: CreditReservationRecord;
    wallet?: CreditWalletRecord;
    errorCode?: string;
    errorMessage?: string;
  }> {
    const { attemptId, additionalAmount, reason = 'Measured duration extension' } = params;
    if (additionalAmount <= 0) {
      return { allowed: true };
    }

    const db = await getMongoDb();
    const reservations = db.collection<CreditReservationRecord>('credit_reservations');
    const wallets = db.collection<CreditWalletRecord>('credit_wallets');
    const transactions = db.collection<CreditTransactionRecord>('credit_transactions');

    const reservation = await reservations.findOne({ attempt_id: attemptId });
    if (!reservation) {
      return { allowed: false, errorCode: 'RESERVATION_NOT_FOUND', errorMessage: `Reservation not found for attempt ${attemptId}` };
    }

    if (reservation.status !== 'reserved') {
      return { allowed: false, errorCode: 'INVALID_RESERVATION_STATE', errorMessage: `Reservation is in ${reservation.status} state, cannot extend` };
    }

    return withOptionalTransaction(async (session) => {
      const wallet = await this.getOrCreateWallet(reservation.user_id, reservation.workspace_id);

      // Atomic conditional deduction for additional amount
      const updateResult = await wallets.updateOne(
        {
          id: wallet.id,
          available_credits: { $gte: additionalAmount },
        },
        {
          $inc: {
            available_credits: -additionalAmount,
            reserved_credits: additionalAmount,
            version: 1,
          },
          $set: {
            updated_at: new Date(),
          },
        },
        { session }
      );

      if (updateResult.matchedCount === 0) {
        return {
          allowed: false,
          wallet,
          errorCode: 'INSUFFICIENT_CREDITS',
          errorMessage: `Insufficient credits to extend reservation. Need ${additionalAmount} more credits, but only ${wallet.available_credits} available.`,
        };
      }

      const now = new Date();
      await reservations.updateOne(
        { id: reservation.id },
        {
          $inc: { amount: additionalAmount },
          $set: { updated_at: now },
        },
        { session }
      );

      const balanceBefore = wallet.available_credits;
      const balanceAfter = balanceBefore - additionalAmount;
      const reservedBefore = wallet.reserved_credits;
      const reservedAfter = reservedBefore + additionalAmount;

      const txRecord: CreditTransactionRecord = {
        id: crypto.randomUUID(),
        wallet_id: wallet.id,
        user_id: reservation.user_id,
        workspace_id: reservation.workspace_id || null,
        type: 'reservation',
        amount: -additionalAmount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        reserved_before: reservedBefore,
        reserved_after: reservedAfter,
        operation_id: reservation.operation_id,
        reference_id: attemptId,
        reservation_id: reservation.id,
        idempotency_key: `reserve_extend_${attemptId}_${Date.now()}`,
        description: `Extended reservation by ${additionalAmount} credits: ${reason}`,
        metadata: { additionalAmount, reason },
        created_at: now,
      };

      try {
        await transactions.insertOne(txRecord, { session });
      } catch (err) {
        if (!session) {
          await wallets.updateOne(
            { id: wallet.id },
            {
              $inc: {
                available_credits: additionalAmount,
                reserved_credits: -additionalAmount,
              },
            }
          ).catch(() => undefined);
          await reservations.updateOne(
            { id: reservation.id },
            { $inc: { amount: -additionalAmount } }
          ).catch(() => undefined);
        }
        throw err;
      }

      const updatedWallet = await wallets.findOne({ id: wallet.id }, { session });
      const updatedReservation = await reservations.findOne({ id: reservation.id }, { session });

      return {
        allowed: true,
        reservation: updatedReservation || reservation,
        wallet: updatedWallet || wallet,
      };
    });
  }

  /**
   * Settles an active reservation upon successful processing completion.
   * If actualAmount is less than reserved amount, unused credits are returned to available balance.
   * Duplicate settlements are safely handled idempotently.
   */
  public static async settleReservation(
    attemptId: string,
    actualAmount?: number,
    metadata?: Record<string, unknown>
  ): Promise<{
    idempotent?: boolean;
    settledAmount: number;
    reservation: CreditReservationRecord;
    wallet: CreditWalletRecord;
  }> {
    const db = await getMongoDb();
    const reservations = db.collection<CreditReservationRecord>('credit_reservations');
    const wallets = db.collection<CreditWalletRecord>('credit_wallets');
    const transactions = db.collection<CreditTransactionRecord>('credit_transactions');

    const reservation = await reservations.findOne({ attempt_id: attemptId });
    if (!reservation) {
      throw new AppError(`Reservation not found for attempt ${attemptId}`, 404, 'RESERVATION_NOT_FOUND');
    }

    if (reservation.status === 'settled') {
      const wallet = await this.getOrCreateWallet(reservation.user_id, reservation.workspace_id);
      return {
        idempotent: true,
        settledAmount: reservation.settled_amount ?? reservation.amount,
        reservation,
        wallet,
      };
    }

    if (reservation.status === 'released') {
      throw new AppError(`Cannot settle reservation ${attemptId} because it was already released.`, 409, 'RESERVATION_ALREADY_RELEASED');
    }

    if (reservation.status !== 'reserved') {
      throw new AppError(`Reservation ${attemptId} is not in active reserved status (current: ${reservation.status}).`, 400, 'INVALID_RESERVATION_STATE');
    }

    // Determine final settled amount (clamped to never exceed original reservation)
    const rawSettled = actualAmount !== undefined ? Number(actualAmount) : reservation.amount;
    const settledAmount = Math.max(0, Math.min(reservation.amount, rawSettled));
    const refundUnused = reservation.amount - settledAmount;

    return withOptionalTransaction(async (session) => {
      const now = new Date();

      // Atomically transition status from reserved -> settled
      const updateResResult = await reservations.updateOne(
        {
          id: reservation.id,
          status: 'reserved',
        },
        {
          $set: {
            status: 'settled',
            settled_amount: settledAmount,
            updated_at: now,
          },
        },
        { session }
      );

      if (updateResResult.matchedCount === 0) {
        // Race condition: another worker already settled
        const recheck = await reservations.findOne({ id: reservation.id }, { session });
        const wallet = await this.getOrCreateWallet(reservation.user_id, reservation.workspace_id);
        return {
          idempotent: true,
          settledAmount: recheck?.settled_amount ?? settledAmount,
          reservation: recheck || reservation,
          wallet,
        };
      }

      const wallet = await this.getOrCreateWallet(reservation.user_id, reservation.workspace_id);

      let walletModified = false;
      try {
        await wallets.updateOne(
          { id: wallet.id },
          {
            $inc: {
              reserved_credits: -reservation.amount,
              available_credits: refundUnused,
              period_consumed: settledAmount,
              lifetime_consumed: settledAmount,
              version: 1,
            },
            $set: {
              updated_at: now,
            },
          },
          { session }
        );
        walletModified = true;

        const balanceBefore = wallet.available_credits;
        const balanceAfter = balanceBefore + refundUnused;
        const reservedBefore = wallet.reserved_credits;
        const reservedAfter = reservedBefore - reservation.amount;

        // Log consumption ledger transaction
        const txRecord: CreditTransactionRecord = {
          id: crypto.randomUUID(),
          wallet_id: wallet.id,
          user_id: reservation.user_id,
          workspace_id: reservation.workspace_id || null,
          type: 'consumption',
          amount: settledAmount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          reserved_before: reservedBefore,
          reserved_after: reservedAfter,
          operation_id: reservation.operation_id,
          reference_id: attemptId,
          reservation_id: reservation.id,
          idempotency_key: `settle_${attemptId}`,
          description: `Settled ${settledAmount} credits for ${reservation.operation_id}${refundUnused > 0 ? ` (${refundUnused} unused credits refunded)` : ''}`,
          metadata: { ...(metadata || {}), original_reserved: reservation.amount, refund_unused: refundUnused },
          created_at: now,
        };

        await transactions.insertOne(txRecord, { session });
      } catch (err) {
        if (!session) {
          // Compensating rollback for standalone non-transactional Mongo
          if (walletModified) {
            await wallets.updateOne(
              { id: wallet.id },
              {
                $inc: {
                  reserved_credits: reservation.amount,
                  available_credits: -refundUnused,
                  period_consumed: -settledAmount,
                  lifetime_consumed: -settledAmount,
                },
              }
            ).catch(() => undefined);
          }
          await reservations.updateOne(
            { id: reservation.id },
            { $set: { status: 'reserved', updated_at: now }, $unset: { settled_amount: '' } }
          ).catch(() => undefined);
        }
        throw err;
      }

      const updatedWallet = await wallets.findOne({ id: wallet.id }, { session });
      const updatedReservation = await reservations.findOne({ id: reservation.id }, { session });

      return {
        settledAmount,
        reservation: updatedReservation || reservation,
        wallet: updatedWallet || wallet,
      };
    });
  }

  /**
   * Releases an active reservation back to the user's available balance upon eligible job failure.
   * Duplicate release requests are idempotent.
   */
  public static async releaseReservation(
    attemptId: string,
    reason: string
  ): Promise<{
    idempotent?: boolean;
    releasedAmount: number;
    reservation: CreditReservationRecord;
    wallet: CreditWalletRecord;
  }> {
    const db = await getMongoDb();
    const reservations = db.collection<CreditReservationRecord>('credit_reservations');
    const wallets = db.collection<CreditWalletRecord>('credit_wallets');
    const transactions = db.collection<CreditTransactionRecord>('credit_transactions');

    const reservation = await reservations.findOne({ attempt_id: attemptId });
    if (!reservation) {
      throw new AppError(`Reservation not found for attempt ${attemptId}`, 404, 'RESERVATION_NOT_FOUND');
    }

    if (reservation.status === 'released') {
      const wallet = await this.getOrCreateWallet(reservation.user_id, reservation.workspace_id);
      return {
        idempotent: true,
        releasedAmount: reservation.amount,
        reservation,
        wallet,
      };
    }

    if (reservation.status === 'settled') {
      throw new AppError(`Cannot release reservation ${attemptId} because it has already been settled.`, 409, 'RESERVATION_ALREADY_SETTLED');
    }

    return withOptionalTransaction(async (session) => {
      const now = new Date();

      // Atomically update reservation status from reserved -> released
      const updateResResult = await reservations.updateOne(
        {
          id: reservation.id,
          status: 'reserved',
        },
        {
          $set: {
            status: 'released',
            updated_at: now,
          },
        },
        { session }
      );

      if (updateResResult.matchedCount === 0) {
        // Race condition: another thread already released
        const recheck = await reservations.findOne({ id: reservation.id }, { session });
        const wallet = await this.getOrCreateWallet(reservation.user_id, reservation.workspace_id);
        return {
          idempotent: true,
          releasedAmount: recheck?.amount ?? reservation.amount,
          reservation: recheck || reservation,
          wallet,
        };
      }

      const wallet = await this.getOrCreateWallet(reservation.user_id, reservation.workspace_id);

      let walletModified = false;
      try {
        // Refund reserved credits back to available balance
        await wallets.updateOne(
          { id: wallet.id },
          {
            $inc: {
              reserved_credits: -reservation.amount,
              available_credits: reservation.amount,
              version: 1,
            },
            $set: {
              updated_at: now,
            },
          },
          { session }
        );
        walletModified = true;

        const balanceBefore = wallet.available_credits;
        const balanceAfter = balanceBefore + reservation.amount;
        const reservedBefore = wallet.reserved_credits;
        const reservedAfter = reservedBefore - reservation.amount;

        // Log release transaction in ledger
        const txRecord: CreditTransactionRecord = {
          id: crypto.randomUUID(),
          wallet_id: wallet.id,
          user_id: reservation.user_id,
          workspace_id: reservation.workspace_id || null,
          type: 'reservation_release',
          amount: reservation.amount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          reserved_before: reservedBefore,
          reserved_after: reservedAfter,
          operation_id: reservation.operation_id,
          reference_id: attemptId,
          reservation_id: reservation.id,
          idempotency_key: `release_${attemptId}`,
          description: `Released ${reservation.amount} reserved credits: ${reason}`,
          metadata: { reason },
          created_at: now,
        };

        await transactions.insertOne(txRecord, { session });
      } catch (err) {
        if (!session) {
          // Compensating rollback for standalone non-transactional Mongo
          if (walletModified) {
            await wallets.updateOne(
              { id: wallet.id },
              {
                $inc: {
                  reserved_credits: reservation.amount,
                  available_credits: -reservation.amount,
                },
              }
            ).catch(() => undefined);
          }
          await reservations.updateOne(
            { id: reservation.id },
            { $set: { status: 'reserved', updated_at: now } }
          ).catch(() => undefined);
        }
        throw err;
      }

      const updatedWallet = await wallets.findOne({ id: wallet.id }, { session });
      const updatedReservation = await reservations.findOne({ id: reservation.id }, { session });

      return {
        releasedAmount: reservation.amount,
        reservation: updatedReservation || reservation,
        wallet: updatedWallet || wallet,
      };
    });
  }

  /**
   * Scans and releases expired reservations orphaned by worker crashes or network dropouts.
   * Checks if underlying processing or rendering jobs are actively running; if so, extends
   * expiration instead of premature cancellation.
   */
  public static async recoverExpiredReservations(): Promise<number> {
    const db = await getMongoDb();
    const reservations = db.collection<CreditReservationRecord>('credit_reservations');

    const now = new Date();
    const expiredList = await reservations
      .find({
        status: 'reserved',
        expires_at: { $lt: now },
      })
      .limit(50)
      .toArray();

    const activeProjectStatuses = ['uploading', 'queued', 'processing', 'transcribing', 'analyzing', 'generating'];
    const activeRenderJobStatuses = ['queued', 'processing', 'uploading'];
    const activeClipStatuses = ['queued', 'rendering', 'uploading'];

    let recovered = 0;
    for (const item of expiredList) {
      try {
        let isJobActive = false;

        // Staleness thresholds: 60m for project activity, 30m for render jobs
        const staleProjectCutoff = new Date(now.getTime() - 60 * 60 * 1000);
        const staleJobCutoff = new Date(now.getTime() - 30 * 60 * 1000);

        // 1. Check projects collection if metadata references projectId
        if (item.metadata?.projectId && typeof item.metadata.projectId === 'string') {
          const project = await db.collection('projects').findOne({
            id: item.metadata.projectId,
            video_status: { $in: activeProjectStatuses },
          });
          if (project) {
            const lastUpdated = project.updated_at
              ? new Date(project.updated_at)
              : (project.created_at ? new Date(project.created_at) : null);
            if (lastUpdated && lastUpdated >= staleProjectCutoff) {
              isJobActive = true;
            } else {
              logger.warn(
                `[CreditRepository] Project ${item.metadata.projectId} is in active status but stale (no update for >60m); treating as abandoned.`
              );
            }
          }
        }

        // 2. Check render_jobs collection
        if (!isJobActive) {
          const candidateJobIds = [item.attempt_id, item.metadata?.jobId].filter(
            (id): id is string => typeof id === 'string' && Boolean(id)
          );
          if (candidateJobIds.length > 0) {
            const renderJob = await db.collection('render_jobs').findOne({
              id: { $in: candidateJobIds },
              status: { $in: activeRenderJobStatuses },
            });
            if (renderJob) {
              const lastHeartbeat = renderJob.locked_at
                ? new Date(renderJob.locked_at)
                : (renderJob.updated_at ? new Date(renderJob.updated_at) : null);
              if (lastHeartbeat && lastHeartbeat >= staleJobCutoff) {
                isJobActive = true;
              } else {
                logger.warn(
                  `[CreditRepository] Render job ${renderJob.id} is in active status but stale (no heartbeat for >30m); treating as abandoned.`
                );
              }
            }
          }
        }

        // 3. Check clips collection
        if (!isJobActive && item.metadata?.clipId && typeof item.metadata.clipId === 'string') {
          const clip = await db.collection('clips').findOne({
            id: item.metadata.clipId,
            render_status: { $in: activeClipStatuses },
          });
          if (clip) {
            const lastUpdated = clip.updated_at ? new Date(clip.updated_at) : null;
            if (lastUpdated && lastUpdated >= staleJobCutoff) {
              isJobActive = true;
            } else {
              logger.warn(
                `[CreditRepository] Clip ${clip.id} is in active status but stale (no update for >30m); treating as abandoned.`
              );
            }
          }
        }

        // If an associated job is still actively running, extend expiration by 30 minutes instead of releasing
        if (isJobActive) {
          logger.info(`[CreditRepository] Reservation ${item.attempt_id} expired but associated job is still active; extending expiration by 30 minutes.`);
          await reservations.updateOne(
            { id: item.id },
            { $set: { expires_at: new Date(now.getTime() + 30 * 60 * 1000), updated_at: now } }
          );
          continue;
        }

        await this.releaseReservation(item.attempt_id, 'Automatic recovery of expired reservation');
        recovered++;
      } catch (err: any) {
        // Continue scanning others
      }
    }
    return recovered;
  }

  /**
   * Retrieves full balance summary for a user.
   */
  public static async getBalanceSummary(
    userId: string,
    isUnlimited = false
  ): Promise<CreditBalanceSummary> {
    const wallet = await this.getOrCreateWallet(userId);

    return {
      wallet_id: wallet.id,
      user_id: wallet.user_id,
      workspace_id: wallet.workspace_id,
      available_credits: wallet.available_credits,
      reserved_credits: wallet.reserved_credits,
      total_balance: wallet.available_credits + wallet.reserved_credits,
      period_granted: wallet.period_granted,
      period_consumed: wallet.period_consumed,
      billing_period: wallet.billing_period,
      reset_date: wallet.reset_date,
      status: wallet.status,
      is_unlimited: isUnlimited,
    };
  }

  /**
   * Fetches paginated ledger transaction history for auditability.
   */
  public static async getTransactionHistory(
    userId: string,
    limit = 50
  ): Promise<CreditTransactionRecord[]> {
    const db = await getMongoDb();
    const transactions = db.collection<CreditTransactionRecord>('credit_transactions');

    return transactions
      .find({ user_id: userId })
      .sort({ created_at: -1 })
      .limit(Math.min(limit, 100))
      .toArray();
  }
}
