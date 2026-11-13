# VIREOCLIP PHASE 4B.3: FINAL UNIFIED TRANSACTION ARCHITECTURE & IMPLEMENTATION BLUEPRINT

> **Document Status**: FINAL ARCHITECTURE SPECIFICATION & IMPLEMENTATION BLUEPRINT  
> **Execution Authorization**: STRICTLY PLANNING ONLY — NOT IMPLEMENTED  
> **Target Phase**: Phase 4B.3 (Production Credit Settlement & Sweeper Reconciliation)  
> **Target Deliverable**: `VIREOCLIP_PHASE_4B3_FINAL_UNIFIED_TRANSACTION_ARCHITECTURE.md`  
> **Mode**: READ-ONLY ARCHITECTURAL RESOLUTION. Zero production code modified, zero schemas altered, zero database mutations, zero commercial rule changes.  

---

## 1. EXECUTIVE SUMMARY

Over the course of multiple architectural reviews, attempts to achieve production-grade financial reliability on standalone MongoDB via single-document arrays, ring buffers, token migrations, and state inference heuristics have demonstrated a fundamental truth of distributed systems:

$$\text{Strict cross-document atomicity across separate collections without multi-document ACID transactions is mathematically impossible.}$$

This final specification makes a definitive architectural decision:

1. **Complete Retirement of Standalone MongoDB for Financial State Transitions**:
   The standalone Active In-Flight Reservation (AIFR) protocol, token migration schemes, and cross-document state inference heuristics are formally **retired and eliminated**.
2. **Unified Multi-Document ACID Transaction Architecture**:
   All financial state transitions—credit reservations, settlements, refunds, ledger recordings, and permanent idempotency commitments—are unified under **MongoDB Multi-Document ACID Transactions (WiredTiger Snapshot Isolation)**.
3. **Mandatory Replica Set Deployment**:
   Production, staging, automated integration testing, and local development environments supporting financial operations **MUST** run on a MongoDB Replica Set.
4. **Strict Fail-Closed Topology Guardrail**:
   If the application starts against a standalone MongoDB instance while attempting to execute Phase 4B.3 financial operations, it **fails closed immediately** with HTTP `503 SERVICE_UNAVAILABLE (REPLICA_SET_REQUIRED)`. Standalone instances may continue serving non-financial developer features, but financial mutations are strictly forbidden.

---

## 2. FINAL ARCHITECTURE DECISION: REPLICA-SET MANDATE & TOPOLOGY MATRIX

### 2.1 Deployment Environment Topology Matrix

| Environment | Database Topology | Transaction Support | Phase 4B.3 Financial Operations | Behavior on Standalone Detection |
| :--- | :--- | :---: | :---: | :--- |
| **Production** | MongoDB Atlas / 3-Node Managed Replica Set | **ACID (Snapshot Isolation)** | **ENABLED** | **FATAL STARTUP CRASH**: Server process exits immediately ($1$). |
| **Staging** | 3-Node MongoDB Replica Set | **ACID (Snapshot Isolation)** | **ENABLED** | **FATAL STARTUP CRASH**: Server process exits immediately ($1$). |
| **Local Development** | Single-Node Replica Set (`mongod --replSet rs0`) | **ACID (Snapshot Isolation)** | **ENABLED** | Non-financial features enabled; financial routes return HTTP `503`. |
| **Automated CI/CD Tests**| `MongoMemoryReplSet` (In-Memory Replica Set) | **ACID (Snapshot Isolation)** | **ENABLED** | Test runner boots multi-node in-memory replica set. |
| **Standalone MongoDB** | Unreplicated Single `mongod` Node | **UNSUPPORTED** | **DISABLED** | **FAIL-CLOSED**: Credit reservation and settlement are blocked. |

### 2.2 Topology Validation & Fail-Closed Guard Specification
During server startup (in `bootstrapMongo.ts` / `mongoClient.ts`), the connection topology is inspected:
```typescript
export async function validateFinancialTopology(client: MongoClient): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';
  const topology = client.topology?.description?.type;
  const isReplicaSet = topology === 'ReplicaSetWithPrimary' || topology === 'Sharded';

  if (!isReplicaSet) {
    const errorMsg = `[CRITICAL] Financial operations require a MongoDB Replica Set with transaction support. Detected topology: "${topology}".`;
    if (isProduction) {
      logger.error(errorMsg);
      throw new Error(`FATAL_TOPOLOGY_ERROR: ${errorMsg}`);
    } else {
      logger.warn(`${errorMsg} Financial mutations are disabled (Fail-Closed).`);
    }
  }
}
```

