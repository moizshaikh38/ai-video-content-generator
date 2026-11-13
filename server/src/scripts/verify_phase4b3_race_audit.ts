import crypto from 'node:crypto';

// ============================================================================
// VIREOCLIP PHASE 4B.3: FINAL FENCING & IDEMPOTENCY RACE AUDIT TEST SUITE
// ============================================================================

interface IdempotencyKeyDoc {
  _id: string;
  user_id: string;
  payload_sha256: string;
  operation_id: string;
  status: 'in_flight' | 'reserving' | 'committed' | 'aborted_unreserved';
  server_created_at: Date;
  lease_expires_at: Date;
  fencing_token: number;
}

interface WalletDoc {
  _id: string;
  user_id: string;
  available_credits: number;
  reserved_credits: number;
  active_reservations: string[]; // e.g. ["att_100:f1"]
}

interface ReservationDoc {
  _id: string;
  wallet_id: string;
  user_id: string;
  amount: number;
  status: 'created' | 'refunding' | 'active' | 'settled' | 'expired' | 'voided';
  fencing_token: number;
}

class RaceAuditSimulator {
  public idempotencyKeys: Map<string, IdempotencyKeyDoc> = new Map();
  public wallet: WalletDoc;
  public reservations: Map<string, ReservationDoc> = new Map();

  constructor() {
    this.wallet = {
      _id: 'w_test',
      user_id: 'u_test',
      available_credits: 97,
      reserved_credits: 3,
      active_reservations: ['att_target_100:f1'],
    };
  }

  public reset(useFencedTokens = true) {
    this.idempotencyKeys.clear();
    this.wallet = {
      _id: 'w_test',
      user_id: 'u_test',
      available_credits: 97,
      reserved_credits: 3,
      active_reservations: useFencedTokens ? ['att_target_100:f1'] : ['att_target_100'],
    };
    this.reservations.clear();
    this.reservations.set('att_target_100', {
      _id: 'att_target_100',
      wallet_id: 'w_test',
      user_id: 'u_test',
      amount: 3,
      status: 'active',
      fencing_token: 1,
    });
  }

  // --------------------------------------------------------------------------
  // GAP 1: STALE WORKER WALLET MUTATION RACE
  // --------------------------------------------------------------------------

  // Without Fenced Tokens (Current V5 Design)
  public executeWalletRefundUnfenced(attemptId: string, amount: number): { modifiedCount: number } {
    const hasToken = this.wallet.active_reservations.includes(attemptId);
    if (!hasToken || this.wallet.reserved_credits < amount) {
      return { modifiedCount: 0 };
    }
    this.wallet.available_credits += amount;
    this.wallet.reserved_credits -= amount;
    this.wallet.active_reservations = this.wallet.active_reservations.filter((id) => id !== attemptId);
    return { modifiedCount: 1 };
  }

  // With Fenced Tokens (Proposed Correction)
  public executeWalletRefundFenced(
    attemptId: string,
    expectedFence: number,
    amount: number
  ): { modifiedCount: number } {
    const tokenString = `${attemptId}:f${expectedFence}`;
    const hasToken = this.wallet.active_reservations.includes(tokenString);
    if (!hasToken || this.wallet.reserved_credits < amount) {
      return { modifiedCount: 0 };
    }
    this.wallet.available_credits += amount;
    this.wallet.reserved_credits -= amount;
    this.wallet.active_reservations = this.wallet.active_reservations.filter((t) => t !== tokenString);
    return { modifiedCount: 1 };
  }

  public advanceWalletTokenFence(attemptId: string, oldFence: number, newFence: number): boolean {
    const oldToken = `${attemptId}:f${oldFence}`;
    const newToken = `${attemptId}:f${newFence}`;
    const idx = this.wallet.active_reservations.indexOf(oldToken);
    if (idx === -1) return false;
    this.wallet.active_reservations[idx] = newToken;
    return true;
  }

