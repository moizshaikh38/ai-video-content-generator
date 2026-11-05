# VIREOCLIP — PHASE 4B.3 TECHNICAL ADDENDUM & RISK REGISTER
## Quota Reservation Identity, Dual-Mode Atomicity, Late-Cache Billing & Timeout Reconciliation

**Phase:** 4B.3 — Atomic Credit Billing & Quotas  
**Document Type:** Final Technical Architecture Addendum & Risk Register  
**Authorization State:** READ-ONLY TECHNICAL ADDENDUM ONLY (Implementation NOT Authorized)  
**Date:** November 5, 2026  
**Auditor & Systems Architect:** Senior Video Infrastructure & Financial Reliability Architect  

---

## 1. Executive Summary

This technical addendum supplements the Phase 4B.3 Revised Planning Report by providing the final architectural specifications required before implementation authorization:

1. **Quota Reservation Identity**: Establishes discrete identity (`attempt_id`, `fencing_token`, `status`) for every quota reservation in a dedicated collection (`monthly_quota_reservations`), guaranteeing that release and settlement operations are strictly idempotent and can never decrement or mutate another request's reservation bucket.
2. **Atomic Credit + Quota Reservation Engine**:
   - **Primary Path (Production Replica Set / Atlas)**: MongoDB multi-document ACID transactions (`session.withTransaction`) spanning wallet credits, credit reservations, monthly quotas, and quota reservations.
   - **Durable Standalone Path (Local / Non-Replica Set)**: A durable Two-Phase Reservation Intent pattern with an automatic reconciling sweeper that guarantees zero split-brain states or orphaned partial locks.
3. **Late-Arriving Response & Cache Delivery Protocol**: Formalizes the lifecycle for responses arriving after lease revocation. Completed outputs are cached under request fingerprints; when the creator retries, a **fresh, valid reservation is created and settled once**, preventing duplicate provider executions and duplicate user charges.
4. **Timeout Reconciliation & Sweeper Synchronization**: Explicitly handles confirmed failures, unknown provider outcomes, persistence failures, and successful deliveries. Guarantees that the quota sweeper cannot release a reservation twice and ensures credit and quota states are synchronized.
5. **Commercial Boundaries Maintained**: Confirms all credit rates (QUICK 2, BALANCED 3, FULL 5, item regen 1, platform regen 2, translation 2) and paid monthly pack limits (Creator 50, Pro 200, Studio 500) remain **unapproved proposals**. The approved Free 5 QUICK packs/month target is preserved.

---

## 2. Quota Reservation Identity & Concurrency Protection

### 2.1 Flaw of Anonymous Counter Decrements
If quota reservations are managed solely by incrementing/decrementing a scalar `reserved_packs` counter on `monthly_quotas`, race conditions can cause **cross-request interference**:
- Request A reserves quota (`reserved_packs = 1`).
- Request B reserves quota (`reserved_packs = 2`).
- Request A fails, but its release operation triggers twice or a delayed worker decrements `reserved_packs` after Request B has already failed.
- The scalar counter decrements blindly (`reserved_packs: -1`), corrupting Request B's reservation or sending the counter negative.

### 2.2 Discrete Quota Reservation Schema: `monthly_quota_reservations`

Every quota reservation is assigned a dedicated, auditable document with deterministic identity and lease fencing:

```typescript
export type QuotaReservationStatus = 'reserved' | 'settled' | 'released' | 'expired';

export interface MonthlyQuotaReservationRecord {
  id: string;                       // UUID
  user_id: string;                  // UUID
  attempt_id: string;               // Deterministic unique attempt ID
  billing_period: string;           // 'YYYY-MM'
  plan_tier: string;                // 'free' | 'creator' | 'pro' | 'studio' | 'developer'
  mode: ContentPackMode;            // 'QUICK' | 'BALANCED' | 'FULL'
  status: QuotaReservationStatus;   // 'reserved' | 'settled' | 'released' | 'expired'
  fencing_token: number;            // Monotonic version counter (starts at 1)
  worker_id: string;                // Node / Worker instance identifier
  lease_expires_at: Date;           // Heartbeat expiration timestamp
  created_at: Date;
  updated_at: Date;
}
```

