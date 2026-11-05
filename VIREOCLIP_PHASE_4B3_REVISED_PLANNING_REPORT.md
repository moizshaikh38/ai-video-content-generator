# VIREOCLIP — PHASE 4B.3 REVISED PLANNING REPORT
## Atomic Credit Billing, Quota Lifecycle, Lease Safety, Idempotency & Financial Reconciliation

**Phase:** 4B.3 — Atomic Credit Billing & Quotas  
**Document Type:** Revised Technical & Financial Architecture Plan  
**Authorization State:** READ-ONLY PLANNING REVISION ONLY (Implementation NOT Authorized)  
**Date:** November 5, 2026  
**Auditor & Planning Architect:** Senior Video Infrastructure Engineer, Reliability Architect & Financial Systems Specialist  

---

## 1. Executive Summary & Scope Boundary

This document supersedes the initial Phase 4B.3 planning report, addressing all review findings and technical feedback with mathematical precision, distributed concurrency safety, and strict commercial transparency.

### Core Revisions Delivered:
1. **Unified & Reconciled Cost Table**: One single, mathematically consistent cost table covering all generation modes (QUICK, BALANCED, FULL), single-platform generation, item regeneration, platform regeneration, translation, and dual-provider fallback with exact token assumptions and formulas.
2. **Reconciled Credit Valuation**: Fully reconciled per-credit valuation for both Monthly and Yearly subscription plans across Creator, Pro, and Studio tiers, correcting previous valuation discrepancies.
3. **Reservation Lease & Stale-Worker Fencing Safety**: Replaced the static timeout model with an active **lease, heartbeat renewal, and monotonic fencing token architecture** that guarantees reservations cannot be released while a valid worker is running, and prevents stale workers from settling or releasing invalidated reservations.
4. **Concurrency-Safe Atomic Quota Architecture**: Designed an atomic monthly quota bucket model that eliminates the race condition inherent in non-atomic count-then-act checks, ensuring concurrent requests cannot exceed plan allowances.
5. **Provider Outcome Uncertainty & Reconciliation**: Established definitive protocol states for timeouts, disconnected clients, late-arriving provider completions, and database write failures.
6. **Scoped Idempotency & Existing Index Audit**: Verified existing MongoDB indexes on `credit_wallets`, `credit_reservations`, `credit_transactions`, and `content_packs`, and established multi-tenant scoping (`user_id:operation_id:idempotency_key`) to eliminate cross-tenant collisions.
7. **Strict Commercial Boundary Preservation**: Confirms that credit charging rates (`QUICK` 2, `BALANCED` 3, `FULL` 5, item regen 1, platform regen 2, translation 2) and paid monthly pack limits (Creator 50, Pro 200, Studio 500) remain **unapproved proposals**. The 1 credit per 15s video-processing rate remains completely untouched.

---

## 2. Reconciled Financial Calculations & Unit Economics

### 2.1 Provider Rates & Pricing References
*Verified as of November 2026 official developer pricing.*

- **Primary Provider**: OpenRouter — `openai/gpt-4o-mini`
  - Input (Prompt): **\$0.150** / 1,000,000 tokens (\$0.000150 / 1k tokens)
  - Output (Completion): **\$0.600** / 1,000,000 tokens (\$0.000600 / 1k tokens)
- **Fallback Provider**: Groq — `llama-3.3-70b-versatile`
  - Input (Prompt): **\$0.590** / 1,000,000 tokens (\$0.000590 / 1k tokens) — *$3.93x OpenRouter input*
  - Output (Completion): **\$0.790** / 1,000,000 tokens (\$0.000790 / 1k tokens) — *$1.32x OpenRouter output*

### 2.2 Reconciled Credit Valuation Across Subscription Tiers

A credit is not a fixed currency; its nominal dollar value depends on the subscription tier and billing interval:

$$\text{Credit Valuation} = \frac{\text{Subscription Price}}{\text{Granted Monthly Credits}}$$

