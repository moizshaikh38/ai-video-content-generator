import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { Db } from 'mongodb';
import { config } from '../config/index.js';
import { SubscriptionService, BillingOwnershipError } from '../services/subscriptionService.js';
import { RazorpayBillingProvider } from '../services/billing/providers/razorpayBillingProvider.js';
import { PaddleBillingProvider } from '../services/billing/providers/paddleBillingProvider.js';

/**
 * Webhook integrity for the Razorpay (India) / Paddle (elsewhere) billing system:
 * signatures, idempotency, no access before payment, ownership, and legacy data.
 * Runs against a small in-memory stand-in for the Mongo collections the service uses.
 */

// ── In-memory Mongo stand-in (only the operations SubscriptionService uses) ────────────────
type Doc = Record<string, any>;
const matches = (doc: Doc, filter: Doc) =>
  Object.entries(filter).every(([k, v]) => {
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && '$in' in v) return (v.$in as unknown[]).includes(doc[k]);
    return doc[k] === v;
  });

const UNIQUE: Record<string, string[]> = { billing_events: ['provider', 'provider_event_id'] };

function fakeDb(): Db & { data: Record<string, Doc[]> } {
  const data: Record<string, Doc[]> = {};
  const col = (name: string) => {
    const rows = (data[name] ||= []);
    const dupe = (doc: Doc) => {
      const keys = UNIQUE[name];
      return keys && rows.some((r) => keys.every((k) => r[k] === doc[k]));
    };
    return {
      async findOne(filter: Doc, opts?: { sort?: Doc }) {
        let found = rows.filter((r) => matches(r, filter));
        if (opts?.sort?.updated_at === -1) found = found.sort((a, b) => +b.updated_at - +a.updated_at);
        return found[0] ? { ...found[0] } : null;
      },
      find(filter: Doc) {
        const found = rows.filter((r) => matches(r, filter));
        return { sort: () => ({ toArray: async () => found.map((r) => ({ ...r })) }) };
      },
      async insertOne(doc: Doc) {
        if (dupe(doc)) throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
        rows.push({ ...doc });
        return { insertedId: doc.id };
      },
      async updateOne(filter: Doc, update: Doc, opts?: { upsert?: boolean }) {
        const row = rows.find((r) => matches(r, filter));
        if (row) {
          Object.assign(row, update.$set || {});
          return { matchedCount: 1, modifiedCount: 1 };
        }
        if (!opts?.upsert) return { matchedCount: 0, modifiedCount: 0 };
        const plain = Object.fromEntries(Object.entries(filter).filter(([, v]) => typeof v !== 'object' || v instanceof Date));
        rows.push({ ...plain, ...(update.$setOnInsert || {}), ...(update.$set || {}) });
        return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
      },
    };
  };
  return Object.assign({ collection: col, data }, {}) as any;
}

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

const razorpay = new RazorpayBillingProvider();
const paddle = new PaddleBillingProvider();

function razorpayEvent(event: string, opts: { userId?: string; status?: string; paymentAmount?: number; planId?: string; subId?: string } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const body: any = {
    event,
    created_at: now,
    payload: {
      subscription: {
        entity: {
          id: opts.subId || 'sub_RZP123',
          plan_id: opts.planId ?? config.razorpayPlanProMonthly,
          status: opts.status || 'active',
          customer_id: 'cust_RZP1',
          current_start: now,
          current_end: now + 30 * 86400,
          notes: { userId: opts.userId ?? USER_A, planId: 'pro', interval: 'month' },
        },
      },
    },
  };
  if (opts.paymentAmount !== undefined) {
    body.payload.payment = { entity: { id: `pay_${opts.paymentAmount}`, amount: opts.paymentAmount, currency: 'INR', subscription_id: opts.subId || 'sub_RZP123' } };
  }
  return JSON.stringify(body);
}

const rzpHeaders = (eventId = crypto.randomUUID()) => ({ 'x-razorpay-event-id': eventId });

