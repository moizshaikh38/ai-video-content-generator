import { CreditRepository, getCurrentBillingPeriod } from '../db/repositories/creditRepository.js';
import { CreditPricingService } from './billing/creditPricingService.js';
import { isUserUnlimited } from './usageService.js';
import {
  CreditBalanceSummary,
  CreditEstimate,
  CreditTransactionRecord,
  CreditReservationRecord,
  CreditWalletRecord,
} from '../types/index.js';
import { logger } from '../utils/logger.js';

export class CreditWalletService {
  /**
   * Authoritatively guarantees that developer unlimited accounts have abundant credits
   * in their real wallet and ledger. If balance falls low or initial grant is missing,
   * an authoritative grant or refill is recorded with strict balance delta accounting.
   */
  public static async ensureDeveloperCredits(
    userId: string,
    minCreditsNeeded = 100_000
  ): Promise<CreditWalletRecord> {
    const period = getCurrentBillingPeriod();
    const wallet = await CreditRepository.getOrCreateWallet(userId);
    if (wallet.available_credits < minCreditsNeeded) {
      // 1. Try initial monthly grant if not already granted for this period
      const initialKey = `dev_monthly_grant_${userId}_${period}`;
      const grantRes = await CreditRepository.grantCredits({
        userId,
        amount: 999_999,
        type: 'monthly_grant',
        idempotencyKey: initialKey,
        billingPeriod: period,
        description: `Authoritative developer credit grant (${period})`,
        metadata: { is_unlimited: true, plan_tier: 'developer' },
      });

      // 2. If the monthly grant was already processed earlier and balance is still low,
      // grant an auto-refill so developer accounts can NEVER unexpectedly run out of credits
      if (grantRes.alreadyProcessed && grantRes.wallet.available_credits < minCreditsNeeded) {
        const refillKey = `dev_auto_refill_${userId}_${period}_${Date.now()}`;
        const needed = Math.max(999_999, minCreditsNeeded * 2);
        await CreditRepository.grantCredits({
          userId,
          amount: needed,
          type: 'manual_adjustment',
          idempotencyKey: refillKey,
          billingPeriod: period,
          description: `Authoritative developer unlimited auto-refill (${period})`,
          metadata: { is_unlimited: true, plan_tier: 'developer', auto_refill: true },
        });
      }
    }
    return CreditRepository.getOrCreateWallet(userId);
  }

  /**
   * Retrieves user's wallet balance summary with unlimited developer entitlement support.
   */
  public static async getWalletSummary(
    userId: string,
    userEmail?: string
  ): Promise<CreditBalanceSummary> {
    const isUnlimited = isUserUnlimited(userEmail);
    if (isUnlimited) {
      await this.ensureDeveloperCredits(userId, 100_000);
    }
    return CreditRepository.getBalanceSummary(userId, isUnlimited);
  }

  /**
   * Idempotently grants a monthly credit allowance for a billing period.
   */
  public static async grantMonthlyAllowance(
    userId: string,
    planTier: string,
    allowance: number,
    billingPeriod?: string,
    customIdempotencyKey?: string
  ): Promise<{ wallet: CreditWalletRecord; alreadyProcessed: boolean }> {
    const period = billingPeriod || getCurrentBillingPeriod();
    const idempotencyKey = customIdempotencyKey || `monthly_grant_${userId}_${period}`;

    logger.info(`Processing monthly credit grant for user ${userId}`, {
      userId,
      planTier,
      allowance,
      period,
      idempotencyKey,
    });

    return CreditRepository.grantCredits({
      userId,
      amount: allowance,
      type: 'monthly_grant',
      idempotencyKey,
      billingPeriod: period,
      description: `Monthly credit grant for ${planTier.toUpperCase()} plan (${period})`,
      metadata: { plan_tier: planTier, billing_period: period },
    });
  }

