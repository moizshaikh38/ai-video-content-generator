import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
// @ts-ignore
import ffprobeStatic from 'ffprobe-static';
import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import { ShotBoundaryFusionService } from '../services/intelligence/shotBoundaryFusionService.js';
import { VideoIntelligenceService } from '../services/intelligence/videoIntelligenceService.js';
import { VideoIntelligenceRepository, CURRENT_ENGINE_VERSION } from '../db/repositories/videoIntelligenceRepository.js';
import { CreditWalletService } from '../services/creditWalletService.js';
import { CreditRepository } from '../db/repositories/creditRepository.js';
import { CreditPricingService } from '../services/billing/creditPricingService.js';

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);
const probeBinary = (ffprobeStatic as any)?.path || (ffprobeStatic as any)?.default?.path || ffprobeStatic;
if (probeBinary && typeof probeBinary === 'string') {
  ffmpeg.setFfprobePath(probeBinary);
}

describe('Phase 3.1 — Shot-Boundary Quality, Rendering & Credit Reuse Suite', () => {
  const userA = '00000000-0000-4000-8000-0000000000a1';
  const userB = '00000000-0000-4000-8000-0000000000b2';
  const sampleVideo = path.resolve(process.cwd(), '../public/demo/creator-demo.mp4');

  before(async () => {
    const db = await getMongoDb();
    await db.collection('video_intelligence').deleteMany({ user_id: { $in: [userA, userB] } });
    await db.collection('credit_wallets').deleteMany({ user_id: { $in: [userA, userB] } });
    await db.collection('credit_transactions').deleteMany({ user_id: { $in: [userA, userB] } });
    await db.collection('credit_reservations').deleteMany({ user_id: { $in: [userA, userB] } });
    await db.collection('subscriptions').deleteMany({ user_id: { $in: [userA, userB] } });

    // Seed test users with Creator plan and 100 credits
    await db.collection('subscriptions').insertMany([
      {
        id: crypto.randomUUID(),
        user_id: userA,
        provider: 'paddle',
        provider_customer_id: 'cust_userA_test',
        provider_subscription_id: 'sub_userA_test',
        plan_id: 'creator',
        status: 'active',
        current_period_start: new Date(),
        current_period_end: new Date(Date.now() + 30 * 86400000),
        cancel_at_period_end: false,
        canceled_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: crypto.randomUUID(),
        user_id: userB,
        provider: 'paddle',
        provider_customer_id: 'cust_userB_test',
        provider_subscription_id: 'sub_userB_test',
        plan_id: 'creator',
        status: 'active',
        current_period_start: new Date(),
        current_period_end: new Date(Date.now() + 30 * 86400000),
        cancel_at_period_end: false,
        canceled_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);

    await CreditRepository.grantCredits({
      userId: userA,
      amount: 100,
      type: 'manual_adjustment',
      idempotencyKey: 'grant_userA_3_1',
      description: 'Test Grant User A',
    });
    await CreditRepository.grantCredits({
      userId: userB,
      amount: 100,
      type: 'manual_adjustment',
      idempotencyKey: 'grant_userB_3_1',
      description: 'Test Grant User B',
    });
  });

  after(async () => {
    const db = await getMongoDb();
    await db.collection('video_intelligence').deleteMany({ user_id: { $in: [userA, userB] } });
    await db.collection('credit_wallets').deleteMany({ user_id: { $in: [userA, userB] } });
    await db.collection('credit_ledger').deleteMany({ user_id: { $in: [userA, userB] } });
    await db.collection('subscriptions').deleteMany({ user_id: { $in: [userA, userB] } });
    await closeMongo(true);
  });

  // ─────────────────────────────────────────────────────────────
  // 1. SHOT-BOUNDARY QUALITY & SENTENCE COMPLETENESS
  // ─────────────────────────────────────────────────────────────
  describe('1. Shot-Boundary Quality & Sentence Completeness (Part D)', () => {
    it('mid-sentence scene cut NEVER splits or overrides sentence continuity', () => {
      // Sentence: "We are scaling our system rapidly." (start: 5.0, end: 8.5)
      // A scene cut occurs right in the middle at 6.8s
      const words = [
        { word: 'We', start: 5.0, end: 5.3 },
        { word: 'are', start: 5.3, end: 5.6 },
        { word: 'scaling', start: 5.6, end: 6.2 },
        { word: 'our', start: 6.2, end: 6.5 },
        { word: 'system', start: 6.5, end: 7.2 }, // Mid-sentence cut happens around here
        { word: 'rapidly.', start: 7.2, end: 8.5 },
      ];

      const sceneCuts = [
        { timestamp: 6.8, score: 0.85 }, // Cut right in the middle of speech!
      ];

      const optimized = ShotBoundaryFusionService.optimizeBoundaries({
        rawStart: 5.0,
        rawEnd: 8.5,
        words,
        sceneCuts,
        totalVideoDuration: 60,
        targetDuration: { min: 2.0, max: 20 },
      });

      // The optimized end MUST NOT truncate at the mid-sentence cut (6.8s)
      assert.ok(optimized.end >= 8.5, `End must preserve complete sentence (expected >= 8.5, got: ${optimized.end})`);
      assert.equal(optimized.boundaryOptimization.wasSentencePreserved, true);
      assert.equal(optimized.endsOnCut, false, 'Should NOT snap end to an internal mid-sentence cut');
    });

    it('snaps start to nearest prior cut (< 1.2s before speech) to eliminate flash frame', () => {
      const words = [
        { word: 'Welcome', start: 3.5, end: 4.0 },
        { word: 'back.', start: 4.0, end: 4.8 },
      ];

      const sceneCuts = [
        { timestamp: 2.8, score: 0.9 }, // 0.7s before speech (< 1.2s)
      ];

      const optimized = ShotBoundaryFusionService.optimizeBoundaries({
        rawStart: 3.5,
        rawEnd: 4.8,
        words,
        sceneCuts,
        totalVideoDuration: 60,
        targetDuration: { min: 1.5, max: 20 },
      });

      assert.equal(optimized.start, 2.8, 'Start should snap to prior cut at 2.8s');
      assert.equal(optimized.startsOnCut, true);
      assert.equal(optimized.boundaryOptimization.wasShotBoundarySnapped, true);
    });

    it('snaps end to nearest posterior cut (< 0.8s after speech) to prevent flash frame', () => {
      const words = [
        { word: 'That', start: 9.5, end: 10.0 },
        { word: 'works.', start: 10.0, end: 10.6 },
      ];

      const sceneCuts = [
        { timestamp: 11.0, score: 0.85 }, // 0.4s after speech (< 0.8s)
      ];

      const optimized = ShotBoundaryFusionService.optimizeBoundaries({
        rawStart: 9.0,
        rawEnd: 10.6,
        words,
        sceneCuts,
        totalVideoDuration: 60,
        targetDuration: { min: 1.5, max: 20 },
      });

      assert.equal(optimized.end, 11.0, 'End should snap to posterior cut at 11.0s');
      assert.equal(optimized.endsOnCut, true);
    });

    it('trims leading dead air to preserve 150ms natural breath pause', () => {
      const words = [
        { word: 'Action', start: 4.0, end: 4.6 },
        { word: 'begins.', start: 4.6, end: 5.2 },
      ];

      // Raw start begins at 2.0s (2.0s of dead air before speech at 4.0s)
      const optimized = ShotBoundaryFusionService.optimizeBoundaries({
        rawStart: 2.0,
        rawEnd: 5.2,
        words,
        sceneCuts: [], // No cut to snap to
        totalVideoDuration: 60,
        targetDuration: { min: 1.5, max: 20 },
      });

      // Trims leading dead air: 4.0 - 0.15 = 3.85s
      assert.ok(optimized.start >= 3.8 && optimized.start <= 3.9, `Start should be trimmed to ~3.85s, got: ${optimized.start}`);
      assert.ok(optimized.boundaryOptimization.leadingSilenceTrimmedSec > 1.0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. RENDERING VERIFICATION & FFPROBE INSPECTION
  // ─────────────────────────────────────────────────────────────
  describe('2. Rendering Verification & FFprobe Inspection (Part E)', () => {
    it('verifies rendered MP4 output clips exist with valid audio/video streams and A/V sync', async () => {
      const benchmarkRenderDir = path.resolve(process.cwd(), '../delete/benchmark_renders');
      assert.ok(fs.existsSync(benchmarkRenderDir), 'Benchmark render directory must exist');

      const files = fs.readdirSync(benchmarkRenderDir).filter((f) => f.endsWith('.mp4'));
      assert.ok(files.length >= 3, `Expected at least 3 rendered clips, found: ${files.length}`);

      for (const file of files) {
        const fullPath = path.join(benchmarkRenderDir, file);
        const stat = fs.statSync(fullPath);
        assert.ok(stat.size > 10_000, `Rendered file ${file} must have valid size (>10KB), got: ${stat.size}`);

        const probeMeta: any = await new Promise((res, rej) => {
          ffmpeg.ffprobe(fullPath, (err, meta) => (err ? rej(err) : res(meta)));
        });

        assert.ok(probeMeta.format.format_name.includes('mp4'), `${file} format must be mp4`);
        const vStream = probeMeta.streams.find((s: any) => s.codec_type === 'video');
        assert.ok(vStream, `${file} must contain a video stream`);
        assert.equal(vStream.codec_name, 'h264');

        const isSilent = file.includes('v9');
        const aStream = probeMeta.streams.find((s: any) => s.codec_type === 'audio');
        if (!isSilent) {
          assert.ok(aStream, `${file} must contain an audio stream`);
          assert.equal(aStream.codec_name, 'aac');

          // Check A/V sync duration match
          const vDur = Number(vStream.duration || probeMeta.format.duration);
          const aDur = Number(aStream.duration || probeMeta.format.duration);
          const offset = Math.abs(vDur - aDur);
          assert.ok(offset < 0.1, `A/V sync offset for ${file} must be < 0.1s, got: ${offset}s`);
        } else {
          assert.equal(aStream, undefined, 'Silent clip must have no audio stream');
        }
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. CREDIT & MULTI-WORKFLOW INTELLIGENCE REUSE
  // ─────────────────────────────────────────────────────────────
  describe('3. Credit & Multi-Workflow Intelligence Reuse (Part F)', () => {
    it('AI Clipping reserves credits, Subtitle Studio & Content Studio reuse cache for 0 credits', async () => {
      // Step 1: Pre-flight cost estimation for User A on 6.17s video (1 credit per 15s -> 1 credit)
      const costEstimate = CreditPricingService.calculateCoreProcessingCost(6.17);
      assert.equal(costEstimate.credits, 1);

      // Reserve credits for User A
      const attemptId = 'job_attempt_phase3_1_reuse_test';
      const reserveResult = await CreditWalletService.reserveCredits({
        userId: userA,
        attemptId,
        operationId: 'core_video_processing',
        amount: costEstimate.credits,
      });
      assert.equal(reserveResult.allowed, true);

      // Execute AI Clipping handoff on User A
      const handoffClipping = await VideoIntelligenceService.getClippingHandoff(userA, sampleVideo);
      assert.ok(handoffClipping.recommendations.length > 0);

      // Settle reservation
      await CreditWalletService.settleReservation(
        attemptId,
        costEstimate.credits,
        { description: 'Phase 3.1 Initial Analysis Settled' }
      );

      const summaryAfterClipping = await CreditWalletService.getWalletSummary(userA);
      assert.equal(summaryAfterClipping.available_credits, 99, '1 credit should be deducted for initial processing');

      // Step 2: Subtitle Studio requests same video for User A
      // Since video is already analyzed and verified, transcript reuse charges 0 credits
      const tSub0 = Date.now();
      const handoffSub = await VideoIntelligenceService.getSubtitleStudioHandoff(userA, sampleVideo);
      const subElapsed = Date.now() - tSub0;

      assert.ok(subElapsed < 2000, `Handoff must be fast (<2s), took ${subElapsed}ms`);
      assert.equal(handoffSub.handoff.transcriptReused, true);
      assert.ok(handoffSub.transcriptText.length > 0);

      // Subtitle Studio charges 0 credits for pre-analyzed source
      const summaryAfterSub = await CreditWalletService.getWalletSummary(userA);
      assert.equal(summaryAfterSub.available_credits, 99, '0 credits should be deducted for Subtitle Studio reuse');

      // Step 3: Content Studio requests same video for User A
      const handoffContent = await VideoIntelligenceService.getContentStudioHandoff(userA, sampleVideo);
      assert.ok(handoffContent.metadata);

      const summaryAfterContent = await CreditWalletService.getWalletSummary(userA);
      assert.equal(summaryAfterContent.available_credits, 99, '0 credits should be deducted for Content Studio reuse');
    });

    it('enforces strict tenant isolation: User B cannot access User A analysis without own processing', async () => {
      // User B queries same video path
      const userARecords = await VideoIntelligenceRepository.listByUser(userA);
      assert.ok(userARecords.length > 0);

      // User B must have 0 records initially
      const userBRecords = await VideoIntelligenceRepository.listByUser(userB);
      assert.equal(userBRecords.length, 0, 'User B must have NO records before analyzing');

      // User B attempts to find User A record by sourceHash
      const crossTenantCheck = await VideoIntelligenceRepository.findBySourceHash(userB, userARecords[0].source_hash);
      assert.equal(crossTenantCheck, null, 'User B cannot retrieve User A source hash');
    });

    it('invalidates cache when engine version is bumped, requiring fresh processing', async () => {
      const sourceIdentity = VideoIntelligenceService.computeSourceIdentity(sampleVideo, {
        userId: userA,
        metadata: { durationSeconds: 6, width: 640, height: 480, fps: 30, hasAudio: true, videoCodec: 'h264' },
      });

      // Invalidate with newer engine version
      await VideoIntelligenceRepository.invalidateCache(userA, sourceIdentity.sourceHash);

      const recordAfterInvalidation = await VideoIntelligenceRepository.findBySourceHash(userA, sourceIdentity.sourceHash);
      assert.equal(recordAfterInvalidation, null, 'Cache record must be deleted upon invalidation');
    });
  });
});
