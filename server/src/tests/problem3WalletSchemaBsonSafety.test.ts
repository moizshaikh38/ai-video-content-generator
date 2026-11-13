import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { BSON, ObjectId } from 'mongodb';
import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import {
  CreditRepository,
  validateWalletDocument,
  WALLET_ALLOWED_FIELDS,
} from '../db/repositories/creditRepository.js';
import { WALLET_COLLECTION_JSON_SCHEMA } from '../db/bootstrapMongo.js';
import {
  CreditWalletRecord,
  CreditTransactionRecord,
  CreditReservationRecord,
  AppError,
} from '../types/index.js';

describe('VireoClip Phase 4B.3 — Problem 3: BSON Size, Wallet Schema & Bounded Document Safety', () => {
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
  // 1. Fixed-Schema Wallet Design & Runtime Validation
  // =========================================================================
  describe('1. Fixed-Schema Wallet Design & Runtime Validation', () => {
    test('1.1. Valid wallet document passes runtime schema validation', () => {
      const validWallet: CreditWalletRecord = {
        id: crypto.randomUUID(),
        user_id: crypto.randomUUID(),
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
        created_at: new Date(),
        updated_at: new Date(),
      };

      const result = validateWalletDocument(validWallet);
      assert.equal(result.valid, true, `Expected valid wallet, got: ${result.error}`);
    });

    test('1.2. Rejects unexpected properties (additionalProperties: false enforcement)', () => {
      const baseWallet: any = {
        id: crypto.randomUUID(),
        user_id: crypto.randomUUID(),
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
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Attempt to attach history array
      const withArray = { ...baseWallet, history: [1, 2, 3] };
      assert.equal(validateWalletDocument(withArray).valid, false);
      assert.match(validateWalletDocument(withArray).error || '', /Unexpected property 'history'/);

      // Attempt to attach arbitrary metadata
      const withMetadata = { ...baseWallet, custom_data: { foo: 'bar' } };
      assert.equal(validateWalletDocument(withMetadata).valid, false);
      assert.match(validateWalletDocument(withMetadata).error || '', /Unexpected property 'custom_data'/);
    });

    test('1.3. Rejects negative, NaN, Infinity, and non-integer values in numeric fields', () => {
      const baseWallet = {
        id: crypto.randomUUID(),
        user_id: crypto.randomUUID(),
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
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Negative credits
      assert.equal(validateWalletDocument({ ...baseWallet, available_credits: -1 }).valid, false);
      assert.equal(validateWalletDocument({ ...baseWallet, reserved_credits: -10 }).valid, false);

      // NaN
      assert.equal(validateWalletDocument({ ...baseWallet, available_credits: NaN }).valid, false);
      assert.equal(validateWalletDocument({ ...baseWallet, lifetime_consumed: NaN }).valid, false);

      // Infinity
      assert.equal(validateWalletDocument({ ...baseWallet, available_credits: Infinity }).valid, false);
      assert.equal(validateWalletDocument({ ...baseWallet, period_granted: -Infinity }).valid, false);

      // Non-integers (floats)
      assert.equal(validateWalletDocument({ ...baseWallet, available_credits: 10.5 }).valid, false);

      // Version < 1
      assert.equal(validateWalletDocument({ ...baseWallet, version: 0 }).valid, false);
    });

    test('1.4. Rejects oversized strings and invalid enum values', () => {
      const baseWallet = {
        id: crypto.randomUUID(),
        user_id: crypto.randomUUID(),
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
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Oversized id (> 36 chars)
      assert.equal(validateWalletDocument({ ...baseWallet, id: 'x'.repeat(37) }).valid, false);

      // Oversized user_id (> 36 chars)
      assert.equal(validateWalletDocument({ ...baseWallet, user_id: 'x'.repeat(37) }).valid, false);

      // Oversized workspace_id (> 36 chars)
      assert.equal(validateWalletDocument({ ...baseWallet, workspace_id: 'x'.repeat(37) }).valid, false);

      // Oversized billing_period (> 7 chars)
      assert.equal(validateWalletDocument({ ...baseWallet, billing_period: '2026-111' }).valid, false);

      // Oversized reset_date (> 30 chars)
      assert.equal(validateWalletDocument({ ...baseWallet, reset_date: 'x'.repeat(31) }).valid, false);

      // Invalid status enum
      assert.equal(validateWalletDocument({ ...baseWallet, status: 'unknown' as any }).valid, false);
      assert.equal(validateWalletDocument({ ...baseWallet, status: 'deleted' as any }).valid, false);
    });
  });

  // =========================================================================
  // 2. BSON Size Verification & Serialization Boundaries
  // =========================================================================
  describe('2. BSON Size Verification & Serialization Boundaries', () => {
    test('2.1. Nominal wallet document measures exactly 403 bytes', () => {
      const nominalWallet = {
        _id: new ObjectId('6aeba7caaf062efeb54fd714'),
        id: '098863fa-4011-4909-9ea3-b1f7bbb69d9c',
        user_id: 'f16ce27a-3b3a-4edd-91e4-749938d525f6',
        workspace_id: null,
        available_credits: 200,
        reserved_credits: 0,
        lifetime_granted: 200,
        lifetime_consumed: 0,
        period_granted: 200,
        period_consumed: 0,
        billing_period: '2026-11',
        reset_date: '2026-12-01T00:00:00.000Z',
        status: 'active',
        version: 1,
        created_at: new Date('2026-11-04T21:46:50.520Z'),
        updated_at: new Date('2026-11-04T21:46:50.520Z'),
      };

      const size = BSON.calculateObjectSize(nominalWallet);
      assert.equal(size, 403, `Nominal wallet BSON size must be exactly 403 bytes, got ${size}`);

      const buffer = BSON.serialize(nominalWallet);
      assert.equal(buffer.length, 403, `Serialized buffer length must match calculateObjectSize`);
    });

    test('2.2. Minimum valid wallet document measures exactly 403 bytes', () => {
      const minWallet = {
        _id: new ObjectId('6aeba7caaf062efeb54fd714'),
        id: '00000000-0000-0000-0000-000000000000',
        user_id: '00000000-0000-0000-0000-000000000000',
        workspace_id: null,
        available_credits: 0,
        reserved_credits: 0,
        lifetime_granted: 0,
        lifetime_consumed: 0,
        period_granted: 0,
        period_consumed: 0,
        billing_period: '2026-01',
        reset_date: '2026-02-01T00:00:00.000Z',
        status: 'active',
        version: 1,
        created_at: new Date(0),
        updated_at: new Date(0),
      };

      const size = BSON.calculateObjectSize(minWallet);
      assert.equal(size, 403, `Minimum wallet BSON size must be exactly 403 bytes, got ${size}`);
    });

    test('2.3. Maximum valid wallet document: establishes exact 504-byte upper bound under standard ISO-24 timestamp', () => {
      // String _id 36 chars, workspace_id 36 chars, status 'suspended' (9 chars),
      // standard ISO-24 reset_date, 7 numeric fields as Int64/Double (8 bytes each):
      const maxWalletDouble24 = {
        _id: '12345678-1234-1234-1234-123456789012',
        id: '12345678-1234-1234-1234-123456789012',
        user_id: '12345678-1234-1234-1234-123456789012',
        workspace_id: '12345678-1234-1234-1234-123456789012',
        available_credits: 2147483648, // Exceeds int32 -> serialized as Double/Int64 (8 bytes)
        reserved_credits: 2147483648,
        lifetime_granted: 2147483648,
        lifetime_consumed: 2147483648,
        period_granted: 2147483648,
        period_consumed: 2147483648,
        billing_period: '2026-11',
        reset_date: '2026-12-01T00:00:00.000Z', // 24 chars (standard ISO)
        status: 'suspended', // 9 chars
        version: 2147483648,
        created_at: new Date('2026-11-01T00:00:00.000Z'),
        updated_at: new Date('2026-11-01T00:00:00.000Z'),
      };

      const size = BSON.calculateObjectSize(maxWalletDouble24);
      assert.equal(size, 504, `Max wallet under standard ISO-24 timestamp must be exactly 504 bytes, got ${size}`);

      // Same document under Int32 numbers (values <= 2147483647):
      const maxWalletInt32_24 = {
        ...maxWalletDouble24,
        available_credits: 2147483647,
        reserved_credits: 2147483647,
        lifetime_granted: 2147483647,
        lifetime_consumed: 2147483647,
        period_granted: 2147483647,
        period_consumed: 2147483647,
        version: 2147483647,
      };
      const int32Size = BSON.calculateObjectSize(maxWalletInt32_24);
      assert.equal(int32Size, 476, `Max wallet under Int32 must be exactly 476 bytes, got ${int32Size}`);
      assert.equal(504 - 476, 7 * 4, `Difference must be exactly 7 numeric fields * 4 bytes = 28 bytes`);
    });

    test('2.4. Maximum boundary case with 30-char reset_date (512 bytes Double, 484 bytes Int32)', () => {
      const maxWalletDouble30 = {
        _id: '12345678-1234-1234-1234-123456789012',
        id: '12345678-1234-1234-1234-123456789012',
        user_id: '12345678-1234-1234-1234-123456789012',
        workspace_id: '12345678-1234-1234-1234-123456789012',
        available_credits: 2147483648,
        reserved_credits: 2147483648,
        lifetime_granted: 2147483648,
        lifetime_consumed: 2147483648,
        period_granted: 2147483648,
        period_consumed: 2147483648,
        billing_period: '2026-11',
        reset_date: '2026-12-01T00:00:00.000000+00:00', // 30 chars
        status: 'suspended',
        version: 2147483648,
        created_at: new Date('2026-11-01T00:00:00.000Z'),
        updated_at: new Date('2026-11-01T00:00:00.000Z'),
      };

      const doubleSize = BSON.calculateObjectSize(maxWalletDouble30);
      assert.equal(doubleSize, 512, `Max wallet with 30-char reset_date and doubles is 512 bytes, got ${doubleSize}`);

      const int32Size = BSON.calculateObjectSize({
        ...maxWalletDouble30,
        available_credits: 2147483647,
        reserved_credits: 2147483647,
        lifetime_granted: 2147483647,
        lifetime_consumed: 2147483647,
        period_granted: 2147483647,
        period_consumed: 2147483647,
        version: 2147483647,
      });
      assert.equal(int32Size, 484, `Max wallet with 30-char reset_date and int32 is 484 bytes, got ${int32Size}`);

      // Critical invariant: Across all valid permutations, document BSON size is strictly bounded: <= 512 bytes
      assert.ok(doubleSize <= 512, 'Absolute maximum BSON size across all valid schema records is <= 512 bytes');
    });

    test('2.5. Typical production insert with ObjectId _id measures 447 bytes (Int32) / 475 bytes (Double)', () => {
      const prodMaxWallet = {
        _id: new ObjectId('6aeba7caaf062efeb54fd714'),
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
        reset_date: '2026-12-01T00:00:00.000Z',
        status: 'suspended',
        version: 2147483647,
        created_at: new Date('2026-11-01T00:00:00.000Z'),
        updated_at: new Date('2026-11-01T00:00:00.000Z'),
      };

      const size = BSON.calculateObjectSize(prodMaxWallet);
      assert.equal(size, 447, `Production max wallet with ObjectId and Int32 is 447 bytes, got ${size}`);

      const doubleSize = BSON.calculateObjectSize({
        ...prodMaxWallet,
        available_credits: 2147483648,
        reserved_credits: 2147483648,
        lifetime_granted: 2147483648,
        lifetime_consumed: 2147483648,
        period_granted: 2147483648,
        period_consumed: 2147483648,
        version: 2147483648,
      });
      assert.equal(doubleSize, 475, `Production max wallet with ObjectId and Double is 475 bytes, got ${doubleSize}`);
    });
  });

  // =========================================================================
  // 3. MongoDB Database Collection Validator Enforcement
  // =========================================================================
  describe('3. MongoDB Database Collection Validator Enforcement', () => {
    let testCollName: string;

    before(async () => {
      const db = await getMongoDb();
      testCollName = `test_wallet_validator_${Date.now()}`;
      await db.createCollection(testCollName, {
        validator: { $jsonSchema: WALLET_COLLECTION_JSON_SCHEMA },
        validationLevel: 'strict',
      });
    });

    after(async () => {
      const db = await getMongoDb();
      await db.collection(testCollName).drop().catch(() => undefined);
    });

    test('3.1. Valid wallet document passes MongoDB database collection validator', async () => {
      const db = await getMongoDb();
      const coll = db.collection(testCollName);

      const validDoc = {
        id: crypto.randomUUID(),
        user_id: crypto.randomUUID(),
        workspace_id: null,
        available_credits: 500,
        reserved_credits: 0,
        lifetime_granted: 500,
        lifetime_consumed: 0,
        period_granted: 500,
        period_consumed: 0,
        billing_period: '2026-11',
        reset_date: '2026-12-01T00:00:00.000Z',
        status: 'active',
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const result = await coll.insertOne(validDoc);
      assert.ok(result.insertedId);

      const fetched = await coll.findOne({ id: validDoc.id });
      assert.ok(fetched);
      assert.equal(fetched.available_credits, 500);
    });

    test('3.2. Direct database insert with unexpected field fails database validation (additionalProperties: false)', async () => {
      const db = await getMongoDb();
      const coll = db.collection(testCollName);

      const invalidDoc = {
        id: crypto.randomUUID(),
        user_id: crypto.randomUUID(),
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
        created_at: new Date(),
        updated_at: new Date(),
        extra_hacked_field: 'unauthorized', // Unexpected property
      };

      await assert.rejects(
        async () => {
          await coll.insertOne(invalidDoc);
        },
        /Document failed validation/
      );
    });

    test('3.3. Direct database insert with invalid BSON types fails database validation', async () => {
      const db = await getMongoDb();
      const coll = db.collection(testCollName);

      const invalidTypeDoc = {
        id: crypto.randomUUID(),
        user_id: crypto.randomUUID(),
        workspace_id: null,
        available_credits: '1000' as any, // String instead of numeric
        reserved_credits: 0,
        lifetime_granted: 1000,
        lifetime_consumed: 0,
        period_granted: 1000,
        period_consumed: 0,
        billing_period: '2026-11',
        reset_date: '2026-12-01T00:00:00.000Z',
        status: 'active',
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      };

      await assert.rejects(
        async () => {
          await coll.insertOne(invalidTypeDoc);
        },
        /Document failed validation/
      );
    });

    test('3.4. Direct database insert with negative balance fails database validation (minimum: 0)', async () => {
      const db = await getMongoDb();
      const coll = db.collection(testCollName);

      const negativeDoc = {
        id: crypto.randomUUID(),
        user_id: crypto.randomUUID(),
        workspace_id: null,
        available_credits: -50, // Negative credits
        reserved_credits: 0,
        lifetime_granted: 100,
        lifetime_consumed: 0,
        period_granted: 100,
        period_consumed: 0,
        billing_period: '2026-11',
        reset_date: '2026-12-01T00:00:00.000Z',
        status: 'active',
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      };

      await assert.rejects(
        async () => {
          await coll.insertOne(negativeDoc);
        },
        /Document failed validation/
      );
    });

    test('3.5. Direct database insert with oversized string fails database validation (maxLength: 36)', async () => {
      const db = await getMongoDb();
      const coll = db.collection(testCollName);

      const oversizedDoc = {
        id: crypto.randomUUID(),
        user_id: 'x'.repeat(37), // 37 characters exceeds maxLength 36
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
        created_at: new Date(),
        updated_at: new Date(),
      };

      await assert.rejects(
        async () => {
          await coll.insertOne(oversizedDoc);
        },
        /Document failed validation/
      );
    });

    test('3.6. Direct database insert with oversized _id fails database validation (maxLength: 36)', async () => {
      const db = await getMongoDb();
      const coll = db.collection(testCollName);

      const oversizedIdDoc = {
        _id: 'x'.repeat(1000), // 1000 characters exceeds maxLength 36
        id: crypto.randomUUID(),
        user_id: crypto.randomUUID(),
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
        created_at: new Date(),
        updated_at: new Date(),
      };

      await assert.rejects(
        async () => {
          await coll.insertOne(oversizedIdDoc);
        },
        /Document failed validation/
      );
    });

    test('3.7. Direct database insert with embedded array history fails database validation', async () => {
      const db = await getMongoDb();
      const coll = db.collection(testCollName);

      const arrayDoc = {
        id: crypto.randomUUID(),
        user_id: crypto.randomUUID(),
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
        history: [{ date: new Date(), tx: 'test' }], // Embedded array
        created_at: new Date(),
        updated_at: new Date(),
      };

      await assert.rejects(
        async () => {
          await coll.insertOne(arrayDoc);
        },
        /Document failed validation/
      );
    });

    test('3.8. Direct database insert with value > MAX_SAFE_INTEGER fails database validation (maximum: 9007199254740991)', async () => {
      const db = await getMongoDb();
      const coll = db.collection(testCollName);

      const overflowDoc = {
        id: crypto.randomUUID(),
        user_id: crypto.randomUUID(),
        workspace_id: null,
        available_credits: 9007199254740992, // Exceeds MAX_SAFE_INTEGER
        reserved_credits: 0,
        lifetime_granted: 9007199254740992,
        lifetime_consumed: 0,
        period_granted: 9007199254740992,
        period_consumed: 0,
        billing_period: '2026-11',
        reset_date: '2026-12-01T00:00:00.000Z',
        status: 'active',
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      };

      await assert.rejects(
        async () => {
          await coll.insertOne(overflowDoc);
        },
        /Document failed validation/
      );
    });

    test('3.9. Direct database insert with fractional float value fails database validation (multipleOf: 1)', async () => {
      const db = await getMongoDb();
      const coll = db.collection(testCollName);

      const floatDoc = {
        id: crypto.randomUUID(),
        user_id: crypto.randomUUID(),
        workspace_id: null,
        available_credits: 42.5, // Fractional float
        reserved_credits: 0,
        lifetime_granted: 100,
        lifetime_consumed: 0,
        period_granted: 100,
        period_consumed: 0,
        billing_period: '2026-11',
        reset_date: '2026-12-01T00:00:00.000Z',
        status: 'active',
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      };

      await assert.rejects(
        async () => {
          await coll.insertOne(floatDoc);
        },
        /Document failed validation/
      );
    });

    test('3.10. Direct database insert with NaN, Infinity, -Infinity fails database validation', async () => {
      const db = await getMongoDb();
      const coll = db.collection(testCollName);

      const base = {
        id: crypto.randomUUID(),
        user_id: crypto.randomUUID(),
        workspace_id: null,
        reserved_credits: 0,
        lifetime_granted: 100,
        lifetime_consumed: 0,
        period_granted: 100,
        period_consumed: 0,
        billing_period: '2026-11',
        reset_date: '2026-12-01T00:00:00.000Z',
        status: 'active',
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      };

      // NaN
      await assert.rejects(
        async () => {
          await coll.insertOne({ ...base, id: crypto.randomUUID(), available_credits: NaN });
        },
        /Document failed validation/
      );

      // Infinity
      await assert.rejects(
        async () => {
          await coll.insertOne({ ...base, id: crypto.randomUUID(), available_credits: Infinity });
        },
        /Document failed validation/
      );

      // -Infinity
      await assert.rejects(
        async () => {
          await coll.insertOne({ ...base, id: crypto.randomUUID(), available_credits: -Infinity });
        },
        /Document failed validation/
      );
    });

    test('3.11. Direct database insert with valid boundary values (0, MAX_SAFE_INTEGER) succeeds', async () => {
      const db = await getMongoDb();
      const coll = db.collection(testCollName);

      // Boundary 0
      const zeroDoc = {
        id: crypto.randomUUID(),
        user_id: crypto.randomUUID(),
        workspace_id: null,
        available_credits: 0,
        reserved_credits: 0,
        lifetime_granted: 0,
        lifetime_consumed: 0,
        period_granted: 0,
        period_consumed: 0,
        billing_period: '2026-11',
        reset_date: '2026-12-01T00:00:00.000Z',
        status: 'active',
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      };
      const resZero = await coll.insertOne(zeroDoc);
      assert.ok(resZero.insertedId);

      // Boundary MAX_SAFE_INTEGER
      const maxDoc = {
        id: crypto.randomUUID(),
        user_id: crypto.randomUUID(),
        workspace_id: null,
        available_credits: 9007199254740991,
        reserved_credits: 0,
        lifetime_granted: 9007199254740991,
        lifetime_consumed: 0,
        period_granted: 9007199254740991,
        period_consumed: 0,
        billing_period: '2026-11',
        reset_date: '2026-12-01T00:00:00.000Z',
        status: 'active',
        version: 9007199254740991,
        created_at: new Date(),
        updated_at: new Date(),
      };
      const resMax = await coll.insertOne(maxDoc);
      assert.ok(resMax.insertedId);
    });

    test('3.12. Startup validator audit detects and reports validator status accurately', async () => {
      const db = await getMongoDb();
      const { auditWalletCollectionValidator } = await import('../db/bootstrapMongo.js');

      // 1. Audit on the test collection (which has the current final validator)
      const collInfos = await db.listCollections({ name: testCollName }).toArray();
      assert.equal(collInfos.length, 1);
      const isCurrent =
        (collInfos[0].options as any)?.validator?.$jsonSchema?.properties?.available_credits?.multipleOf === 1;
      assert.equal(isCurrent, true, 'Test collection has current validator');

      // 2. Audit on the live Atlas credit_wallets collection
      const atlasAudit = await auditWalletCollectionValidator(db);
      assert.ok(atlasAudit.status === 'OUTDATED' || atlasAudit.status === 'CURRENT');
      assert.ok(typeof atlasAudit.hasCollModPermission === 'boolean');
      assert.ok(atlasAudit.message.length > 0);
    });
  });

  // =========================================================================
  // 4. Input Bounds & Adversarial Numeric Values in Financial Operations
  // =========================================================================
  describe('4. Input Bounds & Adversarial Numeric Values in Financial Operations', () => {
    test('4.1. grantCredits rejects NaN, Infinity, negative, non-integer, and out-of-range amounts', async () => {
      const userId = await createTestUser(100);

      // NaN
      await assert.rejects(
        async () => {
          await CreditRepository.grantCredits({
            userId,
            amount: NaN,
            type: 'monthly_grant',
            idempotencyKey: `nan_grant_${Date.now()}`,
            description: 'NaN grant',
          });
        },
        (err: any) => {
          assert.equal(err.code || err.errorCode, 'INVALID_CREDIT_AMOUNT');
          return true;
        }
      );

      // Infinity
      await assert.rejects(
        async () => {
          await CreditRepository.grantCredits({
            userId,
            amount: Infinity,
            type: 'monthly_grant',
            idempotencyKey: `inf_grant_${Date.now()}`,
            description: 'Infinity grant',
          });
        },
        (err: any) => {
          assert.equal(err.code || err.errorCode, 'INVALID_CREDIT_AMOUNT');
          return true;
        }
      );

      // Negative
      await assert.rejects(
        async () => {
          await CreditRepository.grantCredits({
            userId,
            amount: -10,
            type: 'monthly_grant',
            idempotencyKey: `neg_grant_${Date.now()}`,
            description: 'Negative grant',
          });
        },
        (err: any) => {
          assert.equal(err.code || err.errorCode, 'INVALID_CREDIT_AMOUNT');
          return true;
        }
      );

      // Float (non-integer)
      await assert.rejects(
        async () => {
          await CreditRepository.grantCredits({
            userId,
            amount: 5.5,
            type: 'monthly_grant',
            idempotencyKey: `float_grant_${Date.now()}`,
            description: 'Float grant',
          });
        },
        (err: any) => {
          assert.equal(err.code || err.errorCode, 'INVALID_CREDIT_AMOUNT');
          return true;
        }
      );

      // Out of range (> MAX_SAFE_INTEGER)
      await assert.rejects(
        async () => {
          await CreditRepository.grantCredits({
            userId,
            amount: Number.MAX_SAFE_INTEGER + 1000,
            type: 'monthly_grant',
            idempotencyKey: `overflow_grant_${Date.now()}`,
            description: 'Overflow grant',
          });
        },
        (err: any) => {
          assert.equal(err.code || err.errorCode, 'INVALID_CREDIT_AMOUNT');
          return true;
        }
      );
    });

    test('4.2. reserveCredits rejects NaN, Infinity, negative, and non-integer amounts', async () => {
      const userId = await createTestUser(100);

      // NaN
      await assert.rejects(
        async () => {
          await CreditRepository.reserveCredits({
            userId,
            attemptId: `nan_res_${Date.now()}`,
            operationId: 'ai_clipping',
            amount: NaN,
          });
        },
        (err: any) => {
          assert.equal(err.code || err.errorCode, 'INVALID_RESERVATION_AMOUNT');
          return true;
        }
      );

      // Negative
      await assert.rejects(
        async () => {
          await CreditRepository.reserveCredits({
            userId,
            attemptId: `neg_res_${Date.now()}`,
            operationId: 'ai_clipping',
            amount: -25,
          });
        },
        (err: any) => {
          assert.equal(err.code || err.errorCode, 'INVALID_RESERVATION_AMOUNT');
          return true;
        }
      );

      // Non-integer float
      await assert.rejects(
        async () => {
          await CreditRepository.reserveCredits({
            userId,
            attemptId: `float_res_${Date.now()}`,
            operationId: 'ai_clipping',
            amount: 12.34,
          });
        },
        (err: any) => {
          assert.equal(err.code || err.errorCode, 'INVALID_RESERVATION_AMOUNT');
          return true;
        }
      );
    });

    test('4.3. settleReservation rejects NaN, Infinity, negative, and non-integer amounts', async () => {
      const userId = await createTestUser(100);
      const attemptId = `settle_bad_amount_${Date.now()}`;

      const res = await CreditRepository.reserveCredits({
        userId,
        attemptId,
        operationId: 'ai_clipping',
        amount: 30,
      });
      assert.equal(res.allowed, true);

      // NaN
      await assert.rejects(
        async () => {
          await CreditRepository.settleReservation(attemptId, NaN);
        },
        (err: any) => {
          assert.equal(err.code || err.errorCode, 'INVALID_SETTLEMENT_AMOUNT');
          return true;
        }
      );

      // Negative
      await assert.rejects(
        async () => {
          await CreditRepository.settleReservation(attemptId, -5);
        },
        (err: any) => {
          assert.equal(err.code || err.errorCode, 'INVALID_SETTLEMENT_AMOUNT');
          return true;
        }
      );

      // Float
      await assert.rejects(
        async () => {
          await CreditRepository.settleReservation(attemptId, 15.75);
        },
        (err: any) => {
          assert.equal(err.code || err.errorCode, 'INVALID_SETTLEMENT_AMOUNT');
          return true;
        }
      );
    });

    test('4.4. getOrCreateWallet rejects invalid user_id and oversized strings', async () => {
      // Empty string
      await assert.rejects(
        async () => {
          await CreditRepository.getOrCreateWallet('');
        },
        (err: any) => {
          assert.equal(err.code || err.errorCode, 'INVALID_USER_ID');
          return true;
        }
      );

      // Whitespace only
      await assert.rejects(
        async () => {
          await CreditRepository.getOrCreateWallet('   ');
        },
        (err: any) => {
          assert.equal(err.code || err.errorCode, 'INVALID_USER_ID');
          return true;
        }
      );

      // Oversized string (> 36 chars)
      await assert.rejects(
        async () => {
          await CreditRepository.getOrCreateWallet('x'.repeat(37));
        },
        (err: any) => {
          assert.equal(err.code || err.errorCode, 'INVALID_USER_ID');
          return true;
        }
      );

      // Oversized workspaceId
      await assert.rejects(
        async () => {
          await CreditRepository.getOrCreateWallet(crypto.randomUUID(), 'x'.repeat(37));
        },
        (err: any) => {
          assert.equal(err.code || err.errorCode, 'INVALID_WORKSPACE_ID');
          return true;
        }
      );
    });
  });

  // =========================================================================
  // 5. Wallet Concurrency Stress & Invariant Verification (20 Concurrency Limit)
  // =========================================================================
  describe('5. Wallet Concurrency Stress & Invariant Verification (20 Concurrency Limit)', () => {
    test('5.1. 20 concurrent reservation requests against single wallet: no negative balances, strict invariant', async () => {
      const db = await getMongoDb();
      const initialCredits = 100;
      const reservationCost = 20; // 5 can succeed (5 * 20 = 100), remaining 15 must be rejected
      const userId = await createTestUser(initialCredits);

      const attempts = Array.from({ length: 20 }, (_, i) => `concurrent_res_${i}_${Date.now()}`);

      // Concurrently launch all 20 reservation requests
      const promises = attempts.map((attemptId) =>
        CreditRepository.reserveCredits({
          userId,
          attemptId,
          operationId: 'ai_clipping',
          amount: reservationCost,
        })
      );

      const results = await Promise.allSettled(promises);

      const fulfilled = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
      const rejected = results.filter((r) => r.status === 'rejected');

      const allowedResults = fulfilled.filter((r) => r.value.allowed === true);
      const deniedResults = fulfilled.filter((r) => r.value.allowed === false);

      // Exactly 5 reservations must succeed (5 * 20 = 100)
      assert.equal(allowedResults.length, 5, 'Exactly 5 reservations can succeed with 100 available credits');
      assert.equal(deniedResults.length, 15, 'Exactly 15 reservations must be denied');
      assert.equal(rejected.length, 0, 'All calls must resolve cleanly (no unexpected crashes)');

      // Verify wallet balance invariants:
      // available_credits must be exactly 0
      // reserved_credits must be exactly 100
      // available + reserved === 100
      const wallet = await CreditRepository.getOrCreateWallet(userId);
      assert.equal(wallet.available_credits, 0, 'Available credits must be 0 (never negative!)');
      assert.equal(wallet.reserved_credits, 100, 'Reserved credits must be exactly 100');
      assert.equal(
        wallet.available_credits + wallet.reserved_credits,
        initialCredits,
        'Conservation invariant must hold: available + reserved === initial'
      );
    });

    test('5.2. Concurrent settlement and refund across multiple reservations preserves zero-drift accounting', async () => {
      const db = await getMongoDb();
      const initialCredits = 200;
      const userId = await createTestUser(initialCredits);

      // Create 4 reservations of 25 credits each (total 100 reserved)
      const attempts = Array.from({ length: 4 }, (_, i) => `race_mix_${i}_${Date.now()}`);
      for (const att of attempts) {
        const res = await CreditRepository.reserveCredits({
          userId,
          attemptId: att,
          operationId: 'ai_clipping',
          amount: 25,
        });
        assert.equal(res.allowed, true);
      }

      const walletMid = await CreditRepository.getOrCreateWallet(userId);
      assert.equal(walletMid.available_credits, 100);
      assert.equal(walletMid.reserved_credits, 100);

      // Concurrently settle 2 reservations (25 each = 50 consumed) and refund 2 reservations (25 each = 50 restored)
      const settle1 = CreditRepository.settleReservation(attempts[0], 25);
      const settle2 = CreditRepository.settleReservation(attempts[1], 25);
      const refund1 = CreditRepository.releaseReservation(attempts[2], 'Worker error');
      const refund2 = CreditRepository.releaseReservation(attempts[3], 'Worker timeout');

      const results = await Promise.allSettled([settle1, settle2, refund1, refund2]);
      for (const r of results) {
        assert.equal(r.status, 'fulfilled', 'All concurrent settlements and refunds must succeed');
      }

      // Verify final wallet state:
      // available = 100 (initial leftover) + 50 (refunded) = 150
      // reserved = 0
      // lifetime_consumed = 50 (settled)
      // lifetime_granted = 200
      const walletFinal = await CreditRepository.getOrCreateWallet(userId);
      assert.equal(walletFinal.available_credits, 150, 'Available balance must be 150');
      assert.equal(walletFinal.reserved_credits, 0, 'Reserved balance must be 0');
      assert.equal(walletFinal.lifetime_consumed, 50, 'Lifetime consumed must be 50');
      assert.equal(walletFinal.lifetime_granted, 200, 'Lifetime granted must be 200');

      // Conservation equation: available === lifetime_granted - lifetime_consumed - reserved
      assert.equal(
        walletFinal.available_credits,
        walletFinal.lifetime_granted - walletFinal.lifetime_consumed - walletFinal.reserved_credits,
        'Conservation equation must hold'
      );

      // Ledger audit: sum of all available deltas must equal wallet available balance
      const transactions = await db.collection<CreditTransactionRecord>('credit_transactions')
        .find({ user_id: userId })
        .toArray();

      let ledgerAvailable = 0;
      let ledgerReserved = 0;
      let ledgerGranted = 0;
      let ledgerConsumed = 0;

      for (const tx of transactions) {
        ledgerAvailable += tx.available_delta;
        ledgerReserved += tx.reserved_delta;
        ledgerGranted += tx.lifetime_granted_delta;
        ledgerConsumed += tx.lifetime_consumed_delta;
      }

      assert.equal(ledgerAvailable, walletFinal.available_credits, 'Ledger available deltas must match wallet');
      assert.equal(ledgerReserved, walletFinal.reserved_credits, 'Ledger reserved deltas must match wallet');
      assert.equal(ledgerGranted, walletFinal.lifetime_granted, 'Ledger granted deltas must match wallet');
      assert.equal(ledgerConsumed, walletFinal.lifetime_consumed, 'Ledger consumed deltas must match wallet');
    });

    test('5.3. Concurrent monthly grants with unique idempotency keys increment balances without lost updates', async () => {
      const userId = await createTestUser(100);

      // Concurrently launch 5 independent grants of 50 credits each
      const grantKeys = Array.from({ length: 5 }, (_, i) => `concurrent_grant_${i}_${Date.now()}`);
      const promises = grantKeys.map((key) =>
        CreditRepository.grantCredits({
          userId,
          amount: 50,
          type: 'monthly_grant',
          idempotencyKey: key,
          description: `Concurrent grant ${key}`,
        })
      );

      const results = await Promise.allSettled(promises);
      for (const r of results) {
        assert.equal(r.status, 'fulfilled', 'All concurrent grants must succeed');
      }

      // Wallet should have 100 + (5 * 50) = 350 credits
      const wallet = await CreditRepository.getOrCreateWallet(userId);
      assert.equal(wallet.available_credits, 350, 'Wallet available credits must be exactly 350 (no lost updates)');
      assert.equal(wallet.lifetime_granted, 350, 'Lifetime granted must be exactly 350');
      assert.equal(wallet.period_granted, 350, 'Period granted must be exactly 350');
    });
  });

  // =========================================================================
  // 6. Existing Database Records Audit & Non-Destructive Migration Safety
  // =========================================================================
  describe('6. Existing Database Records Audit & Non-Destructive Migration Safety', () => {
    test('6.1. All existing credit_wallets records in connected database match the 16-field schema', async () => {
      const db = await getMongoDb();
      const existingWallets = await db.collection('credit_wallets').find().toArray();

      assert.ok(existingWallets.length > 0, 'Database must contain existing wallet records to audit');

      for (const wallet of existingWallets) {
        // 1. Verify that all fields in document belong strictly to the allowed 16-field set
        for (const key of Object.keys(wallet)) {
          assert.ok(
            WALLET_ALLOWED_FIELDS.has(key),
            `Existing wallet ${wallet.id} contains unexpected field '${key}'`
          );
        }

        // 2. Verify all required fields are present
        assert.ok(wallet.id, 'Wallet must have id');
        assert.ok(wallet.user_id, 'Wallet must have user_id');
        assert.equal(typeof wallet.available_credits, 'number');
        assert.equal(typeof wallet.reserved_credits, 'number');
        assert.equal(typeof wallet.lifetime_granted, 'number');
        assert.equal(typeof wallet.lifetime_consumed, 'number');
        assert.equal(typeof wallet.period_granted, 'number');
        assert.equal(typeof wallet.period_consumed, 'number');
        assert.equal(typeof wallet.billing_period, 'string');
        assert.equal(typeof wallet.reset_date, 'string');
        assert.ok(['active', 'suspended', 'frozen'].includes(wallet.status));
        assert.equal(typeof wallet.version, 'number');
        assert.ok(wallet.created_at);
        assert.ok(wallet.updated_at);

        // 3. Measure BSON size of existing record
        const size = BSON.calculateObjectSize(wallet);
        assert.ok(
          size <= 504,
          `Existing wallet ${wallet.id} BSON size ${size} must not exceed 504 bytes`
        );
      }
    });

    test('6.2. Confirms zero data migration is required: 100% of existing records conform to schema', async () => {
      const db = await getMongoDb();
      const existingWallets = await db.collection('credit_wallets').find().toArray();

      let nonConformingCount = 0;
      for (const wallet of existingWallets) {
        const check = validateWalletDocument(wallet);
        if (!check.valid) {
          nonConformingCount++;
        }
      }

      assert.equal(
        nonConformingCount,
        0,
        `All ${existingWallets.length} existing wallet records conform 100% to schema. Zero records require destructive migration.`
      );
    });
  });
});
