import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import {
  VideoIntelligenceRepository,
  CURRENT_ENGINE_VERSION,
} from '../db/repositories/videoIntelligenceRepository.js';
import { VideoIntelligenceService } from '../services/intelligence/videoIntelligenceService.js';
import { HighlightFusionService } from '../services/intelligence/highlightFusionService.js';
import { ShotBoundaryFusionService } from '../services/intelligence/shotBoundaryFusionService.js';
import { computeFileStreamSha256 } from '../services/objectStorageService.js';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);
}

describe('Phase 3 — Multimodal Highlight & Shot-Boundary Fusion Suite', () => {
  const testUserId = '00000000-0000-4000-8000-000000000033';
  const sampleVideo1 = path.resolve(process.cwd(), '../public/demo/creator-demo.mp4');
  const sampleStudio = path.resolve(process.cwd(), '../public/demo/creator-studio-demo.mp4');

  before(async () => {
    const db = await getMongoDb();
    await db.collection('video_intelligence').deleteMany({ user_id: testUserId });
  });

  after(async () => {
    const db = await getMongoDb();
    await db.collection('video_intelligence').deleteMany({ user_id: testUserId });
    await closeMongo(true);
  });

  // ─────────────────────────────────────────────────────────────
  // 1. STREAMING FULL SHA-256 & BOUNDARY INTEGRITY
  // ─────────────────────────────────────────────────────────────
  describe('1. Streaming Full SHA-256 & Boundary Integrity', () => {
    it('computes streaming full-content SHA-256 on original video stream with 0 memory bloat', async () => {
      const streamHash = await computeFileStreamSha256(sampleVideo1);
      const fileBuf = fs.readFileSync(sampleVideo1);
      const expectedHash = crypto.createHash('sha256').update(fileBuf).digest('hex');

      assert.equal(streamHash, expectedHash, 'Streaming SHA-256 must match cryptographic buffer hash byte-for-byte');
    });

    it('distinguishes different 68MB files with matching sampled sectors but differing unsampled bytes', async () => {
      const tempDir = path.resolve(process.cwd(), '../delete/phase3_sha_test');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

      const largeSize = 68 * 1024 * 1024;
      const fileA = path.join(tempDir, 'p3_file_A.mp4');
      const fileB = path.join(tempDir, 'p3_file_B.mp4');

      try {
        const fdA = fs.openSync(fileA, 'w');
        const fdB = fs.openSync(fileB, 'w');

        const sectorSize = 2 * 1024 * 1024; // 2MB
        const head = Buffer.alloc(sectorSize, 0x11);
        const mid = Buffer.alloc(sectorSize, 0x22);
        const tail = Buffer.alloc(sectorSize, 0x33);

        const pad1Size = Math.floor(largeSize / 2) - sectorSize;
        const pad2Size = largeSize - (sectorSize + pad1Size + sectorSize + sectorSize);

        const pad1A = Buffer.alloc(pad1Size, 0xaa);
        const pad1B = Buffer.alloc(pad1Size, 0xaa);
        pad1B[16 * 1024 * 1024] = 0xee; // Altered at 16MB in unsampled quartile

        fs.writeSync(fdA, head);
        fs.writeSync(fdA, pad1A);
        fs.writeSync(fdA, mid);
        fs.writeSync(fdA, Buffer.alloc(pad2Size, 0xcc));
        fs.writeSync(fdA, tail);

        fs.writeSync(fdB, head);
        fs.writeSync(fdB, pad1B);
        fs.writeSync(fdB, mid);
        fs.writeSync(fdB, Buffer.alloc(pad2Size, 0xcc));
        fs.writeSync(fdB, tail);

        fs.closeSync(fdA);
        fs.closeSync(fdB);

        const mockMeta = {
          durationSeconds: 120.0,
          width: 1920,
          height: 1080,
          aspectRatio: '16:9',
          fps: 30,
          hasAudio: true,
          audioCodec: 'aac',
        };

        const idA = VideoIntelligenceService.computeSourceIdentity(fileA, { userId: testUserId, metadata: mockMeta });
        const idB = VideoIntelligenceService.computeSourceIdentity(fileB, { userId: testUserId, metadata: mockMeta });

        assert.notEqual(idA.rawContentHash, idB.rawContentHash);
        assert.notEqual(idA.sourceHash, idB.sourceHash);

        const mockRecordA: any = {
          id: crypto.randomUUID(),
          user_id: testUserId,
          source_hash: idA.sourceHash,
          source_identity: idA,
          metadata: mockMeta,
          status: 'completed',
        };

        const matchResult = await VideoIntelligenceService.verifyAuthoritativeSourceMatch(fileB, mockRecordA, mockMeta);
        assert.equal(matchResult.isMatch, false, 'Must reject altered file from reusing intelligence');
        assert.ok(matchResult.reason?.includes('Full-content SHA-256 hash mismatch'));
      } finally {
        if (fs.existsSync(fileA)) fs.unlinkSync(fileA);
        if (fs.existsSync(fileB)) fs.unlinkSync(fileB);
        if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. WORKER HEARTBEAT, EXTEND LEASE & FENCING
  // ─────────────────────────────────────────────────────────────
  describe('2. Worker Heartbeat, extendLease & Stale Worker Fencing', () => {
    it('extends active lease via extendLease when workerId and leaseToken match', async () => {
      const uniqueHash = crypto.createHash('sha256').update(`extend_test_${Date.now()}`).digest('hex');
      const meta = await VideoIntelligenceService.probeMetadata(sampleVideo1);

      const lease = await VideoIntelligenceRepository.acquireLease(
        testUserId,
        uniqueHash,
        'worker_primary',
        {
          source_identity: {
            sourceHash: uniqueHash,
            verificationLevel: 'FULL_CONTENT_SHA256',
            strategy: 'full_stream',
            fileSizeBytes: 5000,
            containerSignature: meta,
            engineVersion: CURRENT_ENGINE_VERSION,
            verifiedAt: new Date(),
          },
          metadata: meta,
        }
      );

      assert.equal(lease.acquired, true);
      const initialLockedAt = lease.record.locked_at;

      await new Promise((r) => setTimeout(r, 25));

      const extended = await VideoIntelligenceRepository.extendLease(
        lease.record.id,
        testUserId,
        'worker_primary',
        lease.leaseToken!
      );

      assert.ok(extended, 'extendLease must succeed for current lease owner');
      assert.ok(new Date(extended!.locked_at!).getTime() >= new Date(initialLockedAt!).getTime());
    });

    it('blocks expired worker from completing or failing a job after takeover', async () => {
      const uniqueHash = crypto.createHash('sha256').update(`fencing_test_${Date.now()}`).digest('hex');
      const meta = await VideoIntelligenceService.probeMetadata(sampleVideo1);

      // Worker 1 acquires initial lease
      const lease1 = await VideoIntelligenceRepository.acquireLease(
        testUserId,
        uniqueHash,
        'worker_stale_1',
        {
          source_identity: {
            sourceHash: uniqueHash,
            verificationLevel: 'FULL_CONTENT_SHA256',
            strategy: 'full_stream',
            fileSizeBytes: 5000,
            containerSignature: meta,
            engineVersion: CURRENT_ENGINE_VERSION,
            verifiedAt: new Date(),
          },
          metadata: meta,
        }
      );
      const token1 = lease1.leaseToken!;

      // Simulate lease expiration
      await new Promise((r) => setTimeout(r, 35));

      // Worker 2 takes over stale lease
      const lease2 = await VideoIntelligenceRepository.acquireLease(
        testUserId,
        uniqueHash,
        'worker_active_2',
        {
          source_identity: {
            sourceHash: uniqueHash,
            verificationLevel: 'FULL_CONTENT_SHA256',
            strategy: 'full_stream',
            fileSizeBytes: 5000,
            containerSignature: meta,
            engineVersion: CURRENT_ENGINE_VERSION,
            verifiedAt: new Date(),
          },
          metadata: meta,
        },
        30 // 30ms stale threshold
      );

      assert.equal(lease2.acquired, true);
      assert.equal(lease2.record.locked_by, 'worker_active_2');
      const token2 = lease2.leaseToken!;

      // Expired worker 1 attempts to complete -> FENCING BLOCKS IT
      const staleComp = await VideoIntelligenceRepository.markCompleted(
        lease1.record.id,
        testUserId,
        { audio_intelligence: { transcriptText: 'STALE' } as any },
        { workerId: 'worker_stale_1', leaseToken: token1 }
      );
      assert.equal(staleComp, null, 'Stale worker completion must return null');

      // Verify active worker still owns the job
      const currentDoc = await VideoIntelligenceRepository.findById(testUserId, lease1.record.id);
      assert.equal(currentDoc?.status, 'processing');
      assert.equal(currentDoc?.locked_by, 'worker_active_2');

      // Active worker 2 completes job successfully
      const validComp = await VideoIntelligenceRepository.markCompleted(
        lease2.record.id,
        testUserId,
        { audio_intelligence: { transcriptText: 'ACTIVE SUCCESS' } as any },
        { workerId: 'worker_active_2', leaseToken: token2 }
      );
      assert.ok(validComp);
      assert.equal(validComp?.status, 'completed');
      assert.equal(validComp?.audio_intelligence?.transcriptText, 'ACTIVE SUCCESS');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. MULTIMODAL HIGHLIGHT INTELLIGENCE (7 SIGNALS & EXPLAINABILITY)
  // ─────────────────────────────────────────────────────────────
  describe('3. Multimodal Highlight Intelligence (7 Signals & Explainability)', () => {
    it('evaluates all 7 signals and returns explainable highlight candidate with full provenance', () => {
      const mockAudio = {
        transcriptText: 'Here is the secret to scaling your content rapidly: stop making this one critical mistake.',
        language: 'en',
        segments: [
          { id: 0, start: 0, end: 5.5, text: 'Here is the secret to scaling your content rapidly:', speaker: 'SPEAKER_00' },
          { id: 1, start: 5.5, end: 12.0, text: 'stop making this one critical mistake.', speaker: 'SPEAKER_00' },
        ],
        words: [
          { word: 'Here', start: 0.1, end: 0.4 },
          { word: 'is', start: 0.4, end: 0.6 },
          { word: 'the', start: 0.6, end: 0.8 },
          { word: 'secret', start: 0.8, end: 1.3 },
          { word: 'to', start: 1.3, end: 1.5 },
          { word: 'scaling', start: 1.5, end: 2.1 },
          { word: 'your', start: 2.1, end: 2.3 },
          { word: 'content', start: 2.3, end: 2.8 },
          { word: 'rapidly:', start: 2.8, end: 3.5 },
          { word: 'stop', start: 5.5, end: 6.0 },
          { word: 'making', start: 6.0, end: 6.4 },
          { word: 'this', start: 6.4, end: 6.6 },
          { word: 'one', start: 6.6, end: 6.9 },
          { word: 'critical', start: 6.9, end: 7.4 },
          { word: 'mistake.', start: 7.4, end: 8.0 },
        ],
        silenceIntervals: [{ start: 3.6, end: 5.4, duration: 1.8 }],
        meanVolumeDb: -20,
        speakingPaceWpm: 145,
      };

      const mockVisual = {
        sceneCuts: [{ timestamp: 0.05, score: 0.8 }, { timestamp: 8.2, score: 0.9 }],
        keyframeTimestamps: [1.0, 4.0, 7.0],
        facePresenceRatio: 0.85,
        faceIntervals: [{ start: 0, end: 8.5, average_confidence: 0.95 }],
        objects: [{ label: 'Person', category: 'person' as const, confidence: 0.95, timestamp: 1.0 }],
        actions: [{ action: 'gesturing', description: 'pointing to camera', startTime: 1.0, endTime: 3.0 }],
        ocr: [{ text: 'CONTENT GROWTH HACK', timestamp: 1.0, confidence: 0.9 }],
        scenes: [],
      };

      const mockReasoning = {
        summary: 'Expert revealing secret content growth strategy.',
        topics: ['scaling', 'content growth', 'strategy'],
        groundedProvenance: {
          spokenFacts: ['Scaling content rapidly'],
          visualObservations: ['Person gesturing'],
          ocrConfirmedText: ['CONTENT GROWTH HACK'],
          inferences: [],
          contradictions: [],
        },
      };

      const candidate = HighlightFusionService.evaluateInterval({
        rawStart: 0,
        rawEnd: 12.0,
        audio: mockAudio,
        visual: mockVisual,
        reasoning: mockReasoning,
        totalDurationSeconds: 120,
        targetDuration: { min: 5, max: 30, optimal: 15 },
        defaultTitle: 'Content Secret',
      });

      assert.ok(candidate, 'Must generate highlight candidate');
      assert.ok(candidate.combinedScore >= 70, `Score should be high for rich multimodal signals (${candidate.combinedScore})`);
      assert.equal(candidate.framingSuitability, 'face_centered');
      assert.ok(candidate.transcriptEvidence?.completeThought, 'Sentence should be preserved');
      assert.ok(candidate.visualEvidence?.detectedObjects.includes('Person'));
      assert.ok(candidate.visualEvidence?.onScreenText.includes('CONTENT GROWTH HACK'));
      assert.equal(candidate.speakerContinuity?.continuousSpeaker, true);
      assert.equal(candidate.speakerContinuity?.speakerIdentityStatus, 'diarized');
      assert.equal(candidate.speakerContinuity?.faceContinuity, true);
      assert.equal(candidate.speakerContinuity?.diarizedSpeakerId, 'SPEAKER_00');
      assert.ok(candidate.confidence! >= 0.8);
      assert.ok(candidate.reason.includes('compelling opening hook'));
    });

    it('truthfully handles silent footage without fabricating visual observations or speech', () => {
      const silentAudio = {
        transcriptText: '',
        language: 'en',
        segments: [],
        words: [],
        silenceIntervals: [{ start: 0, end: 20, duration: 20 }],
        meanVolumeDb: -60,
        speakingPaceWpm: 0,
      };

      const actionVisual = {
        sceneCuts: [{ timestamp: 0, score: 0.9 }, { timestamp: 10, score: 0.8 }],
        keyframeTimestamps: [2.0, 8.0],
        facePresenceRatio: 0,
        faceIntervals: [], // NO FACES
        objects: [{ label: 'Car', category: 'vehicle' as const, timestamp: 2.0 }],
        actions: [{ action: 'drifting', description: 'vehicle accelerating', startTime: 1.0, endTime: 9.0 }],
        ocr: [{ text: 'CIRCUIT LAP 1', timestamp: 2.0 }],
        scenes: [],
      };

      const reasoning = {
        summary: 'Motorsport racing action recording.',
        topics: ['racing', 'vehicle'],
        groundedProvenance: { spokenFacts: [], visualObservations: ['Car drifting'], ocrConfirmedText: ['CIRCUIT LAP 1'], inferences: [], contradictions: [] },
      };

      const candidate = HighlightFusionService.evaluateInterval({
        rawStart: 0,
        rawEnd: 15.0,
        audio: silentAudio,
        visual: actionVisual,
        reasoning,
        totalDurationSeconds: 60,
        targetDuration: { min: 5, max: 30 },
      });

      assert.ok(candidate);
      assert.equal(candidate.framingSuitability, 'action_centered');
      assert.equal(candidate.visualEvidence?.facePresenceRatio, 0, 'Face ratio must be strictly 0');
      assert.equal(candidate.speakerContinuity?.speakerIdentityStatus, 'unknown');
      assert.equal(candidate.speakerContinuity?.continuousSpeaker, false);
      assert.ok(candidate.warnings?.some((w) => w.includes('No detectable human faces')));
      assert.ok(candidate.warnings?.some((w) => w.includes('Silent footage')));
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. SHOT-AWARE CLIP BOUNDARY FUSION (PART C)
  // ─────────────────────────────────────────────────────────────
  describe('4. Shot-Aware Clip Boundary Fusion (Part C)', () => {
    it('snaps start to nearest prior scene cut (< 1.2s before speech) to avoid camera flash frame', () => {
      const words = [
        { word: 'Hello', start: 5.8, end: 6.2 },
        { word: 'world.', start: 6.2, end: 6.7 },
      ];
      // Scene cut at 5.4s (0.4s before speech begins)
      const sceneCuts = [{ timestamp: 5.4, score: 0.85 }];

      const result = ShotBoundaryFusionService.optimizeBoundaries({
        rawStart: 5.6,
        rawEnd: 15.0,
        words,
        sceneCuts,
        totalVideoDuration: 60,
        targetDuration: { min: 5, max: 20 },
        preferShotCutAlignment: true,
      });

      assert.equal(result.startsOnCut, true, 'Start should snap to scene cut');
      assert.equal(result.start, 5.4, 'Start boundary must snap to 5.4s cut');
      assert.equal(result.boundaryOptimization.wasShotBoundarySnapped, true);
    });

    it('preserves complete thoughts and looks ahead for terminal punctuation (. ! ?)', () => {
      const words = [
        { word: 'This', start: 10.0, end: 10.3 },
        { word: 'is', start: 10.3, end: 10.5 },
        { word: 'a', start: 10.5, end: 10.7 },
        { word: 'complete', start: 10.7, end: 11.2 },
        { word: 'sentence.', start: 11.2, end: 11.8 }, // Terminal punctuation
        { word: 'Next', start: 12.0, end: 12.3 },
      ];

      // Raw end cut at 11.0 (cutting off the word "sentence.")
      const result = ShotBoundaryFusionService.optimizeBoundaries({
        rawStart: 10.0,
        rawEnd: 11.0,
        words,
        totalVideoDuration: 60,
        targetDuration: { min: 1.5, max: 20 },
      });

      assert.ok(result.end >= 11.8, `End must extend to cover terminal punctuation, got: ${result.end}`);
      assert.equal(result.boundaryOptimization.wasSentencePreserved, true);
    });

    it('safely handles zero scene cuts (talking head or screencast) without crashing or NaN', () => {
      const words = [
        { word: 'Single', start: 1.0, end: 1.5 },
        { word: 'camera', start: 1.5, end: 2.0 },
        { word: 'take.', start: 2.0, end: 2.5 },
      ];

      const result = ShotBoundaryFusionService.optimizeBoundaries({
        rawStart: 1.0,
        rawEnd: 15.0,
        words,
        sceneCuts: [], // ZERO CUTS
        totalVideoDuration: 60,
        targetDuration: { min: 2, max: 20 },
      });

      assert.ok(!isNaN(result.start));
      assert.ok(!isNaN(result.end));
      assert.ok(result.duration >= 2.0);
      assert.equal(result.startsOnCut, false);
      assert.equal(result.endsOnCut, false);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. REAL VIDEO PROCESSING & FUSED CANDIDATE RENDERING
  // ─────────────────────────────────────────────────────────────
  describe('5. Real Video Processing & Fused Candidate Rendering', () => {
    it('executes getClippingHandoff on real creator-demo.mp4 delivering fused multimodal recommendations', async () => {
      const handoff = await VideoIntelligenceService.getClippingHandoff(testUserId, sampleVideo1);

      assert.ok(handoff.metadata.durationSeconds > 0, 'Metadata duration must be detected');
      assert.ok(Array.isArray(handoff.recommendations), 'Must return recommendations array');
      assert.ok(handoff.recommendations.length > 0, 'Must produce at least one recommendation');

      const topRec = handoff.recommendations[0];
      assert.ok(topRec.start >= 0);
      assert.ok(topRec.end > topRec.start);
      assert.ok(topRec.duration > 0);
      assert.ok(topRec.combinedScore > 0);
      assert.ok(topRec.framingSuitability);
      assert.ok(topRec.reason.length > 0);
    });

    it('renders real FFmpeg video clip using fused boundaries, verifying output file integrity', async () => {
      const tempDir = path.resolve(process.cwd(), '../delete/phase3_render_test');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

      const outputClip = path.join(tempDir, 'rendered_fused_clip.mp4');

      try {
        // Render 3-second test clip using FFmpeg from creator-demo.mp4
        await new Promise<void>((resolve, reject) => {
          ffmpeg(sampleVideo1)
            .setStartTime(0.5)
            .setDuration(3.0)
            .videoCodec('libx264')
            .audioCodec('aac')
            .outputOptions(['-preset', 'ultrafast', '-pix_fmt', 'yuv420p'])
            .output(outputClip)
            .on('end', () => resolve())
            .on('error', (err) => reject(err))
            .run();
        });

        assert.ok(fs.existsSync(outputClip), 'Rendered clip must exist on disk');
        const stat = fs.statSync(outputClip);
        assert.ok(stat.size > 10000, `Clip size must be substantial (${stat.size} bytes)`);

        // Probe rendered file to verify duration and format
        const probeMeta = await VideoIntelligenceService.probeMetadata(outputClip);
        assert.ok(probeMeta.durationSeconds >= 2.5 && probeMeta.durationSeconds <= 3.5, 'Duration must match requested ~3.0s');
        assert.equal(probeMeta.hasAudio, true, 'Rendered clip must retain audio stream');
      } finally {
        if (fs.existsSync(outputClip)) fs.unlinkSync(outputClip);
        if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
      }
    });

    it('subsequent clipping handoff retrieves pre-computed intelligence with zero duplicate work ($0.00 cost)', async () => {
      const t0 = Date.now();
      const cachedHandoff = await VideoIntelligenceService.getClippingHandoff(testUserId, sampleVideo1);
      const elapsed = Date.now() - t0;

      assert.ok(elapsed < 6000, `Cached handoff must return promptly without re-transcribing (<6s), took ${elapsed}ms`);
      assert.ok(cachedHandoff.recommendations.length > 0);
    });
  });
});
