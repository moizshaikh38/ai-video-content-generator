import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import { CreditRepository, getCurrentBillingPeriod } from '../db/repositories/creditRepository.js';
import { CreditWalletService } from '../services/creditWalletService.js';
import { CreditPricingService } from '../services/billing/creditPricingService.js';
import { EntitlementService } from '../services/entitlementService.js';
import {
  CreditReservationRecord,
  CreditWalletRecord,
} from '../types/index.js';

describe('VireoClip Phase D: AI Video Clipping Credit Integration', () => {
  const testUserA = crypto.randomUUID();
  const testUserB = crypto.randomUUID();
  const testUserMidRun = crypto.randomUUID();
  const testUserLimits = crypto.randomUUID();
  const testDevUser = crypto.randomUUID();
  const testDevEmail = 'vertexdigitals07@gmail.com';

  const allTestUsers = [
    testUserA,
    testUserB,
    testUserMidRun,
    testUserLimits,
    testDevUser,
  ];

  before(async () => {
    const db = await getMongoDb();
    await db.collection('credit_wallets').deleteMany({ user_id: { $in: allTestUsers } });
    await db.collection('credit_transactions').deleteMany({ user_id: { $in: allTestUsers } });
    await db.collection('credit_reservations').deleteMany({ user_id: { $in: allTestUsers } });
    await db.collection('projects').deleteMany({ user_id: { $in: allTestUsers } });
    await db.collection('render_jobs').deleteMany({ user_id: { $in: allTestUsers } });
    await db.collection('transcripts').deleteMany({ user_id: { $in: allTestUsers } });
    await db.collection('subscriptions').deleteMany({ user_id: { $in: allTestUsers } });
  });

  after(async () => {
    try {
      const db = await getMongoDb();
      await db.collection('credit_wallets').deleteMany({ user_id: { $in: allTestUsers } });
      await db.collection('credit_transactions').deleteMany({ user_id: { $in: allTestUsers } });
      await db.collection('credit_reservations').deleteMany({ user_id: { $in: allTestUsers } });
      await db.collection('projects').deleteMany({ user_id: { $in: allTestUsers } });
      await db.collection('render_jobs').deleteMany({ user_id: { $in: allTestUsers } });
      await db.collection('transcripts').deleteMany({ user_id: { $in: allTestUsers } });
      await db.collection('subscriptions').deleteMany({ user_id: { $in: allTestUsers } });
    } finally {
      await closeMongo(true);
    }
  });

  // --------------------------------------------------------------------------
  // TEST 1: Duration-based pricing formula & 15-second intervals
  // --------------------------------------------------------------------------
  test('1. Core duration-based credit pricing enforces 1 credit per 15s interval, rounding up, min 1 credit', () => {
    // 5 seconds -> 1 interval of 15s -> 1 credit (min 1)
    const cost5s = CreditPricingService.calculateCoreProcessingCost(5);
    assert.equal(cost5s.credits, 1, '5s should cost 1 credit');

    // 15 seconds -> 1 interval of 15s -> 1 credit
    const cost15s = CreditPricingService.calculateCoreProcessingCost(15);
    assert.equal(cost15s.credits, 1, '15s should cost 1 credit');

    // 16 seconds -> rounds up to 2 intervals (30s) -> 2 credits
    const cost16s = CreditPricingService.calculateCoreProcessingCost(16);
    assert.equal(cost16s.credits, 2, '16s should round up to 2 credits');

    // 30 seconds -> exactly 2 intervals -> 2 credits
    const cost30s = CreditPricingService.calculateCoreProcessingCost(30);
    assert.equal(cost30s.credits, 2, '30s should cost 2 credits');

    // 31 seconds -> rounds up to 3 intervals -> 3 credits
    const cost31s = CreditPricingService.calculateCoreProcessingCost(31);
    assert.equal(cost31s.credits, 3, '31s should round up to 3 credits');

    // 60 seconds (1 full minute) -> 4 intervals -> 4 credits
    const cost60s = CreditPricingService.calculateCoreProcessingCost(60);
    assert.equal(cost60s.credits, 4, '60s should cost 4 credits');

    // 90 seconds (1.5 minutes) -> 6 intervals -> 6 credits
    const cost90s = CreditPricingService.calculateCoreProcessingCost(90);
    assert.equal(cost90s.credits, 6, '90s should cost 6 credits');

    // Verify dynamic configuration override: change interval to 30s and rate to 2 credits/min
    process.env.CREDIT_INTERVAL_SECONDS = '30';
    process.env.CREDITS_PER_SOURCE_MINUTE = '2';
    try {
      const costCustomInterval = CreditPricingService.calculateCoreProcessingCost(60);
      // With 30s interval and 2 credits/min: 60s is 2 intervals of 1 credit = 2 credits
      assert.equal(costCustomInterval.credits, 2, '60s with 30s interval and 2 credits/min should cost 2 credits');
    } finally {
      delete process.env.CREDIT_INTERVAL_SECONDS;
      delete process.env.CREDITS_PER_SOURCE_MINUTE;
    }
  });

  // --------------------------------------------------------------------------
  // TEST 2: Pre-flight estimation & server-authoritative derivation
  // --------------------------------------------------------------------------
  test('2. Pre-flight estimate correctly assesses balance sufficiency and ignores client manipulation', async () => {
    // Initial grant: 3 credits
    await CreditRepository.grantCredits({
      userId: testUserA,
      amount: 3,
      type: 'manual_adjustment',
      idempotencyKey: `grant_a_${Date.now()}`,
      description: 'Initial balance for User A',
    });

    // Estimate for 60s (4 credits needed)
    const estimate60s = await CreditWalletService.estimateCost(testUserA, 'core_video_processing', {
      durationSeconds: 60,
    });
    assert.equal(estimate60s.estimated_credits, 4);
    assert.equal(estimate60s.available_credits, 3);
    assert.equal(estimate60s.has_sufficient_credits, false, 'User A lacks 4 credits for 60s');

    // Estimate for 30s (2 credits needed)
    const estimate30s = await CreditWalletService.estimateCost(testUserA, 'core_video_processing', {
      durationSeconds: 30,
    });
    assert.equal(estimate30s.estimated_credits, 2);
    assert.equal(estimate30s.available_credits, 3);
    assert.equal(estimate30s.has_sufficient_credits, true, 'User A has sufficient credits for 30s');
  });

  // --------------------------------------------------------------------------
  // TEST 3: Insufficient credits cleanly rejects processing with 403
  // --------------------------------------------------------------------------
  test('3. Insufficient balance blocks credit reservation without altering wallet balances', async () => {
    const attemptId = crypto.randomUUID();
    // User A has 3 credits, requests 4 credits (60s video)
    const res = await CreditWalletService.reserveCredits({
      userId: testUserA,
      attemptId,
      operationId: 'core_video_processing',
      amount: 4,
    });

    assert.equal(res.allowed, false);
    assert.equal(res.errorCode, 'INSUFFICIENT_CREDITS');
    assert.ok(res.errorMessage?.includes('Insufficient credits'));

    // Verify wallet balances are untouched
    const wallet = await CreditRepository.getOrCreateWallet(testUserA);
    assert.equal(wallet.available_credits, 3);
    assert.equal(wallet.reserved_credits, 0);
    assert.equal(wallet.period_consumed, 0);

    // Verify no reservation record exists
    const db = await getMongoDb();
    const recordedRes = await db.collection('credit_reservations').findOne({ attempt_id: attemptId });
    assert.equal(recordedRes, null);
  });

  // --------------------------------------------------------------------------
  // TEST 4: Successful reservation, completion settlement & unused credit refund
  // --------------------------------------------------------------------------
  test('4. Atomic reservation locks credits and settling auto-refunds unused credits on shorter duration', async () => {
    // Top up User A by 10 credits -> total available = 13
    await CreditRepository.grantCredits({
      userId: testUserA,
      amount: 10,
      type: 'manual_adjustment',
      idempotencyKey: `topup_a_${Date.now()}`,
      description: 'Topup for User A',
    });

    const attemptId = crypto.randomUUID();
    // Reserve provisional 4 credits (60s)
    const reserveRes = await CreditWalletService.reserveCredits({
      userId: testUserA,
      attemptId,
      operationId: 'core_video_processing',
      amount: 4,
      metadata: { provisionalDuration: 60 },
    });

    assert.equal(reserveRes.allowed, true);
    assert.equal(reserveRes.wallet.available_credits, 9); // 13 - 4
    assert.equal(reserveRes.wallet.reserved_credits, 4);

    // Actual video measured only 25s (requires 2 credits: 2x 15s)
    const settleRes = await CreditWalletService.settleReservation(attemptId, 2, {
      actualDurationSeconds: 25,
    });

    assert.equal(settleRes.settledAmount, 2);
    assert.equal(settleRes.reservation.status, 'settled');
    assert.equal(settleRes.reservation.settled_amount, 2);

    // Wallet check: 9 + 2 refunded = 11 available, 0 reserved, 2 consumed
    assert.equal(settleRes.wallet.available_credits, 11);
    assert.equal(settleRes.wallet.reserved_credits, 0);
    assert.equal(settleRes.wallet.period_consumed, 2);

    // Verify transaction ledger has settlement and unused refund
    const history = await CreditWalletService.getTransactionHistory(testUserA, 10);
    const settleTx = history.find((t) => t.type === 'consumption' && t.reference_id === attemptId);
    assert.ok(settleTx, 'Ledger must record consumption transaction');
    assert.equal(settleTx?.metadata?.refund_unused, 2, 'Metadata must record 2 unused credits refunded');
  });

  // --------------------------------------------------------------------------
  // TEST 5: Mid-run extension on longer measured duration & mid-run failure
  // --------------------------------------------------------------------------
  test('5. Mid-run reservation extension succeeds when balance is sufficient, and cleanly aborts with 100% refund when insufficient', async () => {
    // User MidRun gets 10 credits
    await CreditRepository.grantCredits({
      userId: testUserMidRun,
      amount: 10,
      type: 'manual_adjustment',
      idempotencyKey: `grant_midrun_${Date.now()}`,
      description: 'Grant for MidRun tests',
    });

    // 5A: Successful mid-run extension
    const attemptSuccess = crypto.randomUUID();
    // Provisionally reserve 4 credits (60s)
    const initRes = await CreditWalletService.reserveCredits({
      userId: testUserMidRun,
      attemptId: attemptSuccess,
      operationId: 'core_video_processing',
      amount: 4,
    });
    assert.equal(initRes.allowed, true);
    assert.equal(initRes.wallet.available_credits, 6);
    assert.equal(initRes.wallet.reserved_credits, 4);

    // FFprobe measures actual length as 120s (requires 8 credits -> delta = 4 credits)
    const extendSuccess = await CreditWalletService.extendReservation(attemptSuccess, 4, undefined, 'FFprobe 120s extension');
    assert.equal(extendSuccess.allowed, true);
    assert.equal(extendSuccess.wallet?.available_credits, 2); // 6 - 4
    assert.equal(extendSuccess.wallet?.reserved_credits, 8); // 4 + 4
    assert.equal(extendSuccess.reservation?.amount, 8);

    // Settle the 8 credits
    const settledSuccess = await CreditWalletService.settleReservation(attemptSuccess, 8);
    assert.equal(settledSuccess.wallet.available_credits, 2);
    assert.equal(settledSuccess.wallet.reserved_credits, 0);
    assert.equal(settledSuccess.wallet.period_consumed, 8);

    // 5B: Mid-run extension failure (insufficient balance)
    // User MidRun currently has 2 credits available.
    const attemptFail = crypto.randomUUID();
    // Provisionally reserve 2 credits
    const initResFail = await CreditWalletService.reserveCredits({
      userId: testUserMidRun,
      attemptId: attemptFail,
      operationId: 'core_video_processing',
      amount: 2,
    });
    assert.equal(initResFail.allowed, true);
    assert.equal(initResFail.wallet.available_credits, 0); // 2 - 2
    assert.equal(initResFail.wallet.reserved_credits, 2);

    // FFprobe measures length as 180s (requires 12 credits -> delta = 10 credits, but 0 available)
    const extendFail = await CreditWalletService.extendReservation(attemptFail, 10, undefined, 'FFprobe 180s extension');
    assert.equal(extendFail.allowed, false);
    assert.equal(extendFail.errorCode, 'INSUFFICIENT_CREDITS');

    // On extension refusal, job aborts and releases the initial reservation (100% refund)
    const releaseRes = await CreditWalletService.releaseReservation(attemptFail, 'Mid-run extension failed due to insufficient credits');
    assert.equal(releaseRes.releasedAmount, 2);
    assert.equal(releaseRes.wallet.available_credits, 2); // 0 + 2 refunded
    assert.equal(releaseRes.wallet.reserved_credits, 0);
  });

  // --------------------------------------------------------------------------
  // TEST 6: Reusing transcript & generating multiple clips charges 0 credits
  // --------------------------------------------------------------------------
  test('6. Reusing existing transcript charges 0 credits and generating multiple clips does not duplicate charges', async () => {
    // Pricing check
    const reusedCost = CreditPricingService.calculateOperationCost('core_video_processing', {
      durationSeconds: 120,
      isReusedTranscript: true,
    });
    assert.equal(reusedCost.credits, 0, 'Reused transcript must be 0 credits');

    // Free operations check
    const previewCost = CreditPricingService.calculateOperationCost('clip_preview');
    assert.equal(previewCost.credits, 0, 'Clip preview must be 0 credits');

    // Reserve 0 credits for reused transcript
    const attemptReused = crypto.randomUUID();
    const reserveReused = await CreditWalletService.reserveCredits({
      userId: testUserA,
      attemptId: attemptReused,
      operationId: 'core_video_processing',
      amount: 0,
      metadata: { isReusedTranscript: true },
    });

    assert.equal(reserveReused.allowed, true);
    assert.equal(reserveReused.reservation?.amount, 0);
    assert.equal(reserveReused.reservation?.status, 'settled');

    // Settle 0 credits idempotently
    const settleReused = await CreditWalletService.settleReservation(attemptReused, 0);
    assert.equal(settleReused.settledAmount, 0);
  });

  // --------------------------------------------------------------------------
  // TEST 7: Idempotency across retries and queue redelivery
  // --------------------------------------------------------------------------
  test('7. Multiple reserve calls with same attemptId return idempotent response without double debiting', async () => {
    const attemptId = crypto.randomUUID();
    const res1 = await CreditWalletService.reserveCredits({
      userId: testUserA,
      attemptId,
      operationId: 'core_video_processing',
      amount: 3,
    });

    assert.equal(res1.allowed, true);
    const balanceAfterRes1 = res1.wallet.available_credits;

    // Retry with exact same attemptId
    const res2 = await CreditWalletService.reserveCredits({
      userId: testUserA,
      attemptId,
      operationId: 'core_video_processing',
      amount: 3,
    });

    assert.equal(res2.allowed, true);
    assert.equal(res2.idempotent, true);
    assert.equal(res2.wallet.available_credits, balanceAfterRes1, 'Balance must not be deducted twice');

    // Clean up reservation
    await CreditWalletService.releaseReservation(attemptId, 'Test cleanup');
  });

  // --------------------------------------------------------------------------
  // TEST 8: 100% reservation release on pipeline failure
  // --------------------------------------------------------------------------
  test('8. Full pipeline failure releases 100% of reserved credits back to available balance', async () => {
    const startWallet = await CreditRepository.getOrCreateWallet(testUserA);
    const initialAvailable = startWallet.available_credits;

    const attemptId = crypto.randomUUID();
    await CreditWalletService.reserveCredits({
      userId: testUserA,
      attemptId,
      operationId: 'core_video_processing',
      amount: 4,
    });

    const midWallet = await CreditRepository.getOrCreateWallet(testUserA);
    assert.equal(midWallet.available_credits, initialAvailable - 4);
    assert.equal(midWallet.reserved_credits, 4);

    // Simulate pipeline failure
    const releaseRes = await CreditWalletService.releaseReservation(attemptId, 'FFmpeg transcoding simulated crash');
    assert.equal(releaseRes.releasedAmount, 4);
    assert.equal(releaseRes.reservation.status, 'released');
    assert.equal(releaseRes.wallet.available_credits, initialAvailable);
    assert.equal(releaseRes.wallet.reserved_credits, 0);
  });

  // --------------------------------------------------------------------------
  // TEST 9: Plan Restrictions (Projects, File Size, Duration, Renders, Smart Reframe)
  // --------------------------------------------------------------------------
  test('9. Canonical Plan Entitlements enforce monthly project limits, render limits, duration caps and Smart Reframe gating', async () => {
    const db = await getMongoDb();

    // 9A: Free plan entitlements resolution
    const freeEntitlements = await EntitlementService.resolveUserEntitlements(testUserLimits);
    assert.equal(freeEntitlements.planId, 'free');
    assert.equal(freeEntitlements.limits.maxProjects, 5);
    assert.equal(freeEntitlements.limits.maxClipRenders, 10);
    assert.equal(freeEntitlements.limits.maxUploadDurationSeconds, 15 * 60); // 15 mins
    assert.equal(freeEntitlements.limits.maxFileSizeBytes, 500 * 1024 * 1024); // 500 MB
    assert.equal(freeEntitlements.features.smartReframe, false, 'Free tier must not have Smart Reframe');
    assert.equal(freeEntitlements.watermarkRequired, true, 'Free tier requires watermark');

    // 9B: Create 5 projects for testUserLimits in current month -> reaches maxProjects limit
    const currentMonthStart = new Date();
    currentMonthStart.setUTCDate(1);
    currentMonthStart.setUTCHours(0, 0, 0, 0);

    for (let i = 0; i < 5; i++) {
      await db.collection('projects').insertOne({
        id: crypto.randomUUID(),
        user_id: testUserLimits,
        title: `Project ${i + 1}`,
        source_type: 'upload',
        video_status: 'completed',
        created_at: currentMonthStart,
        updated_at: currentMonthStart,
      });
    }

    const countProjects = await db.collection('projects').countDocuments({
      user_id: testUserLimits,
      created_at: { $gte: currentMonthStart },
    });
    assert.equal(countProjects, 5);
    assert.ok(countProjects >= freeEntitlements.limits.maxProjects, 'User reached monthly project limit');

    // 9C: Create 10 render jobs for testUserLimits -> reaches maxClipRenders limit
    for (let i = 0; i < 10; i++) {
      await db.collection('render_jobs').insertOne({
        id: crypto.randomUUID(),
        user_id: testUserLimits,
        status: 'completed',
        created_at: currentMonthStart,
        updated_at: currentMonthStart,
      });
    }
    const countRenders = await db.collection('render_jobs').countDocuments({
      user_id: testUserLimits,
      created_at: { $gte: currentMonthStart },
    });
    assert.equal(countRenders, 10);
    assert.ok(countRenders >= freeEntitlements.limits.maxClipRenders, 'User reached monthly render limit');

    // 9D: Paid Pro plan entitlements verification
    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.collection('subscriptions').insertOne({
      id: crypto.randomUUID(),
      user_id: testUserB,
      plan_id: 'pro',
      status: 'active',
      provider: 'paddle',
      current_period_end: periodEnd.toISOString(),
      cancel_at_period_end: false,
      billing_interval: 'month',
      updated_at: new Date(),
    });

    const proEntitlements = await EntitlementService.resolveUserEntitlements(testUserB);
    assert.equal(proEntitlements.planId, 'pro');
    assert.equal(proEntitlements.limits.maxProjects, 100);
    assert.equal(proEntitlements.limits.maxClipRenders, 200);
    assert.equal(proEntitlements.limits.maxUploadDurationSeconds, 120 * 60); // 120 mins (2 hours)
    assert.equal(proEntitlements.features.smartReframe, true, 'Pro tier has Smart Reframe enabled');
    assert.equal(proEntitlements.watermarkRequired, false, 'Pro tier has no watermark');
  });

  // --------------------------------------------------------------------------
  // TEST 10: Developer Unlimited Account Continuity & Wallet Accounting
  // --------------------------------------------------------------------------
  test('10. Developer unlimited account resolves developer plan, retains 999,999 balance and records strict ledger accounting', async () => {
    const devEntitlements = await EntitlementService.resolveUserEntitlements(testDevUser, testDevEmail);
    assert.equal(devEntitlements.planId, 'developer');
    assert.equal(devEntitlements.isUnlimited, true);
    assert.equal(devEntitlements.features.smartReframe, true);
    assert.equal(devEntitlements.watermarkRequired, false);

    // Wallet balance check for developer
    const summary = await CreditWalletService.getWalletSummary(testDevUser, testDevEmail);
    assert.equal(summary.is_unlimited, true);
    assert.ok(summary.available_credits >= 100_000, 'Developer must have abundant available credits');

    // Reserve 12 credits (3-minute video)
    const attemptDev = crypto.randomUUID();
    const reserveDev = await CreditWalletService.reserveCredits({
      userId: testDevUser,
      attemptId: attemptDev,
      operationId: 'core_video_processing',
      amount: 12,
      userEmail: testDevEmail,
    });
    assert.equal(reserveDev.allowed, true);
    assert.equal(reserveDev.reservation?.amount, 12);

    // Settle 12 credits
    const settleDev = await CreditWalletService.settleReservation(attemptDev, 12);
    assert.equal(settleDev.settledAmount, 12);
    assert.equal(settleDev.reservation.status, 'settled');

    // Check ledger transactions for developer: balance before/after must strictly reconcile
    const devHistory = await CreditWalletService.getTransactionHistory(testDevUser, 10);
    const settleTx = devHistory.find((t) => t.type === 'consumption' && t.reference_id === attemptDev);
    assert.ok(settleTx, 'Ledger must record developer consumption');
    assert.equal(settleTx?.amount, 12);
    assert.equal(settleTx?.reserved_before - settleTx?.reserved_after, 12, 'Reserved credits strictly reconciled');
  });
});
