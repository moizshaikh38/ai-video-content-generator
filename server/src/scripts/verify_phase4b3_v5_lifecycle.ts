import crypto from 'node:crypto';

// ============================================================================
// VIREOCLIP PHASE 4B.3: V5 LIFECYCLE & CRASH DISAMBIGUATION TEST SUITE
// ============================================================================

interface Wallet {
  _id: string;
  user_id: string;
  available_credits: number;
  reserved_credits: number;
  active_reservations: string[];
}

interface Reservation {
  _id: string; // attempt_id
  wallet_id: string;
  user_id: string;
  amount: number;
  status: 'created' | 'active' | 'settling' | 'settled' | 'refunding' | 'expired' | 'voided';
  fencing_token: number;
  expires_at: Date;
}

interface Ledger {
  _id: string;
  type: 'reservation' | 'settle' | 'refund';
  attempt_id: string;
  amount: number;
}

class V5LifecycleSimulator {
  public wallet: Wallet;
  public idempotencyKeys: Set<string> = new Set();
  public reservations: Map<string, Reservation> = new Map();
  public ledger: Map<string, Ledger> = new Map();

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
    this.wallet = {
      _id: 'w_test',
      user_id: 'u_test',
      available_credits: 100,
      reserved_credits: 0,
      active_reservations: [],
    };
    this.idempotencyKeys.clear();
    this.reservations.clear();
    this.ledger.clear();
  }

  // 1. Idempotency key registration
  public step1_registerIdempotency(key: string): boolean {
    if (this.idempotencyKeys.has(key)) return false;
    this.idempotencyKeys.add(key);
    return true;
  }

  // 2. Reservation document creation
  public step2_createReservation(attemptId: string, amount: number): boolean {
    if (this.reservations.has(attemptId)) return false;
    this.reservations.set(attemptId, {
      _id: attemptId,
      wallet_id: this.wallet._id,
      user_id: this.wallet.user_id,
      amount,
      status: 'created',
      fencing_token: 1,
      expires_at: new Date(Date.now() + 60000),
    });
    return true;
  }

  // 3. Wallet credit reservation (Atomic inc + push)
  public step3_reserveWallet(attemptId: string, amount: number): boolean {
    if (this.wallet.available_credits < amount) return false;
    this.wallet.available_credits -= amount;
    this.wallet.reserved_credits += amount;
    this.wallet.active_reservations.push(attemptId);
    this.ledger.set(`tx_res_${attemptId}`, {
      _id: `tx_res_${attemptId}`,
      type: 'reservation',
      attempt_id: attemptId,
      amount,
    });
    return true;
  }

  // 4. Reservation activation
  public step4_activateReservation(attemptId: string): boolean {
    const res = this.reservations.get(attemptId);
    if (!res || res.status !== 'created') return false;
    res.status = 'active';
    res.fencing_token += 1;
    return true;
  }

  // 5. Successful settlement (consume reserved credits)
  public step5_settle(attemptId: string): boolean {
    const res = this.reservations.get(attemptId);
    if (!res || res.status !== 'active') return false;
    if (this.wallet.reserved_credits < res.amount) return false;

    this.wallet.reserved_credits -= res.amount;
    this.wallet.active_reservations = this.wallet.active_reservations.filter((id) => id !== attemptId);
    res.status = 'settled';
    res.fencing_token += 1;
    this.ledger.set(`tx_set_${attemptId}`, {
      _id: `tx_set_${attemptId}`,
      type: 'settle',
      attempt_id: attemptId,
      amount: res.amount,
    });
    return true;
  }

  // 6. Refund initiation
  public step6_initiateRefund(attemptId: string): boolean {
    const res = this.reservations.get(attemptId);
    if (!res || res.status !== 'active') return false;
    res.status = 'refunding';
    res.fencing_token += 1;
    return true;
  }

  // 7. Atomic wallet refund (inc + pull)
  public step7_atomicWalletRefund(attemptId: string): boolean {
    const hasToken = this.wallet.active_reservations.includes(attemptId);
    const res = this.reservations.get(attemptId);
    if (!hasToken || !res || this.wallet.reserved_credits < res.amount) return false;

    this.wallet.available_credits += res.amount;
    this.wallet.reserved_credits -= res.amount;
    this.wallet.active_reservations = this.wallet.active_reservations.filter((id) => id !== attemptId);
    return true;
  }

  // 8. Ledger insertion for refund
  public step8_insertRefundLedger(attemptId: string): boolean {
    const key = `tx_ref_${attemptId}`;
    if (this.ledger.has(key)) return false;
    const res = this.reservations.get(attemptId);
    if (!res) return false;
    this.ledger.set(key, {
      _id: key,
      type: 'refund',
      attempt_id: attemptId,
      amount: res.amount,
    });
    return true;
  }

  // 9. Final reservation closure
  public step9_closeReservation(attemptId: string): boolean {
    const res = this.reservations.get(attemptId);
    if (!res || (res.status !== 'refunding' && res.status !== 'active' && res.status !== 'created')) return false;
    res.status = 'expired';
    res.fencing_token += 1;
    return true;
  }

  // RECONCILER DISAMBIGUATION LOGIC
  public reconcile(attemptId: string): { action: string; walletChanged: boolean } {
    const res = this.reservations.get(attemptId);
    const hasWalletToken = this.wallet.active_reservations.includes(attemptId);
    const hasResLedger = this.ledger.has(`tx_res_${attemptId}`);
    const hasSettleLedger = this.ledger.has(`tx_set_${attemptId}`);
    const hasRefundLedger = this.ledger.has(`tx_ref_${attemptId}`);

    // If reservation doesn't exist, nothing to do
    if (!res) return { action: 'NO_RESERVATION_DOC', walletChanged: false };

    // Case 1: Already terminal
    if (res.status === 'settled') {
      return { action: 'ALREADY_SETTLED', walletChanged: false };
    }
    if (res.status === 'expired' || res.status === 'voided') {
      return { action: 'ALREADY_CLOSED', walletChanged: false };
    }

    // Case 2: Reservation created, but wallet was NEVER reserved (Crash between Step 2 and 3)
    // DISAMBIGUATION: Token absent AND no reservation ledger row!
    if (!hasWalletToken && !hasResLedger) {
      res.status = 'voided';
      return { action: 'VOID_UNRESERVED_DOC', walletChanged: false };
    }

    // Case 3: Wallet was reserved, but settlement occurred through another path (Crash after Step 5)
    if (hasSettleLedger) {
      res.status = 'settled';
      return { action: 'MARK_SETTLED', walletChanged: false };
    }

    // Case 4: Wallet was refunded (token absent + reservation ledger present + no settlement)
    // Crash between Step 7 and 8 or 8 and 9!
    if (!hasWalletToken && hasResLedger) {
      // Wallet was ALREADY credited! Do NOT credit again!
      if (!hasRefundLedger) {
        this.step8_insertRefundLedger(attemptId);
      }
      this.step9_closeReservation(attemptId);
      return { action: 'RECOVER_LEDGER_AND_CLOSE', walletChanged: false };
    }

    // Case 5: Token IS present in wallet! Wallet needs to be refunded.
    // Crash between Step 3 and 4, or 4 and 5, or 5 and 6, or 6 and 7!
    if (hasWalletToken) {
      this.step7_atomicWalletRefund(attemptId);
      this.step8_insertRefundLedger(attemptId);
      this.step9_closeReservation(attemptId);
      return { action: 'REFUND_WALLET_AND_CLOSE', walletChanged: true };
    }

    return { action: 'UNKNOWN_STATE', walletChanged: false };
  }
}