  // --------------------------------------------------------------------------
  // GAP 2: STALE APP PROCESS RACE AFTER KEY ABORTION
  // --------------------------------------------------------------------------
  public registerKey(key: string, attemptId: string): boolean {
    this.idempotencyKeys.set(key, {
      _id: key,
      user_id: 'u_test',
      payload_sha256: 'hash123',
      operation_id: attemptId,
      status: 'in_flight',
      server_created_at: new Date(),
      lease_expires_at: new Date(Date.now() + 60000),
      fencing_token: 1,
    });
    return true;
  }

  public sweeperAbortAbandonedKey(key: string): boolean {
    const doc = this.idempotencyKeys.get(key);
    if (!doc || doc.status !== 'in_flight') return false;
    // Check if reservation doc was created
    if (this.reservations.has(doc.operation_id)) return false;

    // Transition to aborted_unreserved with fencing increment
    doc.status = 'aborted_unreserved';
    doc.fencing_token += 1;
    return true;
  }

  // App A attempts to proceed from Step 1 to Step 2
  public appProceedToReservation(
    key: string,
    appFence: number,
    attemptId: string,
    amount: number
  ): { allowed: boolean; reason: string } {
    const doc = this.idempotencyKeys.get(key);
    if (!doc) return { allowed: false, reason: 'KEY_NOT_FOUND' };

    // FENCED CONDITIONAL QUERY on idempotency_keys
    if (doc.status !== 'in_flight' || doc.fencing_token !== appFence) {
      return { allowed: false, reason: `FENCE_LOST_OR_STATUS_${doc.status}` };
    }

    // Advance status to reserving
    doc.status = 'reserving';
    doc.fencing_token += 1;

    // Create reservation doc and reserve wallet
    this.reservations.set(attemptId, {
      _id: attemptId,
      wallet_id: 'w_test',
      user_id: 'u_test',
      amount,
      status: 'created',
      fencing_token: 1,
    });
    this.wallet.available_credits -= amount;
    this.wallet.reserved_credits += amount;
    this.wallet.active_reservations.push(`${attemptId}:f1`);

    return { allowed: true, reason: 'SUCCESS' };
  }
}