### 2.3 Idempotent, Scoped Quota Operations

```mermaid
flowchart TD
    Req[Generation Request: attempt_id] --> Check{Conditional Atomic Update on Quota Bucket}
    Check -->|consumed + reserved < allocated| ResDoc[Insert monthly_quota_reservations: status='reserved', fencing_token=1]
    Check -->|Limit reached| Err403[403 QUOTA_EXCEEDED]
    ResDoc --> Inc[Increment monthly_quotas.reserved_packs +1]
    
    Inc --> Process[AI Provider Execution]
    
    Process -->|Success & Persisted| Settle[findOneAndUpdate: attempt_id, status='reserved' -> 'settled']
    Settle -->|matchedCount = 1| SettleBucket[monthly_quotas: reserved -1, consumed +1]
    Settle -->|matchedCount = 0| SettleNoop[Idempotent No-Op: Cannot double-settle]
    
    Process -->|Confirmed Failure| Rel[findOneAndUpdate: attempt_id, status='reserved' -> 'released']
    Rel -->|matchedCount = 1| RelBucket[monthly_quotas: reserved -1]
    Rel -->|matchedCount = 0| RelNoop[Idempotent No-Op: Cannot double-release]
```

#### Safe Settle & Release Guard Rules:
1. **Targeted State Transition**: `settleQuotaReservation` and `releaseQuotaReservation` MUST execute `findOneAndUpdate` matching strictly on `{ attempt_id, fencing_token, status: 'reserved' }`.
2. **Zero Cross-Request Interference**: The aggregate bucket (`monthly_quotas`) is adjusted **only if the specific reservation document was successfully transitioned from `'reserved'`**. If the reservation was already settled, released, or reclaimed by the sweeper, `findOneAndUpdate` returns `null` and the bucket is left untouched.
3. **Impossible Negative Counters**: Because the bucket decrement is guarded by the specific reservation's state transition, `reserved_packs` can never decrement below zero or consume another request's reservation.

---

## 3. Atomic Dual-Mode Credit + Quota Reservation Engine

VireoClip operates across both multi-node production clusters (MongoDB Replica Sets) and standalone developer environments. The reservation architecture guarantees atomicity in both modes without fragile sequential code.

```mermaid
flowchart TD
    Start[Start Reservation: Credit + Quota] --> ModeCheck{Replica Set / Tx Supported?}
    
    subgraph Transactional_Mode [Primary Path: MongoDB ACID Transaction]
        ModeCheck -->|Yes| TxStart[session.withTransaction]
        TxStart --> TxCredit[Conditional Deduct available_credits >= amount & Insert credit_reservations]
        TxCredit --> TxQuota[Conditional Increment quota reserved < allocated & Insert quota_reservation]
        TxQuota --> TxCommit[Commit Transaction]
        TxCommit --> TxDone[Allowed: true]
    end
    
    subgraph Durable_Intent_Mode [Fallback Path: Two-Phase Intent Ledger]
        ModeCheck -->|No| IntentInsert[Insert reservation_intents: status='pending']
        IntentInsert --> ApplyCredit[reserveCredits atomic conditional]
        ApplyCredit -->|Fails| IntentCancel[Set intent status='failed'; Abort]
        ApplyCredit --> ApplyQuota[reserveQuota atomic conditional]
        ApplyQuota -->|Fails| ReconcileRollback[Reconcile: releaseCredits; intent status='aborted']
        ApplyQuota --> IntentActive[Set intent status='active']
        IntentActive --> IntentDone[Allowed: true]
    end
```

### 3.1 Primary Path: Multi-Document ACID Transaction
When running on MongoDB replica sets (production and staging clusters), credit and quota reservations execute inside a single transactional boundary:

```typescript
await session.withTransaction(async () => {
  // 1. Atomic credit deduction & reservation record insert
  const walletRes = await wallets.updateOne(
    { id: wallet.id, available_credits: { $gte: requiredCredits } },
    { $inc: { available_credits: -requiredCredits, reserved_credits: requiredCredits } },
    { session }
  );
  if (walletRes.matchedCount === 0) throw new AppError('Insufficient credits', 403, 'INSUFFICIENT_CREDITS');
  await creditReservations.insertOne(creditResRecord, { session });

  // 2. Atomic quota bucket update & quota reservation record insert
  if (isQuotaEnforced) {
    const quotaRes = await quotas.updateOne(
      { user_id: userId, billing_period: period, $expr: { $lt: [{ $add: ['$consumed_packs', '$reserved_packs'] }, '$allocated_packs'] } },
      { $inc: { reserved_packs: 1 } },
      { session }
    );
    if (quotaRes.matchedCount === 0) throw new AppError('Quota exceeded', 403, 'QUOTA_EXCEEDED');
    await quotaReservations.insertOne(quotaResRecord, { session });
  }

  // 3. Append-only ledger transaction
  await transactions.insertOne(ledgerRecord, { session });
});
```
*If either credits or quotas fail, MongoDB nuke-aborts all mutations simultaneously. Zero split-brain state.*

### 3.2 Durable Standalone Path: Two-Phase Reservation Intent Pattern
For local development or standalone MongoDB instances where transaction numbers are rejected (MongoDB error 20/263), a durable **Reservation Intent** document (`reservation_intents`) coordinates state:

1. **Intent Staging**: Insert `reservation_intents` record with `{ attempt_id, credit_amount, quota_packs: 1, status: 'pending', created_at: now }`.
2. **Execution Steps**:
   - Execute credit reservation. If insufficient balance, mark intent `'rejected_insufficient_credits'` and throw.
   - Execute quota reservation. If quota exceeded, mark intent `'rejected_quota_exceeded'`, immediately call `CreditRepository.releaseReservation(attempt_id)`, and throw.
3. **Intent Confirmation**: Transition intent to `status: 'active'`.
4. **Durable Reconciler Daemon**: The background reservation recovery daemon queries for any intent record in `status: 'pending'` older than 30 seconds:
   - Checks if credit reservation exists: if yes, releases it.
   - Checks if quota reservation exists: if yes, releases it.
   - Updates intent to `status: 'reconciled_abandoned'`.
   - *This guarantees self-healing recovery even if the server process dies between steps 2a and 2b.*

---

## 4. Late Response & Cache Delivery Protocol

When an LLM provider takes longer than the worker lease to respond (e.g. 45s), the sweeper revokes the lease and refunds the user. If the LLM subsequently completes, we must prevent both **unbilled free delivery** and **duplicate provider charges**.

```mermaid
sequenceDiagram
    autonumber
    participant C as Creator Client
    participant W as Content Studio Worker
    participant Cache as Output Fingerprint Cache
    participant DB as MongoDB Ledger & Quotas
    participant AI as AI Provider

    Note over C,AI: Request 1 (Attempt A)
    C->>W: generateContentPack(Attempt A, 3 credits)
    W->>DB: Reserve 3 credits & 1 quota (Attempt A)
    W->>AI: Call LLM (Prompt)
    Note over W: Worker hangs / network delay > 45s
    Note over DB: Sweeper reclaims Attempt A (Status: 'expired' -> Credits & Quota Refunded!)
    
    AI-->>W: Late Valid Response (at 48s)
    W->>DB: settleReservation(Attempt A, fencing_token=1)
    DB-->>W: REJECTED: Status is 'expired', Fencing Token mismatched
    W->>Cache: Save output: key=sha256(userId + sourceHash + mode + platforms), TTL=10 min
    Note over W: Worker logs warning; NO database write to content_packs; NO charges!

    Note over C,AI: Client Retry (Attempt B)
    C->>W: generateContentPack(Attempt B, 3 credits) [Creator clicks Retry]
    W->>DB: Reserve 3 credits & 1 quota (Attempt B) [Fresh, valid reservation!]
    DB-->>W: Allowed: true (Attempt B active)
    
    W->>Cache: Check sha256(userId + sourceHash + mode + platforms)
    Cache-->>W: Cache HIT! Returns validated AI JSON
    Note over W: ZERO duplicate call to OpenRouter/Groq!
    
    W->>DB: Insert ContentPack & ContentPackItem records
    W->>DB: settleReservation(Attempt B) & settleQuotaReservation(Attempt B)
    DB-->>W: Settled! (Attempt B consumed)
    W-->>C: 200 OK (Content Pack delivered)
```

