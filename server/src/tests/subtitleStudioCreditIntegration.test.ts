import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import { CreditRepository } from '../db/repositories/creditRepository.js';
import { CreditWalletService } from '../services/creditWalletService.js';
import { CreditPricingService } from '../services/billing/creditPricingService.js';
import { EntitlementService } from '../services/entitlementService.js';
import { SubtitleStudioService } from '../services/subtitleStudioService.js';
import { processProjectVideo } from '../services/videoProcessingService.js';
import { ownerContext } from '../db/repositories/dataRepository.js';

describe('VireoClip Phase E: Subtitle Studio Credit Integration', () => {
  const testUserA = crypto.randomUUID();
  const testUserB = crypto.randomUUID();
  const testUserZero = crypto.randomUUID();
  const testUserFail = crypto.randomUUID();
  const testDevUser = crypto.randomUUID();
  const testDevEmail = 'vertexdigitals07@gmail.com';

  const allTestUsers = [
    testUserA,
    testUserB,
    testUserZero,
    testUserFail,
    testDevUser,
  ];

  before(async () => {
    const db = await getMongoDb();
    await db.collection('credit_wallets').deleteMany({ user_id: { $in: allTestUsers } });
    await db.collection('credit_transactions').deleteMany({ user_id: { $in: allTestUsers } });
    await db.collection('credit_reservations').deleteMany({ user_id: { $in: allTestUsers } });
    await db.collection('projects').deleteMany({ user_id: { $in: allTestUsers } });
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
      await db.collection('transcripts').deleteMany({ user_id: { $in: allTestUsers } });
      await db.collection('subscriptions').deleteMany({ user_id: { $in: allTestUsers } });
    } finally {
      await closeMongo(true);
    }
  });

  // --------------------------------------------------------------------------
  // TEST 1: Duration-based pricing formula & 15-second intervals
  // --------------------------------------------------------------------------
  test('1. Subtitle Studio duration-based pricing enforces 1 credit per 15s interval, rounding up, min 1 credit', () => {
    // 5 seconds -> 1 interval of 15s -> 1 credit (min 1)
    const cost5s = CreditPricingService.calculateCoreProcessingCost(5);
    assert.equal(cost5s.credits, 1);
    assert.equal(cost5s.units, 0.25); // 15 / 60 = 0.25 min

    // 15 seconds -> 1 credit
    const cost15s = CreditPricingService.calculateCoreProcessingCost(15);
    assert.equal(cost15s.credits, 1);
    assert.equal(cost15s.units, 0.25);

    // 16 seconds -> 2 credits
    const cost16s = CreditPricingService.calculateCoreProcessingCost(16);
    assert.equal(cost16s.credits, 2);
    assert.equal(cost16s.units, 0.5);

    // 30 seconds -> 2 credits
    const cost30s = CreditPricingService.calculateCoreProcessingCost(30);
    assert.equal(cost30s.credits, 2);
    assert.equal(cost30s.units, 0.5);

    // 31 seconds -> 3 credits
    const cost31s = CreditPricingService.calculateCoreProcessingCost(31);
    assert.equal(cost31s.credits, 3);
    assert.equal(cost31s.units, 0.75);

    // 60 seconds -> 4 credits
    const cost60s = CreditPricingService.calculateCoreProcessingCost(60);
    assert.equal(cost60s.credits, 4);
    assert.equal(cost60s.units, 1);

    // 90 seconds -> 6 credits
    const cost90s = CreditPricingService.calculateCoreProcessingCost(90);
    assert.equal(cost90s.credits, 6);
    assert.equal(cost90s.units, 1.5);

    // Reused transcript always returns 0 credits
    const costReused = CreditPricingService.calculateOperationCost('core_video_processing', {
      durationSeconds: 120,
      isReusedTranscript: true,
    });
    assert.equal(costReused.credits, 0);
  });

  // --------------------------------------------------------------------------
  // TEST 2: Pre-flight cost estimate
  // --------------------------------------------------------------------------
  test('2. Pre-flight cost estimate accurately reports credits and checks sufficient balance', async () => {
    // Initialize User A with 10 credits
    await CreditRepository.grantCredits({
      userId: testUserA,
      amount: 10,
      type: 'monthly_grant',
      billingPeriod: '2026-11',
      idempotencyKey: `init_grant_a_${Date.now()}`,
      description: 'Initial grant for User A',
    });

    // Estimate for 60s (requires 4 credits) -> User has 10 credits -> sufficient
    const est60 = await CreditWalletService.estimateCost(testUserA, 'core_video_processing', {
      durationSeconds: 60,
      isReusedTranscript: false,
    });
    assert.equal(est60.estimated_credits, 4);
    assert.equal(est60.available_credits, 10);
    assert.equal(est60.has_sufficient_credits, true);

    // Estimate for 180s (requires 12 credits) -> User has 10 credits -> insufficient
    const est180 = await CreditWalletService.estimateCost(testUserA, 'core_video_processing', {
      durationSeconds: 180,
      isReusedTranscript: false,
    });
    assert.equal(est180.estimated_credits, 12);
    assert.equal(est180.has_sufficient_credits, false);

    // Estimate for reused transcript -> 0 credits -> always sufficient
    const estReused = await CreditWalletService.estimateCost(testUserA, 'core_video_processing', {
      durationSeconds: 300,
      isReusedTranscript: true,
    });
    assert.equal(estReused.estimated_credits, 0);
    assert.equal(estReused.has_sufficient_credits, true);
  });

  // --------------------------------------------------------------------------
  // TEST 3: Insufficient credits rejects Subtitle Studio transcription
  // --------------------------------------------------------------------------
  test('3. Insufficient credits rejects transcription without creating reservations or modifying balance', async () => {
    // Initialize User Zero with 0 credits
    await CreditRepository.getOrCreateWallet(testUserZero);

    const project = await ownerContext.run(testUserZero, async () => {
      return SubtitleStudioService.createProject(testUserZero, {
        title: 'Zero Balance Subtitle Project',
        source_url: 'sources/test/zero_balance.mp4',
      });
    });

    const attemptId = crypto.randomUUID();
    let errorCaught: any = null;
    try {
      await ownerContext.run(testUserZero, async () => {
        await SubtitleStudioService.transcribeProject(project.id, testUserZero, attemptId);
      });
    } catch (err: any) {
      errorCaught = err;
    }

    assert.ok(errorCaught, 'Should throw error when credits are insufficient');
    assert.equal(errorCaught.statusCode, 403);
    assert.equal(errorCaught.code, 'INSUFFICIENT_CREDITS');

    // Verify wallet balance is untouched (0 available, 0 reserved, 0 consumed)
    const summary = await CreditWalletService.getWalletSummary(testUserZero);
    assert.equal(summary.available_credits, 0);
    assert.equal(summary.reserved_credits, 0);
    assert.equal(summary.period_consumed, 0);

    // Verify no reservation record exists
    const db = await getMongoDb();
    const res = await db.collection('credit_reservations').findOne({ attempt_id: attemptId });
    assert.equal(res, null);
  });

  // --------------------------------------------------------------------------
  // TEST 4: Successful transcription reservation, settlement & unused credit refund
  // --------------------------------------------------------------------------
  test('4. Atomic reservation locks credits and settling auto-refunds unused credits on shorter measured duration', async () => {
    // User A currently has 10 credits
    const attemptId = crypto.randomUUID();
    // Reserve provisional 4 credits (60s)
    const reserveRes = await CreditWalletService.reserveCredits({
      userId: testUserA,
      attemptId,
      operationId: 'core_video_processing',
      amount: 4,
      metadata: { provisionalDuration: 60, workflow: 'subtitle_studio' },
    });

    assert.equal(reserveRes.allowed, true);
    assert.equal(reserveRes.wallet.available_credits, 6); // 10 - 4
    assert.equal(reserveRes.wallet.reserved_credits, 4);

    // Actual video measured only 20s (requires 2 credits: 2x 15s)
    const settleRes = await CreditWalletService.settleReservation(attemptId, 2, {
      actualDurationSeconds: 20,
      workflow: 'subtitle_studio',
    });

    assert.equal(settleRes.settledAmount, 2);
    assert.equal(settleRes.reservation.status, 'settled');
    assert.equal(settleRes.reservation.settled_amount, 2);

    // Wallet check: 6 + 2 refunded = 8 available, 0 reserved, 2 consumed
    assert.equal(settleRes.wallet.available_credits, 8);
    assert.equal(settleRes.wallet.reserved_credits, 0);
    assert.equal(settleRes.wallet.period_consumed, 2);

    // Verify transaction ledger has settlement and unused refund
    const history = await CreditWalletService.getTransactionHistory(testUserA, 10);
    const settleTx = history.find((t) => t.type === 'consumption' && t.reference_id === attemptId);
    assert.ok(settleTx, 'Ledger must record consumption transaction');
    assert.equal(settleTx?.metadata?.refund_unused, 2, 'Metadata must record 2 unused credits refunded');
  });

  // --------------------------------------------------------------------------
  // TEST 5: AI Clipping -> Subtitle Studio cross-workflow transcript reuse (0 credits)
  // --------------------------------------------------------------------------
  test('5. AI Clipping -> Subtitle Studio cross-workflow transcript reuse charges 0 credits', async () => {
    const db = await getMongoDb();
    const clipProjectId = crypto.randomUUID();
    const sourceVideoUrl = `sources/${testUserA}/${clipProjectId}/podcast_interview.mp4`;

    // 1. Create project in projects table (as if created via AI clipping)
    await db.collection('projects').insertOne({
      id: clipProjectId,
      user_id: testUserA,
      title: 'AI Clipping Podcast',
      source_type: 'upload',
      source_url: sourceVideoUrl,
      video_status: 'transcribed',
      duration_seconds: 90,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // 2. Insert existing transcript into transcripts table
    const sampleWords = [
      { id: 'w1', word: 'Welcome', start: 0.1, end: 0.5 },
      { id: 'w2', word: 'to', start: 0.6, end: 0.8 },
      { id: 'w3', word: 'the', start: 0.9, end: 1.1 },
      { id: 'w4', word: 'show', start: 1.2, end: 1.6 },
    ];
    await db.collection('transcripts').insertOne({
      id: crypto.randomUUID(),
      project_id: clipProjectId,
      user_id: testUserA,
      transcript_text: 'Welcome to the show',
      text: 'Welcome to the show',
      language: 'en',
      duration_seconds: 90,
      segments: [
        { id: 0, start: 0.1, end: 1.6, text: 'Welcome to the show', words: sampleWords },
      ],
      words: sampleWords,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Record User A balance before Subtitle Studio access
    const balanceBefore = (await CreditWalletService.getWalletSummary(testUserA)).available_credits;

    // 3. User opens / transcribes this project in Subtitle Studio
    const transcribeResult = await ownerContext.run(testUserA, async () => {
      return SubtitleStudioService.transcribeProject(clipProjectId, testUserA);
    });

    // Verify 0 credits charged
    assert.equal(transcribeResult.isReusedTranscript, true);
    assert.equal(transcribeResult.creditsCharged, 0);
    assert.ok(transcribeResult.cues.length > 0, 'Must extract cues from existing transcript');
    assert.equal(transcribeResult.cues[0].text, 'Welcome to the show');

    // Verify wallet balance is completely unchanged
    const balanceAfter = (await CreditWalletService.getWalletSummary(testUserA)).available_credits;
    assert.equal(balanceAfter, balanceBefore);
  });

  // --------------------------------------------------------------------------
  // TEST 6: Subtitle Studio -> AI Clipping cross-workflow transcript reuse (0 credits)
  // --------------------------------------------------------------------------
  test('6. Subtitle Studio -> AI Clipping cross-workflow transcript reuse charges 0 credits', async () => {
    const db = await getMongoDb();
    const subProjectId = crypto.randomUUID();
    const sourceVideoUrl = `sources/${testUserA}/${subProjectId}/webinar_talk.mp4`;

    // 1. Create project via Subtitle Studio
    await db.collection('projects').insertOne({
      id: subProjectId,
      user_id: testUserA,
      title: 'Subtitle Studio Webinar',
      source_type: 'upload',
      source_url: sourceVideoUrl,
      video_status: 'transcribed',
      project_type: 'subtitles',
      duration_seconds: 120,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // 2. Transcript was stored by Subtitle Studio
    const sampleWords = [
      { id: 'w1', word: 'Artificial', start: 0.2, end: 0.7 },
      { id: 'w2', word: 'Intelligence', start: 0.8, end: 1.5 },
    ];
    await db.collection('transcripts').insertOne({
      id: crypto.randomUUID(),
      project_id: subProjectId,
      user_id: testUserA,
      transcript_text: 'Artificial Intelligence',
      text: 'Artificial Intelligence',
      language: 'en',
      duration_seconds: 120,
      segments: [
        { id: 0, start: 0.2, end: 1.5, text: 'Artificial Intelligence', words: sampleWords },
      ],
      words: sampleWords,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // 3. User now runs AI Clipping processProjectVideo on this project
    const attemptId = crypto.randomUUID();
    // In AI Clipping, reserve 0 credits because transcript is already present
    await CreditWalletService.reserveCredits({
      userId: testUserA,
      attemptId,
      operationId: 'core_video_processing',
      amount: 0,
      metadata: { isReusedTranscript: true },
    });

    const balanceBefore = (await CreditWalletService.getWalletSummary(testUserA)).available_credits;

    const result = await processProjectVideo(subProjectId, testUserA, sourceVideoUrl, attemptId);

    assert.equal(result.status, 'transcribed');
    assert.ok(result.transcript);
    assert.equal(result.transcript.transcript_text, 'Artificial Intelligence');

    // Balance remains untouched
    const balanceAfter = (await CreditWalletService.getWalletSummary(testUserA)).available_credits;
    assert.equal(balanceAfter, balanceBefore);
  });

  // --------------------------------------------------------------------------
  // TEST 7: Cross-Project Same-User Reuse by Source Video URL
  // --------------------------------------------------------------------------
  test('7. Same user reusing the same source video across different projects incurs 0 credits', async () => {
    const db = await getMongoDb();
    const sourceVideoUrl = `sources/${testUserA}/shared_folder/common_video.mp4`;

    // Project 1 already transcribed
    const proj1Id = crypto.randomUUID();
    await db.collection('projects').insertOne({
      id: proj1Id,
      user_id: testUserA,
      title: 'Project 1 Original',
      source_type: 'upload',
      source_url: sourceVideoUrl,
      video_status: 'transcribed',
      duration_seconds: 60,
      created_at: new Date(),
      updated_at: new Date(),
    });

    await db.collection('transcripts').insertOne({
      id: crypto.randomUUID(),
      project_id: proj1Id,
      user_id: testUserA,
      transcript_text: 'Cross project reuse test',
      text: 'Cross project reuse test',
      language: 'en',
      duration_seconds: 60,
      segments: [{ id: 0, start: 0, end: 2, text: 'Cross project reuse test' }],
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Project 2 created with the SAME source_url by the SAME user
    const proj2Id = crypto.randomUUID();
    await db.collection('projects').insertOne({
      id: proj2Id,
      user_id: testUserA,
      title: 'Project 2 Reusing Video',
      source_type: 'upload',
      source_url: sourceVideoUrl,
      video_status: 'uploaded',
      project_type: 'subtitles',
      duration_seconds: 60,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const balanceBefore = (await CreditWalletService.getWalletSummary(testUserA)).available_credits;

    // Transcribe Project 2
    const result = await ownerContext.run(testUserA, async () => {
      return SubtitleStudioService.transcribeProject(proj2Id, testUserA);
    });

    assert.equal(result.isReusedTranscript, true);
    assert.equal(result.creditsCharged, 0);

    const balanceAfter = (await CreditWalletService.getWalletSummary(testUserA)).available_credits;
    assert.equal(balanceAfter, balanceBefore);
  });

  // --------------------------------------------------------------------------
  // TEST 8: Strict Tenant Isolation across Different Users
  // --------------------------------------------------------------------------
  test('8. Strict tenant isolation: User B cannot reuse User A transcript for free even with same source URL', async () => {
    const db = await getMongoDb();
    const sharedSourceUrl = `sources/public_bucket/viral_lecture.mp4`;

    // User A transcribed this video
    const userAProjId = crypto.randomUUID();
    await db.collection('projects').insertOne({
      id: userAProjId,
      user_id: testUserA,
      title: 'User A Lecture',
      source_type: 'upload',
      source_url: sharedSourceUrl,
      video_status: 'transcribed',
      duration_seconds: 60,
      created_at: new Date(),
      updated_at: new Date(),
    });

    await db.collection('transcripts').insertOne({
      id: crypto.randomUUID(),
      project_id: userAProjId,
      user_id: testUserA,
      transcript_text: 'User A private transcript',
      text: 'User A private transcript',
      language: 'en',
      duration_seconds: 60,
      segments: [{ id: 0, start: 0, end: 2, text: 'User A private transcript' }],
      created_at: new Date(),
      updated_at: new Date(),
    });

    // User B creates a project with the same source_url
    const userBProjId = crypto.randomUUID();
    await db.collection('projects').insertOne({
      id: userBProjId,
      user_id: testUserB,
      title: 'User B Same Video',
      source_type: 'upload',
      source_url: sharedSourceUrl,
      video_status: 'uploaded',
      project_type: 'subtitles',
      duration_seconds: 60,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Check findReusableTranscript for User B -> must return null!
    const reusableForUserB = await SubtitleStudioService.findReusableTranscript(
      testUserB,
      userBProjId,
      sharedSourceUrl
    );
    assert.equal(reusableForUserB, null, 'Tenant isolation violation: User B must not access User A transcript');

    // Cost estimate for User B must be 4 credits, NOT 0 credits
    const estUserB = CreditPricingService.calculateOperationCost('core_video_processing', {
      durationSeconds: 60,
      isReusedTranscript: Boolean(reusableForUserB),
    });
    assert.equal(estUserB.credits, 4, 'User B must be charged standard duration rate');
  });

  // --------------------------------------------------------------------------
  // TEST 9: Zero-Cost Subtitle Studio Operations
  // --------------------------------------------------------------------------
  test('9. Subtitle editing, styling, and exports remain strictly free (0 credits)', async () => {
    const db = await getMongoDb();
    const projId = crypto.randomUUID();

    // Create a transcribed subtitle project
    await db.collection('projects').insertOne({
      id: projId,
      user_id: testUserA,
      title: 'Zero Cost Ops Project',
      source_type: 'upload',
      source_url: 'sources/test/zero_ops.mp4',
      video_status: 'transcribed',
      project_type: 'subtitles',
      duration_seconds: 45,
      subtitle_cues: [
        { id: 'c1', start: 0, end: 2, text: 'Original line 1' },
        { id: 'c2', start: 2.1, end: 4, text: 'Original line 2' },
      ],
      created_at: new Date(),
      updated_at: new Date(),
    });

    const balanceBefore = (await CreditWalletService.getWalletSummary(testUserA)).available_credits;

    // 1. Update cues
    const updatedCues = await ownerContext.run(testUserA, async () => {
      return SubtitleStudioService.updateCues(projId, testUserA, [
        { id: 'c1', start: 0, end: 2, text: 'Edited line 1' },
        { id: 'c2', start: 2.1, end: 4.5, text: 'Edited line 2 extended' },
        { id: 'c3', start: 4.6, end: 6.0, text: 'Added line 3' },
      ]);
    });
    assert.equal(updatedCues.length, 3);

    // 2. Update style
    const updatedStyle = await ownerContext.run(testUserA, async () => {
      return SubtitleStudioService.updateStyle(projId, testUserA, {
        preset: 'clean',
        fontSize: 48,
        textColor: '#00FFFF',
        highlightColor: '#FF007F',
      });
    });
    assert.equal(updatedStyle.preset, 'clean');

    // 3. Export SRT
    const srt = await ownerContext.run(testUserA, async () => {
      return SubtitleStudioService.exportSRT(projId, testUserA);
    });
    assert.ok(srt.includes('Edited line 1'));
    assert.ok(srt.includes('Added line 3'));

    // 4. Export VTT
    const vtt = await ownerContext.run(testUserA, async () => {
      return SubtitleStudioService.exportVTT(projId, testUserA);
    });
    assert.ok(vtt.startsWith('WEBVTT'));
    assert.ok(vtt.includes('Edited line 1'));

    // Verify wallet balance is 100% untouched
    const balanceAfter = (await CreditWalletService.getWalletSummary(testUserA)).available_credits;
    assert.equal(balanceAfter, balanceBefore);
  });

  // --------------------------------------------------------------------------
  // TEST 10: Transcription Pipeline Failure Releases 100% of Reserved Credits
  // --------------------------------------------------------------------------
  test('10. Pipeline failure releases 100% of reserved credits with complete wallet restoration', async () => {
    // Grant User Fail 10 credits
    await CreditRepository.grantCredits({
      userId: testUserFail,
      amount: 10,
      type: 'manual_adjustment',
      idempotencyKey: `grant_fail_${Date.now()}`,
      description: 'Grant for failure testing',
    });

    const attemptId = crypto.randomUUID();
    // Provisionally reserve 4 credits
    const res = await CreditWalletService.reserveCredits({
      userId: testUserFail,
      attemptId,
      operationId: 'core_video_processing',
      amount: 4,
    });
    assert.equal(res.allowed, true);
    assert.equal(res.wallet.available_credits, 6);
    assert.equal(res.wallet.reserved_credits, 4);

    // Simulate pipeline failure
    const releaseRes = await CreditWalletService.releaseReservation(
      attemptId,
      'Whisper API 500 error simulated'
    );

    assert.equal(releaseRes.reservation.status, 'released');
    assert.equal(releaseRes.wallet.available_credits, 10); // Fully restored!
    assert.equal(releaseRes.wallet.reserved_credits, 0);
    assert.equal(releaseRes.wallet.period_consumed, 0);
  });

  // --------------------------------------------------------------------------
  // TEST 11: Plan Entitlements Limit Enforcement in Subtitle Studio
  // --------------------------------------------------------------------------
  test('11. Plan Entitlements limits: Upload duration limit rejects oversized videos with 403', async () => {
    const db = await getMongoDb();
    const projId = crypto.randomUUID();

    // Create user on Free plan (maxUploadDurationSeconds = 60s)
    const entitlements = await EntitlementService.resolveUserEntitlements(testUserA);
    const maxAllowedSec = entitlements.limits.maxUploadDurationSeconds;

    // Project has duration exceeding the plan limit
    await db.collection('projects').insertOne({
      id: projId,
      user_id: testUserA,
      title: 'Oversized Video Project',
      source_type: 'upload',
      source_url: 'sources/test/oversized.mp4',
      video_status: 'uploaded',
      project_type: 'subtitles',
      duration_seconds: maxAllowedSec + 300,
      created_at: new Date(),
      updated_at: new Date(),
    });

    let error: any = null;
    try {
      await ownerContext.run(testUserA, async () => {
        await SubtitleStudioService.transcribeProject(projId, testUserA);
      });
    } catch (err: any) {
      error = err;
    }

    assert.ok(error, 'Should reject video exceeding plan upload duration limit');
    assert.equal(error.statusCode, 403);
    assert.equal(error.code, 'DURATION_LIMIT_EXCEEDED');
  });

  // --------------------------------------------------------------------------
  // TEST 12: Developer Unlimited Account Continuity
  // --------------------------------------------------------------------------
  test('12. Developer unlimited accounts get auto-refill, bypass depletion, and ledger accurately records operations', async () => {
    // Resolve entitlements for dev user
    const devEntitlements = await EntitlementService.resolveUserEntitlements(testDevUser, testDevEmail);
    assert.equal(devEntitlements.isUnlimited, true);

    const devWallet = await CreditWalletService.getWalletSummary(testDevUser, testDevEmail);
    assert.equal(devWallet.is_unlimited, true);
    assert.equal(devWallet.available_credits, 999999);

    const attemptId = crypto.randomUUID();
    const reserveRes = await CreditWalletService.reserveCredits({
      userId: testDevUser,
      attemptId,
      operationId: 'core_video_processing',
      amount: 4,
      userEmail: testDevEmail,
    });
    assert.equal(reserveRes.allowed, true);

    const settleRes = await CreditWalletService.settleReservation(attemptId, 4, {
      workflow: 'subtitle_studio',
    });
    assert.equal(settleRes.settledAmount, 4);

    const updatedSummary = await CreditWalletService.getWalletSummary(testDevUser, testDevEmail);
    assert.equal(updatedSummary.is_unlimited, true);
  });
});
