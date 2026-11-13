import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Exact validationAction validation helper.
 *
 * Requirements:
 * Accepts ONLY:
 * 1. Property omitted or undefined (MongoDB engine default is "error").
 * 2. Property explicitly strictly equal to "error".
 *
 * Rejects:
 * - Explicit "warn"
 * - null
 * - empty string ""
 * - unexpected strings or types (e.g. "ignore", 123, false, {})
 */
export function isEffectiveErrorValidationAction(options: any): { valid: boolean; reason?: string } {
  if (options === null || typeof options !== 'object') {
    return { valid: false, reason: 'Options must be a non-null object' };
  }

  // Case 1: Property omitted
  if (!('validationAction' in options) || options.validationAction === undefined) {
    return { valid: true };
  }

  // Case 2: Explicitly "error"
  if (options.validationAction === 'error') {
    return { valid: true };
  }

  // Rejections
  if (options.validationAction === 'warn') {
    return { valid: false, reason: "validationAction is explicitly 'warn' (must be 'error' or omitted default)" };
  }

  if (options.validationAction === null) {
    return { valid: false, reason: 'validationAction cannot be null' };
  }

  if (options.validationAction === '') {
    return { valid: false, reason: 'validationAction cannot be an empty string' };
  }

  return {
    valid: false,
    reason: `Invalid validationAction value '${String(options.validationAction)}' (type: ${typeof options.validationAction})`,
  };
}

/**
 * Quiescence filter matcher for currentOp testing.
 * Simulates MongoDB $or filter against currentOp entry shapes.
 */
export function matchesCreditWalletsWriteOp(op: any): boolean {
  if (!op || typeof op !== 'object') return false;

  const cmd = op.command || {};
  const ns = op.ns || '';
  const opType = op.op || '';

  // 1. command.update targeting credit_wallets
  if (cmd.update === 'credit_wallets') return true;

  // 2. command.insert targeting credit_wallets
  if (cmd.insert === 'credit_wallets') return true;

  // 3. command.findAndModify or findandmodify targeting credit_wallets
  if (cmd.findAndModify === 'credit_wallets' || cmd.findandmodify === 'credit_wallets') return true;

  // 4. command.delete targeting credit_wallets
  if (cmd.delete === 'credit_wallets') return true;

  // 5. ns matching vireo_staging.credit_wallets with write opType
  if (ns === 'vireo_staging.credit_wallets' && ['insert', 'update', 'remove'].includes(opType)) {
    return true;
  }

  return false;
}

describe('VireoClip Phase 4B.3: ValidationAction and Quiescence Unit Tests', () => {
  describe('1. Exact validationAction Checks', () => {
    it('1.1. Accepts omitted validationAction property', () => {
      const res = isEffectiveErrorValidationAction({ validationLevel: 'strict' });
      assert.equal(res.valid, true);
    });

    it('1.2. Accepts validationAction: undefined', () => {
      const res = isEffectiveErrorValidationAction({ validationAction: undefined });
      assert.equal(res.valid, true);
    });

    it('1.3. Accepts explicit validationAction: "error"', () => {
      const res = isEffectiveErrorValidationAction({ validationAction: 'error' });
      assert.equal(res.valid, true);
    });

    it('1.4. Rejects explicit validationAction: "warn"', () => {
      const res = isEffectiveErrorValidationAction({ validationAction: 'warn' });
      assert.equal(res.valid, false);
      assert.match(res.reason!, /explicitly 'warn'/);
    });

    it('1.5. Rejects validationAction: null', () => {
      const res = isEffectiveErrorValidationAction({ validationAction: null });
      assert.equal(res.valid, false);
      assert.match(res.reason!, /cannot be null/);
    });

    it('1.6. Rejects validationAction: "" (empty string)', () => {
      const res = isEffectiveErrorValidationAction({ validationAction: '' });
      assert.equal(res.valid, false);
      assert.match(res.reason!, /empty string/);
    });

    it('1.7. Rejects unexpected string values (e.g. "ignore", "moderate")', () => {
      const res = isEffectiveErrorValidationAction({ validationAction: 'ignore' });
      assert.equal(res.valid, false);
      assert.match(res.reason!, /Invalid validationAction value 'ignore'/);
    });

    it('1.8. Rejects non-string types (e.g. boolean false, number 0, object)', () => {
      assert.equal(isEffectiveErrorValidationAction({ validationAction: false }).valid, false);
      assert.equal(isEffectiveErrorValidationAction({ validationAction: 0 }).valid, false);
      assert.equal(isEffectiveErrorValidationAction({ validationAction: {} }).valid, false);
    });
  });

  describe('2. currentOp Quiescence Query Independent Detection', () => {
    it('2.1. Detects update-only operation targeting credit_wallets', () => {
      const op = { command: { update: 'credit_wallets', updates: [{ q: { id: 'test' }, u: { $set: { version: 2 } } }] } };
      assert.equal(matchesCreditWalletsWriteOp(op), true);
    });

    it('2.2. Detects insert-only operation targeting credit_wallets', () => {
      const op = { command: { insert: 'credit_wallets', documents: [{ id: 'test' }] } };
      assert.equal(matchesCreditWalletsWriteOp(op), true);
    });

    it('2.3. Detects findAndModify operation targeting credit_wallets', () => {
      const op = { command: { findAndModify: 'credit_wallets', query: { id: 'test' }, update: { $inc: { version: 1 } } } };
      assert.equal(matchesCreditWalletsWriteOp(op), true);
    });

    it('2.4. Detects delete operation targeting credit_wallets', () => {
      const op = { command: { delete: 'credit_wallets', deletes: [{ q: { id: 'test' }, limit: 1 }] } };
      assert.equal(matchesCreditWalletsWriteOp(op), true);
    });

    it('2.5. Detects namespace-level write ops on credit_wallets', () => {
      assert.equal(matchesCreditWalletsWriteOp({ ns: 'vireo_staging.credit_wallets', op: 'update' }), true);
      assert.equal(matchesCreditWalletsWriteOp({ ns: 'vireo_staging.credit_wallets', op: 'insert' }), true);
      assert.equal(matchesCreditWalletsWriteOp({ ns: 'vireo_staging.credit_wallets', op: 'remove' }), true);
    });

    it('2.6. Does NOT match reads or operations on unrelated collections', () => {
      // Find on credit_wallets
      assert.equal(matchesCreditWalletsWriteOp({ command: { find: 'credit_wallets' }, ns: 'vireo_staging.credit_wallets', op: 'query' }), false);
      // Writes on credit_reservations
      assert.equal(matchesCreditWalletsWriteOp({ command: { update: 'credit_reservations' }, ns: 'vireo_staging.credit_reservations', op: 'update' }), false);
      assert.equal(matchesCreditWalletsWriteOp({ command: { insert: 'outbox_events' }, ns: 'vireo_staging.outbox_events', op: 'insert' }), false);
      // Admin commands
      assert.equal(matchesCreditWalletsWriteOp({ command: { serverStatus: 1 } }), false);
    });
  });
});

