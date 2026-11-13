import test, { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import { CreditRepository, getCurrentBillingPeriod, buildCanonicalIdempotencyKey } from '../db/repositories/creditRepository.js';
import { CreditPricingService } from '../services/billing/creditPricingService.js';
import { CreditWalletService } from '../services/creditWalletService.js';

const TEST_USER = '00000000-0000-4000-8000-000000000099';
const TEST_USER_CONCURRENT = '00000000-0000-4000-8000-000000000098';

describe('VireoClip Phase B — Unified Credit System Foundation', () => {
  const cleanupUserIds = [TEST_USER, TEST_USER_CONCURRENT];

  before(async () => {
    const db = await getMongoDb();
    await db.collection('credit_wallets').deleteMany({ user_id: { $in: cleanupUserIds } });
    await db.collection('credit_transactions').deleteMany({ user_id: { $in: cleanupUserIds } });
    await db.collection('credit_reservations').deleteMany({ user_id: { $in: cleanupUserIds } });
    await db.collection('idempotency_keys').deleteMany({ user_id: { $in: cleanupUserIds } });
  });

  after(async () => {
    try {
      const db = await getMongoDb();
      await db.collection('credit_wallets').deleteMany({ user_id: { $in: cleanupUserIds } });
      await db.collection('credit_transactions').deleteMany({ user_id: { $in: cleanupUserIds } });
      await db.collection('credit_reservations').deleteMany({ user_id: { $in: cleanupUserIds } });
      await db.collection('idempotency_keys').deleteMany({ user_id: { $in: cleanupUserIds } });
    } finally {
      // Ensure MongoDB pool closes cleanly so test runner terminates immediately
      await closeMongo(true);
    }
  });

  // =========================================================================
  // 1. Wallet Creation
  // =========================================================================
  it('1. Initializes unified credit wallet with zero balances and active status', async () => {
    const wallet = await CreditRepository.getOrCreateWallet(TEST_USER);
    assert.ok(wallet.id, 'Wallet must have UUID id');
    assert.equal(wallet.user_id, TEST_USER);
    assert.equal(wallet.available_credits, 0);
    assert.equal(wallet.reserved_credits, 0);
    assert.equal(wallet.period_granted, 0);
    assert.equal(wallet.period_consumed, 0);
    assert.equal(wallet.status, 'active');
    assert.equal(wallet.billing_period, getCurrentBillingPeriod());
  });

  // =========================================================================
  // 2. Monthly Grant & Idempotency
  // =========================================================================
  it('2. Grants monthly credits idempotently with unique ledger transaction', async () => {
    const grantKey = `test_grant_${TEST_USER}_2026-11`;
    const grant1 = await CreditRepository.grantCredits({
      userId: TEST_USER,
      amount: 100,
      type: 'monthly_grant',
      idempotencyKey: grantKey,
      description: 'Provisional Creator plan grant',
    });

    assert.equal(grant1.alreadyProcessed, false);
    assert.equal(grant1.wallet.available_credits, 100);
    assert.equal(grant1.wallet.period_granted, 100);

    // Duplicate grant with same idempotency key must not double-grant credits
    const grant2 = await CreditRepository.grantCredits({
      userId: TEST_USER,
      amount: 100,
      type: 'monthly_grant',
      idempotencyKey: grantKey,
      description: 'Duplicate delivery attempt',
    });

    assert.equal(grant2.alreadyProcessed, true);
    assert.equal(grant2.wallet.available_credits, 100, 'Balance must remain 100 after duplicate grant');
  });

  // =========================================================================
  // 3. Balance Separation & Insufficient Balance Rejection
  // =========================================================================
  it('3. Enforces available balance ceiling and rejects insufficient balance requests', async () => {
    const attemptId = crypto.randomUUID();
    // User has 100 credits; attempting to reserve 150 must fail cleanly
    const res = await CreditWalletService.reserveCredits({
      userId: TEST_USER,
      attemptId,
      operationId: 'core_video_processing',
      amount: 150,
    });

    assert.equal(res.allowed, false);
    assert.equal(res.errorCode, 'INSUFFICIENT_CREDITS');
    assert.equal(res.wallet.available_credits, 100, 'Available balance must remain untouched');
    assert.equal(res.wallet.reserved_credits, 0);
  });

  // =========================================================================
  // 4. Atomic Credit Reservation
  // =========================================================================
  it('4. Atomically reserves credits and records reservation in ledger', async () => {
    const attemptId = crypto.randomUUID();
    const res = await CreditWalletService.reserveCredits({
      userId: TEST_USER,
      attemptId,
      operationId: 'core_video_processing',
      amount: 40,
    });

    assert.equal(res.allowed, true);
    assert.ok(res.reservation);
    assert.equal(res.reservation.amount, 40);
    assert.equal(res.reservation.status, 'reserved');

    const summary = await CreditWalletService.getWalletSummary(TEST_USER);
    assert.equal(summary.available_credits, 60, '100 - 40 = 60 available');
    assert.equal(summary.reserved_credits, 40, '40 credits reserved in-flight');

    // Duplicate reservation with same attempt_id must be idempotent
    const resDuplicate = await CreditWalletService.reserveCredits({
      userId: TEST_USER,
      attemptId,
      operationId: 'core_video_processing',
      amount: 40,
    });

    assert.equal(resDuplicate.allowed, true);
    assert.equal(resDuplicate.idempotent, true);

    const summaryAfter = await CreditWalletService.getWalletSummary(TEST_USER);
    assert.equal(summaryAfter.available_credits, 60);
    assert.equal(summaryAfter.reserved_credits, 40);
  });

  // =========================================================================
  // 5. Settlement & Partial Refund of Unused Credits
  // =========================================================================
  it('5. Settles reservation and refunds unused portion back to available balance', async () => {
    // Current state: 60 available, 40 reserved
    // Job completed using 35 credits; 5 unused credits should return to available
    const db = await getMongoDb();
    const reservation = await db.collection('credit_reservations').findOne({ user_id: TEST_USER, status: 'reserved' });
    assert.ok(reservation, 'Active reservation must exist');

    const settleRes = await CreditWalletService.settleReservation(reservation.attempt_id, 35);
    assert.equal(settleRes.settledAmount, 35);
    assert.equal(settleRes.reservation.status, 'settled');

    const summary = await CreditWalletService.getWalletSummary(TEST_USER);
    assert.equal(summary.available_credits, 65, '60 + 5 refund = 65 available');
    assert.equal(summary.reserved_credits, 0, 'Reserved credits returned to 0');
    assert.equal(summary.period_consumed, 35, '35 credits recorded as consumed');

    // Duplicate settlement must be idempotent
    const duplicateSettle = await CreditWalletService.settleReservation(reservation.attempt_id, 35);
    assert.equal(duplicateSettle.idempotent, true);

    const summaryAfter = await CreditWalletService.getWalletSummary(TEST_USER);
    assert.equal(summaryAfter.available_credits, 65);
    assert.equal(summaryAfter.period_consumed, 35);
  });

  // =========================================================================
  // 6. Reservation Release on Job Failure
  // =========================================================================
  it('6. Releases reserved credits back to available balance on failure', async () => {
    // Current state: 65 available, 0 reserved
    const failAttemptId = crypto.randomUUID();
    await CreditWalletService.reserveCredits({
      userId: TEST_USER,
      attemptId: failAttemptId,
      operationId: 'core_video_processing',
      amount: 25,
    });

    const midSummary = await CreditWalletService.getWalletSummary(TEST_USER);
    assert.equal(midSummary.available_credits, 40);
    assert.equal(midSummary.reserved_credits, 25);

    // Job fails -> release reservation
    const releaseRes = await CreditWalletService.releaseReservation(failAttemptId, 'FFmpeg transcoding interrupted');
    assert.equal(releaseRes.releasedAmount, 25);
    assert.equal(releaseRes.reservation.status, 'released');

    const postSummary = await CreditWalletService.getWalletSummary(TEST_USER);
    assert.equal(postSummary.available_credits, 65, '25 credits restored to available balance');
    assert.equal(postSummary.reserved_credits, 0);

    // Duplicate release must be idempotent
    const duplicateRelease = await CreditWalletService.releaseReservation(failAttemptId, 'Retry release');
    assert.equal(duplicateRelease.idempotent, true);
  });

  // =========================================================================
  // 7. Atomic Concurrent Reservations
  // =========================================================================
  it('7. Handles concurrent reservations safely without allowing negative balances', async () => {
    // Setup dedicated concurrent test user with exactly 30 credits
    await CreditRepository.grantCredits({
      userId: TEST_USER_CONCURRENT,
      amount: 30,
      type: 'monthly_grant',
      idempotencyKey: `concurrent_init_${TEST_USER_CONCURRENT}`,
      description: 'Initial balance for concurrency test',
    });

    // Fire 5 concurrent reservation requests of 10 credits each (total demand: 50, supply: 30)
    const attempts = [
      crypto.randomUUID(),
      crypto.randomUUID(),
      crypto.randomUUID(),
      crypto.randomUUID(),
      crypto.randomUUID(),
    ];

    const results = await Promise.all(
      attempts.map((attemptId) =>
        CreditWalletService.reserveCredits({
          userId: TEST_USER_CONCURRENT,
          attemptId,
          operationId: 'clip_processing',
          amount: 10,
        })
      )
    );

    const successful = results.filter((r) => r.allowed);
    const rejected = results.filter((r) => !r.allowed);

    assert.equal(successful.length, 3, 'Exactly 3 reservations of 10 credits must succeed');
    assert.equal(rejected.length, 2, 'Exactly 2 reservations must be rejected for insufficient balance');

    const wallet = await CreditRepository.getOrCreateWallet(TEST_USER_CONCURRENT);
    assert.equal(wallet.available_credits, 0, 'Available credits must be exactly 0, never negative');
    assert.equal(wallet.reserved_credits, 30, 'Reserved credits must be exactly 30');
  });

  // =========================================================================
  // 8. Stale & Expired Reservation Recovery
  // =========================================================================
  it('8. Automatically recovers and releases expired reservations', async () => {
    const db = await getMongoDb();
    const expiredAttemptId = crypto.randomUUID();

    // Create an expired reservation manually (simulating a dead worker from 2 hours ago)
    const wallet = await CreditRepository.getOrCreateWallet(TEST_USER);
    await db.collection('credit_wallets').updateOne(
      { id: wallet.id },
      { $inc: { available_credits: -15, reserved_credits: 15 } }
    );

    await db.collection('credit_reservations').insertOne({
      id: crypto.randomUUID(),
      wallet_id: wallet.id,
      user_id: TEST_USER,
      attempt_id: expiredAttemptId,
      operation_id: 'abandoned_job',
      amount: 15,
      status: 'reserved',
      expires_at: new Date(Date.now() - 3600 * 1000), // 1 hour ago
      created_at: new Date(Date.now() - 7200 * 1000),
      updated_at: new Date(Date.now() - 7200 * 1000),
    });

    const canonicalKey = buildCanonicalIdempotencyKey(TEST_USER, 'abandoned_job', expiredAttemptId);
    await db.collection('idempotency_keys').insertOne({
      _id: canonicalKey,
      user_id: TEST_USER,
      operation_type: 'abandoned_job',
      operation_id: 'abandoned_job',
      client_key: expiredAttemptId,
      attempt_id: expiredAttemptId,
      request_payload_sha256: 'test_hash_fixture',
      status: 'in_progress',
      created_at: new Date(Date.now() - 7200 * 1000),
      updated_at: new Date(Date.now() - 7200 * 1000),
    });

    const recoveredCount = await CreditRepository.recoverExpiredReservations();
    assert.ok(recoveredCount >= 1, 'Must recover at least the expired reservation');

    const cleanedRes = await db.collection('credit_reservations').findOne({ attempt_id: expiredAttemptId });
    assert.equal(cleanedRes?.status, 'released');
  });

  // =========================================================================
  // 9. Ledger Auditability & Balance Reconciliation
  // =========================================================================
  it('9. Reconciles ledger history and validates balance_before/balance_after invariants', async () => {
    const history = await CreditWalletService.getTransactionHistory(TEST_USER, 50);
    assert.ok(history.length >= 4, 'Must have at least 4 ledger transactions for user');

    for (const tx of history) {
      assert.ok(tx.id, 'Transaction must have id');
      assert.ok(tx.idempotency_key, 'Transaction must have idempotency_key');
      assert.equal(tx.user_id, TEST_USER);

      if (tx.type === 'monthly_grant') {
        assert.equal(tx.balance_after, tx.balance_before + tx.amount);
      } else if (tx.type === 'reservation') {
        assert.equal(tx.balance_after, tx.balance_before + tx.amount); // amount is negative
        assert.equal(tx.reserved_after, tx.reserved_before + Math.abs(tx.amount));
      } else if (tx.type === 'reservation_release') {
        assert.equal(tx.balance_after, tx.balance_before + tx.amount);
        assert.equal(tx.reserved_after, tx.reserved_before - tx.amount);
      }
    }
  });

  // =========================================================================
  // 10. Credit Pricing Calculations & Free Operations
  // =========================================================================
  it('10. Calculates correct duration-based costs and marks free operations at zero', () => {
    // 60-second video at 4 credits/min = 4 credits
    const cost60s = CreditPricingService.calculateCoreProcessingCost(60);
    assert.equal(cost60s.credits, 4);

    // 10-second video: 0.25 min * 4 = 1 credit (minimum charge applied)
    const cost10s = CreditPricingService.calculateCoreProcessingCost(10);
    assert.equal(cost10s.credits, 1);

    // 125-second video: 9 blocks of 15s = 2.25 min * 4 = 9 credits
    const cost125s = CreditPricingService.calculateCoreProcessingCost(125);
    assert.equal(cost125s.credits, 9);

    // Free operations must return 0 credits
    const reuseCost = CreditPricingService.calculateOperationCost('transcript_reuse');
    assert.equal(reuseCost.credits, 0);

    const srtCost = CreditPricingService.calculateOperationCost('subtitle_export_srt');
    assert.equal(srtCost.credits, 0);

    const vttCost = CreditPricingService.calculateOperationCost('subtitle_export_vtt');
    assert.equal(vttCost.credits, 0);

    // Estimation helper
    const estimate = CreditPricingService.estimateOperation('core_video_processing', { durationSeconds: 60 }, 10);
    assert.equal(estimate.estimated_credits, 4);
    assert.equal(estimate.has_sufficient_credits, true);

    const estimateLow = CreditPricingService.estimateOperation('core_video_processing', { durationSeconds: 60 }, 2);
    assert.equal(estimateLow.has_sufficient_credits, false);
  });
});

