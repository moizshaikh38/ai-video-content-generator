import crypto from 'node:crypto';

// ============================================================================
// VIREOCLIP PHASE 4B.3: FINAL STANDALONE PROTOCOL RACE VERIFICATION SCRIPT
// ============================================================================

interface IdempotencyKeyDoc {
  _id: string;
  operation_id: string;
  status: 'in_flight' | 'reserving' | 'aborted_unreserved' | 'committed';
  lease_expires_at: Date;
  fencing_token: number;
}

interface WalletDoc {
  _id: string;
  available_credits: number;
  reserved_credits: number;
  active_reservations: string[];
}

interface ReservationDoc {
  _id: string;
  amount: number;
  status: 'created' | 'refunding' | 'active' | 'settled' | 'expired' | 'voided';
  fencing_token: number;
}

class StandaloneRaceSimulator {
  public idempotencyKeys: Map<string, IdempotencyKeyDoc> = new Map();
  public wallet: WalletDoc;
  public reservations: Map<string, ReservationDoc> = new Map();

  constructor() {
    this.wallet = {
      _id: 'w_test',
      available_credits: 97,
      reserved_credits: 3,
      active_reservations: ['att_100:f3'],
    };
  }

  public reset() {
    this.idempotencyKeys.clear();
    this.wallet = {
      _id: 'w_test',
      available_credits: 97,
      reserved_credits: 3,
      active_reservations: ['att_100:f3'],
    };
    this.reservations.clear();
    this.reservations.set('att_100', {
      _id: 'att_100',
      amount: 3,
      status: 'active',
      fencing_token: 3,
    });
  }

  // --------------------------------------------------------------------------
  // GAP 1: TOKEN MIGRATION RACE ANALYSIS
  // --------------------------------------------------------------------------

  // Worker attempts refund on wallet with its expected token
  public attemptWalletRefund(token: string, amount: number): { modifiedCount: number } {
    const idx = this.wallet.active_reservations.indexOf(token);
    if (idx === -1 || this.wallet.reserved_credits < amount) {
      return { modifiedCount: 0 };
    }
    this.wallet.available_credits += amount;
    this.wallet.reserved_credits -= amount;
    this.wallet.active_reservations.splice(idx, 1);
    return { modifiedCount: 1 };
  }

  // --------------------------------------------------------------------------
  // GAP 2: IDEMPOTENCY GATE TO RESERVATION INSERT RACE
  // --------------------------------------------------------------------------

  // App A performs pre-reservation gate
  public gateKey(key: string, attemptId: string): boolean {
    this.idempotencyKeys.set(key, {
      _id: key,
      operation_id: attemptId,
      status: 'reserving',
      lease_expires_at: new Date(Date.now() + 60000),
      fencing_token: 2,
    });
    return true;
  }

  // Sweeper aborts key AND inserts tombstone reservation doc (PROPOSED FIX)
  public sweeperAbortWithTombstone(key: string, attemptId: string): boolean {
    const keyDoc = this.idempotencyKeys.get(key);
    if (!keyDoc) return false;

    // 1. Advance key to aborted_unreserved
    keyDoc.status = 'aborted_unreserved';
    keyDoc.fencing_token += 1;

    // 2. Insert tombstone doc in credit_reservations if not already present
    if (!this.reservations.has(attemptId)) {
      this.reservations.set(attemptId, {
        _id: attemptId,
        amount: 3,
        status: 'voided',
        fencing_token: 1,
      });
    }
    return true;
  }

  // App A attempts to insert reservation doc (unique index constraint on _id)
  public appInsertReservation(attemptId: string, amount: number): { inserted: boolean; error?: string } {
    if (this.reservations.has(attemptId)) {
      return { inserted: false, error: 'E11000 duplicate key error on _id: ' + attemptId };
    }
    this.reservations.set(attemptId, {
      _id: attemptId,
      amount,
      status: 'created',
      fencing_token: 1,
    });
    return { inserted: true };
  }
}

