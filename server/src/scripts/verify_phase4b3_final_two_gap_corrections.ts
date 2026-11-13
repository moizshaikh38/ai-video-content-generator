import crypto from 'node:crypto';

// ============================================================================
// VIREOCLIP PHASE 4B.3: FINAL TWO-GAP CORRECTION VERIFICATION SCRIPT
// ============================================================================

interface IdempotencyKeyDoc {
  _id: string; // idempotency_key
  user_id: string;
  payload_sha256: string;
  operation_id: string; // attempt_id
  status: 'in_flight' | 'committed' | 'aborted_unreserved';
  server_created_at: Date;
  lease_expires_at: Date;
  fencing_token: number;
}

interface WalletDoc {
  _id: string;
  user_id: string;
  available_credits: number;
  reserved_credits: number;
  active_reservations: string[];
}

interface ReservationDoc {
  _id: string; // attempt_id
  wallet_id: string;
  user_id: string;
  amount: number;
  status: 'created' | 'refunding' | 'active' | 'settled' | 'expired' | 'voided';
  fencing_token: number;
  created_at: Date;
}

interface LedgerDoc {
  _id: string;
  type: 'reservation' | 'settle' | 'refund';
  attempt_id: string;
  amount: number;
}

class TwoGapCorrectionSimulator {
  public idempotencyKeys: Map<string, IdempotencyKeyDoc> = new Map();
  public wallet: WalletDoc;
  public reservations: Map<string, ReservationDoc> = new Map();
  public ledger: Map<string, LedgerDoc> = new Map();

  constructor() {
    this.wallet = {
      _id: 'w_test',
      user_id: 'u_test',
      available_credits: 100,
      reserved_credits: 0,
      active_reservations: [],
    };
  }

  public reset() {
    this.idempotencyKeys.clear();
    this.wallet = {
      _id: 'w_test',
      user_id: 'u_test',
      available_credits: 100,
      reserved_credits: 0,
      active_reservations: [],
    };
    this.reservations.clear();
    this.ledger.clear();
  }

  // --------------------------------------------------------------------------
  // GAP 1 & 3: PERMANENT IDEMPOTENCY KEY LIFECYCLE & INCOMPLETE IN-FLIGHT RECOVERY
  // --------------------------------------------------------------------------
  public registerKey(key: string, payload: string, attemptId: string): { status: string; code: number } {
    const hash = crypto.createHash('sha256').update(payload).digest('hex');
    const existing = this.idempotencyKeys.get(key);

    if (existing) {
      if (existing.payload_sha256 !== hash) {
        return { status: 'IDEMPOTENCY_PARAMETER_MISMATCH', code: 422 };
      }
      if (existing.status === 'aborted_unreserved') {
        return { status: 'IDEMPOTENCY_KEY_ABORTED', code: 409 };
      }
      if (existing.status === 'committed') {
        return { status: 'ALREADY_COMMITTED', code: 200 };
      }
      // Status is in_flight
      const isLeaseExpired = existing.lease_expires_at.getTime() <= Date.now();
      if (!isLeaseExpired) {
        return { status: 'CONCURRENT_REQUEST_IN_FLIGHT', code: 409 };
      }
      // Lease expired: Client retry recovers in-flight registration!
      existing.fencing_token += 1;
      existing.lease_expires_at = new Date(Date.now() + 60000);
      return { status: 'RESUMED_IN_FLIGHT', code: 200 };
    }

    // Insert permanent key (NO TTL)
    this.idempotencyKeys.set(key, {
      _id: key,
      user_id: this.wallet.user_id,
      payload_sha256: hash,
      operation_id: attemptId,
      status: 'in_flight',
      server_created_at: new Date(),
      lease_expires_at: new Date(Date.now() + 60000),
      fencing_token: 1,
    });
    return { status: 'PROCEED', code: 201 };
  }

  // Sweeper cleans abandoned in_flight key whose reservation doc was never created
  public sweepAbandonedInFlight(key: string): boolean {
    const keyDoc = this.idempotencyKeys.get(key);
    if (!keyDoc || keyDoc.status !== 'in_flight') return false;
    if (keyDoc.lease_expires_at.getTime() > Date.now()) return false;

    // Check if reservation doc was created
    const hasResDoc = this.reservations.has(keyDoc.operation_id);
    if (!hasResDoc) {
      // Transition to aborted_unreserved (KEY IS NEVER DELETED!)
      keyDoc.status = 'aborted_unreserved';
      return true;
    }
    return false;
  }

