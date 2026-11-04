import { config, isBillingProviderEnabled } from '../../config/index.js';
import { BillingInterval, BillingProviderName, PlanDefinition, PlanId } from '../../types/index.js';
import { getAllPlans } from './planConfig.js';
import { BillingRegistry } from './billingRegistry.js';

/**
 * Single source of truth for "which gateway may bill this customer".
 *
 *   billing country IN            → Razorpay (INR)
 *   any other supported country   → Paddle (USD list price; Paddle localises tax at checkout)
 *   Paddle-blocked country        → no gateway (clear error, never a silent fallback)
 *
 * The client never chooses the gateway. Country comes from, in order:
 *   1. the customer's confirmed billing country (stored server-side),
 *   2. an existing paid subscription (its gateway pins the country),
 *   3. a trusted edge header, only when BILLING_TRUSTED_COUNTRY_HEADER is configured.
 * Browser locale, language, IP lookups in the client and currency preference are never used.
 */

export type CountrySource = 'confirmed' | 'subscription' | 'ip' | 'edge_header';

export type GatewayDecision =
  | { ok: true; provider: BillingProviderName; currency: 'INR' | 'USD' }
  | { ok: false; code: 'COUNTRY_NOT_SUPPORTED'; message: string };

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    return null;
  }
})();

/** Codes Intl knows that are not countries a customer can be billed in. */
const NON_BILLING_CODES = new Set(['EU', 'UN', 'EZ', 'QO', 'ZZ', 'XA', 'XB', 'AQ']);

/** ISO 3166-1 alpha-2, upper-cased; null for anything that is not a real country code. */
export function normalizeCountryCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const code = input.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || NON_BILLING_CODES.has(code)) return null;
  if (regionNames) {
    const name = regionNames.of(code);
    if (!name || name === code) return null;
  }
  return code;
}

export function countryDisplayName(code: string): string {
  return regionNames?.of(code) || code;
}

export function gatewayForCountry(country: string, blocked: string[] = config.paddleBlockedCountries): GatewayDecision {
  if (country === 'IN') return { ok: true, provider: 'razorpay', currency: 'INR' };
  if (blocked.includes(country)) {
    return {
      ok: false,
      code: 'COUNTRY_NOT_SUPPORTED',
      message: `Paid plans are not available for billing addresses in ${countryDisplayName(country)}.`,
    };
  }
  return { ok: true, provider: 'paddle', currency: 'USD' };
}

/** The country a gateway proves: Razorpay subscriptions are India-only by policy. */
export function countryImpliedByProvider(provider: string | null | undefined, storedCountry?: string | null): string | null {
  const stored = normalizeCountryCode(storedCountry);
  if (stored) return stored;
  if (provider === 'razorpay') return 'IN';
  return null;
}

export interface CountryResolution {
  country: string | null;
  source: CountrySource | null;
}

/**
 * Pure resolution step (unit-tested): confirmed profile → paid subscription → trusted header.
 */
export function resolveCountry(input: {
  confirmedCountry?: string | null;
  subscription?: { provider?: string | null; billing_country?: string | null } | null;
  /** Advisory only: server-derived client IP country (ipGeoService). Never client-supplied. */
  ipCountry?: string | null;
  headers?: Record<string, string | string[] | undefined>;
  trustedHeader?: string;
}): CountryResolution {
  const confirmed = normalizeCountryCode(input.confirmedCountry);
  if (confirmed) return { country: confirmed, source: 'confirmed' };

  const fromSub = input.subscription
    ? countryImpliedByProvider(input.subscription.provider, input.subscription.billing_country)
    : null;
  if (fromSub) return { country: fromSub, source: 'subscription' };

  // Advisory server-side IP geolocation (billing spec §3): used only when no
  // confirmed country and no subscription exist. A conflict between the IP
  // country and a later-confirmed country requires explicit confirmation —
  // detected separately by detectGatewayConflict, never silently switched.
  const ipCountry = normalizeCountryCode(input.ipCountry);
  if (ipCountry) return { country: ipCountry, source: 'ip' };

  const header = (input.trustedHeader || '').toLowerCase();
  if (header && input.headers) {
    const raw = input.headers[header];
    const fromEdge = normalizeCountryCode(Array.isArray(raw) ? raw[0] : raw);
    if (fromEdge) return { country: fromEdge, source: 'edge_header' };
  }
  return { country: null, source: null };
}

/**
 * A gateway conflict exists ONLY when the confirmed billing country and the
 * server-observed IP country would route to DIFFERENT providers (e.g. IN vs US).
 * Two countries on the same provider (US vs GB, both Paddle) are not a conflict.
 * Conflicts require explicit customer confirmation — never a silent switch.
 */
export interface GatewayConflict {
  confirmedCountry: string;
  ipCountry: string;
  confirmedProvider: BillingProviderName;
  ipProvider: BillingProviderName;
}

export function detectGatewayConflict(
  confirmedCountry: string | null | undefined,
  ipCountry: string | null | undefined
): GatewayConflict | null {
  const confirmed = normalizeCountryCode(confirmedCountry);
  const observed = normalizeCountryCode(ipCountry);
  if (!confirmed || !observed || confirmed === observed) return null;
  const a = gatewayForCountry(confirmed);
  const b = gatewayForCountry(observed);
  if (!a.ok || !b.ok || a.provider === b.provider) return null;
  return {
    confirmedCountry: confirmed,
    ipCountry: observed,
    confirmedProvider: a.provider,
    ipProvider: b.provider,
  };
}