async function runStandaloneRaceVerification() {
  console.log('========================================================================');
  console.log('VIREOCLIP PHASE 4B.3: FINAL STANDALONE PROTOCOL RACE VERIFICATION');
  console.log('========================================================================\n');

  const sim = new StandaloneRaceSimulator();

  // --------------------------------------------------------------------------
  // TEST 1: GAP 1 — Fenced Wallet Token Migration Race
  // --------------------------------------------------------------------------
  console.log('--- TEST 1: GAP 1 — Fenced Wallet Token Migration Race ---');
  sim.reset();
  console.log('Initial State: Reservation fence=3, Wallet active_reservations=["att_100:f3"]');

  // Step 1: Worker A holds fence 3, pauses. Lease expires.
  console.log('1. Worker A (fence 3) pauses. Lease expires on disk.');

  // Step 2: Worker B acquires fence 4 on credit_reservations
  sim.reservations.get('att_100')!.fencing_token = 4;
  console.log('2. Worker B acquires fence 4 on credit_reservations.');
  console.log('   CRITICAL GAP WINDOW: Worker B has NOT yet updated the wallet token on disk!');
  console.log(`   On disk: Reservation fence=${sim.reservations.get('att_100')?.fencing_token}, Wallet token=${sim.wallet.active_reservations[0]}`);

  // Step 3: Worker A resumes before Worker B updates wallet!
  console.log('3. Stale Worker A resumes and attempts refund with att_100:f3...');
  const resA = sim.attemptWalletRefund('att_100:f3', 3);
  console.log(`   Worker A refund result: modifiedCount=${resA.modifiedCount}`);
  console.log(`   Wallet balance after Worker A: available=${sim.wallet.available_credits}, reserved=${sim.wallet.reserved_credits}`);

  // Step 4: Worker B attempts refund with att_100:f4 (or tries to migrate token)
  console.log('4. Worker B attempts refund with att_100:f4...');
  const resB = sim.attemptWalletRefund('att_100:f4', 3);
  console.log(`   Worker B refund result: modifiedCount=${resB.modifiedCount}`);
  console.log(`   Final Wallet balance: available=${sim.wallet.available_credits}, reserved=${sim.wallet.reserved_credits}`);

  if (resA.modifiedCount !== 1 || resB.modifiedCount !== 0 || sim.wallet.available_credits !== 100) {
    throw new Error('Test 1 failed!');
  }
  console.log('✔ Proof: FINANCIAL EXACTLY-ONCE IS PRESERVED (balance=100, exactly one refund applied).');
  console.log('  However, strict worker ownership failed: Worker A (stale) mutated the wallet.\n');

  // --------------------------------------------------------------------------
  // TEST 2: GAP 2 — Idempotency Gate to Reservation Insert Race
  // --------------------------------------------------------------------------
  console.log('--- TEST 2: GAP 2 — Pre-Reservation Gate to Reservation Insert Race ---');
  sim.idempotencyKeys.clear();
  sim.reservations.clear();
  sim.wallet = { _id: 'w_test', available_credits: 100, reserved_credits: 0, active_reservations: [] };

  console.log('1. App A executes pre-reservation gate: status="reserving", fence=2');
  sim.gateKey('key_gap2', 'att_gap2');

  console.log('2. App A pauses for 90s. Lease expires.');
  console.log('3. Sweeper detects expired reserving lease and no reservation doc.');
  console.log('   Sweeper executes fix: Marks key "aborted_unreserved" AND inserts tombstone doc in credit_reservations!');
  sim.sweeperAbortWithTombstone('key_gap2', 'att_gap2');
  console.log(`   Key status on disk: ${sim.idempotencyKeys.get('key_gap2')?.status}`);
  console.log(`   Reservation doc on disk: status=${sim.reservations.get('att_gap2')?.status}`);

  console.log('4. Stale App A wakes up and attempts Step 2 (insert reservation doc)...');
  const appInsert = sim.appInsertReservation('att_gap2', 3);
  console.log(`   App A insert result: inserted=${appInsert.inserted}, error="${appInsert.error}"`);
  console.log(`   Did App A proceed to wallet reserve? ${appInsert.inserted ? 'YES (BUG)' : 'NO (BLOCKED BY E11000)'}`);
  console.log(`   Wallet balance: available=${sim.wallet.available_credits}, reserved=${sim.wallet.reserved_credits}`);

  if (appInsert.inserted || sim.wallet.available_credits !== 100) {
    throw new Error('Test 2 failed!');
  }
  console.log('✔ Proof: STALE APP A IS STRICTLY BLOCKED BY UNIQUE INDEX CONSTRAINT (E11000)!');
  console.log('  Zero orphaned reservations created; zero wallet credits deducted.\n');

  console.log('========================================================================');
  console.log('ALL STANDALONE RACE VERIFICATION TESTS PASSED (100%)');
  console.log('========================================================================');
}

runStandaloneRaceVerification().catch((err) => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});

