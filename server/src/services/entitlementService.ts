import type { Db, ClientSession } from 'mongodb';
import { getMongoDb } from '../db/mongoClient.js';
import {
  PlanEntitlements,
  PlanFeatures,
  PlanLimits,
  PlanId,
  SubscriptionStatus,
  SubscriptionRecord,
  UserEntitlement,
} from '../types/index.js';
import { isUserUnlimited } from './usageService.js';
import { PLANS, getPlanDefinition } from './billing/planConfig.js';
import { logger } from '../utils/logger.js';

/**
 * Provisional monthly credit allowances.
 * NOTE: As per product specifications, these values (60, 500, 1500, 4000) are provisional
 * configuration defaults, not finalized commercial pricing, and are environment-configurable.
 */
export const PROVISIONAL_MONTHLY_CREDITS: Record<PlanId, number> = {
  free: Number(process.env.PROVISIONAL_MONTHLY_CREDITS_FREE || 60),
  creator: Number(process.env.PROVISIONAL_MONTHLY_CREDITS_CREATOR || 500),
  pro: Number(process.env.PROVISIONAL_MONTHLY_CREDITS_PRO || 1500),
  studio: Number(process.env.PROVISIONAL_MONTHLY_CREDITS_STUDIO || 4000),
};

/**
 * Returns dynamic, environment-configurable provisional credit allowance for a plan tier.
 */
export function getProvisionalMonthlyCredits(planId: PlanId | 'developer'): number {
  if (planId === 'developer') return 999999;
  const envKey = `PROVISIONAL_MONTHLY_CREDITS_${planId.toUpperCase()}`;
  const envVal = process.env[envKey];
  if (envVal !== undefined && envVal !== '' && !isNaN(Number(envVal))) {
    return Number(envVal);
  }
  return PROVISIONAL_MONTHLY_CREDITS[planId] || 60;
}

/**
 * Canonical Plan Entitlement definitions across all supported tiers.
 */