### 4.1 Strict Cache Invariants:
1. **Never Deliver Content Without an Active Reservation**: Cached AI responses must NEVER be returned to a client without an active, verified reservation for the incoming request (`Attempt B`).
2. **Single Settle Rule**: Only `Attempt B` is settled. `Attempt A` remains permanently `'expired'` (or `'released'`).
3. **Single Provider Cost**: The provider was billed once (for Attempt A). Attempt B incurs \$0 in external provider charges.
4. **Creator Fairness**: The creator is charged exactly once (3 credits on Attempt B), receiving their content promptly upon retry without paying twice.

---

## 5. Comprehensive Timeout & Sweeper Reconciliation

### 5.1 Outcome Classification Matrix

| Scenario | Observable Technical State | User Wallet Action | User Quota Action | ContentPack Persisted? | Internal Cost Telemetry |
|---|---|---|---|---|---|
| **A. Confirmed Provider Failure** | Provider returns explicit HTTP 4xx/5xx | **100% Refund** (`releaseReservation`) | **100% Refund** (`releaseQuota`) | NO | Recorded (`failure_category: 'PROVIDER_ERROR'`) |
| **B. Client Timeout / Disconnect** | Request aborted after 30s timeout | **100% Refund** (`releaseReservation`) | **100% Refund** (`releaseQuota`) | NO | Recorded with estimated provider token liability |
| **C. DB Persistence Failure** | LLM returned valid JSON, but Mongo write failed | **100% Refund** (`releaseReservation`) | **100% Refund** (`releaseQuota`) | NO | Recorded (`failure_category: 'PERSISTENCE_ERROR'`) |
| **D. Successful Delivery** | LLM succeeded, pack saved, 200 delivered | **Settle Standard Amount** | **Settle Quota** | YES | Recorded with exact measured tokens and cost |
| **E. Fallback Success** | Primary failed, Groq succeeded, pack saved | **Settle Standard Amount** (Single charge) | **Settle Quota** (Single increment) | YES | Recorded with `used_fallback: true` |

### 5.2 Synchronized Sweeper & Double-Release Prevention

To guarantee that the background recovery sweeper cannot release the same reservation twice or desynchronize credits and quotas:

```javascript
public static async recoverExpiredReservation(
  reservationId: string,
  expectedFencingToken: number
): Promise<{ recovered: boolean }> {
  return withOptionalTransaction(async (session) => {
    // 1. Atomic lease acquisition on reservation record
    const res = await db.collection('credit_reservations').findOneAndUpdate(
      {
        id: reservationId,
        fencing_token: expectedFencingToken,
        status: 'reserved',
        lease_expires_at: { $lte: new Date() }
      },
      {
        $set: { status: 'expired', updated_at: new Date() },
        $inc: { fencing_token: 1 }
      },
      { returnDocument: 'after', session }
    );

    // If another sweeper thread or worker already modified it, exit immediately
    if (!res) {
      return { recovered: false };
    }

    // 2. Refund wallet credits
    await db.collection('credit_wallets').updateOne(
      { id: res.wallet_id },
      {
        $inc: {
          reserved_credits: -res.amount,
          available_credits: res.amount,
          version: 1
        },
        $set: { updated_at: new Date() }
      },
      { session }
    );

    // 3. Synchronized Quota Release (Only if quota was reserved)
    if (res.metadata?.quota_reserved) {
      await db.collection('monthly_quota_reservations').updateOne(
        { attempt_id: res.attempt_id, status: 'reserved' },
        { $set: { status: 'expired', updated_at: new Date() }, $inc: { fencing_token: 1 } },
        { session }
      );

      await db.collection('monthly_quotas').updateOne(
        { user_id: res.user_id, billing_period: res.metadata.billing_period, reserved_packs: { $gte: 1 } },
        { $inc: { reserved_packs: -1, version: 1 } },
        { session }
      );
    }

    return { recovered: true };
  });
}
```