| Plan Tier | Billing Interval | Price (USD) | Monthly Credits | Effective Valuation / Credit |
|---|---|---:|---:|---:|
| **Creator** | Monthly | \$12.00 / mo | 500 cr | **\$0.02400** (2.40¢) |
| **Creator** | Yearly (\$120/yr) | \$10.00 / mo | 500 cr | **\$0.02000** (2.00¢) |
| **Pro** | Monthly | \$24.00 / mo | 1,500 cr | **\$0.01600** (1.60¢) |
| **Pro** | Yearly (\$240/yr) | \$20.00 / mo | 1,500 cr | **\$0.01333** (1.33¢) |
| **Studio** | Monthly | \$49.00 / mo | 4,000 cr | **\$0.01225** (1.23¢) |
| **Studio** | Yearly (\$490/yr) | \$40.83 / mo | 4,000 cr | **\$0.01021** (1.02¢) |

*The nominal credit value ranges from **\$0.01021** (Studio Yearly) to **\$0.02400** (Creator Monthly).*

### 2.3 Master Cost-Assumption & Scenario Table

#### Calculation Formulas:
1. **OpenRouter Cost**:
   $$\text{Cost}_{\text{OR}} = \left(\text{Input Tokens} \times \frac{0.150}{10^6}\right) + \left(\text{Output Tokens} \times \frac{0.600}{10^6}\right)$$
2. **Groq Cost**:
   $$\text{Cost}_{\text{Groq}} = \left(\text{Input Tokens} \times \frac{0.590}{10^6}\right) + \left(\text{Output Tokens} \times \frac{0.790}{10^6}\right)$$
3. **Combined Fallback Cost**:
   If OpenRouter processes the prompt but encounters a transient 5xx/timeout or aborts mid-stream, OpenRouter bills for input tokens. Groq then processes the full prompt and generates completion:
   $$\text{Cost}_{\text{Combined}} = \left(\text{Input Tokens} \times \frac{0.150}{10^6}\right) + \text{Cost}_{\text{Groq}} = \left(\text{Input Tokens} \times \frac{0.740}{10^6}\right) + \left(\text{Output Tokens} \times \frac{0.790}{10^6}\right)$$

*Data Transparency Note*: Direct database inspection confirms **zero live customer observations** exist in `content_generation_telemetry` (only 19 local test fixture records). All P50, P90, P95, and Upper Bound figures are **modeled parameter scenarios**, NOT empirical customer measurements.

| Scenario / Operation | In Tokens | Out Tokens | OpenRouter Cost (USD) | Groq Cost (USD) | Combined Fallback Cost (USD) | Scenario Assumptions & Basis |
|---|---:|---:|---:|---:|---:|---|
| **QUICK Mode (Modeled P50 / Typ)** | 800 | 300 | **\$0.000300** | **\$0.000709** | **\$0.000829** | 1–2 platforms (Shorts/TikTok), short clip transcript summary |
| **QUICK Mode (Modeled P90)** | 1,200 | 400 | **\$0.000420** | **\$0.001024** | **\$0.001204** | 2 platforms, longer prompt instructions |
| **QUICK Mode (Modeled Upper Bound)**| 1,500 | 500 | **\$0.000525** | **\$0.001280** | **\$0.001505** | Parameter ceiling for QUICK mode |
| **BALANCED Mode (Modeled P50 / Typ)**| 1,800 | 650 | **\$0.000660** | **\$0.001576** | **\$0.001846** | All 6 platforms, 3–5m source transcript + OCR & visual summary |
| **BALANCED Mode (Modeled P90)** | 2,400 | 800 | **\$0.000840** | **\$0.002048** | **\$0.002408** | Dense video transcript, comprehensive multi-platform pack |
| **BALANCED Mode (Modeled P95)** | 3,000 | 900 | **\$0.000990** | **\$0.002481** | **\$0.002931** | High OCR text and object observation density |
| **BALANCED Mode (Modeled Upper Bound)**| 4,000 | 1,100 | **\$0.001260** | **\$0.003229** | **\$0.003829** | Max allowed transcript window for BALANCED |
| **FULL Mode (Modeled P50 / Typ)** | 3,200 | 1,100 | **\$0.001140** | **\$0.002757** | **\$0.003237** | All 6 platforms, chapters, deep alt-titles, expanded captions |
| **FULL Mode (Modeled P90)** | 4,500 | 1,350 | **\$0.001485** | **\$0.003721** | **\$0.004397** | Full transcript, extensive cross-platform variations |
| **FULL Mode (Modeled P95)** | 5,500 | 1,500 | **\$0.001725** | **\$0.004430** | **\$0.005255** | Long-form multi-segment speech context |
| **FULL Mode (Modeled Upper Bound)** | 7,000 | 1,800 | **\$0.002130** | **\$0.005552** | **\$0.006602** | Absolute parameter ceiling for FULL mode |
| **Single-Platform (Modeled Typ)** | 1,400 | 400 | **\$0.000450** | **\$0.001142** | **\$0.001352** | Single target (YouTube or X), tailored prompt schema |
| **Platform Regeneration (Modeled Typ)**| 1,200 | 200 | **\$0.000300** | **\$0.000866** | **\$0.001046** | Regenerating 1 target platform (e.g. LinkedIn only) |
| **Item Regeneration (Modeled Typ)** | 800 | 80 | **\$0.000168** | **\$0.000535** | **\$0.000655** | Single title, hook, or caption regeneration |
| **Translation Handoff (Modeled Typ)** | 1,000 | 600 | **\$0.000510** | **\$0.001064** | **\$0.001214** | Translating approved pack items into target language |