  /**
   * Calculates a server-authoritative credit estimate before starting an operation.
   */
  public static async estimateCost(
    userId: string,
    operationId: string,
    params: { durationSeconds?: number; isReusedTranscript?: boolean } = {},
    userEmail?: string
  ): Promise<CreditEstimate> {
    const summary = await this.getWalletSummary(userId, userEmail);
    return CreditPricingService.estimateOperation(operationId, params, summary.available_credits);
  }

  /**
   * Atomically reserves credits for an operation.
   */
  public static async reserveCredits(params: {
    userId: string;
    attemptId: string;
    operationId: string;
    amount: number;
    userEmail?: string;
    ttlMinutes?: number;
    metadata?: Record<string, unknown>;
  }): Promise<{
    allowed: boolean;
    idempotent?: boolean;
    reservation?: CreditReservationRecord;
    wallet: CreditWalletRecord;
    errorCode?: string;
    errorMessage?: string;
  }> {
    const { userId, attemptId, operationId, amount, userEmail, ttlMinutes = 60, metadata } = params;
    const isUnlimited = isUserUnlimited(userEmail);

    if (isUnlimited) {
      // Authoritatively ensure developer has sufficient credits (auto-refill if needed)
      await this.ensureDeveloperCredits(userId, amount);
    }

    const result = await CreditRepository.reserveCredits({
      userId,
      attemptId,
      operationId,
      amount,
      ttlMinutes,
      metadata,
    });

    if (!result.allowed) {
      return {
        allowed: false,
        wallet: result.wallet,
        errorCode: 'INSUFFICIENT_CREDITS',
        errorMessage: `Insufficient credits. You need ${amount} credits to perform this operation, but only ${result.wallet.available_credits} credits are available.`,
      };
    }

    return result;
  }

  /**
   * Atomically extends an in-flight reservation if measured duration requires more credits.
   */
  public static async extendReservation(
    attemptId: string,
    additionalAmount: number,
    userEmail?: string,
    reason?: string
  ): Promise<{
    allowed: boolean;
    reservation?: CreditReservationRecord;
    wallet?: CreditWalletRecord;
    errorCode?: string;
    errorMessage?: string;
  }> {
    if (additionalAmount <= 0) {
      return { allowed: true };
    }

    const isUnlimited = isUserUnlimited(userEmail);
    if (isUnlimited) {
      const db = await (await import('../db/mongoClient.js')).getMongoDb();
      const res = await db.collection<CreditReservationRecord>('credit_reservations').findOne({ attempt_id: attemptId });
      if (res) {
        await this.ensureDeveloperCredits(res.user_id, additionalAmount);
      }
    }

    return CreditRepository.extendReservation({ attemptId, additionalAmount, reason });
  }

  /**
   * Settles an active reservation into consumption upon successful completion.
   */
  public static async settleReservation(
    attemptId: string,
    actualCredits?: number,
    metadata?: Record<string, unknown>,
    commitCompletion?: (session:import('mongodb').ClientSession,replay?:boolean)=>Promise<void>,
    completionIdentity?:import('../db/repositories/creditRepository.js').ProcessingSettlementIdentity
  ): Promise<{
    idempotent?: boolean;
    settledAmount: number;
    reservation: CreditReservationRecord;
    wallet: CreditWalletRecord;
  }> {
    return CreditRepository.settleReservation(attemptId, actualCredits, metadata,undefined,commitCompletion,completionIdentity);
  }

  /**
   * Releases an active reservation back to available balance upon failure.
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
    return CreditRepository.releaseReservation(attemptId, reason);
  }

  /**
   * Returns audit ledger transaction history.
   */
  public static async getTransactionHistory(
    userId: string,
    limit = 50
  ): Promise<CreditTransactionRecord[]> {
    return CreditRepository.getTransactionHistory(userId, limit);
  }

  /**
   * Scans and releases expired/abandoned reservations.
   */
  public static async cleanupOrphanedReservations(): Promise<number> {
    return CreditRepository.recoverExpiredReservations();
  }
}

