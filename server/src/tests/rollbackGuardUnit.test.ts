import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WALLET_COLLECTION_JSON_SCHEMA } from '../db/bootstrapMongo.js';

function canonicalize(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(canonicalize);
  const sorted: Record<string, any> = {};
  for (const k of Object.keys(obj).sort()) sorted[k] = canonicalize(obj[k]);
  return sorted;
}

const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';
const EXPECTED_LEGACY_VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['id', 'user_id'],
    properties: {
      id: { bsonType: 'string', pattern: UUID_PATTERN },
      user_id: { bsonType: 'string', pattern: UUID_PATTERN },
      project_id: { bsonType: 'string', pattern: UUID_PATTERN },
      clip_id: { bsonType: 'string', pattern: UUID_PATTERN },
      created_at: { bsonType: 'date' },
      updated_at: { bsonType: 'date' },
    },
  },
};

const EXPECTED_NEW_VALIDATOR = {
  $jsonSchema: WALLET_COLLECTION_JSON_SCHEMA,
};

function isEffectiveErrorValidationAction(options: any): { valid: boolean; reason?: string } {
  if (options === null || typeof options !== 'object') {
    return { valid: false, reason: 'Options must be a non-null object' };
  }
  if (!('validationAction' in options) || options.validationAction === undefined) {
    return { valid: true };
  }
  if (options.validationAction === 'error') {
    return { valid: true };
  }
  return { valid: false, reason: `Invalid validationAction value '${String(options.validationAction)}'` };
}

function verifyRollbackGuard(liveOptions: any): { allowed: boolean; error?: string } {
  const liveValidator = liveOptions?.validator;
  if (!liveValidator) {
    return { allowed: false, error: 'No validator present on collection' };
  }

  const liveCanon = JSON.stringify(canonicalize(liveValidator));
  const newCanon = JSON.stringify(canonicalize(EXPECTED_NEW_VALIDATOR));
  const legacyCanon = JSON.stringify(canonicalize(EXPECTED_LEGACY_VALIDATOR));

  // Guard 1: Abort if already legacy
  if (liveCanon === legacyCanon) {
    return { allowed: false, error: 'Collection already has legacy validator' };
  }

  // Guard 2: Abort if not the expected target new schema
  if (liveCanon !== newCanon) {
    return { allowed: false, error: 'Collection has unexpected validator' };
  }

  // Guard 3: Abort if validationLevel is not strict
  if (liveOptions.validationLevel !== 'strict') {
    return { allowed: false, error: `Invalid validationLevel: ${liveOptions.validationLevel}` };
  }

  // Guard 4: Abort if effective validationAction is not error
  const actionCheck = isEffectiveErrorValidationAction(liveOptions);
  if (!actionCheck.valid) {
    return { allowed: false, error: actionCheck.reason };
  }

  return { allowed: true };
}

describe('VireoClip Phase 4B.3: Rollback State Guard Unit Tests', () => {
  it('1. Allows rollback when collection has expected new schema with explicit strict/error', () => {
    const liveOptions = {
      validator: { $jsonSchema: WALLET_COLLECTION_JSON_SCHEMA },
      validationLevel: 'strict',
      validationAction: 'error',
    };
    const res = verifyRollbackGuard(liveOptions);
    assert.equal(res.allowed, true);
    assert.equal(res.error, undefined);
  });

  it('2. Allows rollback when validationAction is omitted (MongoDB engine default "error")', () => {
    const liveOptions = {
      validator: { $jsonSchema: WALLET_COLLECTION_JSON_SCHEMA },
      validationLevel: 'strict',
      // validationAction omitted
    };
    const res = verifyRollbackGuard(liveOptions);
    assert.equal(res.allowed, true);
    assert.equal(res.error, undefined);
  });

  it('3. Aborts when collection is already in legacy state', () => {
    const liveOptions = {
      validator: EXPECTED_LEGACY_VALIDATOR,
      validationLevel: 'strict',
    };
    const res = verifyRollbackGuard(liveOptions);
    assert.equal(res.allowed, false);
    assert.match(res.error!, /already has legacy validator/);
  });

  it('4. Aborts when collection has an unexpected third-party or partial validator', () => {
    const liveOptions = {
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          properties: { unexpected_field: { bsonType: 'string' } },
        },
      },
      validationLevel: 'strict',
      validationAction: 'error',
    };
    const res = verifyRollbackGuard(liveOptions);
    assert.equal(res.allowed, false);
    assert.match(res.error!, /unexpected validator/);
  });

  it('5. Aborts when validationLevel is not strict (e.g. moderate or off)', () => {
    const liveOptions = {
      validator: { $jsonSchema: WALLET_COLLECTION_JSON_SCHEMA },
      validationLevel: 'moderate',
      validationAction: 'error',
    };
    const res = verifyRollbackGuard(liveOptions);
    assert.equal(res.allowed, false);
    assert.match(res.error!, /Invalid validationLevel/);
  });

  it('6. Aborts when validationAction is explicitly configured as warn', () => {
    const liveOptions = {
      validator: { $jsonSchema: WALLET_COLLECTION_JSON_SCHEMA },
      validationLevel: 'strict',
      validationAction: 'warn',
    };
    const res = verifyRollbackGuard(liveOptions);
    assert.equal(res.allowed, false);
    assert.match(res.error!, /Invalid validationAction.*warn/);
  });
});