### 2.4 Coverage Analysis of Proposed Credit Rates

Comparing proposed credit charges against the reconciled credit valuations:

| Operation | Proposed Credits | Nominal Value @ Studio Yearly (\$0.01021/cr) | Nominal Value @ Creator Monthly (\$0.02400/cr) | Typical OpenRouter Cost | Typical Groq Fallback Cost | Worst-Case Combined Fallback Cost | Minimum Cost Coverage Buffer |
|---|---:|---:|---:|---:|---:|---:|---:|
| **QUICK** | 2 | \$0.02042 | \$0.04800 | \$0.000300 | \$0.000709 | \$0.001505 | **13.6x – 31.9x** |
| **BALANCED** | 3 | \$0.03063 | \$0.07200 | \$0.000660 | \$0.001576 | \$0.003829 | **8.0x – 18.8x** |
| **FULL** | 5 | \$0.05104 | \$0.12000 | \$0.001140 | \$0.002757 | \$0.006602 | **7.7x – 18.2x** |
| **Item Regen** | 1 | \$0.01021 | \$0.02400 | \$0.000168 | \$0.000535 | \$0.000655 | **15.6x – 36.6x** |
| **Platform Regen**| 2 | \$0.02042 | \$0.04800 | \$0.000300 | \$0.000866 | \$0.001046 | **19.5x – 45.9x** |
| **Translation** | 2 | \$0.02042 | \$0.04800 | \$0.000510 | \$0.001064 | \$0.001214 | **16.8x – 39.5x** |

*Even against the absolute worst-case combined fallback upper bound, the lowest credit tier (Studio Yearly) covers total direct LLM provider expenses by at least **7.7x**.*

---

## 3. Reservation Lease & Stale-Worker Safety Architecture

### 3.1 Failure Modes of the Current Model
Under the existing implementation in `creditRepository.ts`, reservations have a fixed `expires_at = now + ttlMinutes` (default 60 minutes) without active heartbeating or worker fencing tokens:
- **Risk 1 (Premature Sweeper Release)**: If TTL is shortened to avoid long credit locks (e.g. 2 minutes), a long LLM generation or network stall could cause the sweeper to release the reservation while the worker is still actively generating.
- **Risk 2 (Stale Worker Overwrite / Double Mutation)**: If the sweeper releases the reservation, and the worker subsequently finishes, the stale worker might attempt to settle or release, causing state inconsistency.
- **Risk 3 (Late-Arriving Provider Completion)**: A provider response arriving after timeout could result in free content or unexpected balance mutations.

### 3.2 Fencing Token, Lease & Heartbeat Model