beforeEach(() => {
  config.razorpayPlanProMonthly = 'plan_PRO_MONTHLY';
  config.razorpayWebhookSecret = 'rzp_webhook_test_secret';
  config.paddlePriceProMonthly = 'pri_PRO_MONTHLY';
  config.paddleWebhookSecret = 'pdl_ntfset_test_secret';
  config.paddleApiKey = config.paddleApiKey || 'pdl_sdbx_apikey_test_only_not_real';
});

describe('Webhook signatures', () => {
  it('Razorpay: a valid HMAC is accepted; a tampered body or wrong secret is rejected', async () => {
    const body = razorpayEvent('subscription.charged', { paymentAmount: 199900 });
    const sig = crypto.createHmac('sha256', config.razorpayWebhookSecret).update(body).digest('hex');
    assert.equal(await razorpay.verifyWebhook(body, { 'x-razorpay-signature': sig }), true);
    assert.equal(await razorpay.verifyWebhook(body.replace('199900', '100'), { 'x-razorpay-signature': sig }), false);
    const forged = crypto.createHmac('sha256', 'attacker').update(body).digest('hex');
    assert.equal(await razorpay.verifyWebhook(body, { 'x-razorpay-signature': forged }), false);
    assert.equal(await razorpay.verifyWebhook(body, {}), false);
  });

  it('Paddle: a valid Paddle-Signature is accepted; tampering or a bad h1 is rejected', async () => {
    const body = JSON.stringify({ event_id: 'evt_1', event_type: 'subscription.activated', occurred_at: new Date().toISOString(), data: { id: 'sub_P1' } });
    const ts = Math.floor(Date.now() / 1000);
    const h1 = crypto.createHmac('sha256', config.paddleWebhookSecret).update(`${ts}:${body}`).digest('hex');
    assert.equal(await paddle.verifyWebhook(body, { 'paddle-signature': `ts=${ts};h1=${h1}` }), true);
    assert.equal(await paddle.verifyWebhook(body.replace('sub_P1', 'sub_P2'), { 'paddle-signature': `ts=${ts};h1=${h1}` }), false);
    assert.equal(await paddle.verifyWebhook(body, { 'paddle-signature': `ts=${ts};h1=${'0'.repeat(64)}` }), false);
    assert.equal(await paddle.verifyWebhook(body, {}), false);
  });
});