async function runRaceAudit() {
  console.log('========================================================================');
  console.log('VIREOCLIP PHASE 4B.3: FINAL FENCING & IDEMPOTENCY RACE AUDIT');
  console.log('========================================================================\n');

  const sim = new RaceAuditSimulator();

  // --------------------------------------------------------------------------
  // GAP 1: STALE WORKER RACE DEMONSTRATION
  // --------------------------------------------------------------------------
  console.log('--- GAP 1: STALE WORKER WALLET MUTATION RACE ---');
  
  // Trace 1A: Without Fenced Tokens (Current V5 Design)
  sim.reset(false); // active_reservations has ["att_target_100"]
  console.log('1. Worker A acquires fencing token 3 on credit_reservations.');
  sim.reservations.get('att_target_100')!.fencing_token = 3;
  console.log('2. Worker A pauses. Lease expires.');
  console.log('3. Worker B acquires fencing token 4 on credit_reservations.');
  sim.reservations.get('att_target_100')!.fencing_token = 4;
  console.log('4. Worker A wakes up BEFORE Worker B touches the wallet.');
  console.log('5. Worker A attempts unfenced wallet refund...');
  const resA = sim.executeWalletRefundUnfenced('att_target_100', 3);
  console.log(`Outcome for Worker A: modifiedCount=${resA.modifiedCount}`);
  console.log(`Wallet Balance after Worker A: available=${sim.wallet.available_credits}, reserved=${sim.wallet.reserved_credits}`);
  console.log('6. Worker B attempts unfenced wallet refund...');
  const resB = sim.executeWalletRefundUnfenced('att_target_100', 3);
  console.log(`Outcome for Worker B: modifiedCount=${resB.modifiedCount}`);
  console.log(`Wallet Balance after Worker B: available=${sim.wallet.available_credits}, reserved=${sim.wallet.reserved_credits}`);
  console.log('Analysis: Financial safety holds (balance=100, exactly-once), BUT Worker A (STALE) mutated the wallet, failing strict fencing ownership!\n');

  // Trace 1B: With Fenced Tokens (Proposed Correction)
  sim.reset(true); // active_reservations has ["att_target_100:f1"]
  console.log('--- WITH PROPOSED FENCED TOKENS (att_target_100:fX) ---');
  console.log('1. Worker A acquires fence 3, updates wallet token to att_target_100:f3.');
  sim.reservations.get('att_target_100')!.fencing_token = 3;
  sim.advanceWalletTokenFence('att_target_100', 1, 3);
  console.log(`Wallet tokens: ${JSON.stringify(sim.wallet.active_reservations)}`);

  console.log('2. Worker A pauses. Lease expires.');
  console.log('3. Worker B acquires fence 4, updates wallet token to att_target_100:f4.');
  sim.reservations.get('att_target_100')!.fencing_token = 4;
  sim.advanceWalletTokenFence('att_target_100', 3, 4);
  console.log(`Wallet tokens: ${JSON.stringify(sim.wallet.active_reservations)}`);

  console.log('4. Stale Worker A wakes up and attempts wallet refund with its stale fence (f3)...');
  const resAFenced = sim.executeWalletRefundFenced('att_target_100', 3, 3);
  console.log(`Outcome for Stale Worker A: modifiedCount=${resAFenced.modifiedCount} (STRICTLY BLOCKED!)`);

  console.log('5. Active Worker B executes wallet refund with valid fence (f4)...');
  const resBFenced = sim.executeWalletRefundFenced('att_target_100', 4, 3);
  console.log(`Outcome for Active Worker B: modifiedCount=${resBFenced.modifiedCount} (COMMITTED!)`);
  console.log(`Final Balance: available=${sim.wallet.available_credits}, reserved=${sim.wallet.reserved_credits}`);
  if (resAFenced.modifiedCount !== 0 || resBFenced.modifiedCount !== 1 || sim.wallet.available_credits !== 100) {
    throw new Error('Gap 1 Fenced Token Test Failed!');
  }
  console.log('✔ Passed: Stale worker strictly blocked; active worker commits; strict fencing verified.\n');

  // --------------------------------------------------------------------------
  // GAP 2: STALE APPLICATION PROCESS RACE AFTER KEY ABORTION
  // --------------------------------------------------------------------------
  console.log('--- GAP 2: STALE APPLICATION PROCESS AFTER KEY ABORTION ---');
  sim.reset(true);
  sim.wallet.available_credits = 100;
  sim.wallet.reserved_credits = 0;
  sim.wallet.active_reservations = [];
  sim.reservations.clear();

  console.log('1. App A registers idempotency key "idem_app_race" with fence 1.');
  sim.registerKey('idem_app_race', 'att_app_race');

  console.log('2. App A pauses. Lease expires.');
  console.log('3. Sweeper detects abandoned key without reservation doc.');
  const swept = sim.sweeperAbortAbandonedKey('idem_app_race');
  console.log(`Sweeper abort result: swept=${swept}, newStatus=${sim.idempotencyKeys.get('idem_app_race')?.status}, newFence=${sim.idempotencyKeys.get('idem_app_race')?.fencing_token}`);

  console.log('4. Stale App A wakes up and attempts to proceed with stale fence 1...');
  const appProceed = sim.appProceedToReservation('idem_app_race', 1, 'att_app_race', 3);
  console.log(`App A outcome: allowed=${appProceed.allowed}, reason="${appProceed.reason}" (STRICTLY BLOCKED!)`);
  console.log(`Wallet Balance: available=${sim.wallet.available_credits}, reserved=${sim.wallet.reserved_credits}`);
  console.log(`Reservation Doc Exists: ${sim.reservations.has('att_app_race')}`);

  if (appProceed.allowed || sim.wallet.available_credits !== 100 || sim.reservations.has('att_app_race')) {
    throw new Error('Gap 2 Stale App Test Failed!');
  }
  console.log('✔ Passed: Stale application process strictly prevented from reserving credits or creating reservation.\n');

  console.log('========================================================================');
  console.log('ALL FENCING & IDEMPOTENCY RACE AUDIT TESTS PASSED (100%)');
  console.log('========================================================================');
}

runRaceAudit().catch((err) => {
  console.error('RACE AUDIT FAILED:', err);
  process.exit(1);
});