To make the reservation lifecycle bulletproof across distributed nodes, we design a **Lease Fencing Architecture**:

1. **Reservation Ownership**: When a reservation is created, it records `worker_id: string`, a monotonically increasing `fencing_token: 1`, and `lease_expires_at = now + 45s`.
2. **Heartbeat Renewal**: While the worker awaits provider completion, a background heartbeat interval renews `{ id: reservationId, fencing_token: 1, status: 'reserved' }` every 15 seconds by extending `lease_expires_at = now + 45s`.
3. **Lease Expiration & Sweeper**: The orphan sweeper reclaims reservations only if `lease_expires_at <= now` (heartbeats ceased). When reclaiming, it increments `fencing_token` from 1 to 2, transitions status to `'expired'`, and restores reserved credits to available balance.
4. **Stale Worker Settlement Guard**: When a worker finishes, it calls `settleReservation(attemptId, fencing_token)`. The database update conditionally checks `{ attempt_id, fencing_token: expectedToken, status: 'reserved' }`. If the lease was broken or revoked, `matchedCount === 0`, and the stale settlement is safely rejected (`409 STALE_LEASE_REJECTED`).
5. **Stale Worker Release Guard**: A stale worker cannot release a reservation whose fencing token has been bumped or which has already been reclaimed.

### 3.3 State Machine Definition

```
                ┌─────────────────────────────────────────────────────────────┐
                │                                                             │
                ▼                                                             │
  [Idle] ──► reserveCredits() ──► [Status: 'reserved', Fencing Token: N]     │
                                        │               │                     │
                ┌───────────────────────┘               └─────────────┐       │
                │ (Heartbeat Renewal every 15s)                       │       │
                ▼                                                     │       │
    lease_expires_at = now + 45s                                      │       │
                │                                                     │       │
                ├── Normal Success: settleReservation(token: N)       │       │
                │   Matched { status: 'reserved', token: N }          │       │
                │   └─► [Status: 'settled']                           │       │
                │                                                     │       │
                ├── Confirmed Failure: releaseReservation(token: N)   │       │
                │   Matched { status: 'reserved', token: N }          │       │
                │   └─► [Status: 'released']                          │       │
                │                                                     │       │
                └── Worker Freeze / Crash (lease_expires_at < now)    │       │
                    Sweeper reclaims: token -> N + 1, status: 'expired'       │
                    └─► Credits returned to available_credits         │       │
                                                                      │       │
  Late-arriving response on Token N ──────────────────────────────────┘       │
  settleReservation(token: N) matches 0 docs -> STALE_LEASE_REJECTED ─────────┘
  (Defensively drop response; no balance mutation)
```

### 3.4 Handling Late-Arriving Provider Responses
If an LLM response arrives at a worker after its lease has been revoked by the sweeper:
1. The worker attempts to settle with its local `fencing_token`.
2. The conditional MongoDB query `{ attempt_id, fencing_token, status: 'reserved' }` returns `matchedCount === 0`.
3. The worker aborts settlement, raises a warning (`STALE_LEASE_REJECTED`), and leaves the wallet untouched.
4. **Defensive Result Cache**: The worker may store the completed payload in a short-lived cache (e.g. 5 minutes) keyed by `sha256(user_id + input_hash)`. If the creator immediately retries the operation, the cached result is served instantaneously without re-executing LLM generation or paying the provider twice.

---

## 4. Concurrency-Safe Atomic Monthly Quota Architecture

### 4.1 The Race Condition in Non-Atomic Quota Checking
A naive implementation checks quota via:
```typescript
// VULNERABLE: Race condition window between count and insert!
const count = await db.content_packs.countDocuments({ user_id, created_at: { $gte: monthStart } });
if (count >= 5) throw new AppError('Quota exceeded', 403);
await generateAndSavePack(...);
```
If two requests arrive concurrently, both execute `countDocuments()` before either saves a pack. Both see `count = 4` and proceed, allowing the user to generate 6 packs (violating the 5-pack limit).

### 4.2 Dedicated Atomic Quota Collection: `monthly_quotas`

