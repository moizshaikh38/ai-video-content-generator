import crypto from 'node:crypto';
import type { Db } from 'mongodb';
import { getMongoDb } from '../db/mongoClient.js';
import {
  BillingCustomerRecord,
  SubscriptionRecord,
  BillingEventRecord,
  BillingInvoiceRecord,
  BillingCheckoutRecord,
  UserEntitlement,
  PlanId,
  BillingProviderName,
  SubscriptionStatus,
} from '../types/index.js';
import { isUserUnlimited } from './usageService.js';
import { PLANS, getPlanDefinition } from './billing/planConfig.js';
import { NormalizedBillingEvent } from './billing/types.js';
import { logger } from '../utils/logger.js';

/** A verified webhook tried to touch a subscription owned by someone else. Never retried. */
export class BillingOwnershipError extends Error {
  readonly code = 'OWNERSHIP_MISMATCH';
  constructor(event: NormalizedBillingEvent, owners: string[]) {
    super(
      `Event ${event.eventId} (${event.provider} ${event.eventType}) names user ${event.userId || 'unknown'} but the subscription/customer/checkout belongs to ${owners.join(', ')}.`
    );
  }
}

export class SubscriptionService {
  /**
   * Resolves the authoritative entitlement for a user across any provider.
   * Priority:
   * 1. Developer Unlimited entitlement (vertexdigitals07@gmail.com) -> 'developer'
   * 2. Active or trialing paid subscription -> 'pro' | 'business'
   * 3. Canceled subscription where current_period_end > now -> paid plan until period ends
   * 4. Past due subscription with grace period (< 3 days) -> paid plan with warning
   * 5. Expired / unpaid / no subscription -> 'free'
   */
  static async resolveUserEntitlement(userId: string, userEmail?: string, database?: Db): Promise<UserEntitlement> {
    const db = database ?? (await getMongoDb());

    let email = userEmail;
    if (!email && userId) {
      try {
        const profile = await db.collection('profiles').findOne({ $or: [{ id: userId }, { user_id: userId }] });
        if (profile && typeof profile.email === 'string') {
          email = profile.email;
        }
      } catch {}
    }

    if (isUserUnlimited(email)) {
      return {
        plan_id: 'developer',
        display_name: 'Developer Unlimited Entitlement',
        is_unlimited: true,
        monthly_minutes: 999999,
        max_projects: 999999,
        max_clip_renders: 999999,
        max_social_connections: 999999,
        max_scheduled_posts: 999999,
        subscription: null,
      };
    }
    const subCol = db.collection<SubscriptionRecord>('subscriptions');
    // Find active subscription across all providers
    const activeSub = await subCol.findOne({
      user_id: userId,
      status: { $in: ['active', 'trialing', 'past_due', 'canceled'] },
    }, { sort: { updated_at: -1 } });

    if (!activeSub) {
      const freePlan = PLANS.free;
      return {
        plan_id: 'free',
        display_name: freePlan.display_name,
        is_unlimited: false,
        monthly_minutes: freePlan.monthly_minutes,
        max_projects: freePlan.max_projects,
        max_clip_renders: freePlan.max_clip_renders,
        max_social_connections: freePlan.max_social_connections,
        max_scheduled_posts: freePlan.max_scheduled_posts,
        subscription: null,
      };
    }

    const now = new Date();
    const periodEnd = new Date(activeSub.current_period_end);
    const plan = getPlanDefinition(activeSub.plan_id) || PLANS.free;

    // Check if active or trialing
    if (activeSub.status === 'active' || activeSub.status === 'trialing') {
      return {
        plan_id: activeSub.plan_id,
        display_name: plan.display_name,
        is_unlimited: false,
        monthly_minutes: plan.monthly_minutes,
        max_projects: plan.max_projects,
        max_clip_renders: plan.max_clip_renders,
        max_social_connections: plan.max_social_connections,
        max_scheduled_posts: plan.max_scheduled_posts,
        subscription: {
          id: activeSub.id,
          provider: activeSub.provider,
          status: activeSub.status,
          cancel_at_period_end: activeSub.cancel_at_period_end,
          current_period_end: periodEnd.toISOString(),
          billing_interval: activeSub.billing_interval,
        },
      };
    }

    // Check canceled but current period is still active
    if (activeSub.status === 'canceled' && periodEnd > now) {
      return {
        plan_id: activeSub.plan_id,
        display_name: plan.display_name,
        is_unlimited: false,
        monthly_minutes: plan.monthly_minutes,
        max_projects: plan.max_projects,
        max_clip_renders: plan.max_clip_renders,
        max_social_connections: plan.max_social_connections,
        max_scheduled_posts: plan.max_scheduled_posts,
        subscription: {
          id: activeSub.id,
          provider: activeSub.provider,
          status: 'canceled',
          cancel_at_period_end: true,
          current_period_end: periodEnd.toISOString(),
          billing_interval: activeSub.billing_interval,
        },
      };
    }

    // Check past_due with 3-day grace period
    const gracePeriodMs = 3 * 24 * 60 * 60 * 1000;
    if (activeSub.status === 'past_due' && now.getTime() - periodEnd.getTime() < gracePeriodMs) {
      return {
        plan_id: activeSub.plan_id,
        display_name: plan.display_name,
        is_unlimited: false,
        monthly_minutes: plan.monthly_minutes,
        max_projects: plan.max_projects,
        max_clip_renders: plan.max_clip_renders,
        max_social_connections: plan.max_social_connections,
        max_scheduled_posts: plan.max_scheduled_posts,
        subscription: {
          id: activeSub.id,
          provider: activeSub.provider,
          status: 'past_due',
          cancel_at_period_end: activeSub.cancel_at_period_end,
          current_period_end: periodEnd.toISOString(),
          billing_interval: activeSub.billing_interval,
        },
      };
    }

    // Otherwise fallback to Free starter
    const freePlan = PLANS.free;
    return {
      plan_id: 'free',
      display_name: freePlan.display_name,
      is_unlimited: false,
      monthly_minutes: freePlan.monthly_minutes,
      max_projects: freePlan.max_projects,
      max_clip_renders: freePlan.max_clip_renders,
      max_social_connections: freePlan.max_social_connections,
      max_scheduled_posts: freePlan.max_scheduled_posts,
      subscription: {
        id: activeSub.id,
        provider: activeSub.provider,
        status: activeSub.status,
        cancel_at_period_end: activeSub.cancel_at_period_end,
        current_period_end: periodEnd.toISOString(),
        billing_interval: activeSub.billing_interval,
      },
    };
  }