export const PLAN_ENTITLEMENT_DEFINITIONS: Record<PlanId | 'developer', PlanEntitlements> = {
  free: {
    planId: 'free',
    displayName: 'Free',
    monthlyCredits: PROVISIONAL_MONTHLY_CREDITS.free,
    watermarkRequired: true,
    allowedSubtitlePresets: ['vireo_comic_default', 'simple', 'clean', 'none'],
    features: {
      smartReframe: false,
      animatedCaptions: false,
      customFonts: false,
      priorityQueue: false,
      exportSrtVtt: true,
      brandTemplates: false,
      advancedEditor: false,
      multiBrandKits: false,
    },
    limits: {
      maxProjects: 5,
      maxClipRenders: 10,
      maxSocialConnections: 2,
      maxScheduledPosts: 5,
      maxUploadDurationSeconds: 15 * 60, // 15 minutes
      maxFileSizeBytes: 500 * 1024 * 1024, // 500 MB
      storageLimitBytes: 1024 * 1024 * 1024, // 1 GB
    },
    isUnlimited: false,
  },
  creator: {
    planId: 'creator',
    displayName: 'Creator',
    monthlyCredits: PROVISIONAL_MONTHLY_CREDITS.creator,
    watermarkRequired: false,
    allowedSubtitlePresets: [
      'vireo_comic_default',
      'simple',
      'clean',
      'none',
      'karaoke',
      'beasty',
      'hormozi',
      'minimal_box',
      'glow',
      'comic',
      'cinema',
    ],
    features: {
      smartReframe: false,
      animatedCaptions: false,
      customFonts: false,
      priorityQueue: false,
      exportSrtVtt: true,
      brandTemplates: true,
      advancedEditor: true,
      multiBrandKits: false,
    },
    limits: {
      maxProjects: 25,
      maxClipRenders: 50,
      maxSocialConnections: 3,
      maxScheduledPosts: 20,
      maxUploadDurationSeconds: 60 * 60, // 60 minutes
      maxFileSizeBytes: 2 * 1024 * 1024 * 1024, // 2 GB
      storageLimitBytes: 10 * 1024 * 1024 * 1024, // 10 GB
    },
    isUnlimited: false,
  },
  pro: {
    planId: 'pro',
    displayName: 'Pro',
    monthlyCredits: PROVISIONAL_MONTHLY_CREDITS.pro,
    watermarkRequired: false,
    allowedSubtitlePresets: ['*'], // Wildcard: all presets allowed
    features: {
      smartReframe: true,
      animatedCaptions: true,
      customFonts: true,
      priorityQueue: false,
      exportSrtVtt: true,
      brandTemplates: true,
      advancedEditor: true,
      multiBrandKits: false,
    },
    limits: {
      maxProjects: 100,
      maxClipRenders: 200,
      maxSocialConnections: 10,
      maxScheduledPosts: 100,
      maxUploadDurationSeconds: 120 * 60, // 120 minutes
      maxFileSizeBytes: 4 * 1024 * 1024 * 1024, // 4 GB
      storageLimitBytes: 50 * 1024 * 1024 * 1024, // 50 GB
    },
    isUnlimited: false,
  },
  studio: {
    planId: 'studio',
    displayName: 'Studio',
    monthlyCredits: PROVISIONAL_MONTHLY_CREDITS.studio,
    watermarkRequired: false,
    allowedSubtitlePresets: ['*'], // Wildcard: all presets allowed
    features: {
      smartReframe: true,
      animatedCaptions: true,
      customFonts: true,
      priorityQueue: true,
      exportSrtVtt: true,
      brandTemplates: true,
      advancedEditor: true,
      multiBrandKits: true,
    },
    limits: {
      maxProjects: 250,
      maxClipRenders: 500,
      maxSocialConnections: 25,
      maxScheduledPosts: 500,
      maxUploadDurationSeconds: 240 * 60, // 240 minutes
      maxFileSizeBytes: 10 * 1024 * 1024 * 1024, // 10 GB
      storageLimitBytes: 200 * 1024 * 1024 * 1024, // 200 GB
    },
    isUnlimited: false,
  },
  developer: {
    planId: 'developer',
    displayName: 'Developer Unlimited Entitlement',
    monthlyCredits: 999999,
    watermarkRequired: false,
    allowedSubtitlePresets: ['*'],
    features: {
      smartReframe: true,
      animatedCaptions: true,
      customFonts: true,
      priorityQueue: true,
      exportSrtVtt: true,
      brandTemplates: true,
      advancedEditor: true,
      multiBrandKits: true,
    },
    limits: {
      maxProjects: 999999,
      maxClipRenders: 999999,
      maxSocialConnections: 999999,
      maxScheduledPosts: 999999,
      maxUploadDurationSeconds: 86400,
      maxFileSizeBytes: 50 * 1024 * 1024 * 1024,
      storageLimitBytes: 1024 * 1024 * 1024 * 1024,
    },
    isUnlimited: true,
  },
};

export class EntitlementService {
  /**
   * Returns a copy of the canonical baseline PlanEntitlements for a given plan tier.
   */
  public static getPlanEntitlements(planId: PlanId | 'developer'): PlanEntitlements {
    const normalized = (planId || 'free').toLowerCase().trim() as PlanId | 'developer';
    const base = PLAN_ENTITLEMENT_DEFINITIONS[normalized] || PLAN_ENTITLEMENT_DEFINITIONS.free;
    const clone: PlanEntitlements = JSON.parse(JSON.stringify(base));
    clone.monthlyCredits = getProvisionalMonthlyCredits(normalized);
    return clone;
  }

  /**
   * Returns canonical PlanEntitlements for all commercial customer tiers.
   */
  public static getAllPlans(): PlanEntitlements[] {
    return (['free', 'creator', 'pro', 'studio'] as PlanId[]).map((id) => this.getPlanEntitlements(id));
  }