We design an atomic monthly quota ledger collection:

```typescript
export interface MonthlyQuotaRecord {
  id: string; // Deterministic: `${userId}:${billingPeriod}`
  user_id: string;
  billing_period: string; // e.g. '2026-11'
  plan_tier: string;
  allocated_packs: number; // e.g. 5 for Free
  reserved_packs: number;  // in-flight active reservations
  consumed_packs: number;  // finalized, persisted packs
  reset_date: Date;        // 1st of next month 00:00:00 UTC
  version: number;
  updated_at: Date;
}
```

### 4.3 Atomic Quota Lifecycle Operations

#### Step 1: Atomic Quota Reservation (Before Provider Call)
```javascript
const result = await db.collection('monthly_quotas').updateOne(
  {
    user_id: userId,
    billing_period: currentPeriod,
    // Concurrency Guard: in-flight + consumed must be strictly less than allocated
    $expr: {
      $lt: [
        { $add: ['$consumed_packs', '$reserved_packs'] },
        '$allocated_packs'
      ]
    }
  },
  {
    $inc: { reserved_packs: 1, version: 1 },
    $set: { updated_at: new Date() }
  }
);

if (result.matchedCount === 0) {
  throw new AppError('Monthly Content Studio generation quota exceeded for your plan.', 403, 'QUOTA_EXCEEDED');
}
```

#### Step 2: Atomic Quota Settlement (Upon Pack Persistence)
```javascript
await db.collection('monthly_quotas').updateOne(
  {
    user_id: userId,
    billing_period: currentPeriod,
    reserved_packs: { $gte: 1 }
  },
  {
    $inc: { reserved_packs: -1, consumed_packs: 1, version: 1 },
    $set: { updated_at: new Date() }
  }
);
```

#### Step 3: Atomic Quota Release (Upon Confirmed Failure / Timeout)
```javascript
await db.collection('monthly_quotas').updateOne(
  {
    user_id: userId,
    billing_period: currentPeriod,
    reserved_packs: { $gte: 1 }
  },
  {
    $inc: { reserved_packs: -1, version: 1 },
    $set: { updated_at: new Date() }
  }
);
```

### 4.4 UTC Reset Boundaries
- Quota documents are partitioned by `billing_period` (`YYYY-MM`).
- Reset occurs naturally as the date crosses `00:00:00 UTC` on the 1st of each month.
- An upsert pattern initializes the record for the new period on the user's first request of the month. No heavy scheduled batch reset jobs are required.

### 4.5 Crash Consistency Between Quota and Credits
To prevent desynchronization if a worker process terminates between credit reservation and quota reservation:
1. `CreditReservationRecord` includes a boolean field `quota_reserved: boolean` and `billing_period: string`.
2. When `CreditWalletService.reserveCredits()` is called for Content Studio, both credit reservation and quota reservation are executed within a MongoDB multi-document session transaction (or sequential compensating block).
3. If the quota reservation fails, the credit reservation is immediately rolled back.
4. If a crash occurs mid-flight, the sweeper examines `reservation.quota_reserved`. If `true`, it decrements `reserved_packs` in `monthly_quotas` at the exact moment it releases the credit reservation.

---

## 5. Provider Outcome Uncertainty & Reconciliation

When interacting with external AI providers, network timeouts or socket disconnects do not indicate whether the provider stopped processing or succeeded remotely.

### 5.1 Uncertainty Resolution Matrix