  /**
   * Retrieves or creates a customer record for a given provider.
   */
  static async getOrCreateCustomer(
    userId: string,
    email: string,
    provider: BillingProviderName,
    providerCustomerId?: string
  ): Promise<BillingCustomerRecord> {
    const db = await getMongoDb();
    const customerCol = db.collection<BillingCustomerRecord>('billing_customers');
    const existing = await customerCol.findOne({ user_id: userId, provider });

    if (existing) {
      if (providerCustomerId && existing.provider_customer_id !== providerCustomerId) {
        await customerCol.updateOne(
          { id: existing.id },
          { $set: { provider_customer_id: providerCustomerId, updated_at: new Date() } }
        );
        existing.provider_customer_id = providerCustomerId;
      }
      return existing;
    }

    const now = new Date();
    const record: BillingCustomerRecord = {
      id: crypto.randomUUID(),
      user_id: userId,
      provider,
      provider_customer_id: providerCustomerId || `${provider}_cust_${crypto.randomUUID()}`,
      email,
      created_at: now,
      updated_at: now,
    };

    await customerCol.insertOne(record);
    return record;
  }

  /**
   * Authoritative handler consuming a verified NormalizedBillingEvent.
   *
   * Invariants (each one pinned by phaseBillingWebhookIntegrity.test.ts):
   *  - Ownership: an event is applied only to the user the server bound to it at checkout
   *    (billing_checkouts) or who already owns the provider subscription/customer. A webhook
   *    that names a different user throws BillingOwnershipError and changes nothing.
   *  - No default plan: an event whose price/plan id doesn't map to a configured plan never
   *    creates a subscription.
   *  - No access before payment: a new subscription without an explicit provider status is
   *    stored as 'incomplete'; only active/trialing (and the past_due grace window) unlock limits.
   *  - Idempotent writes: limits and invoices use $set/upsert keyed by provider ids, so a
   *    replayed event cannot grant more than once.
   */
  static async processNormalizedEvent(event: NormalizedBillingEvent, database?: Db): Promise<void> {
    const db = database ?? (await getMongoDb());
    const subCol = db.collection<SubscriptionRecord>('subscriptions');
    const limitsCol = db.collection('subscription_limits');
    const invCol = db.collection<BillingInvoiceRecord>('billing_invoices');
    const customerCol = db.collection<BillingCustomerRecord>('billing_customers');
    const checkoutCol = db.collection<BillingCheckoutRecord>('billing_checkouts');

    const now = new Date();

    // 1. Who does this event belong to? Collect every server-side binding and require agreement.
    const existing = event.subscriptionId
      ? await subCol.findOne({ provider: event.provider, provider_subscription_id: event.subscriptionId })
      : null;
    const customer = event.customerId
      ? await customerCol.findOne({ provider: event.provider, provider_customer_id: event.customerId })
      : null;
    // Razorpay checkouts are keyed by subscription id; Paddle by the checkout transaction id,
    // which subscription.* events carry as data.transaction_id.
    const rawData = (event.rawPayload as any)?.data || {};
    const checkoutRefs = [event.subscriptionId, rawData.id, rawData.transaction_id].filter(Boolean) as string[];
    const checkout = checkoutRefs.length
      ? await checkoutCol.findOne({ provider: event.provider, provider_ref: { $in: checkoutRefs } })
      : null;

    const owners = new Set(
      [existing?.user_id, customer?.user_id, checkout?.user_id].filter((v): v is string => Boolean(v))
    );
    if (event.userId && owners.size > 0 && !owners.has(event.userId)) {
      throw new BillingOwnershipError(event, Array.from(owners));
    }
    if (owners.size > 1) {
      throw new BillingOwnershipError(event, Array.from(owners));
    }
    const targetUserId = event.userId || Array.from(owners)[0] || null;

    if (!targetUserId) {
      logger.warn(`[SubscriptionService] Unable to map event ${event.eventId} (${event.eventType}) to a user.`);
      return;
    }

    if (event.customerId && !customer) {
      await customerCol.updateOne(
        { user_id: targetUserId, provider: event.provider },
        {
          $set: { provider_customer_id: event.customerId, updated_at: now },
          $setOnInsert: { id: crypto.randomUUID(), user_id: targetUserId, provider: event.provider, email: '', created_at: now },
        },
        { upsert: true }
      );
    }

    // 2. Subscription lifecycle.
    if (event.subscriptionId && (event.eventType.startsWith('subscription.') || event.eventType === 'checkout.completed')) {
      // Avoid applying out-of-order stale events
      if (existing && existing.last_provider_event_at && existing.last_provider_event_at > event.occurredAt) {
        logger.info(`[SubscriptionService] Ignored out-of-order event ${event.eventId} for sub ${event.subscriptionId}`);
        return;
      }

      const planId = event.planId || existing?.plan_id || checkout?.plan_id || null;
      if (!planId || !getPlanDefinition(planId) || planId === 'free') {
        logger.warn(
          `[SubscriptionService] Event ${event.eventId} for sub ${event.subscriptionId} has no configured plan; not creating a subscription.`
        );
        return;
      }
      const interval = event.interval || existing?.billing_interval || checkout?.billing_interval || 'month';
      const status: SubscriptionStatus =
        event.status ||
        (event.eventType === 'subscription.canceled' ? 'canceled' : existing?.status || 'incomplete');
      const plan = getPlanDefinition(planId) || PLANS.free;

      const subRecord: Partial<SubscriptionRecord> = {
        user_id: targetUserId,
        provider: event.provider,
        provider_customer_id: event.customerId || existing?.provider_customer_id || '',
        provider_subscription_id: event.subscriptionId,
        plan_id: planId,
        status,
        billing_interval: interval,
        cancel_at_period_end: event.cancelAtPeriodEnd ?? existing?.cancel_at_period_end ?? false,
        last_provider_event_id: event.eventId,
        last_provider_event_at: event.occurredAt,
        updated_at: now,
      };
      const billingCountry = checkout?.billing_country || existing?.billing_country || (event.provider === 'razorpay' ? 'IN' : null);
      if (billingCountry) subRecord.billing_country = billingCountry;

      if (event.currentPeriodStart) subRecord.current_period_start = event.currentPeriodStart;
      else if (!existing) subRecord.current_period_start = now;

      if (event.currentPeriodEnd) subRecord.current_period_end = event.currentPeriodEnd;
      else if (!existing) subRecord.current_period_end = new Date(now.getTime() + (interval === 'year' ? 365 : 30) * 24 * 60 * 60 * 1000);

      if (event.canceledAt) subRecord.canceled_at = event.canceledAt;
      if (event.amount) subRecord.amount = event.amount;
      if (event.currency) subRecord.currency = event.currency;

      await subCol.updateOne(
        { provider: event.provider, provider_subscription_id: event.subscriptionId },
        {
          $set: subRecord,
          $setOnInsert: {
            id: crypto.randomUUID(),
            created_at: now,
          },
        },
        { upsert: true }
      );

      if (checkout && (status === 'active' || status === 'trialing')) {
        await checkoutCol.updateOne({ id: checkout.id }, { $set: { status: 'completed', updated_at: now } });
      }

      // Update current UTC billing period limits ($set: replaying the event cannot add more)
      const currentPeriod = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      if (status === 'active' || status === 'trialing') {
        await limitsCol.updateOne(
          { user_id: targetUserId, billing_period: currentPeriod },
          {
            $set: {
              plan_tier: planId,
              monthly_minutes_limit: plan.monthly_minutes,
            },
          },
          { upsert: true }
        );
      } else if (status === 'canceled') {
        // If canceled and past period, restore free plan limit
        const activeEntitlement = await this.resolveUserEntitlement(targetUserId, undefined, db);
        if (activeEntitlement.plan_id === 'free') {
          await limitsCol.updateOne(
            { user_id: targetUserId, billing_period: currentPeriod },
            {
              $set: {
                plan_tier: 'free',
                monthly_minutes_limit: PLANS.free.monthly_minutes,
              },
            }
          );
        }
      }
    }

    // 3. Payment history (never changes access by itself).
    if (event.eventType === 'payment.completed' || event.eventType === 'payment.failed') {
      const invoiceId = event.invoiceId || (event.rawPayload as any)?.data?.id || `${event.provider}_inv_${event.eventId}`;
      const invRecord: Omit<BillingInvoiceRecord, 'id' | 'created_at'> = {
        user_id: targetUserId,
        provider: event.provider,
        provider_invoice_id: invoiceId,
        provider_customer_id: event.customerId || '',
        subscription_id: event.subscriptionId || null,
        amount_due: event.amount || 0,
        amount_paid: event.eventType === 'payment.completed' ? (event.amount || 0) : 0,
        currency: event.currency || (event.provider === 'razorpay' ? 'INR' : 'USD'),
        status: event.eventType === 'payment.completed' ? 'paid' : 'open',
        hosted_invoice_url: event.invoiceUrl || null,
        period_start: event.currentPeriodStart || now,
        period_end: event.currentPeriodEnd || now,
        updated_at: now,
      };

      await invCol.updateOne(
        { provider: event.provider, provider_invoice_id: invoiceId },
        { $set: invRecord, $setOnInsert: { id: crypto.randomUUID(), created_at: now } },
        { upsert: true }
      );
    }
  }