export interface PlanPrice {
  amount: number;
  currency: 'INR' | 'USD';
  available: boolean;
}

export interface PlanOffer {
  id: PlanId;
  display_name: string;
  monthly_minutes: number;
  max_projects: number;
  max_clip_renders: number;
  max_social_connections: number;
  max_scheduled_posts: number;
  features: string[];
  is_recommended: boolean;
  prices: Record<BillingInterval, PlanPrice>;
}

const RAZORPAY_YEARLY_INR: Partial<Record<PlanId, number>> = {
  creator: config.razorpayYearlyInrCreator,
  pro: config.razorpayYearlyInrPro,
  studio: config.razorpayYearlyInrStudio,
};

/** Prices the customer can actually be charged through their gateway (no invented price points). */
export function planOffersFor(provider: BillingProviderName, plans: PlanDefinition[] = getAllPlans()): PlanOffer[] {
  return plans.map((plan) => {
    const base = {
      id: plan.id,
      display_name: plan.display_name,
      monthly_minutes: plan.monthly_minutes,
      max_projects: plan.max_projects,
      max_clip_renders: plan.max_clip_renders,
      max_social_connections: plan.max_social_connections,
      max_scheduled_posts: plan.max_scheduled_posts,
      features: plan.features,
      is_recommended: Boolean(plan.is_recommended),
    };
    if (plan.id === 'free') {
      const currency = provider === 'razorpay' ? 'INR' : 'USD';
      return { ...base, prices: { month: { amount: 0, currency, available: true }, year: { amount: 0, currency, available: true } } };
    }
    if (provider === 'razorpay') {
      const yearly = RAZORPAY_YEARLY_INR[plan.id] || 0;
      return {
        ...base,
        prices: {
          month: { amount: plan.inr_monthly_price || 0, currency: 'INR', available: Boolean(plan.razorpay_plan_id_monthly && plan.inr_monthly_price) },
          year: { amount: yearly, currency: 'INR', available: Boolean(plan.razorpay_plan_id_yearly && yearly) },
        },
      };
    }
    return {
      ...base,
      prices: {
        month: { amount: plan.monthly_price, currency: 'USD', available: Boolean(plan.paddle_price_id_monthly) },
        year: { amount: plan.yearly_price, currency: 'USD', available: Boolean(plan.paddle_price_id_yearly) },
      },
    };
  });
}

export interface BillingContext {
  country: string | null;
  countryName: string | null;
  countrySource: CountrySource | null;
  /** Advisory IP-observed country (never overrides the resolved country). */
  ipCountry: string | null;
  ipCountryName: string | null;
  /** Confirmed-vs-IP provider mismatch: customer must confirm before checkout. */
  conflict: GatewayConflict | null;
  /** True when the customer must pick their billing country before checkout. */
  requiresCountry: boolean;
  /** True when an active/past-due subscription pins the country (and gateway). */
  countryLocked: boolean;
  provider: BillingProviderName | null;
  providerReady: boolean;
  currency: 'INR' | 'USD' | null;
  unsupportedReason: string | null;
  plans: PlanOffer[];
}

export function buildBillingContext(
  resolution: CountryResolution,
  countryLocked: boolean,
  extras: { ipCountry?: string | null } = {}
): BillingContext {
  const ipCountry = normalizeCountryCode(extras.ipCountry) ?? null;
  // A conflict is only surfaced when a CONFIRMED country (or a subscription that
  // pins one) disagrees with the IP-observed gateway. IP-only resolutions have
  // nothing to conflict with.
  const conflict =
    (resolution.source === 'confirmed' || resolution.source === 'subscription') && ipCountry
      ? detectGatewayConflict(resolution.country, ipCountry)
      : null;

  if (!resolution.country) {
    return {
      country: null,
      countryName: null,
      countrySource: null,
      ipCountry,
      ipCountryName: ipCountry ? countryDisplayName(ipCountry) : null,
      conflict: null,
      requiresCountry: true,
      countryLocked: false,
      provider: null,
      providerReady: false,
      currency: null,
      unsupportedReason: null,
      plans: [],
    };
  }
  const decision = gatewayForCountry(resolution.country);
  if (!decision.ok) {
    return {
      country: resolution.country,
      countryName: countryDisplayName(resolution.country),
      countrySource: resolution.source,
      ipCountry,
      ipCountryName: ipCountry ? countryDisplayName(ipCountry) : null,
      conflict,
      requiresCountry: false,
      countryLocked,
      provider: null,
      providerReady: false,
      currency: null,
      unsupportedReason: decision.message,
      plans: [],
    };
  }
  const providerReady =
    isBillingProviderEnabled(decision.provider) && BillingRegistry.getProvider(decision.provider).isConfigured();
  return {
    country: resolution.country,
    countryName: countryDisplayName(resolution.country),
    countrySource: resolution.source,
    ipCountry,
    ipCountryName: ipCountry ? countryDisplayName(ipCountry) : null,
    conflict,
    requiresCountry: false,
    countryLocked,
    provider: decision.provider,
    providerReady,
    currency: decision.currency,
    unsupportedReason: null,
    plans: planOffersFor(decision.provider),
  };
}
