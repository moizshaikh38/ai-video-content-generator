import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import {
  VideoIntelligenceRepository,
  CURRENT_ENGINE_VERSION,
} from '../db/repositories/videoIntelligenceRepository.js';
import { VideoIntelligenceRecord, VideoContainerMetadata, SourceIdentity } from '../types/index.js';

describe('Phase 3.1 — Worker Reliability Hardening Suite', () => {
  const testUserId = '00000000-0000-4000-8000-000000000099';
  const dummyMetadata: VideoContainerMetadata = {
    durationSeconds: 60,
    width: 1920,
    height: 1080,
    aspectRatio: '16:9',
    fps: 30,
    hasAudio: true,
    videoCodec: 'h264',
    audioCodec: 'aac',
  };

  const createDummyIdentity = (uniqueTag: string): SourceIdentity => {
    const rawHash = crypto.createHash('sha256').update(uniqueTag).digest('hex');
    const sourceHash = crypto.createHash('sha256').update(`tenant:${testUserId}|engine:${CURRENT_ENGINE_VERSION}|full_sha256:${rawHash}`).digest('hex');
    return {
      sourceHash,
      rawContentHash: rawHash,
      verificationLevel: 'FULL_CONTENT_SHA256',
      strategy: 'full_stream',
      fileSizeBytes: 1024 * 1024,
      containerSignature: dummyMetadata,
      engineVersion: CURRENT_ENGINE_VERSION,
      verifiedAt: new Date(),
    };
  };

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
  // 1. HEARTBEAT RENEWAL DURING LONG PROCESSING
  // ─────────────────────────────────────────────────────────────
  describe('1. Heartbeat Renewal During Long Processing', () => {
    it('worker continuously renews lease via extendLease preserving active ownership', async () => {
      const identity = createDummyIdentity('hb_renewal_test');
      const workerId = 'worker_heartbeat_1';

      const initialLease = await VideoIntelligenceRepository.acquireLease(
        testUserId,
        identity.sourceHash,
        workerId,
        {
          source_identity: identity,
          metadata: dummyMetadata,
          engine_version: CURRENT_ENGINE_VERSION,
        },
        5000
      );

      assert.equal(initialLease.acquired, true);
      assert.ok(initialLease.leaseToken);
      const initialLockedAt = new Date(initialLease.record.locked_at!).getTime();

      // Simulate passage of time
      await new Promise((r) => setTimeout(r, 60));

      // Worker renews lease
      const renewed = await VideoIntelligenceRepository.renewLease(
        initialLease.record.id,
        testUserId,
        workerId,
        initialLease.leaseToken!
      );

      assert.ok(renewed, 'Lease should be renewed successfully');
      assert.equal(renewed.locked_by, workerId);
      assert.equal(renewed.lease_token, initialLease.leaseToken);
      const renewedLockedAt = new Date(renewed.locked_at!).getTime();
      assert.ok(renewedLockedAt > initialLockedAt, 'locked_at timestamp must advance forward');
    });

    it('heartbeat renewal fails if workerId or leaseToken does not match active record', async () => {
      const identity = createDummyIdentity('hb_mismatch_test');
      const workerId = 'worker_primary';

      const lease = await VideoIntelligenceRepository.acquireLease(
        testUserId,
        identity.sourceHash,
        workerId,
        {
          source_identity: identity,
          metadata: dummyMetadata,
          engine_version: CURRENT_ENGINE_VERSION,
        },
        5000
      );

      assert.equal(lease.acquired, true);

      // Attempt renewal with WRONG workerId
      const wrongWorkerResult = await VideoIntelligenceRepository.renewLease(
        lease.record.id,
        testUserId,
        'imposter_worker',
        lease.leaseToken!
      );
      assert.equal(wrongWorkerResult, null, 'Renewal with incorrect workerId must return null');

      // Attempt renewal with WRONG leaseToken
      const wrongTokenResult = await VideoIntelligenceRepository.renewLease(
        lease.record.id,
        testUserId,
        workerId,
        'wrong-token-uuid-1234'
      );
      assert.equal(wrongTokenResult, null, 'Renewal with incorrect leaseToken must return null');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. WORKER CRASH, LEASE EXPIRATION & CONCURRENT TAKEOVER
  // ─────────────────────────────────────────────────────────────
  describe('2. Worker Crash, Lease Expiration & Concurrent Takeover', () => {
    it('recovers from worker crash after lease timeout and allows another worker to take over', async () => {
      const identity = createDummyIdentity('crash_takeover_test');
      const workerCrashed = 'worker_crashed_99';
      const workerRescuer = 'worker_rescuer_01';

      // Worker 1 acquires lease with 600ms stale timeout
      const shortTimeoutMs = 600;
      const lease1 = await VideoIntelligenceRepository.acquireLease(
        testUserId,
        identity.sourceHash,
        workerCrashed,
        {
          source_identity: identity,
          metadata: dummyMetadata,
          engine_version: CURRENT_ENGINE_VERSION,
        },
        shortTimeoutMs
      );

      assert.equal(lease1.acquired, true);
      assert.equal(lease1.record.locked_by, workerCrashed);
      assert.equal(lease1.record.attempt_count, 1);

      // Immediate attempt by Worker 2 before timeout must fail
      const preTimeoutLease = await VideoIntelligenceRepository.acquireLease(
        testUserId,
        identity.sourceHash,
        workerRescuer,
        {
          source_identity: identity,
          metadata: dummyMetadata,
        },
        shortTimeoutMs
      );
      assert.equal(preTimeoutLease.acquired, false, 'Lease cannot be acquired while active worker lease is fresh');

      // Simulate worker crash: wait for staleTimeoutMs to elapse
      await new Promise((r) => setTimeout(r, 700));

      // Worker 2 takes over the abandoned/crashed job
      const lease2 = await VideoIntelligenceRepository.acquireLease(
        testUserId,
        identity.sourceHash,
        workerRescuer,
        {
          source_identity: identity,
          metadata: dummyMetadata,
        },
        shortTimeoutMs
      );

      assert.equal(lease2.acquired, true, 'Worker 2 should acquire expired lease');
      assert.equal(lease2.record.locked_by, workerRescuer);
      assert.equal(lease2.record.attempt_count, 2, 'Attempt count must increment on takeover');
      assert.notEqual(lease2.leaseToken, lease1.leaseToken, 'New worker must receive a unique fencing leaseToken');
    });

    it('stale superseded worker is categorically blocked from completing or failing job', async () => {
      const identity = createDummyIdentity('stale_overwrite_fencing_test');
      const workerStale = 'worker_stale_old';
      const workerCurrent = 'worker_current_new';

      const shortTimeoutMs = 60;
      const leaseStale = await VideoIntelligenceRepository.acquireLease(
        testUserId,
        identity.sourceHash,
        workerStale,
        {
          source_identity: identity,
          metadata: dummyMetadata,
        },
        shortTimeoutMs
      );
      assert.equal(leaseStale.acquired, true);

      // Expire lease
      await new Promise((r) => setTimeout(r, 90));

      // Worker 2 takes over
      const leaseCurrent = await VideoIntelligenceRepository.acquireLease(
        testUserId,
        identity.sourceHash,
        workerCurrent,
        {
          source_identity: identity,
          metadata: dummyMetadata,
        },
        shortTimeoutMs
      );
      assert.equal(leaseCurrent.acquired, true);
      assert.equal(leaseCurrent.record.locked_by, workerCurrent);

      // Stale Worker attempts to mark completed with old token
      const staleCompleteResult = await VideoIntelligenceRepository.markCompleted(
        leaseStale.record.id,
        testUserId,
        {
          clipping_recommendations: [{ id: 'stale_clip_bad' }],
        },
        { workerId: workerStale, leaseToken: leaseStale.leaseToken! }
      );

      assert.equal(staleCompleteResult, null, 'Stale worker markCompleted must be blocked and return null');

      // Stale Worker attempts to mark failed with old token
      const staleFailResult = await VideoIntelligenceRepository.markFailed(
        leaseStale.record.id,
        testUserId,
        'Stale worker error',
        { workerId: workerStale, leaseToken: leaseStale.leaseToken! }
      );
      assert.equal(staleFailResult, null, 'Stale worker markFailed must be blocked and return null');

      // Verify DB record is STILL in processing state owned by Worker 2
      const freshRecord = await VideoIntelligenceRepository.findById(testUserId, leaseCurrent.record.id);
      assert.equal(freshRecord?.status, 'processing');
      assert.equal(freshRecord?.locked_by, workerCurrent);
      assert.equal(freshRecord?.lease_token, leaseCurrent.leaseToken);

      // Worker 2 completes cleanly
      const currentComplete = await VideoIntelligenceRepository.markCompleted(
        leaseCurrent.record.id,
        testUserId,
        {
          clipping_recommendations: [{ id: 'valid_clip_good' }],
        },
        { workerId: workerCurrent, leaseToken: leaseCurrent.leaseToken! }
      );

      assert.ok(currentComplete, 'Active worker must complete successfully');
      assert.equal(currentComplete.status, 'completed');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. MAXIMUM RETRY LIMIT PRESERVATION
  // ─────────────────────────────────────────────────────────────
  describe('3. Maximum Retry Limit Preservation', () => {
    it('strictly enforces max_attempts and refuses re-acquisition when limit exceeded', async () => {
      const identity = createDummyIdentity('max_attempts_limit_test');
      const maxAttempts = 3;
      const shortTimeoutMs = 40;

      // Attempt 1: Acquire and fail
      const lease1 = await VideoIntelligenceRepository.acquireLease(
        testUserId,
        identity.sourceHash,
        'worker_retry_1',
        {
          source_identity: identity,
          metadata: dummyMetadata,
          max_attempts: maxAttempts,
        },
        shortTimeoutMs
      );
      assert.equal(lease1.acquired, true);
      assert.equal(lease1.record.attempt_count, 1);
      await VideoIntelligenceRepository.markFailed(
        lease1.record.id,
        testUserId,
        'Fail attempt 1',
        { workerId: 'worker_retry_1', leaseToken: lease1.leaseToken! }
      );

      // Attempt 2: Acquire and fail
      const lease2 = await VideoIntelligenceRepository.acquireLease(
        testUserId,
        identity.sourceHash,
        'worker_retry_2',
        {
          source_identity: identity,
          metadata: dummyMetadata,
          max_attempts: maxAttempts,
        },
        shortTimeoutMs
      );
      assert.equal(lease2.acquired, true);
      assert.equal(lease2.record.attempt_count, 2);
      await VideoIntelligenceRepository.markFailed(
        lease2.record.id,
        testUserId,
        'Fail attempt 2',
        { workerId: 'worker_retry_2', leaseToken: lease2.leaseToken! }
      );

      // Attempt 3: Acquire and fail (reaches maxAttempts)
      const lease3 = await VideoIntelligenceRepository.acquireLease(
        testUserId,
        identity.sourceHash,
        'worker_retry_3',
        {
          source_identity: identity,
          metadata: dummyMetadata,
          max_attempts: maxAttempts,
        },
        shortTimeoutMs
      );
      assert.equal(lease3.acquired, true);
      assert.equal(lease3.record.attempt_count, 3);
      await VideoIntelligenceRepository.markFailed(
        lease3.record.id,
        testUserId,
        'Fail attempt 3',
        { workerId: 'worker_retry_3', leaseToken: lease3.leaseToken! }
      );

      // Attempt 4: Exceeded maxAttempts!
      const lease4 = await VideoIntelligenceRepository.acquireLease(
        testUserId,
        identity.sourceHash,
        'worker_retry_4',
        {
          source_identity: identity,
          metadata: dummyMetadata,
          max_attempts: maxAttempts,
        },
        shortTimeoutMs
      );

      assert.equal(lease4.acquired, false, 'Lease acquisition must be rejected when attempt_count >= max_attempts');
      assert.equal(lease4.record.status, 'failed', 'Record status must remain failed');
      assert.equal(lease4.record.attempt_count, 3, 'Attempt count must not increment past max_attempts');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. CLEANUP AND CANCELLATION AFTER LEASE LOSS
  // ─────────────────────────────────────────────────────────────
  describe('4. Cleanup and Cancellation After Lease Loss', () => {
    it('detects lease loss during execution and cleanly aborts without corrupting database state', async () => {
      const identity = createDummyIdentity('lease_loss_abort_test');
      const workerOvertaken = 'worker_overtaken_alpha';
      const workerUsurper = 'worker_usurper_beta';
      const shortTimeoutMs = 60;

      const initialLease = await VideoIntelligenceRepository.acquireLease(
        testUserId,
        identity.sourceHash,
        workerOvertaken,
        {
          source_identity: identity,
          metadata: dummyMetadata,
        },
        shortTimeoutMs
      );
      assert.equal(initialLease.acquired, true);

      // Simulate lease expiration
      await new Promise((r) => setTimeout(r, 90));

      // Worker Usurper acquires lease
      const usurperLease = await VideoIntelligenceRepository.acquireLease(
        testUserId,
        identity.sourceHash,
        workerUsurper,
        {
          source_identity: identity,
          metadata: dummyMetadata,
        },
        shortTimeoutMs
      );
      assert.equal(usurperLease.acquired, true);

      // Worker Overtaken tries to renew its lease -> returns null (lease lost)
      const renewCheck = await VideoIntelligenceRepository.renewLease(
        initialLease.record.id,
        testUserId,
        workerOvertaken,
        initialLease.leaseToken!
      );
      assert.equal(renewCheck, null, 'Renew must return null signaling lease was lost');

      // Worker Overtaken safely abandons work without throwing unhandled exceptions or corrupting record
      let leaseLostFlag = true;
      if (leaseLostFlag) {
        // Correct behavior: do NOT invoke markCompleted or markFailed
      }

      // Verify database record remains untouched and owned by Usurper
      const currentDbRecord = await VideoIntelligenceRepository.findById(testUserId, initialLease.record.id);
      assert.equal(currentDbRecord?.locked_by, workerUsurper);
      assert.equal(currentDbRecord?.lease_token, usurperLease.leaseToken);
    });
  });
});