  // --------------------------------------------------------------------------
  // GAP 2: UNAMBIGUOUS W2 / W3 STANDALONE RECOVERY WITH DURABLE TRANSITIONS
  // --------------------------------------------------------------------------
  public createReservation(attemptId: string, amount: number) {
    this.reservations.set(attemptId, {
      _id: attemptId,
      wallet_id: this.wallet._id,
      user_id: this.wallet.user_id,
      amount,
      status: 'created',
      fencing_token: 1,
      created_at: new Date(),
    });
  }

  public reserveWallet(attemptId: string, amount: number): boolean {
    if (this.wallet.available_credits < amount) return false;
    this.wallet.available_credits -= amount;
    this.wallet.reserved_credits += amount;
    this.wallet.active_reservations.push(attemptId);
    return true;
  }

  // REVISED RECONCILER FOR W2/W3
  public reconcileStandalone(attemptId: string): { action: string; walletMutated: boolean; status: string } {
    const res = this.reservations.get(attemptId);
    if (!res) return { action: 'NO_RES_DOC', walletMutated: false, status: 'none' };

    const tokenPresent = this.wallet.active_reservations.includes(attemptId);
    const hasResLedger = this.ledger.has(`tx_res_${attemptId}`);
    const hasRefundLedger = this.ledger.has(`tx_ref_${attemptId}`);

    // Case W2: Reservation status is 'created' and token is ABSENT
    // Rule: Recovery worker NEVER refunds while reservation status is 'created'.
    // Therefore, if status is 'created' and token is ABSENT, Step 3 never executed!
    if (res.status === 'created' && !tokenPresent) {
      res.status = 'voided';
      return { action: 'VOID_UNRESERVED_DOC', walletMutated: false, status: res.status };
    }

    // Case W3 (Initial): Status is 'created' and token IS PRESENT!
    // Step 3 executed, but activation/ledger crashed.
    if (res.status === 'created' && tokenPresent) {
      // Step A: MUST transition status to 'refunding' FIRST before touching wallet!
      res.status = 'refunding';
      res.fencing_token += 1;

      // Step B: Single-document atomic wallet refund ($inc + $pull)
      this.wallet.available_credits += res.amount;
      this.wallet.reserved_credits -= res.amount;
      this.wallet.active_reservations = this.wallet.active_reservations.filter((id) => id !== attemptId);

      // Step C: Ledger insert
      this.ledger.set(`tx_ref_${attemptId}`, {
        _id: `tx_ref_${attemptId}`,
        type: 'refund',
        attempt_id: attemptId,
        amount: res.amount,
      });

      // Step D: Close reservation
      res.status = 'expired';
      res.fencing_token += 1;
      return { action: 'REFUND_AND_EXPIRE', walletMutated: true, status: res.status };
    }

    // Case W3 (Crash during recovery): Status is 'refunding' and token is ABSENT!
    // Reconciler resumes after partial recovery crash
    if (res.status === 'refunding' && !tokenPresent) {
      // Token was already pulled on disk! Do NOT mutate wallet again!
      if (!hasRefundLedger) {
        this.ledger.set(`tx_ref_${attemptId}`, {
          _id: `tx_ref_${attemptId}`,
          type: 'refund',
          attempt_id: attemptId,
          amount: res.amount,
        });
      }
      res.status = 'expired';
      res.fencing_token += 1;
      return { action: 'RECOVER_MISSING_LEDGER_AND_EXPIRE', walletMutated: false, status: res.status };
    }

    return { action: 'ALREADY_TERMINAL', walletMutated: false, status: res.status };
  }

  // --------------------------------------------------------------------------
  // GAP 4: FENCING ENFORCEMENT AGAINST EXPIRED WORKERS
  // --------------------------------------------------------------------------
  public executeWorkerMutation(
    attemptId: string,
    workerFencingToken: number
  ): { resUpdated: boolean; walletUpdated: boolean } {
    const res = this.reservations.get(attemptId);
    if (!res || res.fencing_token !== workerFencingToken) {
      // Fencing mismatch! Stale worker rejected on reservation doc!
      return { resUpdated: false, walletUpdated: false };
    }

    // Check wallet condition
    const tokenPresent = this.wallet.active_reservations.includes(attemptId);
    if (!tokenPresent) {
      // Token already pulled by newer worker! Stale worker rejected on wallet!
      return { resUpdated: true, walletUpdated: false };
    }

    // Update
    res.fencing_token += 1;
    this.wallet.available_credits += res.amount;
    this.wallet.reserved_credits -= res.amount;
    this.wallet.active_reservations = this.wallet.active_reservations.filter((id) => id !== attemptId);
    return { resUpdated: true, walletUpdated: true };
  }
}

