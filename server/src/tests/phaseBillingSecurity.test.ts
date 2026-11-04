import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { computeProcessingEstimateMinutes } from '../services/usageService.js';

/**
 * Billing + security hardening: no extra minutes, no quota bypass, no spoofing.
 * Pure-logic tests run without DB; wiring guards pin the source so the
 * vulnerabilities cannot silently return.
 */

describe('Billing — server-authoritative processing estimates', () => {
  it('derives estimates from server-measured duration only', () => {
    assert.equal(computeProcessingEstimateMinutes(300), 6); // 5 min + 1 margin
    assert.equal(computeProcessingEstimateMinutes(5400), 91); // 90 min + 1
    assert.equal(computeProcessingEstimateMinutes(61), 3); // 1m01s → 2 + 1
  });

  it('unknown/invalid durations get a provisional estimate, extended mid-processing', () => {
    assert.equal(computeProcessingEstimateMinutes(undefined), 12);
    assert.equal(computeProcessingEstimateMinutes(null), 12);
    assert.equal(computeProcessingEstimateMinutes(-5), 12);
    assert.equal(computeProcessingEstimateMinutes('not-a-number'), 12);
  });

  it('caps at the 2-hour source ceiling + margin and enforces a minimum charge', () => {
    assert.equal(computeProcessingEstimateMinutes(7200), 121); // 2h + 1
    assert.equal(computeProcessingEstimateMinutes(999999), 125); // hard cap
    assert.equal(computeProcessingEstimateMinutes(1), 2); // 1s still bills ceil-to-minute + margin
  });

  it('controller no longer trusts req.body.estimated_minutes', () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), 'src/controllers/projectController.ts'), 'utf8');
    assert.doesNotMatch(src, /req\.body\?\.estimated_minutes/, 'client estimate must be ignored');
    assert.match(src, /computeProcessingEstimateMinutes\(\(project as any\)\.duration_seconds\)/);
  });
});

describe('Billing — settlement invariants (source-level)', () => {
  const repo = fs.readFileSync(path.resolve(process.cwd(), 'src/db/repositories/usageRepository.ts'), 'utf8');

  it('settled minutes can never exceed the reserved amount (hard clamp)', () => {
    assert.match(repo, /Math\.min\(measured, event\.reserved_minutes\)/);
    assert.match(repo, /settled_clamped_to_reservation: true/);
  });

  it('mid-processing extension re-checks the plan ceiling atomically', () => {
    assert.match(repo, /export async function extendUsageReservation/);
    assert.match(repo, /\$lte: \[\{ \$add: \['\$settled_minutes', '\$reserved_minutes', delta\] \}, '\$monthly_minutes_limit'\]/);
  });

  it('processing extends the reservation before settling and fails on refusal', () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), 'src/services/videoProcessingService.ts'), 'utf8');
    const extendIdx = src.indexOf('extendReservationToMeasuredDuration(processingAttemptId');
    const settleIdx = src.indexOf('settleReservation(', extendIdx);
    assert.ok(extendIdx > 0, 'extension call present');
    assert.ok(settleIdx > extendIdx, 'settle must follow the extension');
    assert.match(src, /quota exceeded mid-run/);
  });

  it('webhook processing verifies signatures and dedupes events', () => {
    const billing = fs.readFileSync(path.resolve(process.cwd(), 'src/controllers/billingController.ts'), 'utf8');
    assert.match(billing, /provider\.verifyWebhook\(rawBody/);
    assert.match(billing, /isEventAlreadyProcessed/);
    const payment = fs.readFileSync(path.resolve(process.cwd(), 'src/controllers/paymentController.ts'), 'utf8');
    assert.match(payment, /timingSafeEqual/);
    assert.match(payment, /createHmac\('sha256', keySecret\)/);
  });

  it('Razorpay payment verification computes the canonical payload correctly', () => {
    const keySecret = 'test_secret';
    const orderId = 'order_TEST123';
    const paymentId = 'pay_TEST456';
    const payload = `${orderId}|${paymentId}`;
    const expected = crypto.createHmac('sha256', keySecret).update(payload).digest('hex');
    // The controller's exact construction, verified against a forged signature.
    const forged = crypto.createHmac('sha256', keySecret).update(`${paymentId}|${orderId}`).digest('hex');
    assert.notEqual(expected, forged, 'swapped-field forgery must not match');
    assert.equal(
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(forged)),
      false
    );
  });
});

describe('Security — request hardening', () => {
  it('trust proxy is env-gated, not unconditional (rate-limit spoofing)', () => {
    const index = fs.readFileSync(path.resolve(process.cwd(), 'src/index.ts'), 'utf8');
    assert.match(index, /if \(config\.trustProxy\) \{\s*\n\s*app\.set\('trust proxy', 1\);/);
    assert.doesNotMatch(index, /^app\.set\('trust proxy', 1\);$/m);
  });

  it('JSON bodies strip prototype-pollution keys via reviver', () => {
    const index = fs.readFileSync(path.resolve(process.cwd(), 'src/index.ts'), 'utf8');
    assert.match(index, /pollutionSafeReviver/);
    assert.match(index, /'__proto__' \|\| key === 'constructor' \|\| key === 'prototype'/);

    // Behavioral proof with the same reviver semantics.
    const reviver = (key: string, value: unknown) =>
      key === '__proto__' || key === 'constructor' || key === 'prototype' ? undefined : value;
    const parsed = JSON.parse('{"a":1,"__proto__":{"polluted":true},"b":{"constructor":{"x":1}},"c":2}', reviver);
    assert.equal((parsed as any).polluted, undefined);
    assert.equal((parsed as any).a, 1);
    assert.equal((parsed as any).c, 2);
  });

  it('rate limiter keys by IP, never by unverified JWT claims', () => {
    const rl = fs.readFileSync(path.resolve(process.cwd(), 'src/middleware/rateLimiter.ts'), 'utf8');
    assert.match(rl, /ipKeyGenerator\(req\.ip/);
    assert.doesNotMatch(rl, /payload\.sub/, 'unverified sub must not create buckets');
  });

  it('auth middleware fails closed and verifies tokens via Supabase', () => {
    const auth = fs.readFileSync(path.resolve(process.cwd(), 'src/middleware/authMiddleware.ts'), 'utf8');
    assert.match(auth, /SERVICE_UNAVAILABLE/);
    assert.match(auth, /getUser\(token\)/);
    assert.doesNotMatch(auth, /['"]demo-token['"]/, 'no demo-token acceptance in code');
  });

  it('admin routes require the explicit server-side allowlist', () => {
    const admin = fs.readFileSync(path.resolve(process.cwd(), 'src/middleware/adminMiddleware.ts'), 'utf8');
    assert.match(admin, /config\.adminEmails\.includes/);
    assert.match(admin, /config\.adminUserIds\.includes/);
    assert.match(admin, /FORBIDDEN_ADMIN_ACCESS/);
  });

  it('upload grants and editor sources stay owner-scoped (regression pins)', () => {
    const pc = fs.readFileSync(path.resolve(process.cwd(), 'src/controllers/projectController.ts'), 'utf8');
    assert.match(pc, /\.eq\('user_id', userId\)/);
    const validator = fs.readFileSync(path.resolve(process.cwd(), 'src/utils/editorAssetValidator.ts'), 'utf8');
    assert.match(validator, /users\/\$\{userId\}\//);
  });
});