async function runLifecycleTests() {
  console.log('========================================================================');
  console.log('VIREOCLIP PHASE 4B.3: V5 LIFECYCLE & CRASH DISAMBIGUATION TEST SUITE');
  console.log('========================================================================\n');

  const sim = new V5LifecycleSimulator();

  // Test Crash between 1 and 2
  console.log('--- CRASH WINDOW 1-2: Crash after Key Registration, before Reservation Doc ---');
  sim.reset();
  sim.step1_registerIdempotency('key_1');
  // Crash!
  const rec1 = sim.reconcile('att_1');
  console.log(`Reconcile result: action=${rec1.action}, walletChanged=${rec1.walletChanged}`);
  console.log(`Balance: available=${sim.wallet.available_credits}, reserved=${sim.wallet.reserved_credits}`);
  if (sim.wallet.available_credits !== 100 || rec1.action !== 'NO_RESERVATION_DOC') throw new Error('Test 1-2 failed');
  console.log('✔ Passed: No orphaned reservation or wallet balance mutation.\n');

  // Test Crash between 2 and 3
  console.log('--- CRASH WINDOW 2-3: Crash after Reservation Doc, before Wallet Reserve ---');
  sim.reset();
  sim.step1_registerIdempotency('key_2');
  sim.step2_createReservation('att_2', 3);
  // Crash before step 3! (Wallet not reserved, token absent)
  const rec2 = sim.reconcile('att_2');
  console.log(`Reconcile result: action=${rec2.action}, walletChanged=${rec2.walletChanged}`);
  console.log(`Final Reservation Status: ${sim.reservations.get('att_2')?.status}`);
  console.log(`Balance: available=${sim.wallet.available_credits}, reserved=${sim.wallet.reserved_credits}`);
  if (sim.wallet.available_credits !== 100 || rec2.action !== 'VOID_UNRESERVED_DOC' || rec2.walletChanged) {
    throw new Error('Test 2-3 failed: Free credit bug detected!');
  }
  console.log('✔ Passed: Token absence disambiguated via missing ledger! Zero free credits granted.\n');

  // Test Crash between 3 and 4
  console.log('--- CRASH WINDOW 3-4: Crash after Wallet Reserve, before Activation ---');
  sim.reset();
  sim.step1_registerIdempotency('key_3');
  sim.step2_createReservation('att_3', 3);
  sim.step3_reserveWallet('att_3', 3); // available=97, reserved=3, token present
  // Crash before step 4!
  const rec3 = sim.reconcile('att_3');
  console.log(`Reconcile result: action=${rec3.action}, walletChanged=${rec3.walletChanged}`);
  console.log(`Balance: available=${sim.wallet.available_credits}, reserved=${sim.wallet.reserved_credits}`);
  if (sim.wallet.available_credits !== 100 || !rec3.walletChanged || sim.reservations.get('att_3')?.status !== 'expired') {
    throw new Error('Test 3-4 failed');
  }
  console.log('✔ Passed: Wallet safely refunded and reservation closed.\n');

  // Test Crash between 4 and 5
  console.log('--- CRASH WINDOW 4-5: Active Reservation Times Out before Settlement ---');
  sim.reset();
  sim.step1_registerIdempotency('key_4');
  sim.step2_createReservation('att_4', 3);
  sim.step3_reserveWallet('att_4', 3);
  sim.step4_activateReservation('att_4');
  // Job timed out
  const rec4 = sim.reconcile('att_4');
  console.log(`Reconcile result: action=${rec4.action}, walletChanged=${rec4.walletChanged}`);
  console.log(`Balance: available=${sim.wallet.available_credits}, reserved=${sim.wallet.reserved_credits}`);
  if (sim.wallet.available_credits !== 100 || sim.reservations.get('att_4')?.status !== 'expired') {
    throw new Error('Test 4-5 failed');
  }
  console.log('✔ Passed: Timed out active reservation fully refunded.\n');

  // Test Crash between 5 and 6 (Successful settlement completed)
  console.log('--- CRASH WINDOW 5-6: Normal Settlement Completed ---');
  sim.reset();
  sim.step1_registerIdempotency('key_5');
  sim.step2_createReservation('att_5', 3);
  sim.step3_reserveWallet('att_5', 3);
  sim.step4_activateReservation('att_5');
  sim.step5_settle('att_5'); // Settle consumed 3 credits: available=97, reserved=0
  const rec5 = sim.reconcile('att_5');
  console.log(`Reconcile result: action=${rec5.action}, walletChanged=${rec5.walletChanged}`);
  console.log(`Balance: available=${sim.wallet.available_credits}, reserved=${sim.wallet.reserved_credits}`);
  if ((sim.wallet.available_credits as number) !== 97 || rec5.action !== 'ALREADY_SETTLED' || rec5.walletChanged) {
    throw new Error('Test 5-6 failed: Settled credits erroneously refunded!');
  }
  console.log('✔ Passed: Settled reservation strictly recognized. Zero erroneous refunds.\n');

  // Test Crash between 6 and 7
  console.log('--- CRASH WINDOW 6-7: Crash after Refund Initiation, before Wallet Refund ---');
  sim.reset();
  sim.step1_registerIdempotency('key_6');
  sim.step2_createReservation('att_6', 3);
  sim.step3_reserveWallet('att_6', 3);
  sim.step4_activateReservation('att_6');
  sim.step6_initiateRefund('att_6'); // status: refunding, token still present
  const rec6 = sim.reconcile('att_6');
  console.log(`Reconcile result: action=${rec6.action}, walletChanged=${rec6.walletChanged}`);
  console.log(`Balance: available=${sim.wallet.available_credits}, reserved=${sim.wallet.reserved_credits}`);
  if (sim.wallet.available_credits !== 100 || !rec6.walletChanged) throw new Error('Test 6-7 failed');
  console.log('✔ Passed: Incomplete refund resumed and completed.\n');

  // Test Crash between 7 and 8 (Wallet refunded, ledger NOT inserted)
  console.log('--- CRASH WINDOW 7-8: Crash after Wallet Refund, before Ledger Insertion ---');
  sim.reset();
  sim.step1_registerIdempotency('key_7');
  sim.step2_createReservation('att_7', 3);
  sim.step3_reserveWallet('att_7', 3);
  sim.step4_activateReservation('att_7');
  sim.step6_initiateRefund('att_7');
  sim.step7_atomicWalletRefund('att_7'); // available=100, reserved=0, token removed!
  // Crash!
  const rec7 = sim.reconcile('att_7');
  console.log(`Reconcile result: action=${rec7.action}, walletChanged=${rec7.walletChanged}`);
  console.log(`Balance: available=${sim.wallet.available_credits}, reserved=${sim.wallet.reserved_credits}`);
  console.log(`Refund Ledger exists: ${sim.ledger.has('tx_ref_att_7')}`);
  if (sim.wallet.available_credits !== 100 || rec7.walletChanged || !sim.ledger.has('tx_ref_att_7')) {
    throw new Error('Test 7-8 failed: Double refund or missing ledger!');
  }
  console.log('✔ Passed: ZERO double refund; missing ledger cleanly recovered!\n');

  // Test Crash between 8 and 9 (Ledger inserted, reservation not closed)
  console.log('--- CRASH WINDOW 8-9: Crash after Ledger Insertion, before Reservation Closure ---');
  sim.reset();
  sim.step1_registerIdempotency('key_8');
  sim.step2_createReservation('att_8', 3);
  sim.step3_reserveWallet('att_8', 3);
  sim.step4_activateReservation('att_8');
  sim.step6_initiateRefund('att_8');
  sim.step7_atomicWalletRefund('att_8');
  sim.step8_insertRefundLedger('att_8');
  // Crash!
  const rec8 = sim.reconcile('att_8');
  console.log(`Reconcile result: action=${rec8.action}, walletChanged=${rec8.walletChanged}`);
  console.log(`Final Reservation Status: ${sim.reservations.get('att_8')?.status}`);
  if (sim.wallet.available_credits !== 100 || rec8.walletChanged || sim.reservations.get('att_8')?.status !== 'expired') {
    throw new Error('Test 8-9 failed');
  }
  console.log('✔ Passed: Reservation closed cleanly without balance mutation.\n');

  console.log('========================================================================');
  console.log('ALL 8 LIFECYCLE CRASH WINDOW TESTS PASSED (100%)');
  console.log('========================================================================');
}

runLifecycleTests().catch((err) => {
  console.error('LIFECYCLE VERIFICATION FAILED:', err);
  process.exit(1);
});