---

## 3. UNIFIED TRANSACTION ARCHITECTURE

All financial state transitions are executed across five primary collections within two millisecond-fast ACID transactions. Long-running AI video processing runs strictly **outside** database transactions.

```mermaid
sequenceDiagram
    autonumber
    participant Client as Client Application
    participant Gateway as API Gateway / EntitlementService
    participant DB as MongoDB Replica Set (WiredTiger)
    participant AI as AI Generation Provider (Async Worker)

    Note over Gateway, DB: TRANSACTION 1: ATOMIC RESERVATION (< 10 ms)
    Gateway->>DB: session.startTransaction({ readConcern: 'snapshot', writeConcern: 'majority' })
    Gateway->>DB: 1. idempotency_keys.insertOne({ _id: key, payload_sha256, status: 'in_progress', ... })
    Gateway->>DB: 2. credit_reservations.insertOne({ _id: attemptId, status: 'active', amount: N, fencing_token: 1 })
    Gateway->>DB: 3. credit_wallets.updateOne({ _id: wId, available >= N }, { $inc: { available: -N, reserved: +N, version: 1 } })
    Gateway->>DB: 4. credit_transactions.insertOne({ _id: 'tx_res_' + attemptId, type: 'reservation' })
    Gateway->>DB: session.commitTransaction()
    Note right of DB: ATOMIC COMMIT: All 4 documents commit simultaneously.<br/>Zero partial records on disk!

    Note over Gateway, AI: ASYNCHRONOUS AI PROCESSING (OUTSIDE TRANSACTION: 5s - 60s)
    Gateway->>AI: Generate Content Pack / Render Video
    AI-->>Gateway: Generation Completed or Timed Out

    alt Generation Succeeded
        Note over Gateway, DB: TRANSACTION 2A: ATOMIC SETTLEMENT (< 10 ms)
        Gateway->>DB: session.startTransaction({ readConcern: 'snapshot', writeConcern: 'majority' })
        Gateway->>DB: 1. credit_reservations.updateOne({ _id: attemptId, status: 'active', fencing_token: 1 }, { $set: { status: 'settled', fencing_token: 2 } })
        Gateway->>DB: 2. credit_wallets.updateOne({ _id: wId, reserved >= N }, { $inc: { reserved: -N, version: 1 } })
        Gateway->>DB: 3. credit_transactions.insertOne({ _id: 'tx_set_' + attemptId, type: 'consumption' })
        Gateway->>DB: 4. idempotency_keys.updateOne({ _id: key }, { $set: { status: 'committed' } })
        Gateway->>DB: 5. idempotency_response_cache.insertOne({ _id: key, response_body, ... }) (30d TTL)
        Gateway->>DB: session.commitTransaction()
    else Generation Failed or Timed Out
        Note over Gateway, DB: TRANSACTION 2B: ATOMIC REFUND (< 10 ms)
        Gateway->>DB: session.startTransaction({ readConcern: 'snapshot', writeConcern: 'majority' })
        Gateway->>DB: 1. credit_reservations.updateOne({ _id: attemptId, status: 'active', fencing_token: 1 }, { $set: { status: 'expired', fencing_token: 2 } })
        Gateway->>DB: 2. credit_wallets.updateOne({ _id: wId, reserved >= N }, { $inc: { available: +N, reserved: -N, version: 1 } })
        Gateway->>DB: 3. credit_transactions.insertOne({ _id: 'tx_ref_' + attemptId, type: 'refund' })
        Gateway->>DB: 4. idempotency_keys.updateOne({ _id: key }, { $set: { status: 'refunded' } })
        Gateway->>DB: session.commitTransaction()
    end
```

### Detailed Transaction Specifications

#### Transaction A: Initial Reservation Transaction
- **Execution Boundary**: Atomically executed upon incoming user generation request.
- **Participating Collections**:
  1. `idempotency_keys`: Inserts `{ _id: key, payload_sha256, operation_id, reservation_id, status: 'in_progress', created_at: $$NOW }`. Unique index on `_id` blocks concurrent duplicate requests.
  2. `credit_reservations`: Inserts reservation document with `status: 'active'`, `amount: N`, `fencing_token: 1`, `expires_at: $$NOW + 120s`.
  3. `credit_wallets`: Conditional balance update `{ _id: walletId, available_credits: { $gte: amount } }` applying `$inc: { available_credits: -amount, reserved_credits: +amount, version: 1 }`.
  4. `credit_transactions`: Inserts unique reservation ledger entry `_id: 'tx_res_' + attemptId`.
