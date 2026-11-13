import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import {
  CreditRepository,
  buildCanonicalIdempotencyKey,
  computeCanonicalPayloadHash,
} from '../db/repositories/creditRepository.js';
import {
  CreditReservationRecord,
  CreditWalletRecord,
  CreditTransactionRecord,
  IdempotencyKeyRecord,
  AppError,
} from '../types/index.js';

describe('VireoClip Phase 4B.3 — Problem 2: Missing Idempotency Record & Unsafe Upsert Safety Verification', () => {
  const testTrackedUsers: string[] = [];

  async function createTestUser(initialCredits = 200): Promise<string> {
    const userId = crypto.randomUUID();
    testTrackedUsers.push(userId);
    await CreditRepository.grantCredits({
      userId,
      amount: initialCredits,
      type: 'monthly_grant',
      idempotencyKey: `grant_${userId}`,
      description: 'Test User Initial Grant',
    });
    return userId;
  }

  after(async () => {
    try {
      if (testTrackedUsers.length > 0) {
        const db = await getMongoDb();
        await db.collection('credit_wallets').deleteMany({ user_id: { $in: testTrackedUsers } });
        await db.collection('credit_transactions').deleteMany({ user_id: { $in: testTrackedUsers } });
        await db.collection('credit_reservations').deleteMany({ user_id: { $in: testTrackedUsers } });
        await db.collection('idempotency_keys').deleteMany({ user_id: { $in: testTrackedUsers } });
        await db.collection('outbox_events').deleteMany({ user_id: { $in: testTrackedUsers } });
        await db.collection('user_concurrency_slots').deleteMany({ user_id: { $in: testTrackedUsers } });
      }
    } finally {
      await closeMongo(true);
    }
  });

  // =========================================================================
  // Scenario 1: Missing Idempotency Record during Settlement
  // =========================================================================
  test('1. Delete idempotency record after reservation, then attempt settlement -> fails closed (409 IDEMPOTENCY_RECORD_MISSING)', async () => {
    const db = await getMongoDb();
    const userId = await createTestUser(100);
    const attemptId = `settle_missing_idemp_${Date.now()}`;
    const opId = 'ai_clipping';

    const reserveRes = await CreditRepository.reserveCredits({
      userId,
      attemptId,
      operationId: opId,
      amount: 30,
    });
    assert.equal(reserveRes.allowed, true);

    const canonicalKey = buildCanonicalIdempotencyKey(userId, opId, attemptId);

    // Delete the idempotency record to simulate data loss / omission defect
    const deleteResult = await db.collection('idempotency_keys').deleteOne({ _id: canonicalKey });
    assert.equal(deleteResult.deletedCount, 1);

    const walletBefore = await CreditRepository.getOrCreateWallet(userId);

    // Attempt settlement -> MUST FAIL CLOSED
    await assert.rejects(
      async () => {
        await CreditRepository.settleReservation(attemptId, 30);
      },
      (err: any) => {
        const code = err.code || err.errorCode;
        assert.equal(err.statusCode, 409);
        assert.equal(code, 'IDEMPOTENCY_RECORD_MISSING');
        return true;
      }
    );

    // Verify wallet was NOT mutated
    const walletAfter = await CreditRepository.getOrCreateWallet(userId);
    assert.equal(walletAfter.available_credits, walletBefore.available_credits);
    assert.equal(walletAfter.reserved_credits, walletBefore.reserved_credits);
    assert.equal(walletAfter.period_consumed, walletBefore.period_consumed);

    // Verify reservation was NOT transitioned to settled
    const resDoc = await db.collection<CreditReservationRecord>('credit_reservations').findOne({ attempt_id: attemptId });
    assert.ok(resDoc);
    assert.equal(resDoc.status, 'reserved');
    assert.ok(!resDoc.settled_amount);

    // Verify zero consumption ledger writes
    const ledgerTx = await db.collection<CreditTransactionRecord>('credit_transactions').find({
      user_id: userId,
      attempt_id: attemptId,
      type: 'consumption',
    }).toArray();
    assert.equal(ledgerTx.length, 0);

    // Verify idempotency record was NOT silently recreated with empty hash
    const idempDoc = await db.collection('idempotency_keys').findOne({ _id: canonicalKey });
    assert.equal(idempDoc, null);
  });

  // =========================================================================
  // Scenario 2: Missing Idempotency Record during Refund
  // =========================================================================
  test('2. Delete idempotency record after reservation, then attempt refund -> fails closed (409 IDEMPOTENCY_RECORD_MISSING)', async () => {
    const db = await getMongoDb();
    const userId = await createTestUser(100);
    const attemptId = `refund_missing_idemp_${Date.now()}`;
    const opId = 'ai_clipping';

    const reserveRes = await CreditRepository.reserveCredits({
      userId,
      attemptId,
      operationId: opId,
      amount: 30,
    });
    assert.equal(reserveRes.allowed, true);

    const canonicalKey = buildCanonicalIdempotencyKey(userId, opId, attemptId);

    // Delete the idempotency record
    const deleteResult = await db.collection('idempotency_keys').deleteOne({ _id: canonicalKey });
    assert.equal(deleteResult.deletedCount, 1);

    const walletBefore = await CreditRepository.getOrCreateWallet(userId);

    // Attempt refund -> MUST FAIL CLOSED
    await assert.rejects(
      async () => {
        await CreditRepository.releaseReservation(attemptId, 'Test refund with missing idempotency record');
      },
      (err: any) => {
        const code = err.code || err.errorCode;
        assert.equal(err.statusCode, 409);
        assert.equal(code, 'IDEMPOTENCY_RECORD_MISSING');
        return true;
      }
    );

    // Verify wallet was NOT restored
    const walletAfter = await CreditRepository.getOrCreateWallet(userId);
    assert.equal(walletAfter.available_credits, walletBefore.available_credits);
    assert.equal(walletAfter.reserved_credits, walletBefore.reserved_credits);

    // Verify reservation was NOT released
    const resDoc = await db.collection<CreditReservationRecord>('credit_reservations').findOne({ attempt_id: attemptId });
    assert.ok(resDoc);
    assert.equal(resDoc.status, 'reserved');

    // Verify zero refund ledger writes
    const ledgerTx = await db.collection<CreditTransactionRecord>('credit_transactions').find({
      user_id: userId,
      attempt_id: attemptId,
      type: 'reservation_release',
    }).toArray();
    assert.equal(ledgerTx.length, 0);

    // Verify idempotency record was NOT recreated
    const idempDoc = await db.collection('idempotency_keys').findOne({ _id: canonicalKey });
    assert.equal(idempDoc, null);
  });

  // =========================================================================
  // Scenario 3: Tenant Isolation Enforcement
  // =========================================================================
  test('3. Cross-tenant isolation: User B idempotency record cannot settle or refund User A reservation', async () => {
    const db = await getMongoDb();
    const userA = await createTestUser(100);
    const userB = await createTestUser(100);
    const attemptIdA = `cross_tenant_attA_${Date.now()}`;
    const opId = 'ai_clipping';

    await CreditRepository.reserveCredits({
      userId: userA,
      attemptId: attemptIdA,
      operationId: opId,
      amount: 20,
    });

    const canonicalKeyA = buildCanonicalIdempotencyKey(userA, opId, attemptIdA);

    // Delete User A's idempotency record
    await db.collection('idempotency_keys').deleteOne({ _id: canonicalKeyA });

    // Insert a document under User B's ownership with User A's attemptId
    const canonicalKeyB = buildCanonicalIdempotencyKey(userB, opId, attemptIdA);
    await db.collection<IdempotencyKeyRecord>('idempotency_keys').insertOne({
      _id: canonicalKeyB,
      user_id: userB,
      operation_type: opId,
      operation_id: opId,
      client_key: attemptIdA,
      attempt_id: attemptIdA,
      request_payload_sha256: 'userB_hash',
      status: 'in_progress',
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Attempt settlement on User A's reservation -> MUST FAIL CLOSED (User A's record is missing)
    await assert.rejects(
      async () => {
        await CreditRepository.settleReservation(attemptIdA, 20);
      },
      (err: any) => {
        const code = err.code || err.errorCode;
        assert.equal(code, 'IDEMPOTENCY_RECORD_MISSING');
        return true;
      }
    );

    // Attempt refund on User A's reservation -> MUST FAIL CLOSED
    await assert.rejects(
      async () => {
        await CreditRepository.releaseReservation(attemptIdA, 'cross tenant release');
      },
      (err: any) => {
        const code = err.code || err.errorCode;
        assert.equal(code, 'IDEMPOTENCY_RECORD_MISSING');
        return true;
      }
    );
  });

  // =========================================================================
  // Scenario 4: Mismatched Operation ID or Reservation ID
  // =========================================================================
  test('4. Non-existent attempt ID or tampered operation ID fails closed', async () => {
    const db = await getMongoDb();
    const userId = await createTestUser(100);
    const fakeAttempt = `fake_attempt_${Date.now()}`;

    // Non-existent attemptId returns 404
    await assert.rejects(
      async () => {
        await CreditRepository.settleReservation(fakeAttempt, 10);
      },
      (err: any) => {
        const code = err.code || err.errorCode;
        assert.equal(code, 'RESERVATION_NOT_FOUND');
        assert.equal(err.statusCode, 404);
        return true;
      }
    );

    await assert.rejects(
      async () => {
        await CreditRepository.releaseReservation(fakeAttempt, 'non-existent');
      },
      (err: any) => {
        const code = err.code || err.errorCode;
        assert.equal(code, 'RESERVATION_NOT_FOUND');
        assert.equal(err.statusCode, 404);
        return true;
      }
    );

    // Create valid reservation, then tamper operation_id on reservation document
    const validAttempt = `tampered_op_attempt_${Date.now()}`;
    await CreditRepository.reserveCredits({
      userId,
      attemptId: validAttempt,
      operationId: 'ai_clipping',
      amount: 15,
    });

    // Tamper operation_id on reservation in database
    await db.collection('credit_reservations').updateOne(
      { attempt_id: validAttempt },
      { $set: { operation_id: 'tampered_operation' } }
    );

    // Settlement must fail closed because canonical key no longer resolves to original idempotency doc
    await assert.rejects(
      async () => {
        await CreditRepository.settleReservation(validAttempt, 15);
      },
      (err: any) => {
        const code = err.code || err.errorCode;
        assert.equal(code, 'IDEMPOTENCY_RECORD_MISSING');
        return true;
      }
    );
  });

  // =========================================================================
  // Scenario 5: Initial Reservation Creation Legitimately Creates Record
  // =========================================================================
  test('5. Initial reservation creation legitimately creates idempotency record (standard & 0-credit)', async () => {
    const db = await getMongoDb();
    const userId = await createTestUser(100);
    const standardAttempt = `init_standard_${Date.now()}`;
    const zeroAttempt = `init_zero_${Date.now()}`;

    // 1. Standard reservation
    const stdRes = await CreditRepository.reserveCredits({
      userId,
      attemptId: standardAttempt,
      operationId: 'ai_clipping',
      amount: 25,
      metadata: { preset: 'smart_reframe' },
    });
    assert.equal(stdRes.allowed, true);

    const stdKey = buildCanonicalIdempotencyKey(userId, 'ai_clipping', standardAttempt);
    const stdIdemp = await db.collection<IdempotencyKeyRecord>('idempotency_keys').findOne({ _id: stdKey });
    assert.ok(stdIdemp);
    assert.equal(stdIdemp.status, 'in_progress');
    assert.equal(stdIdemp.user_id, userId);
    assert.equal(stdIdemp.operation_type, 'ai_clipping');
    assert.equal(stdIdemp.client_key, standardAttempt);
    assert.ok(stdIdemp.request_payload_sha256.length > 0);

    // 2. 0-credit reservation (Content Studio / transcript reuse)
    const zeroRes = await CreditRepository.reserveCredits({
      userId,
      attemptId: zeroAttempt,
      operationId: 'content_studio_generation',
      amount: 0,
      metadata: { free: true },
    });
    assert.equal(zeroRes.allowed, true);

    const zeroKey = buildCanonicalIdempotencyKey(userId, 'content_studio_generation', zeroAttempt);
    const zeroIdemp = await db.collection<IdempotencyKeyRecord>('idempotency_keys').findOne({ _id: zeroKey });
    assert.ok(zeroIdemp);
    assert.equal(zeroIdemp.status, 'committed');
    assert.equal(zeroIdemp.user_id, userId);
  });

  // =========================================================================
  // Scenario 6: Same-Key and Same-Payload Retries Return Existing Operation
  // =========================================================================
  test('6. Same-key and same-payload retries return existing operation idempotently', async () => {
    const userId = await createTestUser(100);
    const attemptId = `retry_same_payload_${Date.now()}`;
    const params = {
      userId,
      attemptId,
      operationId: 'ai_clipping',
      amount: 20,
      metadata: { quality: '1080p' },
    };

    const first = await CreditRepository.reserveCredits(params);
    assert.equal(first.allowed, true);
    assert.equal(first.idempotent, undefined);

    const walletAfterFirst = await CreditRepository.getOrCreateWallet(userId);

    // Exact retry
    const second = await CreditRepository.reserveCredits(params);
    assert.equal(second.allowed, true);
    assert.equal(second.idempotent, true);
    assert.equal(second.reservation.id, first.reservation.id);

    const walletAfterSecond = await CreditRepository.getOrCreateWallet(userId);
    assert.equal(walletAfterSecond.available_credits, walletAfterFirst.available_credits);
    assert.equal(walletAfterSecond.reserved_credits, walletAfterFirst.reserved_credits);
  });

  // =========================================================================
  // Scenario 7: Same-Key and Different-Payload Retries Fail Closed
  // =========================================================================
  test('7. Same-key and different-payload retries return HTTP 409 IDEMPOTENCY_KEY_COLLISION_WITH_DIFFERENT_PAYLOAD', async () => {
    const userId = await createTestUser(100);
    const attemptId = `retry_diff_payload_${Date.now()}`;

    await CreditRepository.reserveCredits({
      userId,
      attemptId,
      operationId: 'ai_clipping',
      amount: 20,
    });

    // Retry with different amount (material payload change)
    await assert.rejects(
      async () => {
        await CreditRepository.reserveCredits({
          userId,
          attemptId,
          operationId: 'ai_clipping',
          amount: 50,
        });
      },
      (err: any) => {
        const code = err.code || err.errorCode;
        assert.equal(code, 'IDEMPOTENCY_KEY_COLLISION_WITH_DIFFERENT_PAYLOAD');
        assert.equal(err.statusCode, 409);
        return true;
      }
    );
  });

  // =========================================================================
  // Scenario 8: Duplicate Settlement Cannot Double-Consume Credits
  // =========================================================================
  test('8. Duplicate settlement cannot double-consume credits or duplicate ledger entries', async () => {
    const db = await getMongoDb();
    const userId = await createTestUser(100);
    const attemptId = `dup_settle_${Date.now()}`;

    const res = await CreditRepository.reserveCredits({
      userId,
      attemptId,
      operationId: 'ai_clipping',
      amount: 40,
    });
    assert.equal(res.allowed, true);

    // Wallet: 100 total, 60 available, 40 reserved
    // Settle 30 credits (10 refunded back to available)
    const settle1 = await CreditRepository.settleReservation(attemptId, 30);
    assert.equal(settle1.settledAmount, 30);
    assert.equal(settle1.idempotent, undefined);

    const walletAfterSettle1 = await CreditRepository.getOrCreateWallet(userId);
    assert.equal(walletAfterSettle1.available_credits, 70); // 60 + 10
    assert.equal(walletAfterSettle1.reserved_credits, 0);
    assert.equal(walletAfterSettle1.period_consumed, 30);

    // Duplicate settlement call
    const settle2 = await CreditRepository.settleReservation(attemptId, 30);
    assert.equal(settle2.settledAmount, 30);
    assert.equal(settle2.idempotent, true);

    const walletAfterSettle2 = await CreditRepository.getOrCreateWallet(userId);
    assert.equal(walletAfterSettle2.available_credits, 70);
    assert.equal(walletAfterSettle2.reserved_credits, 0);
    assert.equal(walletAfterSettle2.period_consumed, 30);

    // Verify exactly 1 consumption transaction in ledger
    const txCount = await db.collection('credit_transactions').countDocuments({
      user_id: userId,
      attempt_id: attemptId,
      type: 'consumption',
    });
    assert.equal(txCount, 1);

    // Verify idempotency record status is 'committed'
    const idempKey = buildCanonicalIdempotencyKey(userId, 'ai_clipping', attemptId);
    const idempDoc = await db.collection<IdempotencyKeyRecord>('idempotency_keys').findOne({ _id: idempKey });
    assert.equal(idempDoc?.status, 'committed');
  });

  // =========================================================================
  // Scenario 9: Duplicate Refund Cannot Restore Credits Twice
  // =========================================================================
  test('9. Duplicate refund cannot restore credits twice or duplicate refund ledger entries', async () => {
    const db = await getMongoDb();
    const userId = await createTestUser(100);
    const attemptId = `dup_refund_${Date.now()}`;

    const res = await CreditRepository.reserveCredits({
      userId,
      attemptId,
      operationId: 'ai_clipping',
      amount: 35,
    });
    assert.equal(res.allowed, true);

    // Wallet: 100 total, 65 available, 35 reserved
    const ref1 = await CreditRepository.releaseReservation(attemptId, 'Worker failure refund');
    assert.equal(ref1.releasedAmount, 35);
    assert.equal(ref1.idempotent, undefined);

    const walletAfterRef1 = await CreditRepository.getOrCreateWallet(userId);
    assert.equal(walletAfterRef1.available_credits, 100);
    assert.equal(walletAfterRef1.reserved_credits, 0);

    // Duplicate release call
    const ref2 = await CreditRepository.releaseReservation(attemptId, 'Worker failure refund retry');
    assert.equal(ref2.releasedAmount, 35);
    assert.equal(ref2.idempotent, true);

    const walletAfterRef2 = await CreditRepository.getOrCreateWallet(userId);
    assert.equal(walletAfterRef2.available_credits, 100);
    assert.equal(walletAfterRef2.reserved_credits, 0);

    // Verify exactly 1 release transaction in ledger
    const txCount = await db.collection('credit_transactions').countDocuments({
      user_id: userId,
      attempt_id: attemptId,
      type: 'reservation_release',
    });
    assert.equal(txCount, 1);

    // Verify idempotency record status is 'refunded'
    const idempKey = buildCanonicalIdempotencyKey(userId, 'ai_clipping', attemptId);
    const idempDoc = await db.collection<IdempotencyKeyRecord>('idempotency_keys').findOne({ _id: idempKey });
    assert.equal(idempDoc?.status, 'refunded');
  });

  // =========================================================================
  // Scenario 10: Concurrent Settlement vs Refund Attempts
  // =========================================================================
  test('10. Concurrent settlement vs refund attempts against same reservation -> exactly one winner', async () => {
    const userId = await createTestUser(100);
    const attemptId = `race_settle_refund_${Date.now()}`;

    const res = await CreditRepository.reserveCredits({
      userId,
      attemptId,
      operationId: 'ai_clipping',
      amount: 40,
    });
    assert.equal(res.allowed, true);

    // Launch concurrent settle vs refund
    const settlePromise = CreditRepository.settleReservation(attemptId, 40);
    const refundPromise = CreditRepository.releaseReservation(attemptId, 'Concurrent failure');

    const results = await Promise.allSettled([settlePromise, refundPromise]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.equal(fulfilled.length, 1, 'Exactly one operation must win');
    assert.equal(rejected.length, 1, 'Exactly one operation must be rejected');

    const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
    const rejCode = rejectionReason.code || rejectionReason.errorCode;
    assert.ok(
      rejCode === 'RESERVATION_ALREADY_RELEASED' ||
      rejCode === 'RESERVATION_ALREADY_SETTLED' ||
      rejCode === 'STALE_WORKER_FENCE_LOST' ||
      rejCode === 'STALE_RECOVERY_FENCE_LOST' ||
      rejCode === 'STATE_MISMATCH_RECONCILIATION_REQUIRED',
      `Rejection code was: ${rejCode}`
    );

    // Verify wallet consistency: available + reserved must equal 100
    const wallet = await CreditRepository.getOrCreateWallet(userId);
    assert.equal(wallet.reserved_credits, 0);
    assert.ok(wallet.available_credits === 60 || wallet.available_credits === 100);
  });

  // =========================================================================
  // Scenario 11: Missing-Record & State-Mismatch Recovery Flagged for Reconciliation
  // =========================================================================
  test('11. Missing-record and state-mismatch recovery scenarios -> flagged for reconciliation without unsafe refund', async () => {
    const db = await getMongoDb();
    const userId = await createTestUser(100);
    const now = new Date();

    // 11a. Expired reservation with missing idempotency record
    const missingAttempt = `orphan_missing_idemp_${Date.now()}`;
    await db.collection<CreditReservationRecord>('credit_reservations').insertOne({
      id: crypto.randomUUID(),
      wallet_id: crypto.randomUUID(),
      user_id: userId,
      attempt_id: missingAttempt,
      operation_id: 'abandoned_worker',
      amount: 20,
      status: 'reserved',
      expires_at: new Date(now.getTime() - 3600 * 1000), // 1 hour ago
      created_at: new Date(now.getTime() - 7200 * 1000),
      updated_at: now,
    });
    await db.collection('credit_wallets').updateOne(
      { user_id: userId },
      { $inc: { available_credits: -20, reserved_credits: 20 } }
    );

    // 11b. Expired reservation with state mismatch (reservation reserved, idempotency committed)
    const mismatchAttempt = `orphan_mismatch_${Date.now()}`;
    await db.collection<CreditReservationRecord>('credit_reservations').insertOne({
      id: crypto.randomUUID(),
      wallet_id: crypto.randomUUID(),
      user_id: userId,
      attempt_id: mismatchAttempt,
      operation_id: 'abandoned_worker',
      amount: 15,
      status: 'reserved',
      expires_at: new Date(now.getTime() - 3600 * 1000),
      created_at: new Date(now.getTime() - 7200 * 1000),
      updated_at: now,
    });
    await db.collection('credit_wallets').updateOne(
      { user_id: userId },
      { $inc: { available_credits: -15, reserved_credits: 15 } }
    );
    const mismatchKey = buildCanonicalIdempotencyKey(userId, 'abandoned_worker', mismatchAttempt);
    await db.collection<IdempotencyKeyRecord>('idempotency_keys').insertOne({
      _id: mismatchKey,
      user_id: userId,
      operation_type: 'abandoned_worker',
      operation_id: 'abandoned_worker',
      client_key: mismatchAttempt,
      attempt_id: mismatchAttempt,
      request_payload_sha256: 'test_hash',
      status: 'committed', // Mismatched status!
      created_at: now,
      updated_at: now,
    });

    const walletBeforeRecovery = await CreditRepository.getOrCreateWallet(userId);

    // Run background sweeper
    const recoveredCount = await CreditRepository.recoverExpiredReservations();
    // Neither of the 2 should have been recovered (both are consistency failures)
    assert.equal(recoveredCount, 0);

    // Verify 11a: Missing-record reservation was marked reconciliation_required
    const resA = await db.collection<CreditReservationRecord>('credit_reservations').findOne({ attempt_id: missingAttempt });
    assert.ok(resA);
    assert.equal(resA.status, 'reconciliation_required');
    assert.match(resA.reconciliation_reason || '', /Idempotency record missing/);

    // Verify 11b: State-mismatch reservation was marked reconciliation_required
    const resB = await db.collection<CreditReservationRecord>('credit_reservations').findOne({ attempt_id: mismatchAttempt });
    assert.ok(resB);
    assert.equal(resB.status, 'reconciliation_required');

    // Verify NO credits were blindly refunded to wallet
    const walletAfterRecovery = await CreditRepository.getOrCreateWallet(userId);
    assert.equal(walletAfterRecovery.available_credits, walletBeforeRecovery.available_credits);
    assert.equal(walletAfterRecovery.reserved_credits, walletBeforeRecovery.reserved_credits);
  });

  // =========================================================================
  // Scenario 12: Unknown Commit / reconciliation_required Rejection & No Recreation
  // =========================================================================
  test('12. Unknown commit reconciliation does not recreate record or duplicate financial mutation', async () => {
    const db = await getMongoDb();
    const userId = await createTestUser(100);
    const attemptId = `unknown_commit_${Date.now()}`;
    const opId = 'ai_clipping';

    const res = await CreditRepository.reserveCredits({
      userId,
      attemptId,
      operationId: opId,
      amount: 30,
    });
    assert.equal(res.allowed, true);

    const canonicalKey = buildCanonicalIdempotencyKey(userId, opId, attemptId);

    // Simulate an unknown commit outcome that placed idempotency into 'reconciliation_required'
    await db.collection('idempotency_keys').updateOne(
      { _id: canonicalKey },
      { $set: { status: 'reconciliation_required', updated_at: new Date() } }
    );

    // 1. Client retry must fail with 409 RECONCILIATION_IN_PROGRESS
    await assert.rejects(
      async () => {
        await CreditRepository.reserveCredits({
          userId,
          attemptId,
          operationId: opId,
          amount: 30,
        });
      },
      (err: any) => {
        const code = err.code || err.errorCode;
        assert.equal(code, 'RECONCILIATION_IN_PROGRESS');
        assert.equal(err.statusCode, 409);
        return true;
      }
    );

    // 2. Settlement attempt must fail with 409 RECONCILIATION_IN_PROGRESS
    await assert.rejects(
      async () => {
        await CreditRepository.settleReservation(attemptId, 30);
      },
      (err: any) => {
        const code = err.code || err.errorCode;
        assert.equal(code, 'RECONCILIATION_IN_PROGRESS');
        assert.equal(err.statusCode, 409);
        return true;
      }
    );

    // 3. Refund attempt must fail with 409 RECONCILIATION_IN_PROGRESS
    await assert.rejects(
      async () => {
        await CreditRepository.releaseReservation(attemptId, 'Unknown commit refund');
      },
      (err: any) => {
        const code = err.code || err.errorCode;
        assert.equal(code, 'RECONCILIATION_IN_PROGRESS');
        assert.equal(err.statusCode, 409);
        return true;
      }
    );

    // Verify idempotency record was NOT recreated, overwritten, or mutated
    const idempDoc = await db.collection<IdempotencyKeyRecord>('idempotency_keys').findOne({ _id: canonicalKey });
    assert.ok(idempDoc);
    assert.equal(idempDoc.status, 'reconciliation_required');
  });

  // =========================================================================
  // Scenario 13: Sweeper Concurrency Race Against Settle / Refund
  // =========================================================================
  test('13. Concurrency race: Sweeper cannot overwrite settled state when settlement commits concurrently', async () => {
    const db = await getMongoDb();
    const userId = await createTestUser(100);
    const attemptId = `race_sweeper_settle_${Date.now()}`;
    const opId = 'ai_clipping';

    const res = await CreditRepository.reserveCredits({
      userId,
      attemptId,
      operationId: opId,
      amount: 40,
    });
    assert.equal(res.allowed, true);

    const canonicalResKey = `${userId}:${attemptId}`;
    const pastExpires = new Date(Date.now() - 3600 * 1000);

    // Make reservation expired so sweeper considers it
    await db.collection('credit_reservations').updateOne(
      { _id: canonicalResKey },
      { $set: { expires_at: pastExpires, worker_leased_until: pastExpires } }
    );

    // Concurrently launch settlement and sweeper recovery
    const settlePromise = CreditRepository.settleReservation(attemptId, 40);
    const sweeperPromise = CreditRepository.recoverExpiredReservations();

    const [settleRes, sweeperRes] = await Promise.allSettled([settlePromise, sweeperPromise]);

    const finalRes = await db.collection<CreditReservationRecord>('credit_reservations').findOne({ _id: canonicalResKey });
    assert.ok(finalRes);

    // Critical Invariant: Status must be strictly 'settled' or 'released' - NEVER corrupted to 'reconciliation_required'!
    assert.notEqual(finalRes.status, 'reconciliation_required', 'Sweeper must NEVER overwrite a concurrent settlement with reconciliation_required');
    assert.ok(
      finalRes.status === 'settled' || finalRes.status === 'released' || finalRes.status === 'refunded',
      `Final status was ${finalRes.status}`
    );

    if (settleRes.status === 'fulfilled') {
      assert.equal(finalRes.status, 'settled');
      const canonicalIdempKey = buildCanonicalIdempotencyKey(userId, opId, attemptId);
      const finalIdemp = await db.collection<IdempotencyKeyRecord>('idempotency_keys').findOne({ _id: canonicalIdempKey });
      assert.equal(finalIdemp?.status, 'committed');
    }
  });

  // =========================================================================
  // Scenario 14: Hard Deadline Sweeper Race Against Settled Reservation
  // =========================================================================
  test('14. Sweeper hard-deadline sweep racing with settled reservation preserves settled state', async () => {
    const db = await getMongoDb();
    const userId = await createTestUser(100);
    const attemptId = `hard_deadline_settle_${Date.now()}`;
    const opId = 'ai_clipping';

    const res = await CreditRepository.reserveCredits({
      userId,
      attemptId,
      operationId: opId,
      amount: 30,
    });
    assert.equal(res.allowed, true);

    const canonicalResKey = `${userId}:${attemptId}`;
    const pastHardDeadline = new Date(Date.now() - 1000);

    // Settle the reservation first
    const settleResult = await CreditRepository.settleReservation(attemptId, 30);
    assert.equal(settleResult.reservation.status, 'settled');

    // Simulate stale sweeper finding document with past hard_deadline_at
    await db.collection('credit_reservations').updateOne(
      { _id: canonicalResKey },
      { $set: { hard_deadline_at: pastHardDeadline } }
    );

    // Run sweeper
    const recovered = await CreditRepository.recoverExpiredReservations();

    // Verify reservation was NOT touched or corrupted by sweeper
    const resAfter = await db.collection<CreditReservationRecord>('credit_reservations').findOne({ _id: canonicalResKey });
    assert.ok(resAfter);
    assert.equal(resAfter.status, 'settled', 'Hard-deadline sweeper must NEVER overwrite settled reservation');
  });

  // =========================================================================
  // Scenario 15: Refund Racing With Sweeper — Idempotency Record Exists (in_progress)
  // Exactly one refund must succeed. Wallet must be restored exactly once.
  // =========================================================================
  test('15. Refund racing with sweeper when idempotency record exists -> exactly one refund, wallet restored once', async () => {
    const db = await getMongoDb();
    const userId = await createTestUser(200);
    const attemptId = `refund_sweeper_race_valid_${Date.now()}`;
    const opId = 'ai_clipping';

    const walletBefore = await CreditRepository.getOrCreateWallet(userId);
    const initialAvailable = walletBefore.available_credits;

    const res = await CreditRepository.reserveCredits({
      userId,
      attemptId,
      operationId: opId,
      amount: 50,
    });
    assert.equal(res.allowed, true);

    const canonicalResKey = `${userId}:${attemptId}`;
    const canonicalIdempKey = buildCanonicalIdempotencyKey(userId, opId, attemptId);
    const pastExpires = new Date(Date.now() - 3600 * 1000);

    // Make reservation expired so sweeper will pick it up
    await db.collection('credit_reservations').updateOne(
      { _id: canonicalResKey },
      { $set: { expires_at: pastExpires, worker_leased_until: pastExpires } }
    );

    // Launch refund and sweeper concurrently
    const refundPromise = CreditRepository.releaseReservation(attemptId, 'Client cancellation');
    const sweeperPromise = CreditRepository.recoverExpiredReservations();

    const [refundResult, sweeperResult] = await Promise.allSettled([refundPromise, sweeperPromise]);

    // At least one path must succeed in refunding (either direct refund or sweeper-driven refund)
    const refundFulfilled = refundResult.status === 'fulfilled';
    const sweeperRecovered = sweeperResult.status === 'fulfilled' ? (sweeperResult as PromiseFulfilledResult<number>).value : 0;

    // At least one path completed the refund
    assert.ok(
      refundFulfilled || sweeperRecovered > 0,
      `Neither refund (${refundResult.status}) nor sweeper (recovered: ${sweeperRecovered}) succeeded`
    );

    // Verify final reservation state: must be terminal (released/refunded)
    const finalRes = await db.collection<CreditReservationRecord>('credit_reservations').findOne({ _id: canonicalResKey });
    assert.ok(finalRes);
    assert.ok(
      finalRes.status === 'released' || finalRes.status === 'refunded',
      `Expected released/refunded, got: ${finalRes.status}`
    );

    // Verify idempotency record: must be 'refunded'
    const finalIdemp = await db.collection<IdempotencyKeyRecord>('idempotency_keys').findOne({ _id: canonicalIdempKey });
    assert.ok(finalIdemp);
    assert.equal(finalIdemp.status, 'refunded');

    // Verify wallet: credits restored EXACTLY once (no double-refund)
    const walletAfter = await CreditRepository.getOrCreateWallet(userId);
    assert.equal(walletAfter.available_credits, initialAvailable, 'Available credits must be fully restored');
    assert.equal(walletAfter.reserved_credits, 0, 'Reserved credits must be 0');

    // Verify exactly 1 refund ledger entry
    const refundLedgerEntries = await db.collection<CreditTransactionRecord>('credit_transactions')
      .find({ user_id: userId, type: 'reservation_release', attempt_id: attemptId })
      .toArray();
    assert.equal(refundLedgerEntries.length, 1, 'Exactly 1 refund ledger entry must exist (no duplicates)');
  });

  // =========================================================================
  // Scenario 16: Refund Racing With Sweeper — Idempotency Record MISSING
  // Both must fail. Reservation must end as reconciliation_required.
  // Wallet must remain unchanged (no blind refund).
  // =========================================================================
  test('16. Refund racing with sweeper when idempotency record is MISSING -> both fail, reconciliation_required, wallet unchanged', async () => {
    const db = await getMongoDb();
    const userId = await createTestUser(200);
    const attemptId = `refund_sweeper_race_missing_${Date.now()}`;
    const opId = 'ai_clipping';

    const res = await CreditRepository.reserveCredits({
      userId,
      attemptId,
      operationId: opId,
      amount: 50,
    });
    assert.equal(res.allowed, true);

    const canonicalResKey = `${userId}:${attemptId}`;
    const canonicalIdempKey = buildCanonicalIdempotencyKey(userId, opId, attemptId);
    const pastExpires = new Date(Date.now() - 3600 * 1000);

    // Delete the idempotency record to simulate data loss
    const deleteResult = await db.collection('idempotency_keys').deleteOne({ _id: canonicalIdempKey });
    assert.equal(deleteResult.deletedCount, 1);

    // Capture wallet state AFTER deletion but BEFORE any refund attempt
    const walletBeforeRace = await CreditRepository.getOrCreateWallet(userId);

    // Make reservation expired so sweeper considers it
    await db.collection('credit_reservations').updateOne(
      { _id: canonicalResKey },
      { $set: { expires_at: pastExpires, worker_leased_until: pastExpires } }
    );

    // Launch refund and sweeper concurrently — both should fail due to missing idempotency
    const refundPromise = CreditRepository.releaseReservation(attemptId, 'Client cancellation');
    const sweeperPromise = CreditRepository.recoverExpiredReservations();

    const [refundResult, sweeperResult] = await Promise.allSettled([refundPromise, sweeperPromise]);

    // Direct refund MUST fail with IDEMPOTENCY_RECORD_MISSING
    assert.equal(refundResult.status, 'rejected');
    const refundErr = (refundResult as PromiseRejectedResult).reason;
    const refundCode = refundErr.code || refundErr.errorCode;
    assert.equal(refundCode, 'IDEMPOTENCY_RECORD_MISSING');

    // Sweeper should NOT have recovered (returns 0), because releaseReservation fails
    assert.equal(sweeperResult.status, 'fulfilled');
    const sweeperRecovered = (sweeperResult as PromiseFulfilledResult<number>).value;
    assert.equal(sweeperRecovered, 0, 'Sweeper must not count a failed recovery');

    // Verify reservation ends as reconciliation_required (sweeper flagged it)
    const finalRes = await db.collection<CreditReservationRecord>('credit_reservations').findOne({ _id: canonicalResKey });
    assert.ok(finalRes);
    assert.equal(finalRes.status, 'reconciliation_required');

    // Verify wallet is UNCHANGED — no blind refund
    const walletAfter = await CreditRepository.getOrCreateWallet(userId);
    assert.equal(walletAfter.available_credits, walletBeforeRace.available_credits, 'No credits should have been refunded');
    assert.equal(walletAfter.reserved_credits, walletBeforeRace.reserved_credits, 'Reserved credits must be unchanged');

    // Verify 0 refund ledger entries
    const refundLedgerEntries = await db.collection<CreditTransactionRecord>('credit_transactions')
      .find({ user_id: userId, type: 'reservation_release', attempt_id: attemptId })
      .toArray();
    assert.equal(refundLedgerEntries.length, 0, 'No refund ledger entries must exist');
  });

  // =========================================================================
  // Scenario 17: Sweeper Flags Reconciliation First, Then Refund Attempt Arrives
  // The late refund must be rejected with RECONCILIATION_IN_PROGRESS.
  // Wallet must remain unchanged.
  // =========================================================================
  test('17. Sweeper flags reconciliation first, then refund attempt -> rejected RECONCILIATION_IN_PROGRESS, wallet unchanged', async () => {
    const db = await getMongoDb();
    const userId = await createTestUser(200);
    const attemptId = `sweeper_first_then_refund_${Date.now()}`;
    const opId = 'ai_clipping';

    const res = await CreditRepository.reserveCredits({
      userId,
      attemptId,
      operationId: opId,
      amount: 50,
    });
    assert.equal(res.allowed, true);

    const canonicalResKey = `${userId}:${attemptId}`;
    const canonicalIdempKey = buildCanonicalIdempotencyKey(userId, opId, attemptId);
    const pastExpires = new Date(Date.now() - 3600 * 1000);

    // Delete idempotency record and expire reservation
    await db.collection('idempotency_keys').deleteOne({ _id: canonicalIdempKey });
    await db.collection('credit_reservations').updateOne(
      { _id: canonicalResKey },
      { $set: { expires_at: pastExpires, worker_leased_until: pastExpires } }
    );

    // Capture wallet state before race
    const walletBefore = await CreditRepository.getOrCreateWallet(userId);

    // Step 1: Run sweeper FIRST — it should flag reconciliation_required
    const recovered = await CreditRepository.recoverExpiredReservations();
    assert.equal(recovered, 0, 'Sweeper must not count reconciliation as recovery');

    const resAfterSweeper = await db.collection<CreditReservationRecord>('credit_reservations').findOne({ _id: canonicalResKey });
    assert.ok(resAfterSweeper);
    assert.equal(resAfterSweeper.status, 'reconciliation_required');

    // Step 2: Now attempt refund — must be rejected
    await assert.rejects(
      async () => {
        await CreditRepository.releaseReservation(attemptId, 'Late refund attempt');
      },
      (err: any) => {
        const code = err.code || err.errorCode;
        // The refund pre-check sees missing idempotency record (it was deleted)
        // OR it sees reservation is reconciliation_required and the idempotency record
        // doesn't exist (IDEMPOTENCY_RECORD_MISSING).
        // Either IDEMPOTENCY_RECORD_MISSING or RECONCILIATION_IN_PROGRESS is acceptable
        // because both prevent financial mutation.
        assert.ok(
          code === 'RECONCILIATION_IN_PROGRESS' || code === 'IDEMPOTENCY_RECORD_MISSING',
          `Expected RECONCILIATION_IN_PROGRESS or IDEMPOTENCY_RECORD_MISSING, got: ${code}`
        );
        assert.equal(err.statusCode, 409);
        return true;
      }
    );

    // Verify wallet is UNCHANGED — no refund occurred
    const walletAfter = await CreditRepository.getOrCreateWallet(userId);
    assert.equal(walletAfter.available_credits, walletBefore.available_credits, 'Available credits must be unchanged');
    assert.equal(walletAfter.reserved_credits, walletBefore.reserved_credits, 'Reserved credits must be unchanged');

    // Verify reservation still reconciliation_required (not overwritten)
    const finalRes = await db.collection<CreditReservationRecord>('credit_reservations').findOne({ _id: canonicalResKey });
    assert.ok(finalRes);
    assert.equal(finalRes.status, 'reconciliation_required');

    // Verify 0 refund ledger entries
    const refundLedgerEntries = await db.collection<CreditTransactionRecord>('credit_transactions')
      .find({ user_id: userId, type: 'reservation_release', attempt_id: attemptId })
      .toArray();
    assert.equal(refundLedgerEntries.length, 0, 'No refund ledger entries must exist');
  });
});