  /**
   * Resolves authoritative server-side plan entitlements for a user.
   * Priority:
   * 1. Developer Unlimited entitlement (vertexdigitals07@gmail.com) -> 'developer'
   * 2. Active or trialing paid subscription -> 'creator' | 'pro' | 'studio'
   * 3. Canceled subscription where current_period_end > now -> paid plan until period ends (isCanceledActive: true)
   * 4. Past due subscription with grace period (< 3 days) -> paid plan with grace period warning (isGracePeriod: true)
   * 5. Expired / unpaid / no subscription -> 'free' (watermark required, free limits)
   */
  public static async resolveUserEntitlements(
    userId: string,
    userEmail?: string,
    database?: Db,
    session?:ClientSession
  ): Promise<PlanEntitlements> {
    const db = database ?? (await getMongoDb());

    // 1. Resolve email if not passed directly
    let email = userEmail;
    if (!email && userId) {
      try {
        const profile = await db
          .collection('profiles')
          .findOne({ $or: [{ id: userId }, { user_id: userId }] },{session});
        if (profile && typeof profile.email === 'string') {
          email = profile.email;
        }
      } catch (err) {
        logger.warn(`[EntitlementService] Failed to lookup email for user ${userId}`, { err });
      }
    }

    // 2. Developer Unlimited Entitlement check
    if (isUserUnlimited(email)) {
      const devBase = this.getPlanEntitlements('developer');
      devBase.subscriptionStatus = 'active';
      return devBase;
    }

    // 3. Query subscriptions collection across all providers
    const subCol = db.collection<SubscriptionRecord>('subscriptions');
    const activeSub = await subCol.findOne(
      {
        user_id: userId,
        status: { $in: ['active', 'trialing', 'past_due', 'canceled'] },
      },
      { sort: { updated_at: -1 },session }
    );

    // If no subscription records match active states, return Free starter
    if (!activeSub) {
      const freeEntitlements = this.getPlanEntitlements('free');
      freeEntitlements.subscriptionStatus = null;
      freeEntitlements.subscription = null;
      return freeEntitlements;
    }

    const now = new Date();
    const periodEnd = new Date(activeSub.current_period_end);
    const planKey = (activeSub.plan_id in PLAN_ENTITLEMENT_DEFINITIONS
      ? activeSub.plan_id
      : 'free') as PlanId;
    const basePlan = this.getPlanEntitlements(planKey);

    const subscriptionPayload = {
      id: activeSub.id,
      provider: activeSub.provider,
      status: activeSub.status,
      cancel_at_period_end: activeSub.cancel_at_period_end,
      current_period_end: periodEnd.toISOString(),
      billing_interval: activeSub.billing_interval,
    };

    // Case A: Active or trialing
    if (activeSub.status === 'active' || activeSub.status === 'trialing') {
      basePlan.subscriptionStatus = activeSub.status;
      basePlan.currentPeriodEnd = periodEnd.toISOString();
      basePlan.isCanceledActive = false;
      basePlan.isGracePeriod = false;
      basePlan.subscription = subscriptionPayload;
      return basePlan;
    }

    // Case B: Canceled but current period end is still in the future
    if (activeSub.status === 'canceled' && periodEnd > now) {
      basePlan.subscriptionStatus = 'canceled';
      basePlan.currentPeriodEnd = periodEnd.toISOString();
      basePlan.isCanceledActive = true;
      basePlan.isGracePeriod = false;
      basePlan.subscription = {
        ...subscriptionPayload,
        cancel_at_period_end: true,
      };
      return basePlan;
    }

    // Case C: Past due within 3-day grace period
    const gracePeriodMs = 3 * 24 * 60 * 60 * 1000;
    if (
      activeSub.status === 'past_due' &&
      now.getTime() - periodEnd.getTime() < gracePeriodMs
    ) {
      basePlan.subscriptionStatus = 'past_due';
      basePlan.currentPeriodEnd = periodEnd.toISOString();
      basePlan.isGracePeriod = true;
      basePlan.isCanceledActive = false;
      basePlan.subscription = subscriptionPayload;
      return basePlan;
    }

    // Case D: Past due expired or canceled expired -> fallback to Free starter tier
    const freeFallback = this.getPlanEntitlements('free');
    freeFallback.subscriptionStatus = activeSub.status;
    freeFallback.currentPeriodEnd = periodEnd.toISOString();
    freeFallback.isGracePeriod = false;
    freeFallback.isCanceledActive = false;
    freeFallback.subscription = subscriptionPayload;
    return freeFallback;
  }