| Outcome Category | Observable State | User Billing Action | Quota Action | Telemetry Classification | Reconciliation Logic |
|---|---|---|---|---|---|
| **Confirmed Provider Failure** | HTTP 429, 500, 503, 504 returned directly | **Release Reservation** (Refund 100%) | **Release Quota** (`reserved_packs - 1`) | `status: 'failed'`, `failure_category: 'PROVIDER_ERROR'` | Immediate release; zero credit charge; zero quota consumed. |
| **Client Disconnect / Timeout** | Socket aborted after 30s; provider state unknown | **Release Reservation** (Refund 100%) | **Release Quota** (`reserved_packs - 1`) | `status: 'failed'`, `failure_category: 'TIMEOUT_UNKNOWN_PROVIDER_STATE'` | User is **never** charged for undelivered content. Provider cost liability is logged internally for financial audit. |
| **Provider Succeeded, Persistence Failed** | LLM returned valid JSON, but MongoDB insert failed | **Release Reservation** (Refund 100%) | **Release Quota** (`reserved_packs - 1`) | `status: 'failed'`, `failure_category: 'PERSISTENCE_ERROR'` | Worker attempts 2 immediate retries on DB write. If still failing, release credits. Content was not delivered. |
| **Primary Failed, Fallback Succeeded** | OpenRouter failed; Groq returned valid JSON | **Settle Single Standard Rate** | **Settle Quota** (`consumed_packs + 1`) | `status: 'success'`, `used_fallback: true` | Single settlement only. User is never charged extra for internal failover. |
| **Duplicate Request in Flight** | Repeated request arrives while original is `'reserved'` | **Attach to Existing Reservation** | **No Quota Mutation** | `status: 'in_flight_attached'` | Returns in-flight promise or polls. Does NOT launch second LLM call or deduct credits. |

### 5.2 Provider Liability vs. User Billing Rule
If an external LLM provider bills VireoClip for tokens on a disconnected request, that expense is an operational infrastructure liability. Under no circumstances may a user's wallet be charged for a request that did not deliver a validated, queryable `ContentPack` to their account.

---

## 6. Idempotency & Database Index Audit

### 6.1 Audit of Existing MongoDB Indexes

Direct live inspection of the staging MongoDB instance was conducted. Here is the verified status of existing indexes:

| Collection Name | Index Key | Unique? | Already Exists? | Role in Phase 4B.3 |
|---|---|---|---|---|
| **`credit_wallets`** | `{ user_id: 1 }` | **YES** | **CONFIRMED** | Fast wallet lookup & single wallet per user. |
| **`credit_wallets`** | `{ id: 1 }` | **YES** | **CONFIRMED** | Wallet primary key. |
| **`credit_reservations`**| `{ attempt_id: 1 }` | **YES** | **CONFIRMED** | Idempotent reservation lookup. |
| **`credit_reservations`**| `{ wallet_id: 1, status: 1 }` | NO | **CONFIRMED** | Active reservation queries. |
| **`credit_reservations`**| `{ expires_at: 1 }` | NO | **CONFIRMED** | Sweep queries for expired reservations. |
| **`credit_transactions`** | `{ idempotency_key: 1 }` | **YES** | **CONFIRMED** | Global transaction deduplication. |
| **`credit_transactions`** | `{ user_id: 1, created_at: -1 }` | NO | **CONFIRMED** | User ledger history. |
| **`content_packs`** | `{ id: 1 }` | **YES** | **CONFIRMED** | Content pack primary key. |
| **`content_packs`** | `{ user_id: 1, created_at: -1 }` | NO | **CONFIRMED** | User content pack listing. |
| **`content_generation_telemetry`** | `{ _id: 1 }` | **YES** | **CONFIRMED** | Only default `_id` currently exists. |

### 6.2 Idempotency Key Scoping Enhancement

In `creditRepository.ts`, `credit_transactions` has a global unique index on `idempotency_key`.

**Vulnerability Identified**:
If two different users submit a common key like `"client-req-1"`, the second user's transaction would fail with a duplicate key error (`E11000`), breaking cross-tenant isolation.

**Architectural Fix**:
All idempotency keys must be deterministically namespaced by the server:
$$\text{Scoped Idempotency Key} = \text{hash}\left(\text{userId} + \text{":"} + \text{operationId} + \text{":"} + \text{clientKey}\right)$$
This guarantees absolute tenant isolation even if multiple clients supply identical client-side keys.

### 6.3 Recommended New Indexes for Phase 4B.3 (When Authorized)

The following indexes should be created during Phase 4B.3 setup:

```javascript
// 1. Dedicated monthly quotas uniqueness
db.monthly_quotas.createIndex(
  { user_id: 1, billing_period: 1 },
  { unique: true }
);

// 2. Lease sweeper compound index on reservations
db.credit_reservations.createIndex(
  { status: 1, lease_expires_at: 1 }
);

// 3. Telemetry audit queries
db.content_generation_telemetry.createIndex(
  { user_id: 1, created_at: -1 }
);
db.content_generation_telemetry.createIndex(
  { content_pack_id: 1 }
);
```

---

## 7. Commercial Boundaries & Unapproved Decisions

To prevent unauthorized pricing activation, the following status register is formally documented:

| Commercial Parameter | Proposed Value | Formal Status | Operational Handling in 4B.3 Plan |
|---|---|---|---|
| **QUICK Mode Cost** | 2 credits | **UNAPPROVED PROPOSAL** | Configurable via `CREDITS_CONTENT_STUDIO_QUICK` env (default disabled). |
| **BALANCED Mode Cost** | 3 credits | **UNAPPROVED PROPOSAL** | Configurable via `CREDITS_CONTENT_STUDIO_BALANCED` env (default disabled). |
| **FULL Mode Cost** | 5 credits | **UNAPPROVED PROPOSAL** | Configurable via `CREDITS_CONTENT_STUDIO_FULL` env (default disabled). |
| **Item Regeneration** | 1 credit | **UNAPPROVED PROPOSAL** | Gated behind approval; currently 0 credits. |
| **Platform Regeneration** | 2 credits | **UNAPPROVED PROPOSAL** | Gated behind approval; currently 0 credits. |
| **Translation Handoff** | 2 credits | **UNAPPROVED PROPOSAL** | Gated behind approval; currently 0 credits. |
| **Free Plan Quota** | 5 QUICK packs/month | **APPROVED DESIGN TARGET** | Free plan quota bucket initialized to 5 QUICK packs/month. |
| **Creator Plan Allowance** | 50 packs/month | **UNAPPROVED PROPOSAL** | Paid plans remain metered via unified wallet credits. |
| **Pro Plan Allowance** | 200 packs/month | **UNAPPROVED PROPOSAL** | Paid plans remain metered via unified wallet credits. |
| **Studio Plan Allowance** | 500 packs/month | **UNAPPROVED PROPOSAL** | Paid plans remain metered via unified wallet credits. |
| **Base Video Processing** | 1 credit / 15s (4 cr/min) | **APPROVED & UNTOUCHED** | Strictly preserved across all video workflows. |

---

## 8. Recommended Implementation Sequence (When Authorized)

When Phase 4B.3 implementation is formally authorized by the user, execution will follow four strictly staged sub-steps:

1. **Step 1: Lease & Quota Foundation**:
   - Add `worker_id`, `fencing_token`, and `lease_expires_at` to `CreditReservationRecord`.
   - Implement `monthly_quotas` collection schema and atomic update helpers in `creditRepository.ts`.
   - Update `recoverExpiredReservations()` to respect `lease_expires_at` and increment fencing tokens.
2. **Step 2: Service Layer Pricing & Quota Gating**:
   - Register Content Studio operation rates in `CreditPricingService`.
   - Add monthly quota check & atomic reservation to `EntitlementService`.
3. **Step 3: Content Pack Generation Integration**:
   - Wrap `ContentPackService.generateContentPack` in atomic reservation, heartbeat loop, settlement, and release blocks.
   - Integrate discrete `ProviderAttemptTrace[]` into `content_generation_telemetry`.
4. **Step 4: Concurrency & Financial Verification Test Suite**:
   - Implement `server/src/tests/phase4b3CreditBillingAndQuotas.test.ts` covering 20+ scenarios (double-spend, race conditions, stale worker rejection, fallback settlement, quota exhaustion, and crash recovery).

---

> [!IMPORTANT]
> **REVISION COMPLETE — EXECUTION HALTED**  
> In strict accordance with instructions, this is a **read-only planning document**. No code modifications, schema changes, pricing updates, or wallet transactions have been executed. Awaiting explicit user review and authorization before proceeding to implementation.

