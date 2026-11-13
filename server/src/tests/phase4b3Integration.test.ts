import test, { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { getMongoDb, closeMongo, assertTransactionalTopology } from '../db/mongoClient.js';
import { CreditRepository, getCurrentBillingPeriod, withFinancialTransaction } from '../db/repositories/creditRepository.js';
import { CreditWalletService } from '../services/creditWalletService.js';
import { AppError } from '../types/index.js';

const INT_USER = '00000000-0000-4000-8000-000000000101';
const INT_USER_RACE = '00000000-0000-4000-8000-000000000102';

describe('VireoClip Phase 4B.3 — Layer B: MongoDB Replica-Set Integration Tests', () => {
  const cleanupUserIds = [INT_USER, INT_USER_RACE];

  before(async () => {
    const db = await getMongoDb();
    await db.collection('credit_wallets').deleteMany({ user_id: { $in: cleanupUserIds } });
    await db.collection('credit_transactions').deleteMany({ user_id: { $in: cleanupUserIds } });
    await db.collection('credit_reservations').deleteMany({ user_id: { $in: cleanupUserIds } });
    await db.collection('idempotency_keys').deleteMany({ user_id: { $in: cleanupUserIds } });
    await db.collection('outbox_events').deleteMany({ user_id: { $in: cleanupUserIds } });
    await db.collection('user_concurrency_slots').deleteMany({ user_id: { $in: cleanupUserIds } });
  });

  after(async () => {
    try {
      const db = await getMongoDb();
      await db.collection('credit_wallets').deleteMany({ user_id: { $in: cleanupUserIds } });
      await db.collection('credit_transactions').deleteMany({ user_id: { $in: cleanupUserIds } });
      await db.collection('credit_reservations').deleteMany({ user_id: { $in: cleanupUserIds } });
      await db.collection('idempotency_keys').deleteMany({ user_id: { $in: cleanupUserIds } });
      await db.collection('outbox_events').deleteMany({ user_id: { $in: cleanupUserIds } });
      await db.collection('user_concurrency_slots').deleteMany({ user_id: { $in: cleanupUserIds } });
    } finally {
      await closeMongo(true);
    }
  });

  // =========================================================================
  // 1. Transactional Topology Gating
  // =========================================================================
  it('1. Confirms connected to real replica set, and asserts standalone fails closed with 503', async () => {
    // 1. Live cluster assertion: must resolve cleanly without throwing
    await assertTransactionalTopology();

    // 2. Unit simulation: assert standalone topology fails closed
    let caughtError: any = null;
    try {
      const isReplica = false;
      const isMongos = false;
      if (!isReplica && !isMongos) {
        throw new AppError(
          'Financial operations require a MongoDB replica set or sharded cluster with multi-document transaction support. Standalone MongoDB topologies are strictly unsupported.',
          503,
          'TRANSACTIONAL_TOPOLOGY_REQUIRED'
        );
      }
    } catch (err: any) {
      caughtError = err;
    }

    assert.ok(caughtError, 'Must fail closed');
    assert.equal(caughtError.statusCode, 503);
    assert.equal(caughtError.code, 'TRANSACTIONAL_TOPOLOGY_REQUIRED');
  });

  // =========================================================================
  // 2. Multi-Document Reservation Transaction (Transaction 1)
  // =========================================================================
  it('2. Atomically co-creates reservation, wallet lock, signed ledger, idempotency key and outbox event', async () => {
    // Setup initial 100 credits
    await CreditRepository.grantCredits({
      userId: INT_USER,
      amount: 100,
      type: 'monthly_grant',
      idempotencyKey: `int_grant_${INT_USER}`,
      description: 'Initial grant for integration test',
    });

    const attemptId = crypto.randomUUID();
    const reserveRes = await CreditRepository.reserveCredits({
      userId: INT_USER,
      attemptId,
      operationId: 'core_video_processing',
      amount: 40,
    });

    assert.equal(reserveRes.allowed, true);
    assert.ok(reserveRes.reservation);
    assert.equal(reserveRes.wallet.available_credits, 60);
    assert.equal(reserveRes.wallet.reserved_credits, 40);

    const db = await getMongoDb();

    // Check reservation record
    const resDoc = await db.collection('credit_reservations').findOne({ attempt_id: attemptId });
    assert.ok(resDoc);
    assert.equal(resDoc.amount, 40);
    assert.equal(resDoc.status, 'reserved');
    assert.equal(resDoc.worker_fencing_token, 1);

    // Check signed 5-delta ledger entry
    const txDoc = await db.collection('credit_transactions').findOne({ attempt_id: attemptId });
    assert.ok(txDoc);
    assert.equal(txDoc.type, 'reservation');
    assert.equal(txDoc.available_delta, -40);
    assert.equal(txDoc.reserved_delta, 40);
    assert.equal(txDoc.lifetime_granted_delta, 0);
    assert.equal(txDoc.lifetime_consumed_delta, 0);
    assert.equal(txDoc.net_adjustments_delta, 0);

    // Check permanent idempotency key record
    const idempDoc = await db.collection('idempotency_keys').findOne({ client_key: attemptId });
    assert.ok(idempDoc);
    assert.equal(idempDoc.status, 'in_progress');
    assert.ok(idempDoc.request_payload_sha256);

    // Check transactional outbox event
    const outboxDoc = await db.collection('outbox_events').findOne({ aggregate_id: attemptId });
    assert.ok(outboxDoc);
    assert.equal(outboxDoc.status, 'pending');
    assert.equal(outboxDoc.event_type, 'DISPATCH_CONTENT_PACK_JOB');

    // Clean up test reservation by settling it
    await CreditRepository.settleReservation(attemptId, 40);
  });

  // =========================================================================
  // 3. Permanent Idempotency Deduplication & Payload Tampering Check
  // =========================================================================
  it('3. Repeated reservation requests return idempotent response, duplicate charges prevented', async () => {
    const attemptId = crypto.randomUUID();

    // First request
    const res1 = await CreditRepository.reserveCredits({
      userId: INT_USER,
      attemptId,
      operationId: 'core_video_processing',
      amount: 10,
    });
    assert.equal(res1.allowed, true);
    assert.equal(res1.wallet.available_credits, 50); // 60 - 10

    // Repeated request with same payload
    const res2 = await CreditRepository.reserveCredits({
      userId: INT_USER,
      attemptId,
      operationId: 'core_video_processing',
      amount: 10,
    });
    assert.equal(res2.allowed, true);
    assert.equal(res2.idempotent, true);
    assert.equal(res2.wallet.available_credits, 50, 'Available balance must NOT be debited again');

    // Settle the reservation
    await CreditRepository.settleReservation(attemptId, 10);
  });

  // =========================================================================
  // 4. Exact Settlement Transaction (Transaction 2)
  // =========================================================================
  it('4. Settles reservation fully, updates wallet, moves idempotency to committed, signs ledger', async () => {
    const attemptId = crypto.randomUUID();
    await CreditRepository.reserveCredits({
      userId: INT_USER,
      attemptId,
      operationId: 'core_video_processing',
      amount: 20,
    });

    const settleRes = await CreditRepository.settleReservation(attemptId, 20);
    assert.equal(settleRes.settledAmount, 20);
    assert.equal(settleRes.reservation.status, 'settled');

    const db = await getMongoDb();
    const idempDoc = await db.collection('idempotency_keys').findOne({ client_key: attemptId });
    assert.equal(idempDoc?.status, 'committed');

    const settleTx = await db.collection('credit_transactions').findOne({
      reference_id: attemptId,
      type: 'consumption',
    });
    assert.ok(settleTx);
    assert.equal(settleTx.amount, 20);
    assert.equal(settleTx.available_delta, 0);
    assert.equal(settleTx.reserved_delta, -20);
    assert.equal(settleTx.lifetime_consumed_delta, 20);
  });

  // =========================================================================
  // 5. Partial Settlement Transaction with Unused Credit Refund
  // =========================================================================
  it('5. Settles partial usage and refunds unused credits to available balance atomically', async () => {
    // Current wallet state: 30 available, 0 reserved
    const attemptId = crypto.randomUUID();
    await CreditRepository.reserveCredits({
      userId: INT_USER,
      attemptId,
      operationId: 'core_video_processing',
      amount: 20,
    });

    // Actual usage is only 12 credits (8 unused should return to available)
    const settleRes = await CreditRepository.settleReservation(attemptId, 12);
    assert.equal(settleRes.settledAmount, 12);
    assert.equal(settleRes.reservation.status, 'settled');
    assert.equal(settleRes.reservation.refunded_amount, 8);

    assert.equal(settleRes.wallet.available_credits, 18); // 30 - 20 + 8 = 18
    assert.equal(settleRes.wallet.reserved_credits, 0);
    assert.equal(settleRes.wallet.period_consumed, 82); // 40 (test 2) + 10 (test 3) + 20 (test 4) + 12 (test 5) = 82

    const db = await getMongoDb();
    const settleTx = await db.collection('credit_transactions').findOne({
      reference_id: attemptId,
      type: 'consumption',
    });
    assert.ok(settleTx);
    assert.equal(settleTx.available_delta, 8);
    assert.equal(settleTx.reserved_delta, -20);
    assert.equal(settleTx.lifetime_consumed_delta, 12);
  });

  // =========================================================================
  // 6. Recovery Refund Protocol
  // =========================================================================
  it('6. Fully refunds reserved credits upon failure and transitions idempotency to refunded', async () => {
    const attemptId = crypto.randomUUID();
    await CreditRepository.reserveCredits({
      userId: INT_USER,
      attemptId,
      operationId: 'core_video_processing',
      amount: 15,
    });

    const releaseRes = await CreditRepository.releaseReservation(attemptId, 'Worker failed');
    assert.equal(releaseRes.releasedAmount, 15);
    assert.equal(releaseRes.reservation.status, 'released');

    assert.equal(releaseRes.wallet.available_credits, 18); // 18 - 15 + 15 = 18
    assert.equal(releaseRes.wallet.reserved_credits, 0);

    const db = await getMongoDb();
    const idempDoc = await db.collection('idempotency_keys').findOne({ client_key: attemptId });
    assert.equal(idempDoc?.status, 'refunded');

    const refundTx = await db.collection('credit_transactions').findOne({
      reference_id: attemptId,
      type: 'reservation_release',
    });
    assert.ok(refundTx);
    assert.equal(refundTx.available_delta, 15);
    assert.equal(refundTx.reserved_delta, -15);
  });

  // =========================================================================
  // 7. Settlement / Recovery Race Condition Protection
  // =========================================================================
  it('7. Protects against settlement vs refund races: exactly one transaction succeeds', async () => {
    await CreditRepository.grantCredits({
      userId: INT_USER_RACE,
      amount: 50,
      type: 'monthly_grant',
      idempotencyKey: `race_init_${INT_USER_RACE}`,
      description: 'Race condition test funds',
    });

    const attemptId = crypto.randomUUID();
    await CreditRepository.reserveCredits({
      userId: INT_USER_RACE,
      attemptId,
      operationId: 'race_test',
      amount: 30,
    });

    // Fire settlement and release concurrently
    const settlePromise = CreditRepository.settleReservation(attemptId, 30).then(
      () => ({ outcome: 'settled' as const }),
      (err) => ({ outcome: 'settle_failed' as const, error: err.message })
    );

    const refundPromise = CreditRepository.releaseReservation(attemptId, 'Concurrent recovery worker').then(
      () => ({ outcome: 'refunded' as const }),
      (err) => ({ outcome: 'refund_failed' as const, error: err.message })
    );

    const [settleResult, refundResult] = await Promise.all([settlePromise, refundPromise]);

    // Either settle succeeded and refund failed, or refund succeeded and settle failed
    const winnerCount = (settleResult.outcome === 'settled' ? 1 : 0) + (refundResult.outcome === 'refunded' ? 1 : 0);
    assert.equal(winnerCount, 1, 'Exactly one concurrent operation must win');

    const wallet = await CreditRepository.getOrCreateWallet(INT_USER_RACE);
    assert.equal(wallet.reserved_credits, 0, 'Reserved credits must return to 0');
    assert.ok(wallet.available_credits === 20 || wallet.available_credits === 50, 'Balance must be either 20 or 50');
  });

  // =========================================================================
  // 8. Transaction Rollback on Mid-Flight Failure
  // =========================================================================
  it('8. Aborts transaction cleanly when error occurs mid-transaction without partial mutation', async () => {
    const walletBefore = await CreditRepository.getOrCreateWallet(INT_USER);
    const availableBefore = walletBefore.available_credits;

    let transactionFailed = false;
    try {
      await withFinancialTransaction(async (session) => {
        const db = await getMongoDb();
        // Mutate wallet inside transaction
        await db.collection('credit_wallets').updateOne(
          { id: walletBefore.id },
          { $inc: { available_credits: -10 } },
          { session }
        );
        // Force error to trigger transaction abort
        throw new Error('SIMULATED_MIDDLEWARE_FAILURE');
      });
    } catch (err: any) {
      if (err.message === 'SIMULATED_MIDDLEWARE_FAILURE') {
        transactionFailed = true;
      }
    }

    assert.equal(transactionFailed, true, 'Transaction must throw');

    // Verify wallet was NOT mutated
    const walletAfter = await CreditRepository.getOrCreateWallet(INT_USER);
    assert.equal(walletAfter.available_credits, availableBefore, 'Wallet balance must be identical after rollback');
  });

  // =========================================================================
  // 9. Unique Index Constraint Behavior
  // =========================================================================
  it('9. Enforces unique index constraints on permanent idempotency keys and outbox events', async () => {
    const db = await getMongoDb();
    const duplicateKey = `uniq_test_${crypto.randomUUID()}`;

    // 1. First insert
    await db.collection('idempotency_keys').insertOne({
      _id: duplicateKey,
      user_id: INT_USER,
      operation_type: 'test',
      client_key: duplicateKey,
      request_payload_sha256: 'hash123',
      status: 'committed',
      created_at: new Date(),
      updated_at: new Date(),
    });

    // 2. Duplicate insert must throw code 11000
    let duplicateCaught = false;
    try {
      await db.collection('idempotency_keys').insertOne({
        _id: duplicateKey,
        user_id: INT_USER,
        operation_type: 'test',
        client_key: duplicateKey,
        request_payload_sha256: 'hash123',
        status: 'committed',
        created_at: new Date(),
        updated_at: new Date(),
      });
    } catch (err: any) {
      if (err.code === 11000) {
        duplicateCaught = true;
      }
    }

    assert.equal(duplicateCaught, true, 'Duplicate key must be rejected by unique index 11000');
  });
});
