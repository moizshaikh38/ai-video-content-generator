import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import { EntitlementService } from '../services/entitlementService.js';
import { SubscriptionService } from '../services/subscriptionService.js';
import { CreditRepository } from '../db/repositories/creditRepository.js';
import { CreditWalletService } from '../services/creditWalletService.js';
import {
  SubscriptionRecord,
  CreditReservationRecord,
} from '../types/index.js';

describe('VireoClip Phase C — Central Entitlements & Plan Governance', () => {
  const testUserIdFree = crypto.randomUUID();
  const testUserIdCreator = crypto.randomUUID();
  const testUserIdPro = crypto.randomUUID();
  const testUserIdStudio = crypto.randomUUID();
  const testUserIdCanceledActive = crypto.randomUUID();
  const testUserIdCanceledExpired = crypto.randomUUID();
  const testUserIdGracePeriod = crypto.randomUUID();
  const testUserIdGraceExpired = crypto.randomUUID();
  const testDevUserId = crypto.randomUUID();
  const testDevEmail = 'vertexdigitals07@gmail.com';

  const testUserIds = [
    testUserIdFree,
    testUserIdCreator,
    testUserIdPro,
    testUserIdStudio,
    testUserIdCanceledActive,
    testUserIdCanceledExpired,
    testUserIdGracePeriod,
    testUserIdGraceExpired,
    testDevUserId,
  ];

  before(async () => {
    const db = await getMongoDb();
    const now = new Date();

    // Clean up test users
    const testSubIds = [
      'sub_creator_test',
      'sub_pro_test',
      'sub_studio_test',
      'sub_canceled_active',
      'sub_canceled_expired',
      'sub_past_due_grace',
      'sub_past_due_expired'
    ];
    await db.collection('subscriptions').deleteMany({
      $or: [
        { user_id: { $in: testUserIds } },
        { provider_subscription_id: { $in: testSubIds } }
      ]
    });
    await db.collection('credit_wallets').deleteMany({ user_id: { $in: testUserIds } });
    await db.collection('credit_transactions').deleteMany({ user_id: { $in: testUserIds } });
    await db.collection('credit_reservations').deleteMany({ user_id: { $in: testUserIds } });
    await db.collection('projects').deleteMany({ user_id: { $in: testUserIds } });

    // Seed Creator subscription (active)
    await db.collection<SubscriptionRecord>('subscriptions').insertOne({
      id: crypto.randomUUID(),
      user_id: testUserIdCreator,
      provider: 'paddle',
      provider_customer_id: 'cust_creator_test',
      provider_subscription_id: 'sub_creator_test',
      plan_id: 'creator',
      status: 'active',
      billing_interval: 'month',
      cancel_at_period_end: false,
      current_period_start: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
      current_period_end: new Date(now.getTime() + 25 * 24 * 60 * 60 * 1000),
      created_at: now,
      updated_at: now,
    });

    // Seed Pro subscription (active)
    await db.collection<SubscriptionRecord>('subscriptions').insertOne({
      id: crypto.randomUUID(),
      user_id: testUserIdPro,
      provider: 'paddle',
      provider_customer_id: 'cust_pro_test',
      provider_subscription_id: 'sub_pro_test',
      plan_id: 'pro',
      status: 'active',
      billing_interval: 'month',
      cancel_at_period_end: false,
      current_period_start: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
      current_period_end: new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000),
      created_at: now,
      updated_at: now,
    });

    // Seed Studio subscription (active)
    await db.collection<SubscriptionRecord>('subscriptions').insertOne({
      id: crypto.randomUUID(),
      user_id: testUserIdStudio,
      provider: 'razorpay',
      provider_customer_id: 'cust_studio_test',
      provider_subscription_id: 'sub_studio_test',
      plan_id: 'studio',
      status: 'active',
      billing_interval: 'year',
      cancel_at_period_end: false,
      current_period_start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      current_period_end: new Date(now.getTime() + 335 * 24 * 60 * 60 * 1000),
      created_at: now,
      updated_at: now,
    });

    // Seed Canceled but still active subscription (current_period_end > now)
    await db.collection<SubscriptionRecord>('subscriptions').insertOne({
      id: crypto.randomUUID(),
      user_id: testUserIdCanceledActive,
      provider: 'paddle',
      provider_customer_id: 'cust_canceled_active',
      provider_subscription_id: 'sub_canceled_active',
      plan_id: 'pro',
      status: 'canceled',
      billing_interval: 'month',
      cancel_at_period_end: true,
      current_period_start: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000),
      current_period_end: new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000), // 15 days remaining
      canceled_at: now,
      created_at: now,
      updated_at: now,
    });

    // Seed Canceled and expired subscription (current_period_end <= now)
    await db.collection<SubscriptionRecord>('subscriptions').insertOne({
      id: crypto.randomUUID(),
      user_id: testUserIdCanceledExpired,
      provider: 'paddle',
      provider_customer_id: 'cust_canceled_expired',
      provider_subscription_id: 'sub_canceled_expired',
      plan_id: 'pro',
      status: 'canceled',
      billing_interval: 'month',
      cancel_at_period_end: true,
      current_period_start: new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000),
      current_period_end: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000), // Expired 10 days ago
      canceled_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
      created_at: now,
      updated_at: now,
    });

    // Seed Past-due within 3-day grace period (24 hours overdue)
    await db.collection<SubscriptionRecord>('subscriptions').insertOne({
      id: crypto.randomUUID(),
      user_id: testUserIdGracePeriod,
      provider: 'paddle',
      provider_customer_id: 'cust_grace_test',
      provider_subscription_id: 'sub_grace_test',
      plan_id: 'creator',
      status: 'past_due',
      billing_interval: 'month',
      cancel_at_period_end: false,
      current_period_start: new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000),
      current_period_end: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000), // 1 day ago (< 3 days)
      created_at: now,
      updated_at: now,
    });

    // Seed Past-due past grace period (5 days overdue)
    await db.collection<SubscriptionRecord>('subscriptions').insertOne({
      id: crypto.randomUUID(),
      user_id: testUserIdGraceExpired,
      provider: 'paddle',
      provider_customer_id: 'cust_grace_expired',
      provider_subscription_id: 'sub_grace_expired',
      plan_id: 'pro',
      status: 'past_due',
      billing_interval: 'month',
      cancel_at_period_end: false,
      current_period_start: new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000),
      current_period_end: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000), // 5 days ago (> 3 days)
      created_at: now,
      updated_at: now,
    });
  });

  after(async () => {
    try {
      const db = await getMongoDb();
      await db.collection('subscriptions').deleteMany({ user_id: { $in: testUserIds } });
      await db.collection('credit_wallets').deleteMany({ user_id: { $in: testUserIds } });
      await db.collection('credit_transactions').deleteMany({ user_id: { $in: testUserIds } });
      await db.collection('credit_reservations').deleteMany({ user_id: { $in: testUserIds } });
      await db.collection('projects').deleteMany({ user_id: { $in: testUserIds } });
    } catch {}
    await closeMongo(true);
  });

  test('1. Free Plan Resolution: enforces watermark, restricts advanced presets & features', async () => {
    const entitlements = await EntitlementService.resolveUserEntitlements(testUserIdFree);

    assert.equal(entitlements.planId, 'free');
    assert.equal(entitlements.displayName, 'Free');
    assert.equal(entitlements.watermarkRequired, true);
    assert.equal(entitlements.monthlyCredits, 60);

    // Preset checks: simple, clean, none are allowed; viral styles disallowed
    assert.equal(EntitlementService.isPresetAllowed(entitlements, 'clean'), true);
    assert.equal(EntitlementService.isPresetAllowed(entitlements, 'simple'), true);
    assert.equal(EntitlementService.isPresetAllowed(entitlements, 'none'), true);
    assert.equal(EntitlementService.isPresetAllowed(entitlements, 'hormozi'), false);
    assert.equal(EntitlementService.isPresetAllowed(entitlements, 'karaoke'), false);
    assert.equal(EntitlementService.isPresetAllowed(entitlements, 'beasty'), false);

    // Feature checks: smartReframe, animatedCaptions disabled
    assert.equal(EntitlementService.isFeatureAllowed(entitlements, 'smartReframe'), false);
    assert.equal(EntitlementService.isFeatureAllowed(entitlements, 'animatedCaptions'), false);
    assert.equal(EntitlementService.isFeatureAllowed(entitlements, 'exportSrtVtt'), true);

    // Limits
    assert.equal(entitlements.limits.maxProjects, 5);
    assert.equal(entitlements.limits.maxClipRenders, 10);
  });

  test('2. Creator Plan Resolution: watermark removed, standard presets unlocked', async () => {
    const entitlements = await EntitlementService.resolveUserEntitlements(testUserIdCreator);

    assert.equal(entitlements.planId, 'creator');
    assert.equal(entitlements.displayName, 'Creator');
    assert.equal(entitlements.watermarkRequired, false);
    assert.equal(entitlements.monthlyCredits, 500);

    // Standard viral presets unlocked
    assert.equal(EntitlementService.isPresetAllowed(entitlements, 'hormozi'), true);
    assert.equal(EntitlementService.isPresetAllowed(entitlements, 'karaoke'), true);
    assert.equal(EntitlementService.isPresetAllowed(entitlements, 'beasty'), true);
    assert.equal(EntitlementService.isPresetAllowed(entitlements, 'cinema'), true);

    // Features
    assert.equal(EntitlementService.isFeatureAllowed(entitlements, 'brandTemplates'), true);
    assert.equal(EntitlementService.isFeatureAllowed(entitlements, 'smartReframe'), false); // Pro+
    assert.equal(EntitlementService.isFeatureAllowed(entitlements, 'multiBrandKits'), false); // Studio
  });

  test('3. Pro Plan Resolution: smart reframe, animated captions, all presets unlocked (*)', async () => {
    const entitlements = await EntitlementService.resolveUserEntitlements(testUserIdPro);

    assert.equal(entitlements.planId, 'pro');
    assert.equal(entitlements.displayName, 'Pro');
    assert.equal(entitlements.watermarkRequired, false);
    assert.equal(entitlements.monthlyCredits, 1500);

    // Wildcard preset check
    assert.equal(EntitlementService.isPresetAllowed(entitlements, 'any_custom_preset_xyz'), true);
    assert.equal(EntitlementService.isPresetAllowed(entitlements, 'hormozi'), true);

    // Advanced features unlocked
    assert.equal(EntitlementService.isFeatureAllowed(entitlements, 'smartReframe'), true);
    assert.equal(EntitlementService.isFeatureAllowed(entitlements, 'animatedCaptions'), true);
    assert.equal(EntitlementService.isFeatureAllowed(entitlements, 'customFonts'), true);
    assert.equal(EntitlementService.isFeatureAllowed(entitlements, 'priorityQueue'), false); // Studio only
  });

  test('4. Studio Plan Resolution: priority queue, multi-brand kits, highest tier limits', async () => {
    const entitlements = await EntitlementService.resolveUserEntitlements(testUserIdStudio);

    assert.equal(entitlements.planId, 'studio');
    assert.equal(entitlements.displayName, 'Studio');
    assert.equal(entitlements.watermarkRequired, false);
    assert.equal(entitlements.monthlyCredits, 4000);
    assert.equal(EntitlementService.isFeatureAllowed(entitlements, 'priorityQueue'), true);
    assert.equal(EntitlementService.isFeatureAllowed(entitlements, 'multiBrandKits'), true);
    assert.equal(entitlements.limits.maxProjects, 250);
    assert.equal(entitlements.limits.maxClipRenders, 500);
  });

  test('5. Canceled Subscription Active: preserves paid benefits until periodEnd', async () => {
    const entitlements = await EntitlementService.resolveUserEntitlements(testUserIdCanceledActive);

    assert.equal(entitlements.planId, 'pro');
    assert.equal(entitlements.subscriptionStatus, 'canceled');
    assert.equal(entitlements.isCanceledActive, true);
    assert.equal(entitlements.watermarkRequired, false);
    assert.equal(EntitlementService.isFeatureAllowed(entitlements, 'smartReframe'), true);
  });

  test('6. Canceled Subscription Expired: cleanly reverts to Free tier limits', async () => {
    const entitlements = await EntitlementService.resolveUserEntitlements(testUserIdCanceledExpired);

    assert.equal(entitlements.planId, 'free');
    assert.equal(entitlements.subscriptionStatus, 'canceled');
    assert.equal(entitlements.isCanceledActive, false);
    assert.equal(entitlements.watermarkRequired, true);
    assert.equal(EntitlementService.isFeatureAllowed(entitlements, 'smartReframe'), false);
  });

  test('7. Past-Due Grace Period: maintains access during 3-day grace period', async () => {
    const entitlements = await EntitlementService.resolveUserEntitlements(testUserIdGracePeriod);

    assert.equal(entitlements.planId, 'creator');
    assert.equal(entitlements.subscriptionStatus, 'past_due');
    assert.equal(entitlements.isGracePeriod, true);
    assert.equal(entitlements.watermarkRequired, false);
  });

  test('8. Past-Due Grace Expired: downgrades to Free tier after 3 days without payment', async () => {
    const entitlements = await EntitlementService.resolveUserEntitlements(testUserIdGraceExpired);

    assert.equal(entitlements.planId, 'free');
    assert.equal(entitlements.subscriptionStatus, 'past_due');
    assert.equal(entitlements.isGracePeriod, false);
    assert.equal(entitlements.watermarkRequired, true);
  });

  test('9. Developer Unlimited Entitlement: grants 999,999 credits, all features, zero watermark', async () => {
    const entitlements = await EntitlementService.resolveUserEntitlements(testDevUserId, testDevEmail);

    assert.equal(entitlements.planId, 'developer');
    assert.equal(entitlements.isUnlimited, true);
    assert.equal(entitlements.watermarkRequired, false);
    assert.equal(entitlements.monthlyCredits, 999999);
    assert.equal(EntitlementService.isFeatureAllowed(entitlements, 'smartReframe'), true);
    assert.equal(EntitlementService.isFeatureAllowed(entitlements, 'animatedCaptions'), true);
    assert.equal(EntitlementService.isFeatureAllowed(entitlements, 'priorityQueue'), true);
    assert.equal(EntitlementService.isPresetAllowed(entitlements, 'hormozi'), true);
  });

  test('10. Backward-Compatibility with SubscriptionService: delegates to EntitlementService', async () => {
    const legacyEntitlement = await SubscriptionService.resolveUserEntitlement(testUserIdPro);

    assert.equal(legacyEntitlement.plan_id, 'pro');
    assert.equal(legacyEntitlement.display_name, 'Pro');
    assert.equal(legacyEntitlement.is_unlimited, false);
    assert.equal(legacyEntitlement.monthly_minutes, 360);
    assert.equal(legacyEntitlement.max_projects, 100);
    assert.ok(legacyEntitlement.subscription);
    assert.equal(legacyEntitlement.subscription?.status, 'active');

    // Also verify resolvePlanEntitlements
    const modernEntitlements = await SubscriptionService.resolvePlanEntitlements(testUserIdPro);
    assert.equal(modernEntitlements.planId, 'pro');
    assert.equal(modernEntitlements.watermarkRequired, false);
  });

  test('11. Preliminary Check 1: Developer accounts maintain full wallet & ledger auditability', async () => {
    // Calling getWalletSummary must grant authoritative developer credits
    const summary = await CreditWalletService.getWalletSummary(testDevUserId, testDevEmail);
    assert.equal(summary.is_unlimited, true);
    assert.ok(summary.available_credits >= 900_000, `Expected >= 900k available credits, got ${summary.available_credits}`);

    // Verify wallet document in database actually contains real available credits
    const db = await getMongoDb();
    const walletInDb = await db.collection('credit_wallets').findOne({ user_id: testDevUserId });
    assert.ok(walletInDb);
    assert.equal(walletInDb.available_credits, summary.available_credits);

    // Check that a monthly_grant ledger record was created
    const tx = await db.collection('credit_transactions').findOne({
      user_id: testDevUserId,
      type: 'monthly_grant',
    });
    assert.ok(tx);
    assert.equal(tx.amount, 999999);
    assert.equal(tx.balance_after, tx.balance_before + tx.amount);

    // Perform an actual reservation and verify strict ledger reconciliation
    const attemptId = `test_dev_attempt_${Date.now()}`;
    const reserveResult = await CreditWalletService.reserveCredits({
      userId: testDevUserId,
      attemptId,
      operationId: 'core_video_processing',
      amount: 40,
      userEmail: testDevEmail,
    });

    assert.equal(reserveResult.allowed, true);
    assert.equal(reserveResult.wallet.available_credits, walletInDb.available_credits - 40);
    assert.equal(reserveResult.wallet.reserved_credits, 40);

    // Settle the reservation
    const settleResult = await CreditWalletService.settleReservation(attemptId, 36);
    assert.equal(settleResult.settledAmount, 36);
    assert.equal(settleResult.wallet.reserved_credits, 0);
    assert.equal(settleResult.wallet.available_credits, walletInDb.available_credits - 36);
  });

  test('12. Preliminary Check 2: Expired reservations with active jobs are NOT released', async () => {
    const db = await getMongoDb();
    const testProjectId = crypto.randomUUID();
    const activeAttemptId = `active_job_attempt_${Date.now()}`;

    // Create an active project
    await db.collection('projects').insertOne({
      id: testProjectId,
      user_id: testUserIdCreator,
      name: 'Test In-Flight Project',
      video_status: 'processing',
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Create an expired reservation referencing this project
    const now = new Date();
    await db.collection<CreditReservationRecord>('credit_reservations').insertOne({
      id: crypto.randomUUID(),
      wallet_id: crypto.randomUUID(),
      user_id: testUserIdCreator,
      attempt_id: activeAttemptId,
      operation_id: 'ai_clipping',
      amount: 40,
      status: 'reserved',
      expires_at: new Date(now.getTime() - 10 * 60 * 1000), // Expired 10 min ago
      metadata: { projectId: testProjectId },
      created_at: new Date(now.getTime() - 70 * 60 * 1000),
      updated_at: now,
    });

    // Run recovery
    const recoveredCount = await CreditRepository.recoverExpiredReservations();
    assert.equal(recoveredCount, 0, 'Must NOT release reservation whose project is actively processing');

    // Verify reservation expires_at was extended by 30 minutes
    const reservationAfter = await db.collection<CreditReservationRecord>('credit_reservations').findOne({
      attempt_id: activeAttemptId,
    });
    assert.ok(reservationAfter);
    assert.equal(reservationAfter.status, 'reserved');
    assert.ok(reservationAfter.expires_at.getTime() > now.getTime() + 20 * 60 * 1000);

    // Clean up
    await db.collection('projects').deleteOne({ id: testProjectId });
    await db.collection('credit_reservations').deleteOne({ attempt_id: activeAttemptId });
  });
});