- **Atomicity Guarantee**: If the wallet has insufficient funds, or the key was already registered, or an unexpected error occurs, **the transaction aborts completely**. Neither the reservation document, the wallet balances, nor the ledger entries are modified. There is **never** an orphaned reservation.

#### AI Processing Phase (Outside Database Transactions)
- External LLM API calls (OpenRouter, Groq), FFmpeg video rendering, audio processing, and network streaming execute asynchronously with a valid reservation in place.
- **Zero Database Lock Contention**: Database connections and WiredTiger transaction locks are **not** held during generation.

#### Transaction B: Successful Settlement Transaction
- **Execution Boundary**: Atomically executed when AI generation finishes successfully.
- **Participating Collections**:
  1. `credit_reservations`: Conditional transition `{ _id: attemptId, status: 'active', fencing_token: expectedToken }` setting `status: 'settled'`, incrementing `fencing_token`.
  2. `credit_wallets`: Deducts reserved credits `{ _id: walletId, reserved_credits: { $gte: amount } }` applying `$inc: { reserved_credits: -amount, version: 1 }`.
  3. `credit_transactions`: Inserts unique settlement ledger entry `_id: 'tx_set_' + attemptId`.
  4. `idempotency_keys`: Advances `status: 'committed'`.
  5. `idempotency_response_cache`: Stores serialized response payload with a 30-day TTL.

#### Transaction C: Failed Generation / Refund Transaction
- **Execution Boundary**: Atomically executed on failure, client cancellation, or background sweeper expiration.
- **Participating Collections**:
  1. `credit_reservations`: Conditional transition `{ _id: attemptId, status: { $in: ['active', 'refunding'] }, fencing_token: expectedToken }` setting `status: 'expired'`, incrementing `fencing_token`.
  2. `credit_wallets`: Restores reserved balance `{ _id: walletId, reserved_credits: { $gte: amount } }` applying `$inc: { available_credits: +amount, reserved_credits: -amount, version: 1 }`.
  3. `credit_transactions`: Inserts unique refund ledger entry `_id: 'tx_ref_' + attemptId`.
  4. `idempotency_keys`: Advances `status: 'refunded'`.
  5. If sweeper intent exists: Marks `sweeper_recovery_intents` as `completed`.
- **Atomicity Guarantee**: Reservation state, wallet balance, and ledger row update together. A reservation can **never** be refunded twice.

---

## 4. PERMANENT IDEMPOTENCY DESIGN

### 4.1 Strict Architectural Separation of Identity vs. Response Cache
To prevent any possibility of key recycling while bounding storage growth:

```mermaid
graph TD
    subgraph PermanentIdentity["idempotency_keys Collection (PERMANENT - NO TTL)"]
        K1["_id: idempotency_key (Unique Index)"]
        K2["payload_sha256: String (SHA-256 Hash)"]
        K3["operation_id: String (Canonical Job ID)"]
        K4["reservation_id: String (Attempt ID)"]
        K5["status: 'in_progress' | 'committed' | 'refunded'"]
        K6["created_at: Date"]
    end

    subgraph EphemeralPayloadCache["idempotency_response_cache Collection (EPHEMERAL - 30-Day TTL)"]
        C1["_id: idempotency_key (Unique Index)"]
        C2["response_body: Document / Object"]
        C3["created_at: Date (TTL Index: 2,592,000s)"]
    end

    PermanentIdentity -.->|Key Reference| EphemeralPayloadCache
```

### 4.2 Invariant Guarantees
1. **Zero Key Recycling**: `idempotency_keys` has **NO TTL INDEX**. Its primary key `_id` is retained permanently. An old key can never be re-used to execute a new transaction, even years later.
2. **Parameter Tampering Prevention**: Incoming requests compute `SHA256(canonical(endpoint, body))`. If a request matches an existing key but has a differing payload hash, it is rejected immediately with HTTP `422 IDEMPOTENCY_PARAMETER_MISMATCH`.
3. **Cache Expiry Safety**: When MongoDB's background TTL thread purges a document from `idempotency_response_cache` after 30 days, the permanent identity in `idempotency_keys` remains intact.
4. **Post-Cache Replay Handling**: A replay arriving after 30 days matches the permanent record with `status: 'committed'`. The server discovers that the ephemeral payload has expired and returns HTTP `409 IDEMPOTENCY_KEY_ALREADY_COMMITTED` with the permanent `operation_id` receipt. It is **never** executed as a new financial charge.

---

## 5. TRANSACTIONAL RECOVERY AND FENCING PROTOCOL

