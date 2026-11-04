import { config } from '../config/index.js';
import { cleanupUsage, releaseUsage, reserveUsage, settleUsage, usageBalance, extendUsageReservation } from '../db/repositories/usageRepository.js';

/**
 * Server-authoritative processing estimate (billing hardening).
 * Derived ONLY from the project's server-measured duration_seconds — the
 * client's `estimated_minutes` is never trusted for quota. A 1-minute safety
 * margin covers transcription drift; unknown durations get a provisional
 * estimate that mid-processing extendReservation() trues up once ffprobe
 * measures the real length.
 */
export function computeProcessingEstimateMinutes(durationSeconds: unknown): number {
  const n = Number(durationSeconds);
  if (!Number.isFinite(n) || n <= 0) return 12; // provisional; extended after measurement
  const minutes = Math.ceil(n / 60) + 1;
  return Math.min(125, Math.max(0.5, Math.round(minutes * 100) / 100)); // 2h source cap + margin
}

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

export function getCurrentUtcBillingPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function getUtcBillingResetDate(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

const DEFAULT_UNLIMITED_EMAILS = ['vertexdigitals07@gmail.com', 'moizsh786786@gmail.com'];

export function isUserUnlimited(email?: string): boolean {
  if (!email) return false;
  const cleanEmail = email.trim().toLowerCase();
  if (DEFAULT_UNLIMITED_EMAILS.includes(cleanEmail)) return true;
  if (!config.devUnlimitedUserEmail) return false;
  const configuredEmails = config.devUnlimitedUserEmail
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return configuredEmails.includes(cleanEmail);
}

let lastOrphanCleanupAt = 0;
const ORPHAN_CLEANUP_INTERVAL_MS = 60 * 1000;

export class UsageService {
  /**
   * Resets the orphan cleanup throttle timestamp (for deterministic unit testing).
   */
  static resetOrphanCleanupThrottle(): void {
    lastOrphanCleanupAt = 0;
  }

  static async reserveQuota(
    userId: string,
    projectId: string,
    attemptId: string,
    estimatedMinutes = 3,
    userEmail?: string
  ): Promise<UsageQuotaReservationResult> {
    // Throttled self-healing check: clean up reservations orphaned >30m before evaluating quota
    const now = Date.now();
    if (now - lastOrphanCleanupAt > ORPHAN_CLEANUP_INTERVAL_MS) {
      lastOrphanCleanupAt = now;
      await cleanupUsage(30).catch(() => 0);
    }

    const isUnlimited = isUserUnlimited(userEmail);
    // Dynamically resolve entitlement if not unlimited developer
    let entitlementLimit: number | undefined;
    let entitlementTier: string | undefined;

    if (!isUnlimited) {
      try {
        const { SubscriptionService } = await import('./subscriptionService.js');
        const entitlement = await SubscriptionService.resolveUserEntitlement(userId, userEmail);
        entitlementLimit = entitlement.monthly_minutes;
        entitlementTier = entitlement.plan_id;
      } catch (err) {
        // Fall back to default
      }
    }

    const result = await reserveUsage(
      userId,
      projectId,
      attemptId,
      getCurrentUtcBillingPeriod(),
      estimatedMinutes,
      isUnlimited,
      entitlementLimit,
      entitlementTier
    );
    const remaining = result.remaining_minutes;
    return {
      allowed: result.allowed,
      idempotent: result.idempotent,
      usageEventId: result.usage_event_id,
      processingAttemptId: attemptId,
      billingPeriod: result.billing_period,
      limitMinutes: result.limit_minutes,
      allocatedMinutes: result.allocated_minutes,
      remainingMinutes: remaining,
      requestedMinutes: estimatedMinutes,
      errorCode: result.allowed ? undefined : 'QUOTA_EXCEEDED',
      errorMessage: result.allowed ? undefined :
        `Monthly video processing quota exceeded. You have ${remaining.toFixed(1)} minutes remaining, but this video requires an estimated ${estimatedMinutes.toFixed(1)} minutes.`,
      resetDate: getUtcBillingResetDate(),
    };
  }

  static async settleReservation(attemptId: string, durationSeconds: number,
    metadata: Record<string, unknown> = {}): Promise<void> {
    const actual = Math.max(0.1, Math.round(durationSeconds / 60 * 100) / 100);
    await settleUsage(attemptId, actual, durationSeconds, metadata);
  }

  /**
   * Extends a live reservation to the server-measured duration before settle,
   * re-checking the plan ceiling atomically. Callers MUST fail the job when
   * this returns ok:false — settling after a refused extension would consume
   * beyond the quota the reservation approved.
   */
  static async extendReservationToMeasuredDuration(
    attemptId: string,
    durationSeconds: number
  ): Promise<{ ok: true; reservedMinutes: number } | { ok: false; code: string; remainingMinutes: number }> {
    if (!attemptId) return { ok: true, reservedMinutes: 0 };
    const target = computeProcessingEstimateMinutes(durationSeconds);
    return extendUsageReservation(attemptId, target);
  }

  static async releaseReservation(attemptId: string, reason: string): Promise<void> {
    await releaseUsage(attemptId, reason);
  }

  static async cleanupOrphanedReservations(olderThanMinutes = 30): Promise<number> {
    return cleanupUsage(olderThanMinutes);
  }

  static async getCurrentUsage(userId: string, userEmail?: string): Promise<UsageBalanceSummary & { is_unlimited?: boolean }> {
    const period = getCurrentUtcBillingPeriod();
    const balance = await usageBalance(userId, period);
    const isUnlimited = isUserUnlimited(userEmail);

    let effectiveLimit = config.defaultMonthlyQuotaMinutes;
    let effectivePlanTier = 'free';
    let resolvedFromSubscription = false;

    if (isUnlimited) {
      effectiveLimit = 999999;
      effectivePlanTier = 'developer';
      resolvedFromSubscription = true;
    } else {
      try {
        const { SubscriptionService } = await import('./subscriptionService.js');
        const entitlement = await SubscriptionService.resolveUserEntitlement(userId, userEmail);
        effectiveLimit = entitlement.monthly_minutes;
        effectivePlanTier = entitlement.plan_id;
        resolvedFromSubscription = true;
      } catch {
        effectiveLimit = balance?.monthly_minutes_limit ?? config.defaultMonthlyQuotaMinutes;
        effectivePlanTier = balance?.plan_tier ?? 'free';
      }
    }

    const limit = isUnlimited
      ? 999999
      : resolvedFromSubscription
      ? Math.max(effectiveLimit, balance?.monthly_minutes_limit ?? 0)
      : (balance?.monthly_minutes_limit ?? effectiveLimit);

    const settled = balance?.settled_minutes ?? 0;
    const reserved = balance?.reserved_minutes ?? 0;
    const total = Math.round((settled + reserved) * 100) / 100;
    return {
      billing_period: period,
      reset_date: getUtcBillingResetDate(),
      plan_tier: effectivePlanTier,
      limit_minutes: limit,
      settled_minutes: settled,
      reserved_minutes: reserved,
      total_used_minutes: total,
      remaining_minutes: isUnlimited ? 999999 : Math.max(0, Math.round((limit - total) * 100) / 100),
      is_quota_exceeded: isUnlimited ? false : total >= limit,
      is_unlimited: isUnlimited,
    };
  }
}