  /**
   * Atomically claims a webhook event for processing (unique index on provider+event id).
   * Returns false when the event was already processed or another worker holds it, so a
   * provider retry or a concurrent duplicate delivery is a no-op.
   */
  static async claimEvent(provider: BillingProviderName, eventId: string, database?: Db): Promise<boolean> {
    const db = database ?? (await getMongoDb());
    const col = db.collection<BillingEventRecord>('billing_events');
    const now = new Date();
    try {
      const res = await col.updateOne(
        { provider, provider_event_id: eventId, status: { $in: ['failed'] } },
        { $set: { status: 'processing', processed_at: now } }
      );
      if (res.modifiedCount === 1) return true; // retrying a previously failed attempt
      await col.insertOne({
        id: crypto.randomUUID(),
        provider,
        provider_event_id: eventId,
        event_type: '',
        status: 'processing',
        processed_at: now,
        created_at: now,
      });
      return true;
    } catch (err: any) {
      if (err?.code === 11000) return false; // duplicate key: already claimed/processed
      throw err;
    }
  }

  /** Binds a provider checkout reference to the user who started it (see processNormalizedEvent). */
  static async recordPendingCheckout(
    input: Omit<BillingCheckoutRecord, 'id' | 'status' | 'created_at' | 'updated_at'>,
    database?: Db
  ): Promise<void> {
    const db = database ?? (await getMongoDb());
    const now = new Date();
    await db.collection<BillingCheckoutRecord>('billing_checkouts').updateOne(
      { provider: input.provider, provider_ref: input.provider_ref },
      {
        $set: { ...input, status: 'pending', updated_at: now },
        $setOnInsert: { id: crypto.randomUUID(), created_at: now },
      },
      { upsert: true }
    );
  }