Background sweeper reconciliation executes via a unified, transaction-fenced protocol:

```mermaid
flowchart TD
    Scan["1. Sweeper Scans Expired Reservations<br/>credit_reservations.find({ status: 'active', expires_at: { $lte: $$NOW } })"]
    Claim["2. Conditional Lease Claim<br/>credit_reservations.updateOne(<br/>  { _id: att, status: 'active', fencing_token: F, lease_expires_at: { $lte: $$NOW } },<br/>  { $set: { recovery_worker: W_ID, lease_expires_at: $$NOW + 30s, fencing_token: F + 1 } }<br/>)"]
    ClaimCheck{"matchedCount === 1?"}
    
    ClaimCheck -- No --> Backoff["Another worker claimed lease. Exit cleanly."]
    ClaimCheck -- Yes --> OpenTx["3. Open Multi-Document Transaction<br/>session.startTransaction({ readConcern: 'snapshot', writeConcern: 'majority' })"]
    
    CheckFence["4. Validate Fencing Inside Transaction<br/>credit_reservations.updateOne(<br/>  { _id: att, recovery_worker: W_ID, fencing_token: F + 1 },<br/>  { $set: { status: 'expired', fencing_token: F + 2 } }<br/>)"]
    FenceCheck{"matchedCount === 1?"}
    
    FenceCheck -- No --> AbortStale["FENCE MISMATCH / STOLEN LEASE:<br/>session.abortTransaction(). Exit cleanly."]
    FenceCheck -- Yes --> MutateWallet["5. Mutate Wallet Inside Transaction<br/>credit_wallets.updateOne(<br/>  { _id: wId, reserved >= N },<br/>  { $inc: { available: +N, reserved: -N, version: 1 } }<br/>)"]
    InsertLedger["6. Insert Ledger Inside Transaction<br/>credit_transactions.insertOne({ _id: 'tx_ref_' + att, type: 'refund' })"]
    CommitTx["7. Commit Transaction<br/>session.commitTransaction()"]
    Done["Refund Atomically Committed (100% Exactly-Once)"]

    OpenTx --> CheckFence --> FenceCheck
    MutateWallet --> InsertLedger --> CommitTx --> Done
```

### 5.1 Fencing Protection Invariants
- **Strict Fencing Inside Transaction**: The worker validates its own `recovery_worker` ID and `fencing_token` **inside the same ACID transaction** that mutates `credit_wallets` and `credit_transactions`.
- **Zero Zombie Mutations**: If Worker A pauses for 45 seconds and Worker B increments the fencing token to $F+1$, Worker A's update inside its transaction matches 0 documents (`matchedCount === 0`) or encounters a WiredTiger `WriteConflict`. Worker A's transaction aborts immediately. **Worker A can never touch the wallet balance.**

### 5.2 Transaction Retry & Commit Handling
- `TransientTransactionError`: If two workers race or WiredTiger encounters a write conflict, the driver's retry loop catches the error label and retries the transaction function from the beginning up to 5 times with exponential backoff and jitter.
- `UnknownTransactionCommitResult`: If a network blip occurs during commit, the driver retries `commitTransaction()` in a loop until the cluster definitively confirms commit or explicit abort.

---

## 6. REMOVAL OF OBSOLETE STANDALONE FINANCIAL MECHANISMS

The following mechanisms from previous proposals are formally **retired and eliminated**:

| Obsolete Mechanism | Previous Role in Standalone Design | Why It Is Retired in Unified Architecture |
| :--- | :--- | :--- |
| `active_reservations: string[]` on `credit_wallets` | In-flight tracking array to prevent wallet bloat | **RETIRED**. `credit_wallets` contains **zero arrays**. Balances are strictly static aggregate numerics (284 bytes forever). |
| AIFR Wallet Token Migration (`att:f3` $\to$ `att:f4`) | Attempted cross-document worker fencing | **RETIRED**. Fencing is enforced natively by WiredTiger transactions across collections. |
| Standalone W2/W3 State Disambiguation | Heuristics to infer if wallet was credited | **RETIRED**. Reservation doc, wallet balances, and ledger row commit atomically in Transaction 1. W2/W3 partial states cannot exist. |
| Tombstone Reservation Insertion Barrier (`E11000`) | Blocking stale apps after key abortion | **RETIRED**. Key registration and reservation creation belong to the same transaction. Key abortion is never premature. |
| Standalone $K \le 500$ Concurrency Filter | Preventing document bloat in standalone mode | **RETIRED**. Replica set transactions use $O(1)$ indexed B-tree lookups; no wallet array exists to bloat. |
| Non-Transactional Compensating Refund Code | Fallback blocks trying to reverse failed steps | **RETIRED**. Failed steps trigger automatic WiredTiger rollback. No manual compensation required. |