describe('No paid access before (or without) payment', () => {
  it('Razorpay created/authenticated subscriptions are recorded as incomplete and unlock nothing', async () => {
    const db = fakeDb();
    const ev = await razorpay.normalizeWebhook(razorpayEvent('subscription.authenticated', { status: 'authenticated' }), rzpHeaders());
    assert.equal(ev?.status, 'incomplete');
    await SubscriptionService.processNormalizedEvent(ev!, db);
    assert.equal(db.data.subscriptions[0].status, 'incomplete');
    assert.equal((db.data.subscription_limits || []).length, 0);
    const ent = await SubscriptionService.resolveUserEntitlement(USER_A, 'someone@example.com', db);
    assert.equal(ent.plan_id, 'free');
  });

  it('payment failures (Razorpay halted, Paddle payment_failed) never grant access', async () => {
    const db = fakeDb();
    const halted = await razorpay.normalizeWebhook(razorpayEvent('subscription.halted', { status: 'halted' }), rzpHeaders());
    await SubscriptionService.processNormalizedEvent(halted!, db);
    assert.equal(db.data.subscriptions[0].status, 'past_due');
    assert.equal((db.data.subscription_limits || []).length, 0);

    const failed = await paddle.normalizeWebhook(
      JSON.stringify({ event_id: 'evt_f', event_type: 'transaction.payment_failed', occurred_at: new Date().toISOString(), data: { id: 'txn_1', customer_id: 'ctm_1', currency_code: 'USD', details: { totals: { total: '2400' } }, custom_data: { userId: USER_B } } }),
      {}
    );
    assert.equal(failed?.eventType, 'payment.failed');
    await SubscriptionService.processNormalizedEvent(failed!, db);
    const inv = db.data.billing_invoices.find((i) => i.user_id === USER_B)!;
    assert.equal(inv.status, 'open');
    assert.equal(inv.amount_paid, 0);
  });

  it('Paddle transaction.created / ready / billed are not payments', async () => {
    for (const type of ['transaction.created', 'transaction.ready', 'transaction.billed']) {
      const ev = await paddle.normalizeWebhook(JSON.stringify({ event_id: `e_${type}`, event_type: type, data: { id: 'txn_x' } }), {});
      assert.equal(ev, null, `${type} must be ignored`);
    }
    const authorized = await razorpay.normalizeWebhook(
      JSON.stringify({ event: 'payment.authorized', created_at: 1, payload: { payment: { entity: { id: 'pay_1', amount: 100, currency: 'INR' } } } }),
      rzpHeaders()
    );
    assert.equal(authorized, null, 'an authorization is not money received');
  });

  it('a charge that does not match the configured INR price does not activate', async () => {
    const db = fakeDb();
    const ev = await razorpay.normalizeWebhook(razorpayEvent('subscription.charged', { paymentAmount: 100 }), rzpHeaders());
    assert.equal(ev?.status, null);
    await SubscriptionService.processNormalizedEvent(ev!, db);
    assert.notEqual(db.data.subscriptions[0].status, 'active');
    assert.equal((db.data.subscription_limits || []).length, 0);
  });

  it('an unmapped plan never creates a subscription (no silent "pro" default)', async () => {
    const db = fakeDb();
    const ev = await razorpay.normalizeWebhook(razorpayEvent('subscription.activated', { planId: 'plan_UNKNOWN' }), rzpHeaders());
    ev!.planId = null;
    await SubscriptionService.processNormalizedEvent(ev!, db);
    assert.equal((db.data.subscriptions || []).length, 0);
  });
});

describe('Successful verified payment', () => {
  it('Razorpay subscription.charged at the right price activates the bound user, sets IN and limits', async () => {
    const db = fakeDb();
    await SubscriptionService.recordPendingCheckout(
      { user_id: USER_A, provider: 'razorpay', provider_ref: 'sub_RZP123', plan_id: 'pro', billing_interval: 'month', billing_country: 'IN' },
      db
    );
    const ev = await razorpay.normalizeWebhook(razorpayEvent('subscription.charged', { paymentAmount: 199900 }), rzpHeaders());
    assert.equal(ev?.status, 'active');
    await SubscriptionService.processNormalizedEvent(ev!, db);

    const sub = db.data.subscriptions[0];
    assert.equal(sub.user_id, USER_A);
    assert.equal(sub.plan_id, 'pro');
    assert.equal(sub.status, 'active');
    assert.equal(sub.billing_country, 'IN');
    assert.equal(db.data.billing_checkouts[0].status, 'completed');
    assert.equal(db.data.subscription_limits[0].plan_tier, 'pro');
    const ent = await SubscriptionService.resolveUserEntitlement(USER_A, 'someone@example.com', db);
    assert.equal(ent.plan_id, 'pro');
  });
});

describe('Idempotency — duplicate deliveries', () => {
  it('the same event id is claimed once; a retry or concurrent copy is a no-op', async () => {
    const db = fakeDb();
    assert.equal(await SubscriptionService.claimEvent('razorpay', 'evt_dup', db), true);
    assert.equal(await SubscriptionService.claimEvent('razorpay', 'evt_dup', db), false);
    await SubscriptionService.recordEvent; // (recordEvent marks processed in the controller)
  });

  it('a failed attempt can be retried, but only once at a time', async () => {
    const db = fakeDb();
    await SubscriptionService.claimEvent('paddle', 'evt_retry', db);
    db.data.billing_events[0].status = 'failed';
    assert.equal(await SubscriptionService.claimEvent('paddle', 'evt_retry', db), true);
    assert.equal(await SubscriptionService.claimEvent('paddle', 'evt_retry', db), false);
  });

  it('re-applying the same charge cannot grant twice (limits are set, invoices keyed by provider id)', async () => {
    const db = fakeDb();
    const body = razorpayEvent('subscription.charged', { paymentAmount: 199900 });
    const ev = await razorpay.normalizeWebhook(body, rzpHeaders('evt_same'));
    await SubscriptionService.processNormalizedEvent(ev!, db);
    await SubscriptionService.processNormalizedEvent({ ...ev! }, db);
    assert.equal(db.data.subscriptions.length, 1);
    assert.equal(db.data.subscription_limits.length, 1);
    assert.equal(db.data.subscription_limits[0].monthly_minutes_limit, 360);
  });
});

