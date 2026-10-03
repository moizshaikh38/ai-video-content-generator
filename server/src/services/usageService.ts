import { supabaseAuthClient, isServerSupabaseConfigured } from '../utils/supabase.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

export interface UsageQuotaReservationResult {
  allowed: boolean;
  idempotent?: boolean;
  usageEventId?: string;
  processingAttemptId: string;
  billingPeriod: string;
  limitMinutes: number;
  allocatedMinutes: number;
  remainingMinutes: number;
  requestedMinutes?: number;
  errorCode?: string;
  errorMessage?: string;
  resetDate: string;
}

export interface UsageBalanceSummary {
  billing_period: string;
  reset_date: string;
  plan_tier: string;
  limit_minutes: number;
  settled_minutes: number;
  reserved_minutes: number;
  total_used_minutes: number;
  remaining_minutes: number;
  is_quota_exceeded: boolean;
}

/**
 * Calculates current UTC billing period ('YYYY-MM')
 */
export function getCurrentUtcBillingPeriod(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Computes exact ISO UTC string for the next billing cycle reset (1st of next month at 00:00:00.000Z)
 */
export function getUtcBillingResetDate(): string {
  const now = new Date();
  const nextMonthYear = now.getUTCMonth() === 11 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  const nextMonth = (now.getUTCMonth() + 1) % 12;
  const resetDate = new Date(Date.UTC(nextMonthYear, nextMonth, 1, 0, 0, 0, 0));
  return resetDate.toISOString();
}

export class UsageService {
  /**
   * Concurrency-safe atomic quota reservation via PostgreSQL RPC reserve_usage_quota().
   * Handles idempotency if duplicate processing_attempt_id is passed.
   */
  static async reserveQuota(
    userId: string,
    projectId: string,
    attemptId: string,
    estimatedMinutes: number = 3.0
  ): Promise<UsageQuotaReservationResult> {
    const defaultQuota = config.defaultMonthlyQuotaMinutes || 15;
    const billingPeriod = getCurrentUtcBillingPeriod();
    const resetDate = getUtcBillingResetDate();

    if (!isServerSupabaseConfigured) {
      // Local development fallback when Supabase is not connected
      return {
        allowed: true,
        processingAttemptId: attemptId,
        billingPeriod,
        limitMinutes: defaultQuota,
        allocatedMinutes: estimatedMinutes,
        remainingMinutes: Math.max(0, defaultQuota - estimatedMinutes),
        resetDate,
      };
    }

    try {
      const { data, error } = await supabaseAuthClient.rpc('reserve_usage_quota', {
        p_user_id: userId,
        p_project_id: projectId,
        p_attempt_id: attemptId,
        p_estimated_minutes: estimatedMinutes,
        p_default_monthly_quota: defaultQuota,
      });

      if (error) {
        logger.error(`[UsageService] Error calling reserve_usage_quota RPC: ${error.message}`);
        throw new Error(`Failed to verify usage quota: ${error.message}`);
      }

      if (!data) {
        throw new Error('No response received from quota reservation engine.');
      }

      const isAllowed = Boolean(data.allowed);
      const remainingMinutes = Number(data.remaining_minutes ?? 0);
      const limitMinutes = Number(data.limit_minutes ?? defaultQuota);
      const allocatedMinutes = Number(data.allocated_minutes ?? 0);

      return {
        allowed: isAllowed,
        idempotent: Boolean(data.idempotent),
        usageEventId: data.usage_event_id,
        processingAttemptId: attemptId,
        billingPeriod: data.billing_period || billingPeriod,
        limitMinutes,
        allocatedMinutes,
        remainingMinutes,
        requestedMinutes: Number(data.requested_minutes ?? estimatedMinutes),
        errorCode: data.error_code,
        errorMessage: !isAllowed
          ? `Monthly video processing quota exceeded. You have ${remainingMinutes.toFixed(
              1
            )} minutes remaining, but this video requires an estimated ${estimatedMinutes.toFixed(1)} minutes.`
          : undefined,
        resetDate,
      };
    } catch (err: any) {
      logger.error('[UsageService] Unexpected error during reserveQuota:', err);
      throw err;
    }
  }

  /**
   * Settles a reserved usage record upon successful transcription pipeline completion.
   * Updates status to 'settled' and records actual audio duration.
   */
  static async settleReservation(
    attemptId: string,
    durationSeconds: number,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    if (!isServerSupabaseConfigured) {
      return;
    }

    const actualMinutes = Math.max(0.1, Number((durationSeconds / 60).toFixed(2)));

    try {
      const { error } = await supabaseAuthClient.rpc('settle_usage_reservation', {
        p_attempt_id: attemptId,
        p_actual_minutes: actualMinutes,
        p_duration_seconds: durationSeconds,
        p_metadata: metadata,
      });

      if (error) {
        logger.error(`[UsageService] Failed to settle reservation for attempt ${attemptId}: ${error.message}`);
      } else {
        logger.info(
          `[UsageService] Successfully settled ${actualMinutes}m (${durationSeconds}s) for attempt ${attemptId}`
        );
      }
    } catch (err: any) {
      logger.error(`[UsageService] Unexpected error settling reservation for attempt ${attemptId}:`, err);
    }
  }

  /**
   * Releases a reserved usage hold when a pipeline run fails or is cancelled.
   * Guarantees that failed jobs do not consume creator monthly quota.
   */
  static async releaseReservation(attemptId: string, reason: string): Promise<void> {
    if (!isServerSupabaseConfigured) {
      return;
    }

    try {
      const { error } = await supabaseAuthClient.rpc('release_usage_reservation', {
        p_attempt_id: attemptId,
        p_failure_reason: reason.substring(0, 500),
      });

      if (error) {
        logger.error(`[UsageService] Failed to release reservation for attempt ${attemptId}: ${error.message}`);
      } else {
        logger.info(`[UsageService] Released reservation for attempt ${attemptId}. Reason: ${reason}`);
      }
    } catch (err: any) {
      logger.error(`[UsageService] Unexpected error releasing reservation for attempt ${attemptId}:`, err);
    }
  }

  /**
   * Runs the cleanup function to release any orphaned reservations older than 30 minutes.
   */
  static async cleanupOrphanedReservations(olderThanMinutes: number = 30): Promise<number> {
    if (!isServerSupabaseConfigured) return 0;
    try {
      const { data, error } = await supabaseAuthClient.rpc('cleanup_orphaned_reservations', {
        p_older_than_minutes: olderThanMinutes,
      });
      if (error) {
        logger.warn(`[UsageService] Orphan reservation cleanup warning: ${error.message}`);
        return 0;
      }
      return typeof data === 'number' ? data : 0;
    } catch (err: any) {
      logger.warn('[UsageService] Cleanup call failed:', err.message);
      return 0;
    }
  }

  /**
   * Queries the current billing period breakdown for an authenticated user.
   */
  static async getCurrentUsage(userId: string): Promise<UsageBalanceSummary> {
    const billingPeriod = getCurrentUtcBillingPeriod();
    const resetDate = getUtcBillingResetDate();
    const defaultQuota = config.defaultMonthlyQuotaMinutes || 15;

    if (!isServerSupabaseConfigured) {
      return {
        billing_period: billingPeriod,
        reset_date: resetDate,
        plan_tier: 'free',
        limit_minutes: defaultQuota,
        settled_minutes: 0,
        reserved_minutes: 0,
        total_used_minutes: 0,
        remaining_minutes: defaultQuota,
        is_quota_exceeded: false,
      };
    }

    try {
      // 1. Fetch user limit or override
      const { data: limitData } = await supabaseAuthClient
        .from('user_subscription_limits')
        .select('plan_tier, monthly_minutes_limit')
        .eq('user_id', userId)
        .maybeSingle();

      const planTier = limitData?.plan_tier || 'free';
      const limitMinutes = limitData?.monthly_minutes_limit
        ? Number(limitData.monthly_minutes_limit)
        : defaultQuota;

      // 2. Fetch usage events for current billing period
      const { data: events, error } = await supabaseAuthClient
        .from('usage_events')
        .select('status, reserved_minutes, actual_minutes')
        .eq('user_id', userId)
        .eq('billing_period', billingPeriod)
        .in('status', ['settled', 'reserved']);

      if (error) {
        logger.error(`[UsageService] Error fetching usage events for user ${userId}: ${error.message}`);
      }

      let settledMinutes = 0;
      let reservedMinutes = 0;

      if (events) {
        for (const ev of events) {
          if (ev.status === 'settled') {
            settledMinutes += Number(ev.actual_minutes || 0);
          } else if (ev.status === 'reserved') {
            reservedMinutes += Number(ev.reserved_minutes || 0);
          }
        }
      }

      settledMinutes = Number(settledMinutes.toFixed(2));
      reservedMinutes = Number(reservedMinutes.toFixed(2));
      const totalUsedMinutes = Number((settledMinutes + reservedMinutes).toFixed(2));
      const remainingMinutes = Math.max(0, Number((limitMinutes - totalUsedMinutes).toFixed(2)));

      return {
        billing_period: billingPeriod,
        reset_date: resetDate,
        plan_tier: planTier,
        limit_minutes: limitMinutes,
        settled_minutes: settledMinutes,
        reserved_minutes: reservedMinutes,
        total_used_minutes: totalUsedMinutes,
        remaining_minutes: remainingMinutes,
        is_quota_exceeded: totalUsedMinutes >= limitMinutes,
      };
    } catch (err) {
      logger.error(`[UsageService] Unexpected error getting usage for user ${userId}:`, err);
      return {
        billing_period: billingPeriod,
        reset_date: resetDate,
        plan_tier: 'free',
        limit_minutes: defaultQuota,
        settled_minutes: 0,
        reserved_minutes: 0,
        total_used_minutes: 0,
        remaining_minutes: defaultQuota,
        is_quota_exceeded: false,
      };
    }
  }
}