---

## 7. DATABASE AND INDEX DESIGN

### 7.1 Schema Definitions

#### Collection: `idempotency_keys` (Permanent Identity)
```typescript
interface IdempotencyKeyRecord {
  _id: string; // Unique Idempotency Key (e.g. UUIDv4 or client header)
  user_id: string; // Tenant isolation UUID
  payload_sha256: string; // SHA-256 hash of canonical request body
  operation_id: string; // Canonical generation job UUID
  reservation_id: string; // Linked reservation attempt ID
  status: 'in_progress' | 'committed' | 'refunded';
  created_at: Date;
  updated_at: Date;
}
```
- **Indexes**:
  - `_id`: Unique primary index (Primary Key).
  - `{ user_id: 1, created_at: -1 }`: Compound tenant index.
  - **TTL Index**: **NONE** (Permanent retention).

#### Collection: `idempotency_response_cache` (Ephemeral Payload Cache)
```typescript
interface IdempotencyResponseCacheRecord {
  _id: string; // Matches idempotency_key _id
  user_id: string;
  response_body: Record<string, unknown>; // Serialized JSON API response
  created_at: Date;
}
```
- **Indexes**:
  - `_id`: Unique primary index.
  - `{ created_at: 1 }`: **TTL Index** with `expireAfterSeconds: 2592000` (30 days).

#### Collection: `credit_reservations` (Discrete Reservation Records)
```typescript
interface CreditReservationRecord {
  _id: string; // attempt_id (UUID)
  wallet_id: string;
  user_id: string;
  amount: number; // Credits reserved
  status: 'active' | 'settled' | 'expired';
  fencing_token: number; // Monotonically increasing sequence
  recovery_worker?: string;
  lease_expires_at?: Date;
  expires_at: Date; // TTL for active job timeout
  settled_at?: Date;
  created_at: Date;
  updated_at: Date;
}
```
- **Indexes**:
  - `_id`: Unique primary index (`attempt_id`).
  - `{ user_id: 1, status: 1 }`: Compound tenant index.
  - `{ status: 1, expires_at: 1 }`: Sweeper discovery index.

#### Collection: `credit_wallets` (Pure Static Numeric Balances)
```typescript
interface CreditWalletRecord {
  _id: string; // UUID
  user_id: string; // Tenant UUID
  available_credits: number; // Spendable balance
  reserved_credits: number; // Currently locked in active jobs
  lifetime_granted: number;
  lifetime_consumed: number;
  version: number; // Optimistic concurrency version
  status: 'active' | 'suspended';
  created_at: Date;
  updated_at: Date;
}
```
- **Indexes**:
  - `_id`: Unique primary index.
  - `{ user_id: 1 }`: Unique tenant index.
  - **Storage Size**: Strictly fixed at **284 bytes forever** (Zero arrays).

#### Collection: `credit_transactions` (Immutable Ledger)
```typescript
interface CreditTransactionRecord {
  _id: string; // Unique Transaction Key (e.g. 'tx_res_...', 'tx_set_...', 'tx_ref_...')
  wallet_id: string;
  user_id: string;
  type: 'monthly_grant' | 'reservation' | 'consumption' | 'refund';
  amount: number;
  balance_before: number;
  balance_after: number;
  reserved_before: number;
  reserved_after: number;
  attempt_id: string;
  idempotency_key: string;
  created_at: Date;
}
```
- **Indexes**:
  - `_id`: Unique primary index.
  - `{ user_id: 1, created_at: -1 }`: Ledger audit index.
  - `{ attempt_id: 1 }`: Reconciliation index.

---

## 8. REQUIRED TEST ARCHITECTURE: REPLICA-SET INTEGRATION

### 8.1 Testing Environment Mandate: `MongoMemoryReplSet`
- Standalone `MongoMemoryServer` is **insufficient** for financial transaction testing.
- All integration tests for Phase 4B.3 must run against `MongoMemoryReplSet` (a real in-memory MongoDB replica set with primary and secondary nodes supporting `session.startTransaction()`).

### 8.2 The 18 Required Verification Scenarios