  /**
   * Backward-compatibility adapter: maps canonical PlanEntitlements to legacy UserEntitlement structure.
   */
  public static toLegacyUserEntitlement(entitlement: PlanEntitlements): UserEntitlement {
    const planDef = getPlanDefinition(
      entitlement.planId === 'developer' ? 'studio' : entitlement.planId
    ) || PLANS.free;

    return {
      plan_id: entitlement.planId,
      display_name: entitlement.displayName,
      is_unlimited: Boolean(entitlement.isUnlimited),
      monthly_minutes: entitlement.isUnlimited ? 999999 : planDef.monthly_minutes,
      max_projects: entitlement.limits.maxProjects,
      max_clip_renders: entitlement.limits.maxClipRenders,
      max_social_connections: entitlement.limits.maxSocialConnections,
      max_scheduled_posts: entitlement.limits.maxScheduledPosts,
      subscription: entitlement.subscription as any || null,
    };
  }

  /**
   * Resolves legacy UserEntitlement for existing SubscriptionService consumers.
   */
  public static async resolveLegacyUserEntitlement(
    userId: string,
    userEmail?: string,
    database?: Db,
    session?:ClientSession
  ): Promise<UserEntitlement> {
    const entitlements = await this.resolveUserEntitlements(userId, userEmail, database,session);
    return this.toLegacyUserEntitlement(entitlements);
  }

  /**
   * Checks whether a subtitle preset is permitted under the given entitlements.
   */
  public static isPresetAllowed(entitlements: PlanEntitlements, presetId: string): boolean {
    if (!presetId) return true;
    if (entitlements.allowedSubtitlePresets.includes('*')) {
      return true;
    }
    const normalized = presetId.toLowerCase().trim();
    return entitlements.allowedSubtitlePresets.some((p) => p.toLowerCase() === normalized);
  }

  /**
   * Resolves user entitlements and validates whether a subtitle preset is permitted.
   */
  public static async checkUserPresetAccess(
    userId: string,
    presetId: string,
    userEmail?: string,
    database?: Db
  ): Promise<boolean> {
    const entitlements = await this.resolveUserEntitlements(userId, userEmail, database);
    return this.isPresetAllowed(entitlements, presetId);
  }

  /**
   * Checks whether a boolean feature flag is enabled for the given entitlements.
   */
  public static isFeatureAllowed(
    entitlements: PlanEntitlements,
    featureKey: keyof PlanFeatures
  ): boolean {
    return Boolean(entitlements.features[featureKey]);
  }

  /**
   * Resolves user entitlements and checks if a specific feature is enabled.
   */
  public static async checkUserFeatureAccess(
    userId: string,
    featureKey: keyof PlanFeatures,
    userEmail?: string,
    database?: Db
  ): Promise<boolean> {
    const entitlements = await this.resolveUserEntitlements(userId, userEmail, database);
    return this.isFeatureAllowed(entitlements, featureKey);
  }

  /**
   * Resolves whether a watermark is strictly required for this user's plan.
   */
  public static async checkUserWatermarkRequired(
    userId: string,
    userEmail?: string,
    database?: Db
  ): Promise<boolean> {
    const entitlements = await this.resolveUserEntitlements(userId, userEmail, database);
    return Boolean(entitlements.watermarkRequired);
  }
}