describe('Ownership — a webhook can never touch another user', () => {
  it('rejects an event naming a different user than the subscription owner', async () => {
    const db = fakeDb();
    const first = await razorpay.normalizeWebhook(razorpayEvent('subscription.charged', { paymentAmount: 199900 }), rzpHeaders());
    await SubscriptionService.processNormalizedEvent(first!, db);

    const hijack = await razorpay.normalizeWebhook(razorpayEvent('subscription.cancelled', { status: 'cancelled', userId: USER_B }), rzpHeaders());
    await assert.rejects(SubscriptionService.processNormalizedEvent(hijack!, db), BillingOwnershipError);
    assert.equal(db.data.subscriptions[0].user_id, USER_A);
    assert.equal(db.data.subscriptions[0].status, 'active');
  });

  it('rejects an event that contradicts the user bound at checkout', async () => {
    const db = fakeDb();
    await SubscriptionService.recordPendingCheckout(
      { user_id: USER_A, provider: 'paddle', provider_ref: 'txn_CHECKOUT', plan_id: 'pro', billing_interval: 'month', billing_country: 'US' },
      db
    );
    const ev = await paddle.normalizeWebhook(
      JSON.stringify({
        event_id: 'evt_owner',
        event_type: 'subscription.activated',
        occurred_at: new Date().toISOString(),
        data: { id: 'sub_P9', status: 'active', customer_id: 'ctm_9', transaction_id: 'txn_CHECKOUT', items: [{ price: { id: 'pri_PRO_MONTHLY' } }], custom_data: { userId: USER_B } },
      }),
      {}
    );
    await assert.rejects(SubscriptionService.processNormalizedEvent(ev!, db), BillingOwnershipError);
    assert.equal((db.data.subscriptions || []).length, 0);
  });
});

describe('Compatibility & lifecycle display', () => {
  it('a pre-existing (legacy provider) active subscription still resolves to its paid plan', async () => {
    const db = fakeDb();
    const now = Date.now();
    db.data.subscriptions = [{
      id: crypto.randomUUID(), user_id: USER_A, provider: 'stripe', provider_subscription_id: 'sub_legacy', plan_id: 'studio',
      status: 'active', billing_interval: 'month', cancel_at_period_end: false,
      current_period_start: new Date(now), current_period_end: new Date(now + 86400000), updated_at: new Date(now),
    }];
    const ent = await SubscriptionService.resolveUserEntitlement(USER_A, 'someone@example.com', db);
    assert.equal(ent.plan_id, 'studio');
  });

  it('canceled-at-period-end keeps access until the period ends, then falls back to Free', async () => {
    const db = fakeDb();
    const now = Date.now();
    const base = { id: crypto.randomUUID(), user_id: USER_A, provider: 'paddle', provider_subscription_id: 'sub_c', plan_id: 'pro', billing_interval: 'month', current_period_start: new Date(now - 86400000), updated_at: new Date(now) };
    db.data.subscriptions = [{ ...base, status: 'canceled', cancel_at_period_end: true, current_period_end: new Date(now + 86400000) }];
    assert.equal((await SubscriptionService.resolveUserEntitlement(USER_A, 'someone@example.com', db)).plan_id, 'pro');
    db.data.subscriptions = [{ ...base, status: 'canceled', cancel_at_period_end: true, current_period_end: new Date(now - 1000) }];
    assert.equal((await SubscriptionService.resolveUserEntitlement(USER_A, 'someone@example.com', db)).plan_id, 'free');
  });
});