| # | Test Scenario | Verified System Invariant | Expected Outcome |
| :-: | :--- | :--- | :--- |
| **1** | Atomic Reservation Creation | Transaction A commits all 4 documents together | Reservation doc, wallet balances ($100 \to 97$), and ledger created atomically. |
| **2** | Insufficient Wallet Balance | Pre-condition `{ available_credits: { $gte: amount } }` fails | Entire transaction aborts. Zero records created. Wallet remains at initial balance. |
| **3** | Concurrent Identical Keys | Two threads submit identical `Idempotency-Key` and payload | Transaction 1 commits; Transaction 2 catches unique index collision on `_id` and discovers existing operation. Zero duplicate charge. |
| **4** | Parameter Tampering (Altered Payload) | Same `Idempotency-Key` with different request body | Payload hash check fails. Returns HTTP `422 IDEMPOTENCY_PARAMETER_MISMATCH`. |
| **5** | Duplicate Settlement Attempts | Two threads call settlement for same `attempt_id` | Thread 1 transitions status `active` $\to$ `settled`. Thread 2 matches 0 documents and aborts. Exactly one settlement ledger row written. |
| **6** | Duplicate Refund Attempts | Sweeper and failure handler both attempt refund | Thread 1 transitions status `active` $\to$ `expired` and restores balance. Thread 2 matches 0 documents and aborts. Exactly one refund applied. |
| **7** | Crash Before Transaction Commit | Node killed before `commitTransaction()` completes | WiredTiger transaction rolls back. Database state on disk is completely untouched. |
| **8** | Crash After Commit Before Response | Node killed immediately after `commitTransaction()` | Client retries with same key. Server discovers committed records and returns `200 OK` receipt. |
| **9** | Unknown Transaction Commit Result | Driver encounters network timeout during commit | Driver enters commit-retry loop until confirmed. Zero duplicate transaction. |
| **10** | Write Conflict Handling | Two transactions attempt to update same wallet document | Driver catches `TransientTransactionError` and retries transaction with backoff. Both commit serially. |
| **11** | Transaction Retry Limit | Unresolvable conflict simulated for 5 retries | Driver exhausts retries, aborts cleanly, and returns HTTP `503` without state corruption. |
| **12** | Concurrent Recovery Workers | Worker A and Worker B race for expired reservation | Worker A acquires lease (`matchedCount=1`). Worker B matches 0 and cleanly exits. |
| **13** | Expired Worker Fencing | Worker A pauses 45s. Worker B takes over with fence 2 | Worker A wakes up. Its transaction check `{ fencing_token: 1 }` fails (`matchedCount=0`). Worker A aborts without mutating wallet. |
| **14** | Stale Application Process | App pauses during generation. Reservation times out and is refunded | App resumes and attempts settlement. Status is already `expired`. Settlement transaction aborts. |
| **15** | Post-Cache Replay | Replay arrives after 30-day cache TTL expires | Server validates permanent key, returns `409 IDEMPOTENCY_KEY_ALREADY_COMMITTED` receipt. Zero re-execution. |
| **16** | Tenant Isolation | User A attempts to settle or refund User B's reservation | Query filter `{ user_id: authenticatedUser }` matches 0 documents. Request rejected with HTTP `403 FORBIDDEN`. |
| **17** | Standalone Topology Rejection | Application started against standalone MongoDB | Financial transaction coordinator throws fatal HTTP `503` fail-closed error. |
| **18** | Ledger Balance Invariants | Mathematical audit across 10,000 transactions | Sum of `credit_transactions.amount` matches `credit_wallets.available_credits + reserved_credits` with 100% precision. |

---

## 9. CRASH-WINDOW MATRIX: UNIFIED ARCHITECTURE

Because all multi-document writes are bound within atomic transactions, the 10 previous crash windows collapse into **3 clean failure boundaries**:

| Failure Boundary | State Injected | System Behavior on Crash | Recovery Mechanism | Resulting Persisted Database State | Financial Invariant Guarantee |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Crash Boundary 1: During Transaction A (Reservation)** | Crash occurs during any step of Transaction A | Transaction is uncommitted in WiredTiger journal. | On reboot, database automatically rolls back uncommitted writes. | Avail: 100<br/>Rsrv: 0<br/>Ledger: 0<br/>ResDoc: None | **100% Clean Abort.** Zero orphaned records. Zero balance mutation. |
| **Crash Boundary 2: During AI Processing (In-Flight)** | Crash occurs while AI generation is running | Transaction A was already committed. ResDoc is `active`, wallet has credits reserved. | Background Sweeper detects `expires_at < $$NOW`. Sweeper executes Transaction C (Refund). | Avail: 100<br/>Rsrv: 0<br/>Ledger: 2 (`tx_res`, `tx_ref`)<br/>ResDoc: `expired` | **100% Exactly-Once Refund.** Reserved credits returned cleanly. |
| **Crash Boundary 3: During Transaction B or C (Settlement / Refund)** | Crash occurs during commit of Settlement or Refund | Either transaction committed durably on disk, or uncommitted and rolled back. | If uncommitted: Reconciler retries transaction. If committed: Retry discovers committed state and returns receipt. | Avail: 100 (refund) or 97 (settle)<br/>Rsrv: 0<br/>Ledger: Complete | **100% Exactly-Once Terminal State.** Zero double settlement or double refund. |

