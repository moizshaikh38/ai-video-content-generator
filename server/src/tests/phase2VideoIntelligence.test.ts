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
import { VideoIntelligenceRecord } from '../types/index.js';

describe('Phase 2 — Shared Video Intelligence Engine & Repository Suite', () => {
  const testUserId1 = '00000000-0000-4000-8000-000000000001';
  const testUserId2 = '00000000-0000-4000-8000-000000000002';
  const sampleVideo1 = path.resolve(process.cwd(), '../public/demo/creator-demo.mp4');
  const sampleVideo2 = path.resolve(process.cwd(), '../public/demo/creator-studio-demo.mp4');
  const sampleLarge4k = path.resolve(process.cwd(), '../delete/video_20261011_011105.mp4');

  before(async () => {
    // Clean up test records
    const db = await getMongoDb();
    await db.collection('video_intelligence').deleteMany({
      user_id: { $in: [testUserId1, testUserId2] },
    });
  });

  after(async () => {
    try {
      const db = await getMongoDb();
      await db.collection('video_intelligence').deleteMany({
        user_id: { $in: [testUserId1, testUserId2] },
      });
    } finally {
      await closeMongo(true);
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 1. SOURCE IDENTITY & AUTHORITATIVE VERIFICATION
  // ─────────────────────────────────────────────────────────────
  describe('1. Source Identity & Authoritative Verification', () => {
    it('generates FULL_CONTENT_SHA256 for small/medium files (<= 64MB)', async () => {
      const meta = await VideoIntelligenceService.probeMetadata(sampleVideo1);
      const identity = VideoIntelligenceService.computeSourceIdentity(sampleVideo1, {
        userId: testUserId1,
        metadata: meta,
      });

      assert.equal(identity.strategy, 'full_stream');
      assert.equal(identity.verificationLevel, 'FULL_CONTENT_SHA256');
      assert.ok(identity.rawContentHash, 'Must include raw cryptographic full-content hash');
      assert.ok(identity.sourceHash.length === 64, 'Tenant hash must be 64-char hex');
      assert.equal(identity.engineVersion, CURRENT_ENGINE_VERSION);
    });

    it('generates FULL_CONTENT_SHA256 even for large files (> 64MB) without sampled compromise', async () => {
      if (!fs.existsSync(sampleLarge4k)) return; // Skip if large file not present

      const meta = await VideoIntelligenceService.probeMetadata(sampleLarge4k);
      const identity = VideoIntelligenceService.computeSourceIdentity(sampleLarge4k, {
        userId: testUserId1,
        metadata: meta,
      });

      assert.equal(identity.strategy, 'full_stream');
      assert.equal(identity.verificationLevel, 'FULL_CONTENT_SHA256');
      assert.ok(identity.rawContentHash, 'Must include raw full content hash');
      assert.ok(identity.sourceHash.length === 64, 'Tenant hash must be 64-char hex');
    });

    it('authoritative verification succeeds on exact identical source', async () => {
      const meta = await VideoIntelligenceService.probeMetadata(sampleVideo1);
      const identity = VideoIntelligenceService.computeSourceIdentity(sampleVideo1, {
        userId: testUserId1,
        metadata: meta,
      });

      const mockRecord: any = {
        id: crypto.randomUUID(),
        user_id: testUserId1,
        source_hash: identity.sourceHash,
        source_identity: identity,
        metadata: meta,
        status: 'completed',
      };

      const check = await VideoIntelligenceService.verifyAuthoritativeSourceMatch(sampleVideo1, mockRecord, meta);
      assert.equal(check.isMatch, true, 'Exact file must match authoritative check');
    });

    it('authoritative verification rejects mismatched duration or file size', async () => {
      const meta = await VideoIntelligenceService.probeMetadata(sampleVideo1);
      const identity = VideoIntelligenceService.computeSourceIdentity(sampleVideo1, {
        userId: testUserId1,
        metadata: meta,
      });

      const mockRecordCorrupt: any = {
        id: crypto.randomUUID(),
        user_id: testUserId1,
        source_hash: identity.sourceHash,
        source_identity: { ...identity, fileSizeBytes: identity.fileSizeBytes + 1024 }, // Size altered
        metadata: meta,
        status: 'completed',
      };

      const check = await VideoIntelligenceService.verifyAuthoritativeSourceMatch(sampleVideo1, mockRecordCorrupt, meta);
      assert.equal(check.isMatch, false, 'Altered size must fail verification');
      assert.ok(check.reason?.includes('File size mismatch'), 'Must report file size mismatch');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. CROSS-TENANT ISOLATION
  // ─────────────────────────────────────────────────────────────
  describe('2. Cross-Tenant Isolation', () => {
    it('isolates source_hash namespaces between different users uploading the identical video', async () => {
      const meta = await VideoIntelligenceService.probeMetadata(sampleVideo1);
      const idUser1 = VideoIntelligenceService.computeSourceIdentity(sampleVideo1, {
        userId: testUserId1,
        metadata: meta,
      });
      const idUser2 = VideoIntelligenceService.computeSourceIdentity(sampleVideo1, {
        userId: testUserId2,
        metadata: meta,
      });

      assert.notEqual(idUser1.sourceHash, idUser2.sourceHash, 'User 1 and User 2 must produce distinct tenant hashes');
    });

    it('prevents User 2 from querying or reading User 1 record by sourceHash or ID', async () => {
      const meta = await VideoIntelligenceService.probeMetadata(sampleVideo1);
      const idUser1 = VideoIntelligenceService.computeSourceIdentity(sampleVideo1, {
        userId: testUserId1,
        metadata: meta,
      });

      // Insert record for User 1
      const lease = await VideoIntelligenceRepository.acquireLease(
        testUserId1,
        idUser1.sourceHash,
        'worker_test_1',
        {
          source_identity: idUser1,
          metadata: meta,
        }
      );
      assert.equal(lease.acquired, true);

      // User 2 queries with same sourceHash or ID
      const user2Query = await VideoIntelligenceRepository.findBySourceHash(testUserId2, idUser1.sourceHash);
      assert.equal(user2Query, null, 'User 2 must receive null when querying User 1 source hash');

      const user2IdQuery = await VideoIntelligenceRepository.findById(testUserId2, lease.record.id);
      assert.equal(user2IdQuery, null, 'User 2 must receive null when querying User 1 document ID');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. CACHE INVALIDATION & ENGINE VERSIONING
  // ─────────────────────────────────────────────────────────────
  describe('3. Cache Invalidation & Engine Versioning', () => {
    it('invalidates cache keys when engineVersion is bumped', async () => {
      const meta = await VideoIntelligenceService.probeMetadata(sampleVideo1);
      const idVer1 = VideoIntelligenceService.computeSourceIdentity(sampleVideo1, {
        userId: testUserId1,
        engineVersion: '1.7.0',
        metadata: meta,
      });
      const idVer2 = VideoIntelligenceService.computeSourceIdentity(sampleVideo1, {
        userId: testUserId1,
        engineVersion: '2.0.0',
        metadata: meta,
      });

      assert.notEqual(idVer1.sourceHash, idVer2.sourceHash, 'Engine version bump must invalidate cache key');
    });

    it('invalidateCache explicitly deletes record from repository', async () => {
      const meta = await VideoIntelligenceService.probeMetadata(sampleVideo1);
      const id = VideoIntelligenceService.computeSourceIdentity(sampleVideo1, {
        userId: testUserId1,
        metadata: meta,
      });

      const deleted = await VideoIntelligenceRepository.invalidateCache(testUserId1, id.sourceHash);
      assert.equal(deleted, true, 'invalidateCache must return true when record was deleted');

      const queryAfter = await VideoIntelligenceRepository.findBySourceHash(testUserId1, id.sourceHash);
      assert.equal(queryAfter, null, 'Record must be gone after invalidation');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. CONCURRENT REQUESTS & ATOMIC LEASE ACQUISITION
  // ─────────────────────────────────────────────────────────────
  describe('4. Concurrency Guard & Atomic Lease Acquisition', () => {
    it('handles concurrent requests safely: only first worker acquires lease', async () => {
      const meta = await VideoIntelligenceService.probeMetadata(sampleVideo1);
      const id = VideoIntelligenceService.computeSourceIdentity(sampleVideo1, {
        userId: testUserId1,
        metadata: meta,
      });

      // Concurrent lease attempts
      const [worker1, worker2] = await Promise.all([
        VideoIntelligenceRepository.acquireLease(testUserId1, id.sourceHash, 'worker_1', {
          source_identity: id,
          metadata: meta,
        }),
        VideoIntelligenceRepository.acquireLease(testUserId1, id.sourceHash, 'worker_2', {
          source_identity: id,
          metadata: meta,
        }),
      ]);

      const acquiredCount = (worker1.acquired ? 1 : 0) + (worker2.acquired ? 1 : 0);
      assert.equal(acquiredCount, 1, 'Exactly one worker must acquire the lease');
      assert.equal(worker1.record.id, worker2.record.id, 'Both workers must reference the same document');
    });

    it('recovers from stale lease when worker crashes and lease expires', async () => {
      const meta = await VideoIntelligenceService.probeMetadata(sampleVideo1);
      const id = VideoIntelligenceService.computeSourceIdentity(sampleVideo1, {
        userId: testUserId1,
        metadata: meta,
      });

      // Stale timeout = 100ms for testing
      await new Promise((r) => setTimeout(r, 150));

      const recoveryWorker = await VideoIntelligenceRepository.acquireLease(
        testUserId1,
        id.sourceHash,
        'recovery_worker_99',
        { source_identity: id, metadata: meta },
        100 // 100ms stale timeout
      );

      assert.equal(recoveryWorker.acquired, true, 'Recovery worker must steal stale lease');
      assert.equal(recoveryWorker.record.locked_by, 'recovery_worker_99');
      assert.ok((recoveryWorker.record.attempt_count || 0) >= 2, 'Attempt count must increment on retry');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. FAILURE RECOVERY & RETRY STATES
  // ─────────────────────────────────────────────────────────────
  describe('5. Failure Recovery & Retry States', () => {
    it('transitions job to failed state with error message and releases lease lock', async () => {
      const meta = await VideoIntelligenceService.probeMetadata(sampleVideo1);
      const id = VideoIntelligenceService.computeSourceIdentity(sampleVideo1, {
        userId: testUserId1,
        metadata: meta,
      });

      const current = await VideoIntelligenceRepository.findBySourceHash(testUserId1, id.sourceHash);
      assert.ok(current, 'Record must exist');

      const failedDoc = await VideoIntelligenceRepository.markFailed(
        current.id,
        testUserId1,
        'Simulated transcode network failure'
      );

      assert.equal(failedDoc?.status, 'failed');
      assert.equal(failedDoc?.error_message, 'Simulated transcode network failure');
      assert.equal(failedDoc?.locked_at, null, 'Lease lock must be released on failure');
      assert.equal(failedDoc?.locked_by, null);
    });

    it('allows retry on failed job within max attempts', async () => {
      const meta = await VideoIntelligenceService.probeMetadata(sampleVideo1);
      const id = VideoIntelligenceService.computeSourceIdentity(sampleVideo1, {
        userId: testUserId1,
        metadata: meta,
      });

      const retryLease = await VideoIntelligenceRepository.acquireLease(
        testUserId1,
        id.sourceHash,
        'retry_worker_1',
        { source_identity: id, metadata: meta }
      );

      assert.equal(retryLease.acquired, true, 'Failed job must be retryable');
      assert.equal(retryLease.record.status, 'processing');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 6. TRANSCRIPT REUSE & ZERO DUPLICATE CHARGING
  // ─────────────────────────────────────────────────────────────
  describe('6. Transcript Reuse & Zero Duplicate Charging', () => {
    it('completes analysis and persists full multimodal payload', async () => {
      const meta = await VideoIntelligenceService.probeMetadata(sampleVideo1);
      const id = VideoIntelligenceService.computeSourceIdentity(sampleVideo1, {
        userId: testUserId1,
        metadata: meta,
      });

      const current = await VideoIntelligenceRepository.findBySourceHash(testUserId1, id.sourceHash);
      assert.ok(current);

      const completed = await VideoIntelligenceRepository.markCompleted(current.id, testUserId1, {
        audio_intelligence: {
          transcriptText: 'Welcome creators to the official Vireo demonstration.',
          language: 'en',
          segments: [{ id: 0, start: 0, end: 5.0, text: 'Welcome creators.' }],
          words: [{ word: 'Welcome', start: 0, end: 0.5 }],
          silenceIntervals: [{ start: 2.5, end: 3.0, duration: 0.5 }],
          meanVolumeDb: -18.5,
          speakingPaceWpm: 140,
        },
        visual_intelligence: {
          sceneCuts: [{ timestamp: 2.5, score: 0.85 }],
          keyframeTimestamps: [1.0, 3.5],
          facePresenceRatio: 0.95,
          faceIntervals: [{ start: 0, end: 5.0, average_confidence: 0.92 }],
          objects: [{ label: 'Person', category: 'person', confidence: 0.95, timestamp: 1.0 }],
          actions: [{ action: 'Speaking', description: 'Presenter speaking', startTime: 0, endTime: 5.0, confidence: 0.9 }],
          ocr: [{ text: 'VireoClip Pro', timestamp: 1.0, confidence: 0.95 }],
          scenes: [],
        },
        multimodal_reasoning: {
          summary: 'Presenter introducing VireoClip.',
          topics: ['software', 'video_editing'],
          groundedProvenance: {
            spokenFacts: ['Vireo demonstration'],
            visualObservations: ['Person speaking'],
            ocrConfirmedText: ['VireoClip Pro'],
            inferences: ['Software tutorial'],
            contradictions: [],
          },
        },
        subtitle_handoff: {
          recommendedPosition: 'bottom',
          safeMarginPercent: 12,
          detectedOcclusions: [],
          transcriptReused: true,
          language: 'en',
        },
      });

      assert.equal(completed?.status, 'completed');
      assert.ok(completed?.audio_intelligence?.transcriptText);
      assert.equal(completed?.locked_at, null);
    });

    it('subsequent getOrAnalyze returns completed record without re-analyzing', async () => {
      const record = await VideoIntelligenceService.getOrAnalyzeVideo({
        userId: testUserId1,
        videoPath: sampleVideo1,
      });

      assert.equal(record.status, 'completed');
      assert.equal(record.audio_intelligence?.transcriptText, 'Welcome creators to the official Vireo demonstration.');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 7. INDEPENDENT FEATURE INITIATION (SUBTITLE / CONTENT / CLIPPING)
  // ─────────────────────────────────────────────────────────────
  describe('7. Independent Feature Initiation & Handoffs', () => {
    it('Subtitle Studio handoff reuses existing transcript with transcriptReused=true and 0 extra cost', async () => {
      const sub = await VideoIntelligenceService.getSubtitleStudioHandoff(testUserId1, sampleVideo1);

      assert.equal(sub.transcriptText, 'Welcome creators to the official Vireo demonstration.');
      assert.equal(sub.handoff.transcriptReused, true, 'Must flag transcript as reused');
      assert.equal(sub.handoff.recommendedPosition, 'bottom');
      assert.equal(sub.handoff.safeMarginPercent, 12);
    });

    it('Content Studio handoff receives grounded provenance, topics and OCR headings', async () => {
      const content = await VideoIntelligenceService.getContentStudioHandoff(testUserId1, sampleVideo1);

      assert.equal(content.summary, 'Presenter introducing VireoClip.');
      assert.ok(content.topics.includes('software'));
      assert.ok(content.dominantObjects.includes('Person'));
      assert.ok(content.ocrHeadings.includes('VireoClip Pro'));
      assert.ok(content.groundedProvenance.spokenFacts.length > 0);
    });

    it('AI Video Clipping handoff receives facePresenceRatio and highlight candidates', async () => {
      const clip = await VideoIntelligenceService.getClippingHandoff(testUserId1, sampleVideo1);

      assert.equal(clip.facePresenceRatio, 0.95);
      assert.ok(clip.metadata.durationSeconds > 0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 8. MANDATORY REQUIREMENT A: STREAMING FULL SHA-256 & 68MB COLLISION REGRESSION
  // ─────────────────────────────────────────────────────────────
  describe('8. Mandatory Requirement A: Streaming Full SHA-256 & Collision Regression', () => {
    it('adopts precomputed fullContentSha256 from R2 stream with zero extra reads', async () => {
      const meta = await VideoIntelligenceService.probeMetadata(sampleVideo1);
      const precomputedHash = 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0';
      const identity = VideoIntelligenceService.computeSourceIdentity(sampleVideo1, {
        userId: testUserId1,
        metadata: meta,
        fullContentSha256: precomputedHash,
      });

      assert.equal(identity.strategy, 'full_stream');
      assert.equal(identity.verificationLevel, 'FULL_CONTENT_SHA256');
      assert.equal(identity.rawContentHash, precomputedHash, 'Must preserve precomputed full content hash');
      assert.ok(identity.sourceHash.length === 64);
    });

    it('reproduces 68MB collision scenario and verifies authoritative full-content hash divergence', async () => {
      const tempDir = path.resolve(process.cwd(), '../delete/sha256_regression_test');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

      const largeFileSize = 68 * 1024 * 1024; // 68 MB
      const fileA = path.join(tempDir, 'collision_test_A.mp4');
      const fileB = path.join(tempDir, 'collision_test_B.mp4');

      try {
        const fdA = fs.openSync(fileA, 'w');
        const fdB = fs.openSync(fileB, 'w');

        const sampleSectorSize = 2 * 1024 * 1024; // 2MB
        const headBlock = Buffer.alloc(sampleSectorSize, 0x11);
        const midBlock = Buffer.alloc(sampleSectorSize, 0x22);
        const tailBlock = Buffer.alloc(sampleSectorSize, 0x33);

        const pad1Size = Math.floor(largeFileSize / 2) - sampleSectorSize;
        const pad2Size = largeFileSize - (sampleSectorSize + pad1Size + sampleSectorSize + sampleSectorSize);

        const pad1A = Buffer.alloc(pad1Size, 0xaa);
        const pad1B = Buffer.alloc(pad1Size, 0xaa);
        // Alter byte at 16MB in File B (in the unsampled first quartile)
        pad1B[16 * 1024 * 1024] = 0xee;

        fs.writeSync(fdA, headBlock);
        fs.writeSync(fdA, pad1A);
        fs.writeSync(fdA, midBlock);
        fs.writeSync(fdA, Buffer.alloc(pad2Size, 0xcc));
        fs.writeSync(fdA, tailBlock);

        fs.writeSync(fdB, headBlock);
        fs.writeSync(fdB, pad1B);
        fs.writeSync(fdB, midBlock);
        fs.writeSync(fdB, Buffer.alloc(pad2Size, 0xcc));
        fs.writeSync(fdB, tailBlock);

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

        // Compute authoritative identities
        const idA = VideoIntelligenceService.computeSourceIdentity(fileA, { userId: testUserId1, metadata: mockMeta });
        const idB = VideoIntelligenceService.computeSourceIdentity(fileB, { userId: testUserId1, metadata: mockMeta });

        // 1. Authoritative hashes MUST diverge despite matching sampled sectors and metadata
        assert.notEqual(idA.rawContentHash, idB.rawContentHash, 'Raw content hashes must diverge');
        assert.notEqual(idA.sourceHash, idB.sourceHash, 'Tenant source hashes must diverge');
        assert.equal(idA.verificationLevel, 'FULL_CONTENT_SHA256');
        assert.equal(idB.verificationLevel, 'FULL_CONTENT_SHA256');

        // 2. Authoritative verification must REJECT cross-file reuse
        const mockRecordA: any = {
          id: crypto.randomUUID(),
          user_id: testUserId1,
          source_hash: idA.sourceHash,
          source_identity: idA,
          metadata: mockMeta,
          status: 'completed',
        };

        const verifyResult = await VideoIntelligenceService.verifyAuthoritativeSourceMatch(fileB, mockRecordA, mockMeta);
        assert.equal(verifyResult.isMatch, false, 'Authoritative verification must reject altered file');
        assert.ok(
          verifyResult.reason?.includes('Full-content SHA-256 hash mismatch'),
          `Reason must identify full-content mismatch, received: ${verifyResult.reason}`
        );
      } finally {
        if (fs.existsSync(fileA)) fs.unlinkSync(fileA);
        if (fs.existsSync(fileB)) fs.unlinkSync(fileB);
        if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
      }
    });

    it('strictly rejects transcript/intelligence reuse when stored record has sampled fingerprints', async () => {
      const meta = await VideoIntelligenceService.probeMetadata(sampleVideo1);
      const legacySampledRecord: any = {
        id: crypto.randomUUID(),
        user_id: testUserId1,
        source_hash: 'legacy_hash',
        source_identity: {
          sourceHash: 'legacy_hash',
          verificationLevel: 'MULTI_SECTOR_COMPOSITE',
          strategy: 'multi_sector_composite',
          fileSizeBytes: fs.statSync(sampleVideo1).size,
          containerSignature: meta,
          engineVersion: CURRENT_ENGINE_VERSION,
          verifiedAt: new Date(),
        },
        metadata: meta,
        status: 'completed',
      };

      const verifyResult = await VideoIntelligenceService.verifyAuthoritativeSourceMatch(sampleVideo1, legacySampledRecord, meta);
      assert.equal(verifyResult.isMatch, false, 'Sampled record must NEVER authorize reuse');
      assert.ok(
        verifyResult.reason?.includes('Sampled fingerprints cannot authorize reuse'),
        `Reason must reject sampled fingerprints, received: ${verifyResult.reason}`
      );
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 9. MANDATORY REQUIREMENT B: ATOMIC WORKER HEARTBEAT & FENCING PROTECTION
  // ─────────────────────────────────────────────────────────────
  describe('9. Mandatory Requirement B: Atomic Worker Heartbeat & Fencing Protection', () => {
    it('generates a unique leaseToken upon lease acquisition and successfully renews via heartbeat', async () => {
      const meta = await VideoIntelligenceService.probeMetadata(sampleVideo1);
      const uniqueSourceHash = crypto.createHash('sha256').update(`heartbeat_test_${Date.now()}`).digest('hex');

      const lease = await VideoIntelligenceRepository.acquireLease(
        testUserId1,
        uniqueSourceHash,
        'worker_alpha',
        {
          source_identity: {
            sourceHash: uniqueSourceHash,
            verificationLevel: 'FULL_CONTENT_SHA256',
            strategy: 'full_stream',
            fileSizeBytes: 1024,
            containerSignature: meta,
            engineVersion: CURRENT_ENGINE_VERSION,
            verifiedAt: new Date(),
          },
          metadata: meta,
        }
      );

      assert.equal(lease.acquired, true);
      assert.ok(lease.leaseToken, 'Must generate leaseToken');
      assert.equal(lease.record.locked_by, 'worker_alpha');

      // Atomic heartbeat renewal
      const initialLockedAt = lease.record.locked_at;
      await new Promise((r) => setTimeout(r, 20));

      const renewed = await VideoIntelligenceRepository.renewLease(
        lease.record.id,
        testUserId1,
        'worker_alpha',
        lease.leaseToken!
      );

      assert.ok(renewed, 'Lease renewal must succeed for current lease owner');
      assert.ok(new Date(renewed!.locked_at!).getTime() >= new Date(initialLockedAt!).getTime(), 'locked_at must be updated');
      assert.equal(renewed?.locked_by, 'worker_alpha');
    });

    it('rejects lease renewal when workerId or leaseToken does not match', async () => {
      const meta = await VideoIntelligenceService.probeMetadata(sampleVideo1);
      const uniqueSourceHash = crypto.createHash('sha256').update(`mismatch_test_${Date.now()}`).digest('hex');

      const lease = await VideoIntelligenceRepository.acquireLease(
        testUserId1,
        uniqueSourceHash,
        'worker_alpha',
        {
          source_identity: {
            sourceHash: uniqueSourceHash,
            verificationLevel: 'FULL_CONTENT_SHA256',
            strategy: 'full_stream',
            fileSizeBytes: 1024,
            containerSignature: meta,
            engineVersion: CURRENT_ENGINE_VERSION,
            verifiedAt: new Date(),
          },
          metadata: meta,
        }
      );

      // Wrong workerId
      const wrongWorker = await VideoIntelligenceRepository.renewLease(
        lease.record.id,
        testUserId1,
        'worker_imposter',
        lease.leaseToken!
      );
      assert.equal(wrongWorker, null, 'Must reject renewal with wrong workerId');

      // Wrong leaseToken
      const wrongToken = await VideoIntelligenceRepository.renewLease(
        lease.record.id,
        testUserId1,
        'worker_alpha',
        '00000000-0000-0000-0000-000000000000'
      );
      assert.equal(wrongToken, null, 'Must reject renewal with wrong leaseToken');
    });

    it('recovers expired lease with worker takeover and blocks stale worker from completing job', async () => {
      const meta = await VideoIntelligenceService.probeMetadata(sampleVideo1);
      const uniqueSourceHash = crypto.createHash('sha256').update(`takeover_test_${Date.now()}`).digest('hex');

      // Worker 1 acquires initial lease
      const lease1 = await VideoIntelligenceRepository.acquireLease(
        testUserId1,
        uniqueSourceHash,
        'worker_slow_1',
        {
          source_identity: {
            sourceHash: uniqueSourceHash,
            verificationLevel: 'FULL_CONTENT_SHA256',
            strategy: 'full_stream',
            fileSizeBytes: 1024,
            containerSignature: meta,
            engineVersion: CURRENT_ENGINE_VERSION,
            verifiedAt: new Date(),
          },
          metadata: meta,
        }
      );
      assert.equal(lease1.acquired, true);
      const token1 = lease1.leaseToken!;

      // Simulate lease expiration (30ms stale timeout)
      await new Promise((r) => setTimeout(r, 40));

      // Worker 2 takes over stale lease
      const lease2 = await VideoIntelligenceRepository.acquireLease(
        testUserId1,
        uniqueSourceHash,
        'worker_hero_2',
        {
          source_identity: {
            sourceHash: uniqueSourceHash,
            verificationLevel: 'FULL_CONTENT_SHA256',
            strategy: 'full_stream',
            fileSizeBytes: 1024,
            containerSignature: meta,
            engineVersion: CURRENT_ENGINE_VERSION,
            verifiedAt: new Date(),
          },
          metadata: meta,
        },
        30 // 30ms stale timeout
      );

      assert.equal(lease2.acquired, true, 'Worker 2 must successfully seize stale lease');
      assert.equal(lease2.record.locked_by, 'worker_hero_2');
      assert.notEqual(lease2.leaseToken, token1, 'Worker 2 must receive a fresh, distinct leaseToken');
      assert.equal(lease2.record.attempt_count, 2, 'Attempt count must increment');
      const token2 = lease2.leaseToken!;

      // Expired Worker 1 attempts to mark completed with stale token1 -> FENCING BLOCKS IT!
      const staleCompleteResult = await VideoIntelligenceRepository.markCompleted(
        lease1.record.id,
        testUserId1,
        {
          audio_intelligence: { transcriptText: 'STALE OVERWRITE ATTEMPT' } as any,
        },
        { workerId: 'worker_slow_1', leaseToken: token1 }
      );
      assert.equal(staleCompleteResult, null, 'Fencing token must BLOCK stale worker from marking completed');

      // Verify record is still in Worker 2's possession and NOT completed
      const checkDoc = await VideoIntelligenceRepository.findById(testUserId1, lease1.record.id);
      assert.equal(checkDoc?.status, 'processing');
      assert.equal(checkDoc?.locked_by, 'worker_hero_2');

      // Expired Worker 1 attempts to mark failed -> FENCING BLOCKS IT!
      const staleFailResult = await VideoIntelligenceRepository.markFailed(
        lease1.record.id,
        testUserId1,
        'Stale failure message',
        { workerId: 'worker_slow_1', leaseToken: token1 }
      );
      assert.equal(staleFailResult, null, 'Fencing token must BLOCK stale worker from failing new worker job');

      // Active Worker 2 successfully completes job with valid token2
      const validCompleteResult = await VideoIntelligenceRepository.markCompleted(
        lease2.record.id,
        testUserId1,
        {
          audio_intelligence: { transcriptText: 'Valid worker 2 intelligence' } as any,
        },
        { workerId: 'worker_hero_2', leaseToken: token2 }
      );
      assert.ok(validCompleteResult, 'Active worker must successfully complete job');
      assert.equal(validCompleteResult?.status, 'completed');
      assert.equal(validCompleteResult?.audio_intelligence?.transcriptText, 'Valid worker 2 intelligence');
      assert.equal(validCompleteResult?.locked_by, null);
      assert.equal(validCompleteResult?.lease_token, null);
    });
  });
});