async function runGapVerification() {
  console.log('========================================================================');
  console.log('VIREOCLIP PHASE 4B.3: FINAL TWO-GAP CORRECTION VERIFICATION');
  console.log('========================================================================\n');

  const sim = new TwoGapCorrectionSimulator();

  // --------------------------------------------------------------------------
  // TEST 1: GAP 1 & GAP 3 — Permanent Idempotency & In-Flight Key Recovery
  // --------------------------------------------------------------------------
  console.log('--- TEST 1: Incomplete in_flight Key Recovery & Terminal Abort ---');
  sim.reset();
  const reg1 = sim.registerKey('idem_gap_1', 'payload_v1', 'att_gap_1');
  console.log(`1. First registration: status=${reg1.status}, code=${reg1.code}`);
  if (reg1.code !== 201) throw new Error('Reg 1 failed');

  // Crash immediately before reservation doc created!
  // Client retries immediately while lease is active
  const regRetryActive = sim.registerKey('idem_gap_1', 'payload_v1', 'att_gap_1');
  console.log(`2. Client retry while lease active: status=${regRetryActive.status}, code=${regRetryActive.code} (Expected 409)`);
  if (regRetryActive.code !== 409) throw new Error('Concurrent protection failed');

  // Fast forward lease expiration (simulate worker death)
  const keyDoc = sim.idempotencyKeys.get('idem_gap_1')!;
  keyDoc.lease_expires_at = new Date(Date.now() - 1000);

  // Client retries after lease expired
  const regRetryExpired = sim.registerKey('idem_gap_1', 'payload_v1', 'att_gap_1');
  console.log(`3. Client retry after lease expired: status=${regRetryExpired.status}, code=${regRetryExpired.code} (Expected 200 Resumed)`);
  if (regRetryExpired.code !== 200 || regRetryExpired.status !== 'RESUMED_IN_FLIGHT') throw new Error('Resume failed');

  // Simulate abandoned key where client never retried
  sim.reset();
  sim.registerKey('idem_abandoned', 'payload_v1', 'att_abandoned');
  sim.idempotencyKeys.get('idem_abandoned')!.lease_expires_at = new Date(Date.now() - 1000);
  const swept = sim.sweepAbandonedInFlight('idem_abandoned');
  console.log(`4. Sweeper cleans abandoned key without res doc: swept=${swept}`);
  console.log(`5. Permanent status of abandoned key: status=${sim.idempotencyKeys.get('idem_abandoned')?.status}`);
  if (!swept || sim.idempotencyKeys.get('idem_abandoned')?.status !== 'aborted_unreserved') throw new Error('Sweeper failed');

  // Late retry of aborted key
  const lateRetry = sim.registerKey('idem_abandoned', 'payload_v1', 'att_abandoned');
  console.log(`6. Late retry of aborted key: status=${lateRetry.status}, code=${lateRetry.code} (Expected 409 Aborted)`);
  if (lateRetry.code !== 409 || lateRetry.status !== 'IDEMPOTENCY_KEY_ABORTED') throw new Error('Aborted rejection failed');
  console.log('✔ Passed: Permanent key retains aborted status forever; zero reuse allowed.\n');

  // --------------------------------------------------------------------------
  // TEST 2: GAP 2 — Disambiguating W2 vs W3 Across Partial Recovery Crashes
  // --------------------------------------------------------------------------
  console.log('--- TEST 2: Unambiguous Disambiguation of W2 vs W3 ---');
  // Scenario W2: Reservation created, wallet never reserved
  sim.reset();
  sim.createReservation('att_w2', 3);
  // Crash before wallet reserve!
  console.log(`W2 Initial state: status=${sim.reservations.get('att_w2')?.status}, tokenPresent=${sim.wallet.active_reservations.includes('att_w2')}`);
  const recW2 = sim.reconcileStandalone('att_w2');
  console.log(`W2 Reconcile: action=${recW2.action}, walletMutated=${recW2.walletMutated}, finalStatus=${recW2.status}`);
  if (recW2.action !== 'VOID_UNRESERVED_DOC' || recW2.walletMutated || recW2.status !== 'voided') {
    throw new Error('W2 failed: free credits or incorrect status');
  }

  // Scenario W3: Wallet reserved, crash before activation, partial recovery crash after pulling token
  sim.reset();
  sim.createReservation('att_w3', 3);
  sim.reserveWallet('att_w3', 3); // available=97, reserved=3, token present!
  console.log(`\nW3 Initial state: available=${sim.wallet.available_credits}, reserved=${sim.wallet.reserved_credits}, tokenPresent=${sim.wallet.active_reservations.includes('att_w3')}`);

  // Simulate Recovery Worker 1 starts recovering W3:
  // Step A: Advances status to 'refunding'
  sim.reservations.get('att_w3')!.status = 'refunding';
  // Step B: Pulls token and refunds wallet
  sim.wallet.available_credits += 3;
  sim.wallet.reserved_credits -= 3;
  sim.wallet.active_reservations = [];
  // ⚡ HARD CRASH HERE! Before Step C (ledger insert) and Step D (status expired)!
  console.log(`⚡ Injected Crash during W3 recovery: status=${sim.reservations.get('att_w3')?.status}, tokenPresent=${sim.wallet.active_reservations.includes('att_w3')}, ledgerExists=${sim.ledger.has('tx_ref_att_w3')}`);

  // Recovery Worker 2 resumes:
  const recW3 = sim.reconcileStandalone('att_w3');
  console.log(`W3 Resumed Reconcile: action=${recW3.action}, walletMutated=${recW3.walletMutated}, finalStatus=${recW3.status}`);
  console.log(`W3 Final State: available=${sim.wallet.available_credits}, reserved=${sim.wallet.reserved_credits}, ledgerExists=${sim.ledger.has('tx_ref_att_w3')}`);
  if (
    recW3.action !== 'RECOVER_MISSING_LEDGER_AND_EXPIRE' ||
    recW3.walletMutated ||
    sim.wallet.available_credits !== 100 ||
    !sim.ledger.has('tx_ref_att_w3')
  ) {
    throw new Error('W3 recovery failed: duplicate refund or lost ledger');
  }
  console.log('✔ Passed: W2 and W3 are 100% distinguishable; zero double refunds; missing ledger recovered.\n');

  // --------------------------------------------------------------------------
  // TEST 3: GAP 4 — Fencing Enforcement Against Expired Stale Workers
  // --------------------------------------------------------------------------
  console.log('--- TEST 3: Fencing Enforcement Against Stale Expired Workers ---');
  sim.reset();
  sim.createReservation('att_fencing', 3);
  sim.reserveWallet('att_fencing', 3);
  sim.reservations.get('att_fencing')!.fencing_token = 2; // Worker 1 holds token 2

  // Worker 1 undergoes GC pause. Lease expires.
  // Worker 2 takes over and acquires token 3, completing recovery!
  sim.reservations.get('att_fencing')!.fencing_token = 3;
  sim.wallet.available_credits += 3;
  sim.wallet.reserved_credits -= 3;
  sim.wallet.active_reservations = []; // Token pulled!
  console.log(`State after Worker 2 finishes: fencing_token=${sim.reservations.get('att_fencing')?.fencing_token}, active_tokens=${sim.wallet.active_reservations.length}`);

  // Stale Worker 1 wakes up and tries to mutate with stale token 2!
  const staleAttempt = sim.executeWorkerMutation('att_fencing', 2);
  console.log(`Stale Worker 1 update outcome: resUpdated=${staleAttempt.resUpdated}, walletUpdated=${staleAttempt.walletUpdated}`);
  console.log(`Wallet balance after stale attempt: available=${sim.wallet.available_credits}, reserved=${sim.wallet.reserved_credits}`);
  if (staleAttempt.walletUpdated || sim.wallet.available_credits !== 100) {
    throw new Error('Fencing failed: stale worker corrupted wallet!');
  }
  console.log('✔ Passed: Stale worker strictly blocked by fencing token and token absence.\n');

  console.log('========================================================================');
  console.log('ALL FOUR GAP VERIFICATION TESTS PASSED (100%)');
  console.log('========================================================================');
}

runGapVerification().catch((err) => {
  console.error('GAP VERIFICATION FAILED:', err);
  process.exit(1);
});