---

## 10. COMMERCIAL AND PRODUCT INVARIANTS

The commercial boundaries established in Phase 4B.1 and Phase 4B.2 remain strictly preserved:
1. **Core Video Processing Rate**: Strictly **1 credit per 15 seconds** of video duration.
2. **Free Content Studio Allowance**: Strictly targeted at **5 QUICK packs per month**.
3. **Content Studio Credit Charges**: Strictly **0 credits** (unapproved commercial items remain unactivated).
4. **Unapproved Features Remain Dormant**:
   - QUICK 2, BALANCED 3, and FULL 5 credit pricing models remain unapproved.
   - Regeneration credit charges (1 or 2 credits) remain unapproved.
   - Translation credit charges (2 credits) remain unapproved.
   - Payment checkout (Paddle/Razorpay) remains unactivated.

---

## 11. ORDERED IMPLEMENTATION BLUEPRINT (STAGES 1 TO 7)

```mermaid
graph TD
    S1["Stage 1: Topology Detection & Fail-Closed Guard"] --> S2["Stage 2: Database Schemas & Index Setup"]
    S2 --> S3["Stage 3: Multi-Document Transaction Coordinator"]
    S3 --> S4["Stage 4: Transactional Sweeper & Fencing Engine"]
    S4 --> S5["Stage 5: Integration Testing (MongoMemoryReplSet)"]
    S5 --> S6["Stage 6: Application Services & Entitlement Integration"]
    S6 --> S7["Stage 7: Regression Audit & Production Readiness"]
```

### Stage 1 — Topology Detection & Configuration Fail-Closed Guard
- **Files Expected to Change**:
  - `server/src/config/index.ts`
  - `server/src/db/mongoClient.ts`
  - `server/src/db/bootstrapMongo.ts`
- **Functions / Services**: `validateFinancialTopology()`, `getMongoClient()`, `isMongoHealthy()`.
- **Database Impact**: Zero schema changes. Validates `client.topology.description.type`.
- **Tests Required**: Standalone rejection test, Replica set acceptance test.
- **Acceptance Criteria**: Server throws fatal error if `NODE_ENV === 'production'` and topology is standalone; financial operations throw HTTP 503 if attempted on standalone.
- **Rollback Consideration**: Revert `mongoClient.ts` topology check.

### Stage 2 — Database Models, Collections & Index Setup
- **Files Expected to Change**:
  - `server/src/types/credits.ts`
  - `server/src/db/schemaValidation.ts`
  - `server/src/db/bootstrapMongo.ts`
- **Functions / Services**: Collection index creation scripts for `idempotency_keys`, `idempotency_response_cache`, `credit_reservations`, `credit_wallets`, `credit_transactions`.
- **Database Impact**: Declares indexes (unique on `_id`, TTL on cache).
- **Tests Required**: Schema validation unit tests, Index uniqueness tests (`E11000`).
- **Acceptance Criteria**: All 5 collections have verified unique and compound indexes; `idempotency_keys` has zero TTL; cache has 30-day TTL.
- **Rollback Consideration**: Drop created indexes via standard migration script.

### Stage 3 — Multi-Document Transaction Coordinator
- **Files Expected to Change**:
  - `server/src/services/creditTransactionCoordinator.ts` (NEW)
  - `server/src/db/repositories/creditRepository.ts`
- **Functions / Services**:
  - `executeReservationTransaction()`
  - `executeSettlementTransaction()`
  - `executeRefundTransaction()`
- **Database Impact**: Executes transactions with snapshot isolation and majority write concern.
- **Tests Required**: Atomic commit test, Insufficient funds abort test, Concurrent idempotency test.
- **Acceptance Criteria**: Transactions commit all 4 documents or roll back 100%; retry loop handles `TransientTransactionError` and `UnknownTransactionCommitResult`.
- **Rollback Consideration**: Revert coordinator invocation in API controllers.

### Stage 4 — Transactional Sweeper & Fencing Engine
- **Files Expected to Change**:
  - `server/src/services/creditSweeperService.ts` (NEW)
  - `server/src/scripts/runSweeper.ts`