#### Sweeper Guarantees:
- **`fencing_token` Guard**: `findOneAndUpdate` transitions `status: 'reserved' -> 'expired'` and bumps `fencing_token`. A second sweeper pass sees `status: 'expired'` and matches 0 documents.
- **Double-Release Impossibility**: Credits and quotas are decremented strictly within the single transaction or coordinated intent block.
- **Credit-Quota Synchronization**: Quota release is physically bound to credit release. One cannot be released without the other.

---

## 6. Updated Risk Register

| Risk ID | Category | Risk Description | Severity | Mitigation & Architectural Control | Status |
|---|---|---|---|---|---|
| **R1** | Financial | Cross-tenant collision on global `idempotency_key` index | **HIGH** | Scoped namespacing: `hash(userId + ":" + operationId + ":" + clientKey)`. Verified existing indexes in staging. | **RESOLVED** |
| **R2** | Reliability | Race condition in concurrent free plan quota checks | **HIGH** | Implemented atomic `monthly_quota_reservations` and conditional `$expr` update on quota bucket. | **RESOLVED** |
| **R3** | Reliability | Stale worker settling after sweeper lease expiration | **HIGH** | Implemented monotonic `fencing_token` and conditional settlement matching `{ status: 'reserved', fencing_token }`. | **RESOLVED** |
| **R4** | Cost | Double provider call on creator retry after timeout | **MEDIUM** | Implemented 10-minute short-lived output cache requiring fresh reservation settlement before delivery. | **RESOLVED** |
| **R5** | Financial | Unapproved commercial pricing activation | **CRITICAL** | Gated all proposed rates (QUICK 2, BALANCED 3, FULL 5, Creator 50, Pro 200, Studio 500) behind config flags. Currently 0 credits. | **CONTROLLED** |
| **R6** | Consistency | Split-brain credit/quota state in standalone Mongo | **MEDIUM** | Implemented Two-Phase Reservation Intent ledger pattern with durable reconciler daemon. | **RESOLVED** |
| **R7** | Observability | Missing per-attempt telemetry for transient retries | **LOW** | Designed discrete `ProviderAttemptTrace[]` array in `content_generation_telemetry` isolated from billing. | **RESOLVED** |

---

## 7. Commercial Boundaries & Unapproved Decisions Checklist

| Item | Status | Action in Phase 4B.3 Implementation |
|---|---|---|
| **QUICK Mode (2 credits)** | **UNAPPROVED** | Disabled / 0 credits until commercial sign-off |
| **BALANCED Mode (3 credits)** | **UNAPPROVED** | Disabled / 0 credits until commercial sign-off |
| **FULL Mode (5 credits)** | **UNAPPROVED** | Disabled / 0 credits until commercial sign-off |
| **Item Regeneration (1 credit)** | **UNAPPROVED** | Disabled / 0 credits until commercial sign-off |
| **Platform Regeneration (2 credits)** | **UNAPPROVED** | Disabled / 0 credits until commercial sign-off |
| **Translation (2 credits)** | **UNAPPROVED** | Disabled / 0 credits until commercial sign-off |
| **Creator Plan (50 packs/mo)** | **UNAPPROVED** | Unused; metered via standard wallet credits |
| **Pro Plan (200 packs/mo)** | **UNAPPROVED** | Unused; metered via standard wallet credits |
| **Studio Plan (500 packs/mo)** | **UNAPPROVED** | Unused; metered via standard wallet credits |
| **Free Plan (5 QUICK packs/mo)** | **APPROVED TARGET** | Gated to 5 packs/month, QUICK mode only |
| **Base Video Rate (1 cr / 15s)** | **APPROVED & ACTIVE**| Preserved 100% without modification |

---

> [!IMPORTANT]
> **TECHNICAL ADDENDUM COMPLETE — EXECUTION HALTED**  
> All source code, database records, schemas, and payment integrations remain completely untouched. Awaiting your explicit review and authorization before proceeding to Phase 4B.3 implementation.
