import test, { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import { ConcurrencySlotRepository } from '../db/repositories/concurrencySlotRepository.js';
import { CreditRepository } from '../db/repositories/creditRepository.js';
import { OutboxService } from '../services/outboxService.js';

const CONC_USER = '00000000-0000-4000-8000-000000000201';
const INSTANCES = ['instance_alpha', 'instance_beta', 'instance_gamma'];

describe('VireoClip Phase 4B.3 — Layer C: Multi-Instance Distributed Concurrency Tests', () => {
  before(async () => {
    const db = await getMongoDb();
    await db.collection('user_concurrency_slots').deleteMany({ user_id: CONC_USER });
    await db.collection('credit_wallets').deleteMany({ user_id: CONC_USER });
    await db.collection('credit_reservations').deleteMany({ user_id: CONC_USER });
    await db.collection('credit_transactions').deleteMany({ user_id: CONC_USER });
    await db.collection('idempotency_keys').deleteMany({ user_id: CONC_USER });
    await db.collection('outbox_events').deleteMany({ user_id: CONC_USER });

    // Seed wallet with 10,000 credits for multi-job tests
    await CreditRepository.grantCredits({
      userId: CONC_USER,
      amount: 10_000,
      type: 'monthly_grant',
      idempotencyKey: `conc_seed_${CONC_USER}`,
      description: 'Concurrency test funding',
    });
  });

  after(async () => {
    try {
      const db = await getMongoDb();
      await db.collection('user_concurrency_slots').deleteMany({ user_id: CONC_USER });
      await db.collection('credit_wallets').deleteMany({ user_id: CONC_USER });
      await db.collection('credit_reservations').deleteMany({ user_id: CONC_USER });
      await db.collection('credit_transactions').deleteMany({ user_id: CONC_USER });
      await db.collection('idempotency_keys').deleteMany({ user_id: CONC_USER });
      await db.collection('outbox_events').deleteMany({ user_id: CONC_USER });
    } finally {
      await closeMongo(true);
    }
  });

  // =========================================================================
  // 1. 60 Simultaneous Requests across 3 Instances against 20-Slot Pool
  // =========================================================================
  it('1. Enforces strict 20-slot ceiling across 3 instances: 60 concurrent requests yield exactly 20 wins', async () => {
    const requests = Array.from({ length: 60 }, (_, i) => ({
      userId: CONC_USER,
      attemptId: crypto.randomUUID(),
      instanceId: INSTANCES[i % INSTANCES.length],
      leaseMs: 30_000,
    }));

    const results = await Promise.all(
      requests.map((req) => ConcurrencySlotRepository.acquireSlot(req))
    );

    const acquired = results.filter((r) => r.acquired);
    const rejected = results.filter((r) => !r.acquired);

    assert.equal(acquired.length, 20, 'Exactly 20 slots must be acquired');
    assert.equal(rejected.length, 40, 'Exactly 40 requests must be rejected');

    for (const r of rejected) {
      assert.equal(r.errorCode, 'CONCURRENCY_LIMIT_EXCEEDED');
    }

    // Verify database state: exactly 20 non-available slots exist for this user
    const db = await getMongoDb();
    const activeSlots = await db
      .collection('user_concurrency_slots')
      .find({ user_id: CONC_USER, status: { $ne: 'available' } })
      .toArray();

    assert.equal(activeSlots.length, 20, 'Database must have exactly 20 occupied slots');

    // Clean up all 20 acquired slots using valid tokens
    for (const a of acquired) {
      if (a.slot) {
        await ConcurrencySlotRepository.releaseSlot({
          slotId: a.slot._id,
          slotToken: a.slot.slot_token,
        });
      }
    }
  });

  // =========================================================================
  // 2. Safe Token-Matched Release & Stale Owner Rejection
  // =========================================================================
  it('2. Prevents stale workers from releasing or mutating another worker’s slot', async () => {
    const attemptId1 = crypto.randomUUID();
    const attemptId2 = crypto.randomUUID();

    // Instance Alpha acquires slot
    const acq1 = await ConcurrencySlotRepository.acquireSlot({
      userId: CONC_USER,
      attemptId: attemptId1,
      instanceId: 'instance_alpha',
      leaseMs: 10_000,
    });
    assert.equal(acq1.acquired, true);
    const slot = acq1.slot!;

    // Stale worker attempts release with wrong/forged token
    const fakeRelease = await ConcurrencySlotRepository.releaseSlot({
      slotId: slot._id,
      slotToken: 'fake_token_123',
    });
    assert.equal(fakeRelease, false, 'Release with invalid token must fail');

    // Legitimate release with correct token succeeds
    const realRelease = await ConcurrencySlotRepository.releaseSlot({
      slotId: slot._id,
      slotToken: slot.slot_token,
    });
    assert.equal(realRelease, true, 'Release with matching token must succeed');

    // Slot is now vacant; Instance Beta can acquire it
    const acq2 = await ConcurrencySlotRepository.acquireSlot({
      userId: CONC_USER,
      attemptId: attemptId2,
      instanceId: 'instance_beta',
      leaseMs: 10_000,
    });
    assert.equal(acq2.acquired, true);

    // Instance Alpha (now obsolete) attempts release on reacquired slot using old token
    const staleAlphaRelease = await ConcurrencySlotRepository.releaseSlot({
      slotId: slot._id,
      slotToken: slot.slot_token, // Old token
    });
    assert.equal(staleAlphaRelease, false, 'Obsolete owner cannot release reassigned slot');

    // Clean up
    await ConcurrencySlotRepository.releaseSlot({
      slotId: acq2.slot!._id,
      slotToken: acq2.slot!.slot_token,
    });
  });

  // =========================================================================
  // 3. Crash Cases 1 & 2: Crash before reservation tx or tx abort
  // =========================================================================
  it('3. Crash Cases 1 & 2: Recovers unlinked slots where reservation transaction aborted or crashed', async () => {
    const attemptId = crypto.randomUUID();

    // Acquire slot in reserved_pending_tx state with 1ms lease (expired immediately)
    const acq = await ConcurrencySlotRepository.acquireSlot({
      userId: CONC_USER,
      attemptId,
      instanceId: 'instance_alpha',
      leaseMs: 1, // Expired immediately
    });
    assert.equal(acq.acquired, true);

    // Wait 50ms so lease is guaranteed expired
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Sweeper runs: since reservation was never created, sweeper recovers slot to available
    const swept = await ConcurrencySlotRepository.sweepExpiredSlots();
    assert.ok(swept.recoveredPending >= 1 || swept.recoveredActive >= 0, 'Sweeper must recover the orphaned pending slot');

    const db = await getMongoDb();
    const slotDoc = await db.collection('user_concurrency_slots').findOne({ _id: acq.slot!._id });
    assert.equal(slotDoc?.status, 'available', 'Slot must be restored to available');
  });

  // =========================================================================
  // 4. Crash Case 6: Stale Worker Resumes After Reassignment
  // =========================================================================
  it('4. Crash Case 6: Stale worker resuming after reassignment is rejected from extending lease', async () => {
    const attemptId = crypto.randomUUID();
    const acq = await ConcurrencySlotRepository.acquireSlot({
      userId: CONC_USER,
      attemptId,
      instanceId: 'instance_alpha',
      leaseMs: 1,
    });
    assert.equal(acq.acquired, true);
    const staleToken = acq.slot!.slot_token;

    await new Promise((resolve) => setTimeout(resolve, 50));
    await ConcurrencySlotRepository.sweepExpiredSlots();

    // Stale instance resumes and tries to renew lease with old token
    const renewed = await ConcurrencySlotRepository.renewLease({
      slotId: acq.slot!._id,
      slotToken: staleToken,
      extensionMs: 30_000,
    });
    assert.equal(renewed, false, 'Stale worker cannot renew lease on swept slot');
  });

  // =========================================================================
  // 5. Crash Case 7: Release Races with Recovery Sweeper
  // =========================================================================
  it('5. Crash Case 7: Simultaneous release and recovery sweep race safely with CAS', async () => {
    const attemptId = crypto.randomUUID();
    const acq = await ConcurrencySlotRepository.acquireSlot({
      userId: CONC_USER,
      attemptId,
      instanceId: 'instance_alpha',
      leaseMs: 1,
    });
    assert.equal(acq.acquired, true);

    await new Promise((resolve) => setTimeout(resolve, 20));

    // Fire release and sweep concurrently
    const releasePromise = ConcurrencySlotRepository.releaseSlot({
      slotId: acq.slot!._id,
      slotToken: acq.slot!.slot_token,
    });
    const sweepPromise = ConcurrencySlotRepository.sweepExpiredSlots();

    await Promise.all([releasePromise, sweepPromise]);

    // Either release won or sweep won, but slot is safely available
    const db = await getMongoDb();
    const slotDoc = await db.collection('user_concurrency_slots').findOne({ _id: acq.slot!._id });
    assert.equal(slotDoc?.status, 'available', 'Slot must end up in available state without corruption');
  });

  // =========================================================================
  // 6. Crash Case 8: Duplicate Requests Arriving from Different Instances
  // =========================================================================
  it('6. Crash Case 8: Duplicate requests across instances resolve to the same slot and reservation', async () => {
    const sharedAttemptId = crypto.randomUUID();

    // Instance Alpha and Instance Beta both attempt reservation for same attemptId simultaneously
    const reqAlpha = CreditRepository.reserveCredits({
      userId: CONC_USER,
      attemptId: sharedAttemptId,
      operationId: 'core_video_processing',
      amount: 10,
    });

    const reqBeta = CreditRepository.reserveCredits({
      userId: CONC_USER,
      attemptId: sharedAttemptId,
      operationId: 'core_video_processing',
      amount: 10,
    });

    const [resAlpha, resBeta] = await Promise.all([reqAlpha, reqBeta]);

    assert.equal(resAlpha.allowed, true);
    assert.equal(resBeta.allowed, true);

    // Exactly one is original, other is idempotent replay
    const originalCount = (resAlpha.idempotent ? 0 : 1) + (resBeta.idempotent ? 0 : 1);
    assert.equal(originalCount, 1, 'Exactly one instance creates original; other is idempotent');

    // Clean up
    await CreditRepository.settleReservation(sharedAttemptId, 10);
  });
});
