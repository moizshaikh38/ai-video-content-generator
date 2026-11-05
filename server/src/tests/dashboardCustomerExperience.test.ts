import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import { EntitlementService } from '../services/entitlementService.js';
import { CreditWalletService } from '../services/creditWalletService.js';
import { CreditPricingService } from '../services/billing/creditPricingService.js';
import { WatermarkService } from '../services/watermarkService.js';
import { SubtitleStudioService } from '../services/subtitleStudioService.js';
import { ownerContext } from '../db/repositories/dataRepository.js';

describe('VireoClip Phase G: Dashboard & Customer Experience Integration Test Suite', () => {
  const freeUserId = crypto.randomUUID();
  const freeUserEmail = 'phase_g_free@example.com';

  const creatorUserId = crypto.randomUUID();
  const creatorUserEmail = 'phase_g_creator@example.com';

  const proUserId = crypto.randomUUID();
  const proUserEmail = 'phase_g_pro@example.com';

  const studioUserId = crypto.randomUUID();
  const studioUserEmail = 'phase_g_studio@example.com';

  const developerUserId = crypto.randomUUID();
  const developerUserEmail = 'vertexdigitals07@gmail.com';

  const downgradedUserId = crypto.randomUUID();
  const downgradedUserEmail = 'phase_g_downgraded@example.com';

  const allTestUsers = [
    freeUserId,
    creatorUserId,
    proUserId,
    studioUserId,
    developerUserId,
    downgradedUserId,
  ];

  before(async () => {
    const db = await getMongoDb();
    await db.collection('credit_wallets').deleteMany({ user_id: { $in: allTestUsers } });
    await db.collection('credit_transactions').deleteMany({ user_id: { $in: allTestUsers } });
    await db.collection('credit_reservations').deleteMany({ user_id: { $in: allTestUsers } });
    await db.collection('projects').deleteMany({ user_id: { $in: allTestUsers } });
    await db.collection('clips').deleteMany({ user_id: { $in: allTestUsers } });
    await db.collection('subscriptions').deleteMany({ user_id: { $in: allTestUsers } });
    await db.collection('profiles').deleteMany({ id: { $in: allTestUsers } });

    // Seed mock profiles matching schema
    const now = new Date();
    await db.collection('profiles').insertMany([
      { id: freeUserId, user_id: freeUserId, email: freeUserEmail, created_at: now },
      { id: creatorUserId, user_id: creatorUserId, email: creatorUserEmail, created_at: now },
      { id: proUserId, user_id: proUserId, email: proUserEmail, created_at: now },
      { id: studioUserId, user_id: studioUserId, email: studioUserEmail, created_at: now },
      { id: developerUserId, user_id: developerUserId, email: developerUserEmail, created_at: now },
      { id: downgradedUserId, user_id: downgradedUserId, email: downgradedUserEmail, created_at: now },
    ]);

    // Seed active subscriptions for paid users with unique provider_subscription_id
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);

    await db.collection('subscriptions').insertMany([
      {
        id: crypto.randomUUID(),
        user_id: creatorUserId,
        plan_id: 'creator',
        status: 'active',
        billing_interval: 'month',
        provider: 'stripe',
        provider_subscription_id: `sub_creator_${crypto.randomUUID()}`,
        cancel_at_period_end: false,
        current_period_end: futureDate.toISOString(),
        created_at: now,
        updated_at: now,
      },
      {
        id: crypto.randomUUID(),
        user_id: proUserId,
        plan_id: 'pro',
        status: 'active',
        billing_interval: 'month',
        provider: 'stripe',
        provider_subscription_id: `sub_pro_${crypto.randomUUID()}`,
        cancel_at_period_end: false,
        current_period_end: futureDate.toISOString(),
        created_at: now,
        updated_at: now,
      },
      {
        id: crypto.randomUUID(),
        user_id: studioUserId,
        plan_id: 'studio',
        status: 'active',
        billing_interval: 'month',
        provider: 'stripe',
        provider_subscription_id: `sub_studio_${crypto.randomUUID()}`,
        cancel_at_period_end: false,
        current_period_end: futureDate.toISOString(),
        created_at: now,
        updated_at: now,
      },
      {
        id: crypto.randomUUID(),
        user_id: downgradedUserId,
        plan_id: 'creator',
        status: 'canceled',
        billing_interval: 'month',
        provider: 'stripe',
        provider_subscription_id: `sub_down_${crypto.randomUUID()}`,
        cancel_at_period_end: false,
        current_period_end: new Date(Date.now() - 1000).toISOString(),
        created_at: new Date(Date.now() - 60 * 86400000),
        updated_at: new Date(Date.now() - 30 * 86400000),
      },
    ]);
  });

  after(async () => {
    try {
      const db = await getMongoDb();
      await db.collection('credit_wallets').deleteMany({ user_id: { $in: allTestUsers } });
      await db.collection('credit_transactions').deleteMany({ user_id: { $in: allTestUsers } });
      await db.collection('credit_reservations').deleteMany({ user_id: { $in: allTestUsers } });
      await db.collection('projects').deleteMany({ user_id: { $in: allTestUsers } });
      await db.collection('clips').deleteMany({ user_id: { $in: allTestUsers } });
      await db.collection('subscriptions').deleteMany({ user_id: { $in: allTestUsers } });
      await db.collection('profiles').deleteMany({ id: { $in: allTestUsers } });
    } finally {
      await closeMongo(true);
    }
  });

  test('Test 1: Canonical PlanEntitlements provides all 4 commercial tiers with provisional allowances and limits', async () => {
    const allPlans = EntitlementService.getAllPlans();
    assert.strictEqual(allPlans.length, 4, 'Must return 4 customer tiers: Free, Creator, Pro, Studio');

    const planIds = allPlans.map((p) => p.planId);
    assert.deepStrictEqual(planIds, ['free', 'creator', 'pro', 'studio']);

    // Validate provisional monthly allowances
    const freePlan = allPlans.find((p) => p.planId === 'free')!;
    const creatorPlan = allPlans.find((p) => p.planId === 'creator')!;
    const proPlan = allPlans.find((p) => p.planId === 'pro')!;
    const studioPlan = allPlans.find((p) => p.planId === 'studio')!;

    assert.strictEqual(freePlan.monthlyCredits, 60, 'Free provisional allowance is 60 credits/mo');
    assert.strictEqual(creatorPlan.monthlyCredits, 500, 'Creator provisional allowance is 500 credits/mo');
    assert.strictEqual(proPlan.monthlyCredits, 1500, 'Pro provisional allowance is 1500 credits/mo');
    assert.strictEqual(studioPlan.monthlyCredits, 4000, 'Studio provisional allowance is 4000 credits/mo');

    // Validate watermark requirements
    assert.strictEqual(freePlan.watermarkRequired, true, 'Free plan requires permanent watermark');
    assert.strictEqual(creatorPlan.watermarkRequired, false, 'Creator plan does not require watermark');
    assert.strictEqual(proPlan.watermarkRequired, false, 'Pro plan does not require watermark');
    assert.strictEqual(studioPlan.watermarkRequired, false, 'Studio plan does not require watermark');

    // Validate subtitle preset restrictions
    assert.deepStrictEqual(freePlan.allowedSubtitlePresets, ['simple', 'clean', 'none']);
    assert.ok(creatorPlan.allowedSubtitlePresets.length >= 9, 'Creator has 9+ viral presets');
    assert.ok(proPlan.allowedSubtitlePresets.includes('*') || proPlan.allowedSubtitlePresets.length >= 9);
    assert.ok(studioPlan.allowedSubtitlePresets.includes('*') || studioPlan.allowedSubtitlePresets.length >= 9);
  });

  test('Test 2: Entitlement resolution for Free, Creator, Pro, Studio, and Developer accounts maps correctly', async () => {
    const freeEnt = await EntitlementService.resolveUserEntitlements(freeUserId, freeUserEmail);
    assert.strictEqual(freeEnt.planId, 'free');
    assert.strictEqual(freeEnt.watermarkRequired, true);
    assert.strictEqual(freeEnt.isUnlimited, false);

    const creatorEnt = await EntitlementService.resolveUserEntitlements(creatorUserId, creatorUserEmail);
    assert.strictEqual(creatorEnt.planId, 'creator');
    assert.strictEqual(creatorEnt.watermarkRequired, false);

    const proEnt = await EntitlementService.resolveUserEntitlements(proUserId, proUserEmail);
    assert.strictEqual(proEnt.planId, 'pro');
    assert.strictEqual(proEnt.watermarkRequired, false);
    assert.strictEqual(proEnt.features.advancedEditor, true);

    const studioEnt = await EntitlementService.resolveUserEntitlements(studioUserId, studioUserEmail);
    assert.strictEqual(studioEnt.planId, 'studio');
    assert.strictEqual(studioEnt.features.multiBrandKits, true);
    assert.strictEqual(studioEnt.features.priorityQueue, true);

    const devEnt = await EntitlementService.resolveUserEntitlements(developerUserId, developerUserEmail);
    assert.strictEqual(devEnt.isUnlimited, true);
    assert.strictEqual(devEnt.watermarkRequired, false);
  });

  test('Test 3: Pre-flight credit estimate reflects 1 credit per 15s interval, min 1 credit, and zero-cost reuse', async () => {
    // 10s video -> 1 interval = 1 credit (min 1)
    const est10 = CreditPricingService.calculateCoreProcessingCost(10);
    assert.strictEqual(est10.credits, 1);

    // 45s video -> 3 intervals = 3 credits
    const est45 = CreditPricingService.calculateCoreProcessingCost(45);
    assert.strictEqual(est45.credits, 3);

    // 46s video -> 4 intervals (ceiling) = 4 credits
    const est46 = CreditPricingService.calculateCoreProcessingCost(46);
    assert.strictEqual(est46.credits, 4);

    // Reused transcript calculation -> 0 credits
    const estReuse = CreditPricingService.calculateOperationCost('core_video_processing', {
      durationSeconds: 120,
      isReusedTranscript: true,
    });
    assert.strictEqual(estReuse.credits, 0);

    // Full estimate object
    const fullEst = CreditPricingService.estimateOperation(
      'core_video_processing',
      { durationSeconds: 60 },
      100
    );
    assert.strictEqual(fullEst.estimated_credits, 4);
    assert.strictEqual(fullEst.has_sufficient_credits, true);
  });

  test('Test 4: Customer wallet balance reflects available, reserved, and consumed credits during reservation lifecycle', async () => {
    // 1. Grant monthly allowance for Free user (60 credits)
    await CreditWalletService.grantMonthlyAllowance(
      freeUserId,
      'free',
      60,
      `cycle_${crypto.randomUUID()}`
    );

    let summary = await CreditWalletService.getWalletSummary(freeUserId, freeUserEmail);
    assert.strictEqual(summary.available_credits, 60);
    assert.strictEqual(summary.reserved_credits, 0);
    assert.strictEqual(summary.period_consumed, 0);

    // 2. Reserve 4 credits for a 60s video
    const attemptId = `test_att_${crypto.randomUUID()}`;
    const reservationResult = await CreditWalletService.reserveCredits({
      userId: freeUserId,
      attemptId,
      operationId: 'core_video_processing',
      amount: 4,
      userEmail: freeUserEmail,
    });
    assert.strictEqual(reservationResult.allowed, true);

    summary = await CreditWalletService.getWalletSummary(freeUserId, freeUserEmail);
    assert.strictEqual(summary.available_credits, 56, 'Available must be 56 after 4 reserved');
    assert.strictEqual(summary.reserved_credits, 4, 'Reserved must be 4');
    assert.strictEqual(summary.period_consumed, 0, 'Consumed remains 0 until settlement');

    // 3. Settle 3 credits (video was 44s, actual cost 3 credits, 1 refunded)
    await CreditWalletService.settleReservation(
      attemptId,
      3,
      'Settlement for 44s source video (1 credit refunded)'
    );

    summary = await CreditWalletService.getWalletSummary(freeUserId, freeUserEmail);
    assert.strictEqual(summary.available_credits, 57, 'Available must be 57 (56 + 1 refund)');
    assert.strictEqual(summary.reserved_credits, 0, 'Reserved must return to 0');
    assert.strictEqual(summary.period_consumed, 3, 'Consumed must be 3');
  });

  test('Test 5: Transaction ledger history records all transaction types with full auditing columns', async () => {
    const transactions = await CreditWalletService.getTransactionHistory(freeUserId, 20);
    assert.ok(transactions.length >= 3, 'Should have grant, reservation, and settlement records');

    const grantTx = transactions.find((t) => t.type === 'grant' || t.type === 'monthly_grant');
    assert.ok(grantTx, 'Must have grant ledger record');
    assert.strictEqual(grantTx.amount, 60);
    assert.strictEqual(grantTx.balance_after, 60);
    assert.strictEqual(grantTx.reserved_after, 0);

    const reserveTx = transactions.find((t) => t.type === 'reservation');
    assert.ok(reserveTx, 'Must have reservation ledger record');
    assert.strictEqual(Math.abs(reserveTx.amount), 4);
    assert.strictEqual(reserveTx.balance_after, 56);
    assert.strictEqual(reserveTx.reserved_after, 4);

    const settleTx = transactions.find((t) => t.type === 'settlement' || t.type === 'consumption');
    assert.ok(settleTx, 'Must have settlement/consumption ledger record');
    assert.strictEqual(Math.abs(settleTx.amount), 3);
    assert.strictEqual(settleTx.balance_after, 57);
    assert.strictEqual(settleTx.reserved_after, 0);
  });

  test('Test 6: Subtitle preset restrictions allow standard presets for Free and enforce Creator+ tier gating', async () => {
    let freeProjId = '';
    await ownerContext.run(freeUserId, async () => {
      const freeProj = await SubtitleStudioService.createProject(freeUserId, {
        title: 'Free Subtitle Project',
        source_url: 'https://example.com/test.mp4',
      });
      freeProjId = freeProj.id;
    });

    // Free user applying 'clean' -> Allowed
    await ownerContext.run(freeUserId, async () => {
      const updatedClean = await SubtitleStudioService.updateStyle(
        freeProjId,
        freeUserId,
        {
          preset: 'clean',
          fontFamily: 'Inter',
          fontSize: 38,
          fontWeight: '600',
          textColor: '#FFFFFF',
          highlightColor: '#60A5FA',
          boxEnabled: false,
          position: 'bottom',
          alignment: 'center',
        }
      );
      assert.strictEqual(updatedClean.preset, 'clean');
    });

    // Free user applying 'hormozi' -> Blocked with PRESET_RESTRICTED
    await assert.rejects(
      async () => {
        await ownerContext.run(freeUserId, async () => {
          await SubtitleStudioService.updateStyle(
            freeProjId,
            freeUserId,
            {
              preset: 'hormozi',
              fontFamily: 'Montserrat',
              fontSize: 48,
              fontWeight: '800',
              textColor: '#FFFFFF',
              highlightColor: '#FACC15',
              boxEnabled: false,
              position: 'bottom',
              alignment: 'center',
            }
          );
        });
      },
      (err: any) => {
        assert.ok(
          err.message.includes('not available on your current') || err.code === 'PRESET_RESTRICTED'
        );
        return true;
      }
    );

    // Creator user applying 'hormozi' -> Allowed
    let creatorProjId = '';
    await ownerContext.run(creatorUserId, async () => {
      const creatorProj = await SubtitleStudioService.createProject(creatorUserId, {
        title: 'Creator Subtitle Project',
        source_url: 'https://example.com/test_creator.mp4',
      });
      creatorProjId = creatorProj.id;

      const updatedHormozi = await SubtitleStudioService.updateStyle(
        creatorProjId,
        creatorUserId,
        {
          preset: 'hormozi',
          fontFamily: 'Montserrat',
          fontSize: 48,
          fontWeight: '800',
          textColor: '#FFFFFF',
          highlightColor: '#FACC15',
          boxEnabled: false,
          position: 'bottom',
          alignment: 'center',
        }
      );
      assert.strictEqual(updatedHormozi.preset, 'hormozi');
    });
  });

  test('Test 7: Watermark status badge transparency accurately distinguishes between Free and Paid exports', async () => {
    // Free plan requires watermark
    const freeShouldWatermark = await WatermarkService.shouldWatermark(freeUserId, freeUserEmail);
    assert.strictEqual(freeShouldWatermark, true, 'Free plan exports must be watermarked');

    // Creator plan produces clean exports
    const creatorShouldWatermark = await WatermarkService.shouldWatermark(creatorUserId, creatorUserEmail);
    assert.strictEqual(creatorShouldWatermark, false, 'Creator plan exports must be clean (unwatermarked)');
  });

  test('Test 8: Downgrade scenario detects un-watermarked exports on downgraded accounts requiring re-render', async () => {
    const downgradedEnt = await EntitlementService.resolveUserEntitlements(downgradedUserId, downgradedUserEmail);
    assert.strictEqual(downgradedEnt.planId, 'free', 'Canceled subscription must resolve to Free plan');
    assert.strictEqual(downgradedEnt.watermarkRequired, true);

    // Attempting to download the clean export without watermarking must trigger commercial downgrade gate
    assert.throws(
      () => {
        WatermarkService.assertExportAccess(
          downgradedEnt,
          { is_watermarked: false } // clean export produced under former paid tier
        );
      },
      (err: any) => {
        assert.strictEqual(err.code, 'WATERMARK_REQUIRED_RERENDER');
        assert.ok(err.message.includes('re-render this video to view or download'));
        return true;
      }
    );
  });

  test('Test 9: Storage and upload limits enforce tier quotas transparently', async () => {
    const freeEnt = await EntitlementService.resolveUserEntitlements(freeUserId, freeUserEmail);
    const creatorEnt = await EntitlementService.resolveUserEntitlements(creatorUserId, creatorUserEmail);
    const proEnt = await EntitlementService.resolveUserEntitlements(proUserId, proUserEmail);
    const studioEnt = await EntitlementService.resolveUserEntitlements(studioUserId, studioUserEmail);

    // Free duration cap: 15 min (900s)
    assert.strictEqual(freeEnt.limits.maxUploadDurationSeconds, 900);
    // Creator duration cap: 60 min (3600s)
    assert.strictEqual(creatorEnt.limits.maxUploadDurationSeconds, 3600);
    // Pro duration cap: 120 min (7200s)
    assert.strictEqual(proEnt.limits.maxUploadDurationSeconds, 7200);
    // Studio duration cap: 240 min (14400s)
    assert.strictEqual(studioEnt.limits.maxUploadDurationSeconds, 14400);

    // Free file size: 500MB
    assert.strictEqual(freeEnt.limits.maxFileSizeBytes, 500 * 1024 * 1024);
    // Creator file size: 2GB
    assert.strictEqual(creatorEnt.limits.maxFileSizeBytes, 2 * 1024 * 1024 * 1024);
  });

  test('Test 10: Atomic safety guarantee verifies automatic refund of unconsumed credits upon job failure', async () => {
    const beforeSummary = await CreditWalletService.getWalletSummary(freeUserId, freeUserEmail);
    const initialAvailable = beforeSummary.available_credits;

    // Reserve 5 credits for a job that later fails
    const failAttemptId = `fail_att_${crypto.randomUUID()}`;
    const failRes = await CreditWalletService.reserveCredits({
      userId: freeUserId,
      attemptId: failAttemptId,
      operationId: 'core_video_processing',
      amount: 5,
      userEmail: freeUserEmail,
    });
    assert.strictEqual(failRes.allowed, true);

    const midSummary = await CreditWalletService.getWalletSummary(freeUserId, freeUserEmail);
    assert.strictEqual(midSummary.available_credits, initialAvailable - 5);
    assert.strictEqual(midSummary.reserved_credits, 5);

    // Job fails -> Release entire reservation with 100% refund
    await CreditWalletService.releaseReservation(
      failAttemptId,
      'System Error: Transcription service timeout, 100% credits refunded'
    );

    const afterSummary = await CreditWalletService.getWalletSummary(freeUserId, freeUserEmail);
    assert.strictEqual(afterSummary.available_credits, initialAvailable, 'All 5 reserved credits must be restored');
    assert.strictEqual(afterSummary.reserved_credits, 0);

    // Verify refund transaction in ledger
    const txHistory = await CreditWalletService.getTransactionHistory(freeUserId, 5);
    const refundTx = txHistory.find((t) => t.type === 'refund' || t.type === 'reservation_release');
    assert.ok(refundTx, 'Refund/release record must be present in ledger');
    assert.strictEqual(Math.abs(refundTx.amount), 5);
    assert.strictEqual(refundTx.balance_after, initialAvailable);
  });
});
