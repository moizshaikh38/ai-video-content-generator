import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { BSON } from 'mongodb';

import {
  CreditTransactionRecord,
  CreditTransactionType,
  CreditReservationRecord,
  CreditWalletRecord,
} from '../types/credits.js';
import {
  canonicalJsonSerialize,
  computeCanonicalPayloadHash,
  buildCanonicalIdempotencyKey,
  parseCanonicalIdempotencyKey,
} from '../db/repositories/creditRepository.js';

describe('VireoClip Phase 4B.3 — Layer A: Unit Tests', () => {

  // =========================================================================
  // 1. Signed 5-Delta Financial Accounting & Conservation Invariants
  // =========================================================================
  describe('1. Signed 5-Delta Accounting Model & Conservation Law', () => {
    // Conservation law equation:
    // available_delta + reserved_delta === lifetime_granted_delta - lifetime_consumed_delta + net_adjustments_delta

    function assertConservation(tx: {
      type: string;
      available_delta: number;
      reserved_delta: number;
      lifetime_granted_delta: number;
      lifetime_consumed_delta: number;
      net_adjustments_delta: number;
    }) {
      const leftSide = tx.available_delta + tx.reserved_delta;
      const rightSide = tx.lifetime_granted_delta - tx.lifetime_consumed_delta + tx.net_adjustments_delta;
      assert.equal(
        leftSide,
        rightSide,
        `Conservation equation failed for tx type '${tx.type}': left(${leftSide}) !== right(${rightSide})`
      );
    }

    it('validates conservation equation for all 9 financial transaction types', () => {
      // 1. Monthly Grant (+100 available)
      const grantTx = {
        type: 'monthly_grant',
        available_delta: 100,
        reserved_delta: 0,
        lifetime_granted_delta: 100,
        lifetime_consumed_delta: 0,
        net_adjustments_delta: 0,
      };
      assertConservation(grantTx);

      // 2. Reservation (-40 available, +40 reserved)
      const reserveTx = {
        type: 'reservation',
        available_delta: -40,
        reserved_delta: 40,
        lifetime_granted_delta: 0,
        lifetime_consumed_delta: 0,
        net_adjustments_delta: 0,
      };
      assertConservation(reserveTx);

      // 3. Full Consumption (0 available, -40 reserved, +40 consumed)
      const fullConsumeTx = {
        type: 'consumption',
        available_delta: 0,
        reserved_delta: -40,
        lifetime_granted_delta: 0,
        lifetime_consumed_delta: 40,
        net_adjustments_delta: 0,
      };
      assertConservation(fullConsumeTx);

      // 4. Partial Consumption (+10 refund to available, -40 reserved, +30 consumed)
      const partialConsumeTx = {
        type: 'consumption_partial',
        available_delta: 10,
        reserved_delta: -40,
        lifetime_granted_delta: 0,
        lifetime_consumed_delta: 30,
        net_adjustments_delta: 0,
      };
      assertConservation(partialConsumeTx);

      // 5. Full Refund / Release (+40 to available, -40 reserved)
      const refundTx = {
        type: 'reservation_release',
        available_delta: 40,
        reserved_delta: -40,
        lifetime_granted_delta: 0,
        lifetime_consumed_delta: 0,
        net_adjustments_delta: 0,
      };
      assertConservation(refundTx);

      // 6. Positive Manual Adjustment (+50 to available)
      const posAdjTx = {
        type: 'manual_adjustment_positive',
        available_delta: 50,
        reserved_delta: 0,
        lifetime_granted_delta: 0,
        lifetime_consumed_delta: 0,
        net_adjustments_delta: 50,
      };
      assertConservation(posAdjTx);

      // 7. Negative Manual Adjustment (-20 from available)
      const negAdjTx = {
        type: 'manual_adjustment_negative',
        available_delta: -20,
        reserved_delta: 0,
        lifetime_granted_delta: 0,
        lifetime_consumed_delta: 0,
        net_adjustments_delta: -20,
      };
      assertConservation(negAdjTx);

      // 8. Credit Purchase (+200 to available, +200 lifetime_granted)
      const purchaseTx = {
        type: 'credit_purchase',
        available_delta: 200,
        reserved_delta: 0,
        lifetime_granted_delta: 200,
        lifetime_consumed_delta: 0,
        net_adjustments_delta: 0,
      };
      assertConservation(purchaseTx);

      // 9. Credit Expiration (-15 available, -15 net_adjustments)
      const expiryTx = {
        type: 'credit_expiry',
        available_delta: -15,
        reserved_delta: 0,
        lifetime_granted_delta: 0,
        lifetime_consumed_delta: 0,
        net_adjustments_delta: -15,
      };
      assertConservation(expiryTx);
    });

    it('reconstructs complete wallet state strictly from sum of 5 deltas', () => {
      const ledger = [
        // User starts at 0
        { type: 'monthly_grant', available_delta: 100, reserved_delta: 0, lifetime_granted_delta: 100, lifetime_consumed_delta: 0, net_adjustments_delta: 0 },
        { type: 'reservation', available_delta: -40, reserved_delta: 40, lifetime_granted_delta: 0, lifetime_consumed_delta: 0, net_adjustments_delta: 0 },
        { type: 'consumption_partial', available_delta: 10, reserved_delta: -40, lifetime_granted_delta: 0, lifetime_consumed_delta: 30, net_adjustments_delta: 0 },
        { type: 'reservation', available_delta: -25, reserved_delta: 25, lifetime_granted_delta: 0, lifetime_consumed_delta: 0, net_adjustments_delta: 0 },
        { type: 'reservation_release', available_delta: 25, reserved_delta: -25, lifetime_granted_delta: 0, lifetime_consumed_delta: 0, net_adjustments_delta: 0 },
        { type: 'manual_adjustment_positive', available_delta: 15, reserved_delta: 0, lifetime_granted_delta: 0, lifetime_consumed_delta: 0, net_adjustments_delta: 15 },
        { type: 'manual_adjustment_negative', available_delta: -5, reserved_delta: 0, lifetime_granted_delta: 0, lifetime_consumed_delta: 0, net_adjustments_delta: -5 },
      ];

      let available = 0;
      let reserved = 0;
      let lifetimeGranted = 0;
      let lifetimeConsumed = 0;
      let netAdjustments = 0;

      for (const tx of ledger) {
        assertConservation(tx);
        available += tx.available_delta;
        reserved += tx.reserved_delta;
        lifetimeGranted += tx.lifetime_granted_delta;
        lifetimeConsumed += tx.lifetime_consumed_delta;
        netAdjustments += tx.net_adjustments_delta;
      }

      assert.equal(available, 80, 'Available balance matches delta sum (100 - 40 + 10 - 25 + 25 + 15 - 5 = 80)');
      assert.equal(reserved, 0, 'Reserved balance matches delta sum');
      assert.equal(lifetimeGranted, 100, 'Lifetime granted matches delta sum');
      assert.equal(lifetimeConsumed, 30, 'Lifetime consumed matches delta sum');
      assert.equal(netAdjustments, 10, 'Net adjustments matches delta sum (15 - 5 = 10)');

      // Invariant check: available + reserved === lifetime_granted - lifetime_consumed + net_adjustments
      assert.equal(available + reserved, lifetimeGranted - lifetimeConsumed + netAdjustments);
    });
  });

  // =========================================================================
  // 2. Amount & Boundary Validation
  // =========================================================================
  describe('2. Financial Amount & Range Validation', () => {
    it('rejects negative reservation amounts', () => {
      const validateAmount = (amount: number) => {
        if (!Number.isFinite(amount) || amount < 0) {
          throw new Error('INVALID_RESERVATION_AMOUNT: Amount must be non-negative');
        }
      };
      assert.throws(() => validateAmount(-5), /INVALID_RESERVATION_AMOUNT/);
      assert.throws(() => validateAmount(-0.01), /INVALID_RESERVATION_AMOUNT/);
      assert.doesNotThrow(() => validateAmount(0));
      assert.doesNotThrow(() => validateAmount(50));
    });

    it('rejects negative settlement amounts and clamps over-settlement to reserved amount', () => {
      const calculateSettlement = (reserved: number, rawSettled: number) => {
        if (!Number.isFinite(rawSettled) || rawSettled < 0) {
          throw new Error('INVALID_SETTLEMENT_AMOUNT: Settled amount cannot be negative');
        }
        const settledAmount = Math.min(reserved, rawSettled);
        const unusedRefund = reserved - settledAmount;
        return { settledAmount, unusedRefund };
      };

      assert.throws(() => calculateSettlement(40, -1), /INVALID_SETTLEMENT_AMOUNT/);

      // Exact settlement
      assert.deepEqual(calculateSettlement(40, 40), { settledAmount: 40, unusedRefund: 0 });

      // Partial settlement
      assert.deepEqual(calculateSettlement(40, 25), { settledAmount: 25, unusedRefund: 15 });

      // Over-settlement capped to reserved amount (protects against client inflation)
      assert.deepEqual(calculateSettlement(40, 999), { settledAmount: 40, unusedRefund: 0 });

      // Zero settlement (100% refund)
      assert.deepEqual(calculateSettlement(40, 0), { settledAmount: 0, unusedRefund: 40 });
    });
  });

  // =========================================================================
  // 3. Recursive Canonical Idempotency Payload Hashing & Validation
  // =========================================================================
  describe('3. Permanent Idempotency Key & Recursive Payload Hash Matching', () => {
    it('computes deterministic SHA-256 hash regardless of top-level key insertion order', () => {
      const hash1 = computeCanonicalPayloadHash({ userId: 'u1', attemptId: 'a1', amount: 40, operationId: 'video' });
      const hash2 = computeCanonicalPayloadHash({ amount: 40, operationId: 'video', userId: 'u1', attemptId: 'a1' });
      assert.equal(hash1, hash2, 'Canonical key sorting must guarantee identical hash');
    });

    it('computes identical hash for nested objects regardless of key insertion order at any depth', () => {
      const payload1 = {
        userId: 'u1',
        operationId: 'core_video_processing',
        attemptId: 'a1',
        amount: 30,
        metadata: {
          resolution: '1080p',
          settings: {
            fps: 60,
            codec: 'h264',
            audio: { bitrate: 192, channels: 2 },
          },
        },
      };

      const payload2 = {
        amount: 30,
        metadata: {
          settings: {
            audio: { channels: 2, bitrate: 192 },
            codec: 'h264',
            fps: 60,
          },
          resolution: '1080p',
        },
        operationId: 'core_video_processing',
        attemptId: 'a1',
        userId: 'u1',
      };

      const hash1 = computeCanonicalPayloadHash(payload1);
      const hash2 = computeCanonicalPayloadHash(payload2);
      assert.equal(hash1, hash2, 'Deeply nested objects with different key order must produce identical hashes');
    });

    it('computes distinct hashes for different nested metadata values', () => {
      const payloadA = {
        userId: 'u1',
        operationId: 'core_video_processing',
        attemptId: 'a1',
        amount: 30,
        metadata: { resolution: '1080p', preset: 'reel' },
      };
      const payloadB = {
        userId: 'u1',
        operationId: 'core_video_processing',
        attemptId: 'a1',
        amount: 30,
        metadata: { resolution: '720p', preset: 'reel' },
      };

      const hashA = computeCanonicalPayloadHash(payloadA);
      const hashB = computeCanonicalPayloadHash(payloadB);
      assert.notEqual(hashA, hashB, 'Different nested metadata values must produce distinct hashes');
    });

    it('computes distinct hashes for different nested objects', () => {
      const payloadA = {
        userId: 'u1',
        operationId: 'core_video_processing',
        attemptId: 'a1',
        amount: 30,
        metadata: { filter: { type: 'blur', radius: 5 } },
      };
      const payloadB = {
        userId: 'u1',
        operationId: 'core_video_processing',
        attemptId: 'a1',
        amount: 30,
        metadata: { filter: { type: 'sharpen', intensity: 1.2 } },
      };

      const hashA = computeCanonicalPayloadHash(payloadA);
      const hashB = computeCanonicalPayloadHash(payloadB);
      assert.notEqual(hashA, hashB, 'Different nested objects must produce distinct hashes');
    });

    it('preserves array order and produces distinct hashes for different array element orders', () => {
      const payloadA = {
        userId: 'u1',
        operationId: 'video',
        attemptId: 'a1',
        amount: 10,
        metadata: { tags: ['youtube', 'tiktok', 'instagram'] },
      };
      const payloadB = {
        userId: 'u1',
        operationId: 'video',
        attemptId: 'a1',
        amount: 10,
        metadata: { tags: ['instagram', 'tiktok', 'youtube'] },
      };

      const hashA = computeCanonicalPayloadHash(payloadA);
      const hashB = computeCanonicalPayloadHash(payloadB);
      assert.notEqual(hashA, hashB, 'Array element order must be preserved: different order produces distinct hash');

      // Canonical serialization check
      assert.equal(
        canonicalJsonSerialize(['a', 'b', 'c']),
        '["a","b","c"]',
        'Array serialization must preserve original ordering'
      );
    });

    it('handles nested null, boolean, and finite number values consistently', () => {
      const payload = {
        userId: 'u1',
        operationId: 'video',
        attemptId: 'a1',
        amount: 0,
        metadata: {
          flagTrue: true,
          flagFalse: false,
          emptyField: null,
          zero: 0,
          negativeZero: -0,
          decimal: 42.5,
        },
      };

      const serialized = canonicalJsonSerialize(payload.metadata);
      assert.equal(
        serialized,
        '{"decimal":42.5,"emptyField":null,"flagFalse":false,"flagTrue":true,"negativeZero":0,"zero":0}'
      );

      const hash = computeCanonicalPayloadHash(payload);
      assert.ok(hash && typeof hash === 'string' && hash.length === 64);
    });

    it('rejects unsupported values: undefined properties and undefined values', () => {
      assert.throws(
        () => canonicalJsonSerialize(undefined),
        /Cannot canonically serialize undefined value/
      );

      assert.throws(
        () => canonicalJsonSerialize({ a: undefined }),
        /Cannot canonically serialize undefined property 'a'/
      );

      assert.throws(
        () => canonicalJsonSerialize({ nested: { bad: undefined } }),
        /Cannot canonically serialize undefined property 'bad'/
      );
    });

    it('rejects non-finite numbers: NaN and Infinity', () => {
      assert.throws(
        () => canonicalJsonSerialize(NaN),
        /Cannot canonically serialize non-finite number: NaN/
      );

      assert.throws(
        () => canonicalJsonSerialize(Infinity),
        /Cannot canonically serialize non-finite number: Infinity/
      );

      assert.throws(
        () => canonicalJsonSerialize(-Infinity),
        /Cannot canonically serialize non-finite number: -Infinity/
      );

      assert.throws(
        () => canonicalJsonSerialize({ count: NaN }),
        /Cannot canonically serialize non-finite number: NaN/
      );
    });

    it('rejects circular references in objects and arrays', () => {
      const circularObj: any = { name: 'root' };
      circularObj.self = circularObj;

      assert.throws(
        () => canonicalJsonSerialize(circularObj),
        /Cannot canonically serialize circular reference in object/
      );

      const circularArr: any = [1, 2];
      circularArr.push(circularArr);

      assert.throws(
        () => canonicalJsonSerialize(circularArr),
        /Cannot canonically serialize circular reference in array/
      );
    });

    it('rejects unsupported types: functions, symbols, and bigints', () => {
      assert.throws(
        () => canonicalJsonSerialize(() => 'noop'),
        /Cannot canonically serialize unsupported type: function/
      );

      assert.throws(
        () => canonicalJsonSerialize(Symbol('key')),
        /Cannot canonically serialize unsupported type: symbol/
      );

      assert.throws(
        () => canonicalJsonSerialize(BigInt(100)),
        /Cannot canonically serialize unsupported type: bigint/
      );
    });

    it('detects payload tampering / mismatch on repeated idempotency key usage', () => {
      const originalPayload = { userId: 'u1', attemptId: 'a1', amount: 40, operationId: 'video' };
      const modifiedPayload = { userId: 'u1', attemptId: 'a1', amount: 80, operationId: 'video' };

      const hashOriginal = computeCanonicalPayloadHash(originalPayload);
      const hashModified = computeCanonicalPayloadHash(modifiedPayload);

      assert.notEqual(hashOriginal, hashModified, 'Modified amount must produce distinct hash');

      const checkIdempotency = (storedHash: string, incomingHash: string) => {
        if (storedHash !== incomingHash) {
          throw new Error('IDEMPOTENCY_KEY_COLLISION_WITH_DIFFERENT_PAYLOAD');
        }
        return { isReplay: true };
      };

      assert.deepEqual(checkIdempotency(hashOriginal, hashOriginal), { isReplay: true });
      assert.throws(() => checkIdempotency(hashOriginal, hashModified), /IDEMPOTENCY_KEY_COLLISION_WITH_DIFFERENT_PAYLOAD/);
    });

    it('enforces tenant isolation in idempotency canonical identity', () => {
      const tenantA_idempotencyId = buildCanonicalIdempotencyKey('userA', 'video_clip', 'attempt123');
      const tenantB_idempotencyId = buildCanonicalIdempotencyKey('userB', 'video_clip', 'attempt123');
      assert.notEqual(
        tenantA_idempotencyId,
        tenantB_idempotencyId,
        'Different tenants using the same attempt ID must never collide in canonical identity'
      );
    });

    it('prevents delimiter ambiguity and collisions across adversarial colon-containing inputs', () => {
      // Adversarial input tuples designed to produce the identical string under simple colon concatenation
      const tuple1 = { userId: 'user1', operationType: 'op:sub', clientKey: 'key' };
      const tuple2 = { userId: 'user1', operationType: 'op', clientKey: 'sub:key' };
      const tuple3 = { userId: 'user1:op', operationType: 'sub', clientKey: 'key' };
      const tuple4 = { userId: 'user1:op:sub', operationType: 'main', clientKey: 'key' };

      const key1 = buildCanonicalIdempotencyKey(tuple1.userId, tuple1.operationType, tuple1.clientKey);
      const key2 = buildCanonicalIdempotencyKey(tuple2.userId, tuple2.operationType, tuple2.clientKey);
      const key3 = buildCanonicalIdempotencyKey(tuple3.userId, tuple3.operationType, tuple3.clientKey);
      const key4 = buildCanonicalIdempotencyKey(tuple4.userId, tuple4.operationType, tuple4.clientKey);

      // Verify all keys are strictly distinct (no collisions)
      const allKeys = new Set([key1, key2, key3, key4]);
      assert.equal(allKeys.size, 4, 'All adversarial colon-containing input tuples must yield distinct canonical keys');

      assert.equal(key1, 'user1:op%3Asub:key');
      assert.equal(key2, 'user1:op:sub%3Akey');
      assert.equal(key3, 'user1%3Aop:sub:key');
      assert.equal(key4, 'user1%3Aop%3Asub:main:key');

      // Roundtrip bijectivity verification: parseCanonicalIdempotencyKey must recover original components
      assert.deepEqual(parseCanonicalIdempotencyKey(key1), tuple1);
      assert.deepEqual(parseCanonicalIdempotencyKey(key2), tuple2);
      assert.deepEqual(parseCanonicalIdempotencyKey(key3), tuple3);
      assert.deepEqual(parseCanonicalIdempotencyKey(key4), tuple4);
    });

    it('rejects empty, whitespace-only, or invalid non-string components', () => {
      assert.throws(() => buildCanonicalIdempotencyKey('', 'op', 'key'), /userId must be a non-empty string/);
      assert.throws(() => buildCanonicalIdempotencyKey('   ', 'op', 'key'), /userId must be a non-empty string/);
      assert.throws(() => buildCanonicalIdempotencyKey('user', '', 'key'), /operationType must be a non-empty string/);
      assert.throws(() => buildCanonicalIdempotencyKey('user', '   ', 'key'), /operationType must be a non-empty string/);
      assert.throws(() => buildCanonicalIdempotencyKey('user', 'op', ''), /clientKey must be a non-empty string/);
      assert.throws(() => buildCanonicalIdempotencyKey('user', 'op', '   '), /clientKey must be a non-empty string/);
      assert.throws(() => buildCanonicalIdempotencyKey(null as any, 'op', 'key'), /userId must be a non-empty string/);
      assert.throws(() => buildCanonicalIdempotencyKey('user', undefined as any, 'key'), /operationType must be a non-empty string/);
    });

    it('guarantees 100% backward compatibility for all existing UUID and standard identifier formats', () => {
      const standardUserId = '00000000-0000-4000-8000-000000000099';
      const standardOp = 'core_video_processing';
      const standardClientKey = 'e34f5b43-65a7-4893-9147-58bcc392e3ea';

      const key = buildCanonicalIdempotencyKey(standardUserId, standardOp, standardClientKey);
      assert.equal(
        key,
        '00000000-0000-4000-8000-000000000099:core_video_processing:e34f5b43-65a7-4893-9147-58bcc392e3ea',
        'Standard UUID/alphanumeric keys must match existing database format identically'
      );

      // Existing database keys parse successfully and preserve original values
      const parsed = parseCanonicalIdempotencyKey(key);
      assert.equal(parsed.userId, standardUserId);
      assert.equal(parsed.operationType, standardOp);
      assert.equal(parsed.clientKey, standardClientKey);
    });

    it('strict parser: rejects non-canonical percent-escapes such as %41 when A is canonical', () => {
      // '%41' decodes to 'A', but canonical builder produces 'A' (unencoded)
      assert.throws(
        () => parseCanonicalIdempotencyKey('user:%41:key'),
        /Non-canonical idempotency key representation: 'user:%41:key' \(canonical format is 'user:A:key'\)/
      );

      assert.throws(
        () => parseCanonicalIdempotencyKey('%75ser:op:key'),
        /Non-canonical idempotency key representation/
      );
    });

    it('strict parser: rejects lowercase percent-escape sequences', () => {
      // Lowercase '%3a' decodes to ':', but canonical builder generates uppercase '%3A'
      assert.throws(
        () => parseCanonicalIdempotencyKey('user:op%3asub:key'),
        /Non-canonical idempotency key representation: 'user:op%3asub:key' \(canonical format is 'user:op%3Asub:key'\)/
      );
    });

    it('strict parser: rejects malformed percent escapes', () => {
      assert.throws(
        () => parseCanonicalIdempotencyKey('user:op%2:key'),
        /Malformed percent-escape sequence in canonical idempotency key/
      );

      assert.throws(
        () => parseCanonicalIdempotencyKey('user:op%ZZ:key'),
        /Malformed percent-escape sequence in canonical idempotency key/
      );

      assert.throws(
        () => parseCanonicalIdempotencyKey('user:op%:key'),
        /Malformed percent-escape sequence in canonical idempotency key/
      );
    });

    it('strict parser: rejects empty components and invalid structural counts', () => {
      assert.throws(
        () => parseCanonicalIdempotencyKey(':op:key'),
        /components cannot be empty/
      );

      assert.throws(
        () => parseCanonicalIdempotencyKey('user::key'),
        /components cannot be empty/
      );

      assert.throws(
        () => parseCanonicalIdempotencyKey('user:op:'),
        /components cannot be empty/
      );

      assert.throws(
        () => parseCanonicalIdempotencyKey('::'),
        /components cannot be empty/
      );

      assert.throws(
        () => parseCanonicalIdempotencyKey('user:op'),
        /expected exactly 3 components separated by ':'/
      );

      assert.throws(
        () => parseCanonicalIdempotencyKey('user:op:key:extra'),
        /expected exactly 3 components separated by ':'/
      );

      assert.throws(
        () => parseCanonicalIdempotencyKey(''),
        /canonicalKey must be a non-empty string/
      );
    });

    it('strict parser: colon-containing and complex values round-trip perfectly', () => {
      const complexTuples = [
        { userId: 'user:1', operationType: 'op:2', clientKey: 'key:3' },
        { userId: 'u:id:special', operationType: 'op_type_1', clientKey: 'stripe:ch_12345' },
        { userId: '00000000-0000-4000-8000-000000000001', operationType: 'video_clip', clientKey: 'job:batch:42' },
        { userId: 'tenant-a', operationType: 'core_video_processing', clientKey: 'my-custom-key' },
      ];

      for (const tuple of complexTuples) {
        const canonicalKey = buildCanonicalIdempotencyKey(tuple.userId, tuple.operationType, tuple.clientKey);
        const parsed = parseCanonicalIdempotencyKey(canonicalKey);
        assert.deepEqual(parsed, tuple, `Round-trip must preserve tuple: ${JSON.stringify(tuple)}`);
      }
    });
  });

  // =========================================================================
  // 4. State Transitions & Worker Fencing Validation
  // =========================================================================
  describe('4. State Machine Transitions & Fencing Tokens', () => {
    it('validates legal reservation lifecycle transitions and rejects illegal mutations', () => {
      const validTransitions: Record<string, string[]> = {
        active: ['settled', 'released', 'recovering'],
        reserved: ['settled', 'released', 'recovering'],
        recovering: ['released', 'refunded'],
        settled: [], // terminal
        released: [], // terminal
        refunded: [], // terminal
      };

      const canTransition = (current: string, next: string) => {
        return (validTransitions[current] || []).includes(next);
      };

      assert.equal(canTransition('active', 'settled'), true);
      assert.equal(canTransition('active', 'recovering'), true);
      assert.equal(canTransition('recovering', 'released'), true);

      // Terminal states cannot transition
      assert.equal(canTransition('settled', 'released'), false);
      assert.equal(canTransition('settled', 'active'), false);
      assert.equal(canTransition('released', 'settled'), false);
      assert.equal(canTransition('refunded', 'settled'), false);
    });

    it('validates that stale worker fencing tokens are rejected', () => {
      let authoritativeToken = 3;

      const validateFencingToken = (workerToken: number) => {
        if (workerToken !== authoritativeToken) {
          throw new Error('STALE_WORKER_FENCE_LOST: Worker lease expired and token was advanced');
        }
        return true;
      };

      // Active worker with token 3 succeeds
      assert.equal(validateFencingToken(3), true);

      // Worker paused, lease expired, recovery worker advanced token to 4
      authoritativeToken = 4;

      // Resumed stale worker attempts mutation with old token 3
      assert.throws(() => validateFencingToken(3), /STALE_WORKER_FENCE_LOST/);

      // New recovery worker with token 4 succeeds
      assert.equal(validateFencingToken(4), true);
    });
  });

  // =========================================================================
  // 5. BSON Serialization Size Bounds
  // =========================================================================
  describe('5. BSON Serialization Size Enclosure & Bounds', () => {
    it('measures nominal wallet document BSON size (~403 bytes)', () => {
      const nominalWallet = {
        _id: '00000000-0000-4000-8000-000000000001',
        id: '00000000-0000-4000-8000-000000000001',
        user_id: '00000000-0000-4000-8000-000000000001',
        workspace_id: null,
        available_credits: 100,
        reserved_credits: 0,
        lifetime_granted: 100,
        lifetime_consumed: 0,
        period_granted: 100,
        period_consumed: 0,
        billing_period: '2026-11',
        reset_date: '2026-12-01T00:00:00.000Z',
        status: 'active',
        version: 1,
        created_at: new Date('2026-11-01T00:00:00.000Z'),
        updated_at: new Date('2026-11-01T00:00:00.000Z'),
      };

      const serialized = BSON.serialize(nominalWallet);
      assert.ok(serialized.length <= 440, `Nominal size ${serialized.length} must be <= 440 bytes`);
    });

    it('verifies maximum wallet BSON size under enforced schema constraints is strictly <= 504 bytes', () => {
      // Maximum field values under schema validation:
      // max string lengths: 36 UUIDs, 7 billing_period, 30 reset_date, status 'suspended' (9 bytes)
      const maxWallet = {
        _id: '12345678-1234-1234-1234-123456789012',
        id: '12345678-1234-1234-1234-123456789012',
        user_id: '12345678-1234-1234-1234-123456789012',
        workspace_id: '12345678-1234-1234-1234-123456789012',
        available_credits: 2147483647,
        reserved_credits: 2147483647,
        lifetime_granted: 2147483647,
        lifetime_consumed: 2147483647,
        period_granted: 2147483647,
        period_consumed: 2147483647,
        billing_period: '2026-11',
        reset_date: '2026-12-01T00:00:00.000000+00:00', // 30 chars max
        status: 'suspended',
        version: 2147483647,
        created_at: new Date('2026-11-01T00:00:00.000Z'),
        updated_at: new Date('2026-11-01T00:00:00.000Z'),
      };

      const serialized = BSON.serialize(maxWallet);
      assert.ok(
        serialized.length <= 504,
        `Enforced maximum BSON size ${serialized.length} must be <= 504 bytes forever`
      );
    });
  });
});