  /** A paid subscription that must be managed (not duplicated) before a new checkout. */
  static async findBlockingSubscription(userId: string, database?: Db): Promise<SubscriptionRecord | null> {
    const db = database ?? (await getMongoDb());
    return db.collection<SubscriptionRecord>('subscriptions').findOne(
      { user_id: userId, status: { $in: ['active', 'trialing', 'past_due'] } },
      { sort: { updated_at: -1 } }
    );
  }

  /**
   * Lists billing invoices for a user across providers.
   */
  static async getUserInvoices(userId: string): Promise<BillingInvoiceRecord[]> {
    const db = await getMongoDb();
    const invCol = db.collection<BillingInvoiceRecord>('billing_invoices');
    return invCol.find({ user_id: userId }).sort({ created_at: -1 }).toArray();
  }

  /**
   * Records and verifies webhook event idempotency across providers.
   */
  static async isEventAlreadyProcessed(provider: BillingProviderName, eventId: string): Promise<boolean> {
    const db = await getMongoDb();
    const eventCol = db.collection<BillingEventRecord>('billing_events');
    const existing = await eventCol.findOne({
      provider,
      provider_event_id: eventId,
    });

    return Boolean(existing && existing.status === 'processed');
  }

  static async recordEvent(
    provider: BillingProviderName,
    eventId: string,
    eventType: string,
    status: 'processed' | 'failed' | 'ignored',
    payloadHash?: string,
    errorCode?: string,
    errorMessage?: string
  ): Promise<void> {
    const db = await getMongoDb();
    const eventCol = db.collection<BillingEventRecord>('billing_events');

    const now = new Date();
    await eventCol.updateOne(
      { provider, provider_event_id: eventId },
      {
        $set: {
          event_type: eventType,
          status,
          processed_at: now,
          payload_hash: payloadHash,
          error_code: errorCode || null,
          error_message: errorMessage || null,
        },
        $setOnInsert: {
          id: crypto.randomUUID(),
          provider,
          provider_event_id: eventId,
          created_at: now,
        },
      },
      { upsert: true }
    );
  }
}
