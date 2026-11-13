import test, { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import {
  CreditRepository,
  buildCanonicalIdempotencyKey,
  computeCanonicalPayloadHash,
} from '../db/repositories/creditRepository.js';
import { AppError } from '../types/index.js';
import { IdempotencyKeyRecord } from '../types/credits.js';

const IDEMP_USER_1 = '00000000-0000-4000-8000-000000000201';
const IDEMP_USER_2 = '00000000-0000-4000-8000-000000000202';
const TEST_USERS = [IDEMP_USER_1, IDEMP_USER_2];

describe('VireoClip Phase 4B.3 — Problem 1: Idempotency Identity Consistency Verification', () => {
  before(async () => {
    const db = await getMongoDb();
    await db.collection('credit_wallets').deleteMany({ user_id: { $in: TEST_USERS } });
    await db.collection('credit_transactions').deleteMany({ user_id: { $in: TEST_USERS } });
    await db.collection('credit_reservations').deleteMany({ user_id: { $in: TEST_USERS } });
    await db.collection('idempotency_keys').deleteMany({ user_id: { $in: TEST_USERS } });
    await db.collection('outbox_events').deleteMany({ user_id: { $in: TEST_USERS } });
    await db.collection('user_concurrency_slots').deleteMany({ user_id: { $in: TEST_USERS } });

    // Grant 200 credits to each test user
    await CreditRepository.grantCredits({
      userId: IDEMP_USER_1,
      amount: 200,
      type: 'monthly_grant',
      idempotencyKey: `init_grant_${IDEMP_USER_1}`,
      description: 'Initial balance for idempotency tests',
    });

    await CreditRepository.grantCredits({
      userId: IDEMP_USER_2,
      amount: 200,
      type: 'monthly_grant',
      idempotencyKey: `init_grant_${IDEMP_USER_2}`,
      description: 'Initial balance for idempotency tests',
    });
  });

  after(async () => {
    try {
      const db = await getMongoDb();
      await db.collection('credit_wallets').deleteMany({ user_id: { $in: TEST_USERS } });
      await db.collection('credit_transactions').deleteMany({ user_id: { $in: TEST_USERS } });
      await db.collection('credit_reservations').deleteMany({ user_id: { $in: TEST_USERS } });
      await db.collection('idempotency_keys').deleteMany({ user_id: { $in: TEST_USERS } });
      await db.collection('outbox_events').deleteMany({ user_id: { $in: TEST_USERS } });
      await db.collection('user_concurrency_slots').deleteMany({ user_id: { $in: TEST_USERS } });
    } finally {
      await closeMongo(true);
    }
  });

  // =========================================================================
  // 1. Same user, same identity, same payload (returns original result)
  // =========================================================================
  it('1. Same user, same identity, same payload returns original result without double charge', async () => {
    const clientKey = crypto.randomUUID();
    const op = 'core_video_processing';

    const first = await CreditRepository.reserveCredits({
      userId: IDEMP_USER_1,
      attemptId: clientKey,
      operationId: op,
      amount: 25,
      metadata: { resolution: '1080p', preset: 'reel' },
    });

    assert.equal(first.allowed, true);
    assert.equal(first.wallet.available_credits, 175);
    assert.equal(first.wallet.reserved_credits, 25);

    const second = await CreditRepository.reserveCredits({
      userId: IDEMP_USER_1,
      attemptId: clientKey,
      operationId: op,
      amount: 25,
      metadata: { resolution: '1080p', preset: 'reel' },
    });

    assert.equal(second.allowed, true);
    assert.equal(second.idempotent, true);
    assert.equal(second.reservation.id, first.reservation.id);
    assert.equal(second.wallet.available_credits, 175, 'Balance must NOT be deducted twice');
    assert.equal(second.wallet.reserved_credits, 25, 'Reserved credits must not double');

    // Clean up
    await CreditRepository.settleReservation(clientKey, 25);
  });

  // =========================================================================
  // 2. Same user, same identity, different payload (throws HTTP 409)
  // =========================================================================
  it('2. Same user, same identity, different payload throws HTTP 409 IDEMPOTENCY_KEY_COLLISION_WITH_DIFFERENT_PAYLOAD', async () => {
    const clientKey = crypto.randomUUID();
    const op = 'core_video_processing';

    await CreditRepository.reserveCredits({
      userId: IDEMP_USER_1,
      attemptId: clientKey,
      operationId: op,
      amount: 15,
      metadata: { sceneCount: 3 },
    });

    let collisionErr: any = null;
    try {
      await CreditRepository.reserveCredits({
        userId: IDEMP_USER_1,
        attemptId: clientKey,
        operationId: op,
        amount: 30, // Changed amount!
        metadata: { sceneCount: 3 },
      });
    } catch (err: any) {
      collisionErr = err;
    }

    assert.ok(collisionErr, 'Must reject altered payload');
    assert.equal(collisionErr.statusCode, 409);
    assert.equal(collisionErr.code, 'IDEMPOTENCY_KEY_COLLISION_WITH_DIFFERENT_PAYLOAD');

    // Clean up
    await CreditRepository.settleReservation(clientKey, 15);
  });

  // =========================================================================
  // 2b. Nested metadata canonicalization: key reordering vs tampering
  // =========================================================================
  it('2b. Reordered nested metadata keys return idempotent success, while nested tampering throws 409', async () => {
    const clientKey = crypto.randomUUID();
    const op = 'core_video_processing';

    // 1. Initial reservation with nested metadata
    const initial = await CreditRepository.reserveCredits({
      userId: IDEMP_USER_1,
      attemptId: clientKey,
      operationId: op,
      amount: 10,
      metadata: {
        resolution: '1080p',
        pipeline: { codec: 'h264', crf: 18, audio: { channels: 2, bitrate: 192 } },
        tags: ['vireo', 'reel'],
      },
    });
    assert.equal(initial.allowed, true);

    // 2. Retry with deeply permuted key insertion order: MUST SUCCEED idempotently
    const reorderedRetry = await CreditRepository.reserveCredits({
      userId: IDEMP_USER_1,
      attemptId: clientKey,
      operationId: op,
      amount: 10,
      metadata: {
        tags: ['vireo', 'reel'], // array preserved
        pipeline: { audio: { bitrate: 192, channels: 2 }, crf: 18, codec: 'h264' }, // permuted keys
        resolution: '1080p',
      },
    });
    assert.equal(reorderedRetry.allowed, true);
    assert.equal(reorderedRetry.idempotent, true);

    // 3. Retry with altered nested property: MUST THROW 409
    let nestedTamperErr: any = null;
    try {
      await CreditRepository.reserveCredits({
        userId: IDEMP_USER_1,
        attemptId: clientKey,
        operationId: op,
        amount: 10,
        metadata: {
          resolution: '1080p',
          pipeline: { codec: 'h264', crf: 28, audio: { channels: 2, bitrate: 192 } }, // crf changed from 18 to 28
          tags: ['vireo', 'reel'],
        },
      });
    } catch (err: any) {
      nestedTamperErr = err;
    }
    assert.ok(nestedTamperErr, 'Must reject altered nested metadata property');
    assert.equal(nestedTamperErr.statusCode, 409);
    assert.equal(nestedTamperErr.code, 'IDEMPOTENCY_KEY_COLLISION_WITH_DIFFERENT_PAYLOAD');

    // 4. Retry with altered array ordering: MUST THROW 409
    let arrayOrderErr: any = null;
    try {
      await CreditRepository.reserveCredits({
        userId: IDEMP_USER_1,
        attemptId: clientKey,
        operationId: op,
        amount: 10,
        metadata: {
          resolution: '1080p',
          pipeline: { codec: 'h264', crf: 18, audio: { channels: 2, bitrate: 192 } },
          tags: ['reel', 'vireo'], // array order swapped
        },
      });
    } catch (err: any) {
      arrayOrderErr = err;
    }
    assert.ok(arrayOrderErr, 'Must reject altered array element order');
    assert.equal(arrayOrderErr.statusCode, 409);
    assert.equal(arrayOrderErr.code, 'IDEMPOTENCY_KEY_COLLISION_WITH_DIFFERENT_PAYLOAD');

    // Clean up
    await CreditRepository.settleReservation(clientKey, 10);
  });

  // =========================================================================
  // 3. Different users using the same client key (tenant isolation verified)
  // =========================================================================
  it('3. Different users using the same client key succeed independently (strict tenant isolation)', async () => {
    const db = await getMongoDb();
    const sharedClientKey = `shared_${crypto.randomUUID()}`;
    const op = 'core_video_processing';
    const now = new Date();

    const canonicalKey1 = buildCanonicalIdempotencyKey(IDEMP_USER_1, op, sharedClientKey);
    const canonicalKey2 = buildCanonicalIdempotencyKey(IDEMP_USER_2, op, sharedClientKey);

    assert.notEqual(canonicalKey1, canonicalKey2, 'Canonical keys must be tenant-isolated');
    assert.equal(canonicalKey1, `${IDEMP_USER_1}:${op}:${sharedClientKey}`);
    assert.equal(canonicalKey2, `${IDEMP_USER_2}:${op}:${sharedClientKey}`);

    // Insert idempotency record for User 1
    const doc1: IdempotencyKeyRecord = {
      _id: canonicalKey1,
      user_id: IDEMP_USER_1,
      operation_type: op,
      operation_id: op,
      client_key: sharedClientKey,
      attempt_id: sharedClientKey,
      request_payload_sha256: 'hash_user_1',
      status: 'in_progress',
      created_at: now,
      updated_at: now,
    };
    await db.collection<IdempotencyKeyRecord>('idempotency_keys').insertOne(doc1);

    // Insert idempotency record for User 2 with the SAME client key
    const doc2: IdempotencyKeyRecord = {
      _id: canonicalKey2,
      user_id: IDEMP_USER_2,
      operation_type: op,
      operation_id: op,
      client_key: sharedClientKey,
      attempt_id: sharedClientKey,
      request_payload_sha256: 'hash_user_2',
      status: 'in_progress',
      created_at: now,
      updated_at: now,
    };
    // Must succeed without E11000 duplicate key error
    await db.collection<IdempotencyKeyRecord>('idempotency_keys').insertOne(doc2);

    // Verify both documents exist independently in MongoDB
    const fetched1 = await db.collection<IdempotencyKeyRecord>('idempotency_keys').findOne({ _id: canonicalKey1 });
    const fetched2 = await db.collection<IdempotencyKeyRecord>('idempotency_keys').findOne({ _id: canonicalKey2 });

    assert.ok(fetched1);
    assert.ok(fetched2);
    assert.equal(fetched1.user_id, IDEMP_USER_1);
    assert.equal(fetched2.user_id, IDEMP_USER_2);
    assert.equal(fetched1.client_key, sharedClientKey);
    assert.equal(fetched2.client_key, sharedClientKey);
    assert.equal(fetched1.request_payload_sha256, 'hash_user_1');
    assert.equal(fetched2.request_payload_sha256, 'hash_user_2');

    // Duplicate insert for User 1 with same client key MUST be rejected by unique index 11000
    let user1DuplicateCaught = false;
    try {
      await db.collection<IdempotencyKeyRecord>('idempotency_keys').insertOne({ ...doc1 });
    } catch (err: any) {
      if (err.code === 11000) {
        user1DuplicateCaught = true;
      }
    }
    assert.equal(user1DuplicateCaught, true, 'Unique index must reject duplicate client key for the SAME user');
  });

  // =========================================================================
  // 4. Different operation types using the same client key (no cross-op collision)
  // =========================================================================
  it('4. Different operation types using the same client key produce distinct canonical keys and records', async () => {
    const db = await getMongoDb();
    const clientKey = `op_test_${crypto.randomUUID()}`;
    const op1 = 'core_video_processing';
    const op2 = 'subtitle_generation';
    const now = new Date();

    const key1 = buildCanonicalIdempotencyKey(IDEMP_USER_1, op1, clientKey);
    const key2 = buildCanonicalIdempotencyKey(IDEMP_USER_1, op2, clientKey);

    assert.notEqual(key1, key2);
    assert.equal(key1, `${IDEMP_USER_1}:${op1}:${clientKey}`);
    assert.equal(key2, `${IDEMP_USER_1}:${op2}:${clientKey}`);

    // Insert for operation 1
    await db.collection<IdempotencyKeyRecord>('idempotency_keys').insertOne({
      _id: key1,
      user_id: IDEMP_USER_1,
      operation_type: op1,
      operation_id: op1,
      client_key: clientKey,
      attempt_id: clientKey,
      request_payload_sha256: 'hash_op1',
      status: 'committed',
      created_at: now,
      updated_at: now,
    });

    // Insert for operation 2 with SAME client key
    await db.collection<IdempotencyKeyRecord>('idempotency_keys').insertOne({
      _id: key2,
      user_id: IDEMP_USER_1,
      operation_type: op2,
      operation_id: op2,
      client_key: clientKey,
      attempt_id: clientKey,
      request_payload_sha256: 'hash_op2',
      status: 'committed',
      created_at: now,
      updated_at: now,
    });

    // Both records exist without collision
    const rec1 = await db.collection<IdempotencyKeyRecord>('idempotency_keys').findOne({ _id: key1 });
    const rec2 = await db.collection<IdempotencyKeyRecord>('idempotency_keys').findOne({ _id: key2 });
    assert.ok(rec1);
    assert.ok(rec2);
    assert.equal(rec1.operation_type, op1);
    assert.equal(rec2.operation_type, op2);
  });

  // =========================================================================
  // 5. Concurrent identical reservation requests across multiple instances
  // =========================================================================
  it('5. Concurrent identical reservation requests yield exactly 1 creation and N-1 idempotent wins', async () => {
    const clientKey = crypto.randomUUID();
    const op = 'concurrent_op';
    const initialWallet = await CreditRepository.getOrCreateWallet(IDEMP_USER_1);
    const initialAvailable = initialWallet.available_credits;

    // Launch 8 concurrent identical reservation requests
    const promises = Array.from({ length: 8 }, () =>
      CreditRepository.reserveCredits({
        userId: IDEMP_USER_1,
        attemptId: clientKey,
        operationId: op,
        amount: 20,
      })
    );

    const results = await Promise.all(promises);

    for (const r of results) {
      assert.equal(r.allowed, true);
    }

    const walletAfter = await CreditRepository.getOrCreateWallet(IDEMP_USER_1);
    assert.equal(
      walletAfter.available_credits,
      initialAvailable - 20,
      'Available credits must be debited exactly ONCE across all concurrent requests'
    );
    assert.equal(walletAfter.reserved_credits, 20);

    // Settle
    await CreditRepository.settleReservation(clientKey, 20);
  });

  // =========================================================================
  // 6. Settlement transitions idempotency record to committed
  // =========================================================================
  it('6. Settlement transitions canonical idempotency record to committed', async () => {
    const clientKey = crypto.randomUUID();
    const op = 'settle_test_op';

    await CreditRepository.reserveCredits({
      userId: IDEMP_USER_1,
      attemptId: clientKey,
      operationId: op,
      amount: 10,
    });

    const db = await getMongoDb();
    const canonicalKey = buildCanonicalIdempotencyKey(IDEMP_USER_1, op, clientKey);

    // Prior to settlement: status is in_progress
    const preSettle = await db.collection<IdempotencyKeyRecord>('idempotency_keys').findOne({ _id: canonicalKey });
    assert.equal(preSettle?.status, 'in_progress');
    assert.equal(preSettle?.operation_type, op);
    assert.equal(preSettle?.operation_id, op);
    assert.equal(preSettle?.client_key, clientKey);
    assert.equal(preSettle?.attempt_id, clientKey);

    // Settle
    const settleRes = await CreditRepository.settleReservation(clientKey, 10);
    assert.equal(settleRes.settledAmount, 10);

    // After settlement: status is committed
    const postSettle = await db.collection<IdempotencyKeyRecord>('idempotency_keys').findOne({ _id: canonicalKey });
    assert.equal(postSettle?.status, 'committed');
    assert.ok(postSettle?.updated_at);
  });

  // =========================================================================
  // 7. Duplicate refund and recovery requests
  // =========================================================================
  it('7. Duplicate refund and recovery requests succeed idempotently without double balance restoration', async () => {
    const clientKey = crypto.randomUUID();
    const op = 'refund_test_op';

    await CreditRepository.reserveCredits({
      userId: IDEMP_USER_1,
      attemptId: clientKey,
      operationId: op,
      amount: 15,
    });

    const walletBeforeRefund = await CreditRepository.getOrCreateWallet(IDEMP_USER_1);
    const availableBeforeRefund = walletBeforeRefund.available_credits;

    // First refund
    const refund1 = await CreditRepository.releaseReservation(clientKey, 'Simulated worker crash');
    assert.equal(refund1.releasedAmount, 15);
    assert.equal(refund1.reservation.status, 'released');
    assert.equal(refund1.wallet.available_credits, availableBeforeRefund + 15);

    // Second refund (duplicate call)
    const refund2 = await CreditRepository.releaseReservation(clientKey, 'Simulated duplicate sweeper');
    assert.equal(refund2.idempotent, true);
    assert.equal(refund2.releasedAmount, 15);
    assert.equal(refund2.wallet.available_credits, availableBeforeRefund + 15, 'Balance must NOT increase again');

    // Verify idempotency record status is refunded
    const db = await getMongoDb();
    const canonicalKey = buildCanonicalIdempotencyKey(IDEMP_USER_1, op, clientKey);
    const idempDoc = await db.collection<IdempotencyKeyRecord>('idempotency_keys').findOne({ _id: canonicalKey });
    assert.equal(idempDoc?.status, 'refunded');
  });

  // =========================================================================
  // 8. Retry after uncertain transaction commit / reconciliation state
  // =========================================================================
  it('8. Retry during reconciliation_required throws HTTP 409 RECONCILIATION_IN_PROGRESS', async () => {
    const clientKey = crypto.randomUUID();
    const op = 'reconciliation_test_op';

    // Simulate an in-flight reservation that was flagged for automated reconciliation sweeper
    const db = await getMongoDb();
    const canonicalKey = buildCanonicalIdempotencyKey(IDEMP_USER_1, op, clientKey);
    const now = new Date();

    const payloadHash = computeCanonicalPayloadHash({
      amount: 20,
      attemptId: clientKey,
      metadata: {},
      operationId: op,
      userId: IDEMP_USER_1,
      workspaceId: null,
    });

    await db.collection<IdempotencyKeyRecord>('idempotency_keys').insertOne({
      _id: canonicalKey,
      user_id: IDEMP_USER_1,
      operation_type: op,
      operation_id: op,
      client_key: clientKey,
      attempt_id: clientKey,
      request_payload_sha256: payloadHash,
      status: 'reconciliation_required',
      created_at: now,
      updated_at: now,
    });

    // Attempting reservation retry while reconciliation is active must throw 409
    let recErr: any = null;
    try {
      await CreditRepository.reserveCredits({
        userId: IDEMP_USER_1,
        attemptId: clientKey,
        operationId: op,
        amount: 20,
      });
    } catch (err: any) {
      recErr = err;
    }

    assert.ok(recErr, 'Must reject retry during reconciliation');
    assert.equal(recErr.statusCode, 409);
    assert.equal(recErr.code, 'RECONCILIATION_IN_PROGRESS');
  });
});