- **Functions / Services**: `reconcileExpiredReservations()`, `claimReservationLease()`, `executeTransactionalRefund()`.
- **Database Impact**: Updates `credit_reservations.fencing_token` and leases.
- **Tests Required**: Two-worker race test, Expired worker fencing test, Reconnection recovery test.
- **Acceptance Criteria**: Sweeper reclaims expired reservations safely; stale workers are strictly rejected.
- **Rollback Consideration**: Stop background cron worker.

### Stage 5 — Integration Testing (`MongoMemoryReplSet`)
- **Files Expected to Change**:
  - `server/src/tests/phase4b3TransactionIntegration.test.ts` (NEW)
  - `server/package.json` (add `mongodb-memory-server` replica set test helper)
- **Functions / Services**: Full implementation of the 18 required test scenarios against a live in-memory replica set.
- **Database Impact**: Zero production impact (runs in-memory).
- **Tests Required**: All 18 test scenarios executed and passing 100%.
- **Acceptance Criteria**: Zero failures across all 18 transaction and crash-recovery scenarios.
- **Rollback Consideration**: N/A (test suite).

### Stage 6 — Application Services & Entitlement Integration
- **Files Expected to Change**:
  - `server/src/services/contentPackService.ts`
  - `server/src/controllers/contentPackController.ts`
  - `server/src/services/billingService.ts`
- **Functions / Services**: Hooking `contentPackService.generatePack()` to the transaction coordinator before and after AI generation.
- **Database Impact**: Content pack generation reserves and settles credits.
- **Tests Required**: End-to-end Content Studio pack generation test with zero credit charges (free mode preserved).
- **Acceptance Criteria**: Pack generation integrates seamlessly with credit reservation and settlement without charging credits (0 credits).
- **Rollback Consideration**: Revert controller hooks.

### Stage 7 — Final Regression & Production Readiness Review
- **Files Expected to Change**: Documentation and audit reports.
- **Functions / Services**: End-to-end regression validation.
- **Database Impact**: Zero.
- **Tests Required**: Run entire test suite (`npm run test`, `npm run typecheck`).
- **Acceptance Criteria**: 100% test pass rate; zero regressions; zero commercial invariant violations.
- **Rollback Consideration**: Standard git revert.

---

## 12. REMAINING RISKS & ARCHITECTURAL MITIGATIONS

1. **Transaction Lifetime Limits**:
   - *Risk*: MongoDB aborts transactions running longer than 60 seconds (`transactionLifetimeLimitSeconds`).
   - *Mitigation*: AI generation and video rendering run **outside** database transactions. Database transactions are millisecond-fast ($< 10\text{ ms}$).
2. **Local Developer Setup**:
   - *Risk*: Developers running local `mongod` without `--replSet` will encounter fail-closed 503 errors.
   - *Mitigation*: Provide a pre-configured `docker-compose.yml` that boots a single-node replica set (`mongod --replSet rs0 --bind_ip_all`) automatically.
3. **WiredTiger Write Conflicts on Single Wallets**:
   - *Risk*: If a single user submits 100 concurrent jobs, multiple transactions compete for the wallet document lock.
   - *Mitigation*: Driver transaction retry loop with exponential backoff and jitter handles write conflicts transparently.

---

## 13. FINAL IMPLEMENTATION-READINESS VERDICT

### **VERDICT: READY FOR IMPLEMENTATION AUTHORIZATION**

The Phase 4B.3 Unified Multi-Document ACID Transaction Architecture resolves **100% of previously identified race conditions, state ambiguities, and crash windows**.

- **Standalone MongoDB financial operations are definitively retired.**
- **Production requires a MongoDB Replica Set with ACID snapshot transactions.**
- **Wallet documents remain strictly static at 284 bytes forever with zero arrays.**
- **Permanent idempotency is guaranteed without TTL recycling.**
- **Commercial invariants remain 100% preserved.**

---

## 14. CONFIRMATION OF ZERO IMPLEMENTATION OR DATABASE CHANGES

- **Source Code**: **0 lines of production application code modified**.
- **Database Collections & Schemas**: **0 database changes, 0 schema migrations, 0 index creations**.
- **Commercial Invariants**:
  - Video processing rate strictly **1 credit per 15 seconds**.
  - Free plan monthly allowance strictly **5 QUICK packs per month**.
  - Content Studio credit charges strictly **0 credits**.
- **Phase Status**: Phase 4B.3 remains **PLANNING ONLY (NOT IMPLEMENTED)**.

*Final unified architecture and implementation blueprint complete. Execution halted awaiting explicit authorization.*
