import { getMongoDb } from '../../db/mongoClient.js';
import { logger } from '../../utils/logger.js';
import {
  BillingContext,
  CountryResolution,
  GatewayConflict,
  buildBillingContext,
  detectGatewayConflict,
  gatewayForCountry,
  normalizeCountryCode,
  resolveCountry,
} from './billingCountryService.js';
import { lookupCountryForIp } from './ipGeoService.js';

/**
 * End-to-end billing-country resolution + persistence (billing spec §3).
 *
 * Precedence (never overridden by locale/currency/client params):
 *   1. Confirmed billing country (customer-selected, stored server-side)
 *   2. Existing paid subscription (provider + stored country pin the gateway)
 *   3. Advisory server-side IP geolocation (req.ip via TRUST_PROXY-aware Express)
 *   4. Trusted edge header, only when BILLING_TRUSTED_COUNTRY_HEADER is set
 *   5. Unknown → the customer must select a country before checkout
 *
 * IP is NEVER allowed to change an existing subscriber's provider, and a
 * confirmed-vs-IP gateway mismatch requires explicit confirmation.
 */

interface BillingCountryRecord {
  user_id: string;
  billing_country: string;
  confirmed_at: Date;
  /** How the country was first established ('selected' | 'checkout'). */
  source: string;
  updated_at: Date;
}

async function getConfirmedCountry(userId: string): Promise<string | null> {
  const db = await getMongoDb();
  const record = await db.collection<BillingCountryRecord>('billing_countries').findOne({ user_id: userId });
  return record ? normalizeCountryCode(record.billing_country) : null;
}

async function upsertConfirmedCountry(userId: string, country: string, source: 'selected' | 'checkout'): Promise<void> {
  const db = await getMongoDb();
  const now = new Date();
  await db.collection<BillingCountryRecord>('billing_countries').updateOne(
    { user_id: userId },
    { $set: { billing_country: country, confirmed_at: now, source, updated_at: now } },
    { upsert: true }
  );
  logger.info(`[BillingCountry] Stored confirmed billing country ${country} for user ${userId} (${source})`);
}

async function getActiveSubscription(userId: string): Promise<{ provider?: string | null; billing_country?: string | null } | null> {
  const db = await getMongoDb();
  const sub = (await db.collection('subscriptions').findOne({
    user_id: userId,
    status: { $in: ['active', 'trialing', 'past_due'] },
  })) as { provider?: string | null; billing_country?: string | null } | null;
  return sub ?? null;
}

export interface ResolvedBilling {
  context: BillingContext;
  /** Raw resolution pieces for checkout-time revalidation. */
  confirmedCountry: string | null;
  subscriptionCountry: string | null;
  ipCountry: string | null;
}

export async function resolveBillingContext(
  userId: string,
  clientIp: string | null | undefined,
  options: { skipIpLookup?: boolean } = {}
): Promise<ResolvedBilling> {
  const [confirmedCountry, subscription] = await Promise.all([
    getConfirmedCountry(userId).catch(() => null),
    getActiveSubscription(userId).catch(() => null),
  ]);

  // Advisory only; failures resolve to null and never block anything.
  const ipCountry = options.skipIpLookup
    ? null
    : await lookupCountryForIp(clientIp).catch(() => null);

  const resolution: CountryResolution = resolveCountry({
    confirmedCountry,
    subscription,
    ipCountry,
  });

  const countryLocked = resolution.source === 'subscription';
  return {
    context: buildBillingContext(resolution, countryLocked, { ipCountry }),
    confirmedCountry,
    subscriptionCountry: subscription
      ? normalizeCountryCode(subscription.billing_country) ?? (subscription.provider === 'razorpay' ? 'IN' : null)
      : null,
    ipCountry,
  };
}

export interface ConfirmCountryResult {
  ok: true;
  country: string;
  context: BillingContext;
}

export interface ConfirmCountryConflict {
  ok: false;
  code: 'COUNTRY_CONFLICT';
  conflict: GatewayConflict;
  message: string;
}

/**
 * Stores the customer's billing-country selection. When the selection would
 * change the gateway an existing CONFIRMED country or the observed IP already
 * implies, `confirmConflict: true` is required — otherwise the conflict is
 * returned for the customer to resolve explicitly. An active subscription can
 * never be re-routed this way (provider lock).
 */
export async function confirmBillingCountry(
  userId: string,
  rawCountry: unknown,
  confirmConflict: boolean,
  clientIp?: string | null
): Promise<ConfirmCountryResult | ConfirmCountryConflict> {
  const country = normalizeCountryCode(rawCountry);
  if (!country) {
    throw Object.assign(new Error('A valid ISO 3166-1 alpha-2 billing country is required.'), {
      statusCode: 400,
      code: 'INVALID_COUNTRY',
    });
  }

  const decision = gatewayForCountry(country);
  if (!decision.ok) {
    throw Object.assign(new Error(decision.message), { statusCode: 403, code: 'COUNTRY_NOT_SUPPORTED' });
  }

  // Provider lock: an active subscription pins the gateway regardless of IP or
  // new selections.
  const subscription = await getActiveSubscription(userId).catch(() => null);
  if (subscription?.provider && subscription.provider !== decision.provider) {
    throw Object.assign(
      new Error(
        `Your active subscription is billed through ${subscription.provider}; your billing country cannot be changed while it is active.`
      ),
      { statusCode: 409, code: 'PROVIDER_LOCKED' }
    );
  }

  // Conflict gate: switching the gateway implied by an existing confirmed
  // country or by the observed IP requires explicit confirmation.
  const existingConfirmed = await getConfirmedCountry(userId).catch(() => null);
  const ipCountry = clientIp ? await lookupCountryForIp(clientIp).catch(() => null) : null;

  const vsConfirmed = detectGatewayConflict(existingConfirmed, country);
  const vsIp = detectGatewayConflict(country, ipCountry);
  const conflict = vsConfirmed ?? vsIp;
  if (conflict && !confirmConflict) {
    const counterCountry = vsConfirmed ? vsConfirmed.confirmedCountry : vsIp?.ipCountry;
    return {
      ok: false,
      code: 'COUNTRY_CONFLICT',
      conflict,
      message: `Your billing country (${country}) would use ${conflict.confirmedProvider === decision.provider ? decision.provider : conflict.confirmedProvider}, but ${counterCountry} observed earlier implies ${conflict.ipProvider === decision.provider ? conflict.ipProvider : conflict.ipProvider}. Please confirm the switch.`,
    };
  }

  await upsertConfirmedCountry(userId, country, 'selected');
  const resolved = await resolveBillingContext(userId, clientIp, { skipIpLookup: true });
  return { ok: true, country, context: resolved.context };
}
