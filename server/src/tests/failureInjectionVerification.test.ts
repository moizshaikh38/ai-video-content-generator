import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Collection } from 'mongodb';
import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import { CreditRepository } from '../db/repositories/creditRepository.js';
import { CreditWalletService } from '../services/creditWalletService.js';
import { EntitlementService, getProvisionalMonthlyCredits } from '../services/entitlementService.js';
import {
  CreditReservationRecord,
} from '../types/index.js';

describe('VireoClip Phase C Pre-D Focused Verification: Failure-Injection, Developer Continuity & Stale Recovery', () => {
  const testUserCompensate = crypto.randomUUID();
  const testDevUser = crypto.randomUUID();
  const testDevEmail = 'vertexdigitals07@gmail.com';
  const testRecoveryUser = crypto.randomUUID();

  const allTestUsers = [testUserCompensate, testDevUser, testRecoveryUser];

  // Intercept Collection.prototype.insertOne to simulate transient database / network crashes
  let shouldFailLedger = false;
  let ledgerFailureMessage = '';
  const originalInsertOne = Collection.prototype.insertOne;

  before(async () => {
    Collection.prototype.insertOne = async function (this: Collection, ...args: any[]) {
      if (this.collectionName === 'credit_transactions' && shouldFailLedger) {
        throw new Error(ledgerFailureMessage || 'SIMULATED_LEDGER_FAILURE');
      }
      return originalInsertOne.apply(this, args as any);
    };

    const db = await getMongoDb();
    await db.collection('credit_wallets').deleteMany({ user_id: { $in: allTestUsers } });
    await db.collection('credit_transactions').deleteMany({ user_id: { $in: allTestUsers } });
    await db.collection('credit_reservations').deleteMany({ user_id: { $in: allTestUsers } });
    await db.collection('projects').deleteMany({ user_id: { $in: allTestUsers } });
    await db.collection('render_jobs').deleteMany({ user_id: { $in: allTestUsers } });
  });

  after(async () => {
    Collection.prototype.insertOne = originalInsertOne;
    try {
      const db = await getMongoDb();
      await db.collection('credit_wallets').deleteMany({ user_id: { $in: allTestUsers } });
      await db.collection('credit_transactions').deleteMany({ user_id: { $in: allTestUsers } });
      await db.collection('credit_reservations').deleteMany({ user_id: { $in: allTestUsers } });
      await db.collection('projects').deleteMany({ user_id: { $in: allTestUsers } });
      await db.collection('render_jobs').deleteMany({ user_id: { $in: allTestUsers } });
    } catch {}
    await closeMongo(true);
  });

  // ── Verification Item 1: Failure-Injection & Compensating Rollback ──────

  test('1.1 grantCredits: rollback on failure restores wallet; retry succeeds cleanly', async () => {
    const db = await getMongoDb();
    const txCol = db.collection('credit_transactions');

    // 1. Initial wallet setup: grant 100 credits cleanly
    await CreditRepository.grantCredits({
      userId: testUserCompensate,
      amount: 100,
      type: 'monthly_grant',
      idempotencyKey: 'initial_grant_setup',
      description: 'Initial balance',
    });

    const walletBefore = await CreditRepository.getOrCreateWallet(testUserCompensate);
    assert.equal(walletBefore.available_credits, 100);

    // 2. Inject failure on credit_transactions.insertOne
    shouldFailLedger = true;
    ledgerFailureMessage = 'SIMULATED_LEDGER_FAILURE_GRANT';

    try {
      await assert.rejects(
        async () => {
          await CreditRepository.grantCredits({
            userId: testUserCompensate,
            amount: 50,
            type: 'monthly_grant',
            idempotencyKey: 'fail_injection_grant',
            description: 'Failed grant attempt',
          });
        },
        /SIMULATED_LEDGER_FAILURE_GRANT/
      );

      // Verify wallet was cleanly compensated back to 100 credits
      const walletAfterFailure = await CreditRepository.getOrCreateWallet(testUserCompensate);
      assert.equal(
        walletAfterFailure.available_credits,
        100,
        'Wallet available_credits must be compensated back to 100 on transaction failure'
      );

      // Verify transaction ledger has no record for fail_injection_grant
      const failedTx = await txCol.findOne({ idempotency_key: 'fail_injection_grant' });
      assert.equal(failedTx, null);
    } finally {
      shouldFailLedger = false;
    }

    // 3. Retry grant with failure removed -> must succeed cleanly
    const retryResult = await CreditRepository.grantCredits({
      userId: testUserCompensate,
      amount: 50,
      type: 'monthly_grant',
      idempotencyKey: 'retry_grant_success',
      description: 'Retried grant after recovery',
    });

    assert.equal(retryResult.alreadyProcessed, false);
    assert.equal(retryResult.wallet.available_credits, 150);

    const txRecord = await txCol.findOne({ idempotency_key: 'retry_grant_success' });
    assert.ok(txRecord);
    assert.equal(txRecord.balance_before, 100);
    assert.equal(txRecord.balance_after, 150);
  });

  test('1.2 reserveCredits: rollback on failure restores wallet & deletes orphaned reservation; retry succeeds', async () => {
    const db = await getMongoDb();
    const txCol = db.collection('credit_transactions');
    const resCol = db.collection<CreditReservationRecord>('credit_reservations');

    const walletBefore = await CreditRepository.getOrCreateWallet(testUserCompensate);
    assert.equal(walletBefore.available_credits, 150);
    assert.equal(walletBefore.reserved_credits, 0);

    // Inject failure on transaction insert
    shouldFailLedger = true;
    ledgerFailureMessage = 'SIMULATED_LEDGER_FAILURE_RESERVE';
    const failedAttemptId = `attempt_fail_reserve_${Date.now()}`;

    try {
      await assert.rejects(
        async () => {
          await CreditRepository.reserveCredits({
            userId: testUserCompensate,
            attemptId: failedAttemptId,
            operationId: 'ai_clipping',
            amount: 40,
          });
        },
        /SIMULATED_LEDGER_FAILURE_RESERVE/
      );

      // Verify wallet was compensated: available remains 150, reserved remains 0
      const walletAfterFailure = await CreditRepository.getOrCreateWallet(testUserCompensate);
      assert.equal(walletAfterFailure.available_credits, 150);
      assert.equal(walletAfterFailure.reserved_credits, 0);

      // Verify reservation was deleted so attemptId can be cleanly retried
      const orphanedRes = await resCol.findOne({ attempt_id: failedAttemptId });
      assert.equal(orphanedRes, null, 'Orphaned reservation record must be deleted on rollback');
    } finally {
      shouldFailLedger = false;
    }

    // Retry reservation -> must succeed cleanly
    const retryResult = await CreditRepository.reserveCredits({
      userId: testUserCompensate,
      attemptId: failedAttemptId,
      operationId: 'ai_clipping',
      amount: 40,
    });

    assert.equal(retryResult.allowed, true);
    assert.equal(retryResult.wallet.available_credits, 110);
    assert.equal(retryResult.wallet.reserved_credits, 40);

    const validRes = await resCol.findOne({ attempt_id: failedAttemptId });
    assert.ok(validRes);
    assert.equal(validRes.status, 'reserved');
  });

  test('1.3 settleReservation: rollback on failure restores reservation status & wallet balance; retry succeeds', async () => {
    const db = await getMongoDb();
    const resCol = db.collection<CreditReservationRecord>('credit_reservations');

    const activeAttemptId = `attempt_settle_test_${Date.now()}`;
    // Create an active reservation for 40 credits
    const reserveRes = await CreditRepository.reserveCredits({
      userId: testUserCompensate,
      attemptId: activeAttemptId,
      operationId: 'subtitle_burn',
      amount: 40,
    });
    assert.equal(reserveRes.allowed, true);

    const walletBeforeSettle = await CreditRepository.getOrCreateWallet(testUserCompensate);
    const availableBeforeSettle = walletBeforeSettle.available_credits;
    const reservedBeforeSettle = walletBeforeSettle.reserved_credits;

    // Inject failure on transaction insert during settlement
    shouldFailLedger = true;
    ledgerFailureMessage = 'SIMULATED_LEDGER_FAILURE_SETTLE';

    try {
      await assert.rejects(
        async () => {
          await CreditRepository.settleReservation(activeAttemptId, 32); // Actual 32, refund 8
        },
        /SIMULATED_LEDGER_FAILURE_SETTLE/
      );

      // Verify reservation was restored to 'reserved' and settled_amount unset
      const resAfterFailure = await resCol.findOne({ attempt_id: activeAttemptId });
      assert.ok(resAfterFailure);
      assert.equal(resAfterFailure.status, 'reserved');
      assert.equal(resAfterFailure.settled_amount, undefined);

      // Verify wallet was compensated back to exact pre-settle state
      const walletAfterFailure = await CreditRepository.getOrCreateWallet(testUserCompensate);
      assert.equal(walletAfterFailure.available_credits, availableBeforeSettle);
      assert.equal(walletAfterFailure.reserved_credits, reservedBeforeSettle);
    } finally {
      shouldFailLedger = false;
    }

    // Retry settlement -> must succeed cleanly with unused credits refunded
    const settleResult = await CreditRepository.settleReservation(activeAttemptId, 32);
    assert.equal(settleResult.settledAmount, 32);
    assert.equal(settleResult.reservation.status, 'settled');

    const finalRes = await resCol.findOne({ attempt_id: activeAttemptId });
    assert.equal(finalRes?.status, 'settled');
    assert.equal(finalRes?.settled_amount, 32);

    const walletFinal = await CreditRepository.getOrCreateWallet(testUserCompensate);
    assert.equal(walletFinal.available_credits, availableBeforeSettle + 8); // 8 refunded
    assert.equal(walletFinal.reserved_credits, reservedBeforeSettle - 40);
  });

  test('1.4 releaseReservation: rollback on failure restores reservation to reserved; retry succeeds', async () => {
    const db = await getMongoDb();
    const resCol = db.collection<CreditReservationRecord>('credit_reservations');

    const releaseAttemptId = `attempt_release_test_${Date.now()}`;
    await CreditRepository.reserveCredits({
      userId: testUserCompensate,
      attemptId: releaseAttemptId,
      operationId: 'subtitle_burn',
      amount: 20,
    });

    const walletBefore = await CreditRepository.getOrCreateWallet(testUserCompensate);
    const availableBefore = walletBefore.available_credits;
    const reservedBefore = walletBefore.reserved_credits;

    // Inject failure on transaction insert
    shouldFailLedger = true;
    ledgerFailureMessage = 'SIMULATED_LEDGER_FAILURE_RELEASE';

    try {
      await assert.rejects(
        async () => {
          await CreditRepository.releaseReservation(releaseAttemptId, 'Worker crash test');
        },
        /SIMULATED_LEDGER_FAILURE_RELEASE/
      );

      // Verify reservation status was restored to 'reserved'
      const resAfterFailure = await resCol.findOne({ attempt_id: releaseAttemptId });
      assert.ok(resAfterFailure);
      assert.equal(resAfterFailure.status, 'reserved');

      // Verify wallet balances were compensated back
      const walletAfterFailure = await CreditRepository.getOrCreateWallet(testUserCompensate);
      assert.equal(walletAfterFailure.available_credits, availableBefore);
      assert.equal(walletAfterFailure.reserved_credits, reservedBefore);
    } finally {
      shouldFailLedger = false;
    }

    // Retry release -> must succeed cleanly
    const releaseResult = await CreditRepository.releaseReservation(releaseAttemptId, 'Worker crash retry');
    assert.equal(releaseResult.releasedAmount, 20);
    assert.equal(releaseResult.reservation.status, 'released');

    const walletAfter = await CreditRepository.getOrCreateWallet(testUserCompensate);
    assert.equal(walletAfter.available_credits, availableBefore + 20);
    assert.equal(walletAfter.reserved_credits, reservedBefore - 20);
  });

  // ── Verification Item 2: Developer Unlimited Continuity & Auto-Refill ──

  test('2. Developer unlimited accounts can never run out of credits even after massive consumption', async () => {
    const db = await getMongoDb();

    // 1. Initial summary call grants 999,999 credits
    const summary = await CreditWalletService.getWalletSummary(testDevUser, testDevEmail);
    assert.equal(summary.is_unlimited, true);
    assert.equal(summary.available_credits, 999999);

    // 2. Simulate heavy consumption: reserve & settle 950,000 credits
    const massiveAttempt = `dev_massive_${Date.now()}`;
    const reserve1 = await CreditWalletService.reserveCredits({
      userId: testDevUser,
      attemptId: massiveAttempt,
      operationId: 'massive_batch_clipping',
      amount: 950_000,
      userEmail: testDevEmail,
    });
    assert.equal(reserve1.allowed, true);

    await CreditWalletService.settleReservation(massiveAttempt, 950_000);

    const walletAfterMassive = await CreditRepository.getOrCreateWallet(testDevUser);
    assert.equal(walletAfterMassive.available_credits, 49999); // < 100,000 threshold

    // 3. Request a new operation that exceeds the remaining balance (e.g. 80,000 credits)
    // In a naive system this would fail with INSUFFICIENT_CREDITS.
    // In our system, ensureDeveloperCredits automatically issues an authoritative auto-refill!
    const nextAttempt = `dev_next_job_${Date.now()}`;
    const reserve2 = await CreditWalletService.reserveCredits({
      userId: testDevUser,
      attemptId: nextAttempt,
      operationId: 'next_large_job',
      amount: 80_000,
      userEmail: testDevEmail,
    });

    assert.equal(reserve2.allowed, true, 'Developer accounts must never be rejected with INSUFFICIENT_CREDITS');

    // Verify auto-refill transaction exists in ledger with valid balance_before and balance_after
    const refillTx = await db.collection('credit_transactions').findOne({
      user_id: testDevUser,
      type: 'manual_adjustment',
      'metadata.auto_refill': true,
    });
    assert.ok(refillTx, 'An authoritative auto-refill ledger transaction must be logged');
    assert.equal(refillTx.amount, 999999);
    assert.equal(refillTx.balance_after, refillTx.balance_before + refillTx.amount);

    // Settle next job
    await CreditWalletService.settleReservation(nextAttempt, 80_000);

    // Verify ledger auditability
    const allDevTxs = await CreditRepository.getTransactionHistory(testDevUser, 20);
    assert.ok(allDevTxs.length >= 4); // monthly_grant, reserve1, settle1, auto_refill, reserve2, settle2
    for (const tx of allDevTxs) {
      if (tx.type === 'monthly_grant' || tx.type === 'manual_adjustment') {
        assert.equal(tx.balance_after, tx.balance_before + tx.amount);
      }
    }
  });

  // ── Verification Item 3: Expired Reservation Recovery — Active vs Abandoned ──

  test('3. Expired reservation recovery protects active jobs with recent heartbeat, but reclaims abandoned jobs', async () => {
    const db = await getMongoDb();
    const now = new Date();

    const activeProjectId = crypto.randomUUID();
    const abandonedProjectId = crypto.randomUUID();
    const activeAttempt = `active_job_${Date.now()}`;
    const abandonedAttempt = `abandoned_job_${Date.now()}`;

    // 1. Create an active project with recent heartbeat (< 10 min ago)
    await db.collection('projects').insertOne({
      id: activeProjectId,
      user_id: testRecoveryUser,
      video_status: 'processing',
      updated_at: new Date(now.getTime() - 5 * 60 * 1000), // 5 min ago
      created_at: new Date(now.getTime() - 30 * 60 * 1000),
    });

    // Create an abandoned project with stale update (> 90 min ago)
    await db.collection('projects').insertOne({
      id: abandonedProjectId,
      user_id: testRecoveryUser,
      video_status: 'processing',
      updated_at: new Date(now.getTime() - 95 * 60 * 1000), // 95 min ago (> 60m cutoff)
      created_at: new Date(now.getTime() - 120 * 60 * 1000),
    });

    // Create wallet for recovery user with initial 100 credits
    await CreditRepository.grantCredits({
      userId: testRecoveryUser,
      amount: 100,
      type: 'monthly_grant',
      idempotencyKey: 'recovery_setup',
      description: 'Setup recovery',
    });

    // Create expired reservation for active project
    await db.collection<CreditReservationRecord>('credit_reservations').insertOne({
      id: crypto.randomUUID(),
      wallet_id: crypto.randomUUID(),
      user_id: testRecoveryUser,
      attempt_id: activeAttempt,
      operation_id: 'ai_clipping',
      amount: 30,
      status: 'reserved',
      expires_at: new Date(now.getTime() - 10 * 60 * 1000), // Expired 10 min ago
      metadata: { projectId: activeProjectId },
      created_at: new Date(now.getTime() - 70 * 60 * 1000),
      updated_at: now,
    });

    // Create expired reservation for abandoned project
    await db.collection<CreditReservationRecord>('credit_reservations').insertOne({
      id: crypto.randomUUID(),
      wallet_id: crypto.randomUUID(),
      user_id: testRecoveryUser,
      attempt_id: abandonedAttempt,
      operation_id: 'ai_clipping',
      amount: 40,
      status: 'reserved',
      expires_at: new Date(now.getTime() - 15 * 60 * 1000), // Expired 15 min ago
      metadata: { projectId: abandonedProjectId },
      created_at: new Date(now.getTime() - 100 * 60 * 1000),
      updated_at: now,
    });

    // Update wallet reserved_credits to reflect both reservations (30 + 40 = 70)
    await db.collection('credit_wallets').updateOne(
      { user_id: testRecoveryUser },
      { $set: { available_credits: 30, reserved_credits: 70 } }
    );

    // Run recovery
    const recoveredCount = await CreditRepository.recoverExpiredReservations();

    // Exactly 1 reservation should be recovered (the abandoned one)
    assert.equal(recoveredCount, 1, 'Only the abandoned job reservation should be recovered');

    // Active reservation must STILL be 'reserved' with an extended expires_at
    const activeResAfter = await db.collection<CreditReservationRecord>('credit_reservations').findOne({
      attempt_id: activeAttempt,
    });
    assert.ok(activeResAfter);
    assert.equal(activeResAfter.status, 'reserved');
    assert.ok(
      activeResAfter.expires_at.getTime() > now.getTime() + 20 * 60 * 1000,
      'Active reservation expires_at must be extended'
    );

    // Abandoned reservation must be 'released'
    const abandonedResAfter = await db.collection<CreditReservationRecord>('credit_reservations').findOne({
      attempt_id: abandonedAttempt,
    });
    assert.ok(abandonedResAfter);
    assert.equal(abandonedResAfter.status, 'released');

    // Wallet balance should reflect the 40 credits released back from abandoned reservation
    const recoveryWallet = await CreditRepository.getOrCreateWallet(testRecoveryUser);
    assert.equal(recoveryWallet.available_credits, 30 + 40); // 70
    assert.equal(recoveryWallet.reserved_credits, 70 - 40); // 30
  });

  // ── Verification Item 4: Provisional Credit Allowances Configurable ──────

  test('4. Monthly credit allowances remain provisional and dynamically configurable via env', async () => {
    // 1. Default provisional allowances
    assert.equal(getProvisionalMonthlyCredits('free'), 60);
    assert.equal(getProvisionalMonthlyCredits('creator'), 500);
    assert.equal(getProvisionalMonthlyCredits('pro'), 1500);
    assert.equal(getProvisionalMonthlyCredits('studio'), 4000);
    assert.equal(getProvisionalMonthlyCredits('developer'), 999999);

    // 2. Override via environment variables
    process.env.PROVISIONAL_MONTHLY_CREDITS_CREATOR = '650';
    process.env.PROVISIONAL_MONTHLY_CREDITS_FREE = '80';
    process.env.PROVISIONAL_MONTHLY_CREDITS_PRO = '1800';

    try {
      assert.equal(getProvisionalMonthlyCredits('creator'), 650);
      assert.equal(getProvisionalMonthlyCredits('free'), 80);
      assert.equal(getProvisionalMonthlyCredits('pro'), 1800);

      // Verify EntitlementService.getPlanEntitlements dynamically uses the overridden values
      const creatorPlan = EntitlementService.getPlanEntitlements('creator');
      assert.equal(creatorPlan.monthlyCredits, 650);

      const freePlan = EntitlementService.getPlanEntitlements('free');
      assert.equal(freePlan.monthlyCredits, 80);

      const proPlan = EntitlementService.getPlanEntitlements('pro');
      assert.equal(proPlan.monthlyCredits, 1800);
    } finally {
      // Clean up environment variables
      delete process.env.PROVISIONAL_MONTHLY_CREDITS_CREATOR;
      delete process.env.PROVISIONAL_MONTHLY_CREDITS_FREE;
      delete process.env.PROVISIONAL_MONTHLY_CREDITS_PRO;
    }

    // Restores to default provisional baseline
    assert.equal(getProvisionalMonthlyCredits('creator'), 500);
    assert.equal(getProvisionalMonthlyCredits('free'), 60);
  });
});
