# VIREOCLIP — PHASE 4B.3 PLANNING & FINANCIAL COST ANALYSIS
## Atomic Credit Billing, Quota Lifecycle, Provider Unit Economics & Architectural Plan

**Phase:** 4B.3 — Atomic Credit Billing & Quotas  
**Document Type:** Technical & Financial Planning Report  
**Authorization State:** PLANNING AND READ-ONLY AUDIT ONLY (Implementation NOT Authorized)  
**Date:** November 5, 2026  
**Auditor & Planning Architect:** Senior Video Infrastructure Engineer, Reliability Architect & Financial Systems Specialist  

---

## 1. Executive Summary

Phase 4B.3 designs the credit billing, monthly quota governance, atomic reservation, settlement, idempotency, and refund architecture for VireoClip's **AI Content Studio**.

### Core Findings & Architectural Direction:
1. **Reuse Existing Production Ledger**: VireoClip already possesses an atomic, append-only credit ledger in `CreditRepository` and `CreditWalletService`. Content Studio should directly leverage this battle-tested system (`reserveCredits`, `settleReservation`, `releaseReservation`, and `cleanupOrphanedReservations`) rather than creating a duplicate or divergent billing subsystem.
2. **Provider Unit Economics**: Raw LLM provider generation costs are exceptionally modest on both primary (OpenRouter `openai/gpt-4o-mini` at \$0.15/\$0.60 per 1M tokens) and fallback (Groq `llama-3.3-70b-versatile` at \$0.59/\$0.79 per 1M tokens).
   - **QUICK generation**: \$0.000300 primary / \$0.000709 fallback (~0.03¢ to 0.07¢).
   - **BALANCED generation**: \$0.000660 primary / \$0.001576 fallback (~0.066¢ to 0.16¢).
   - **FULL generation**: \$0.001140 primary / \$0.002757 fallback (~0.11¢ to 0.28¢).
3. **Credit Pricing Feasibility**: At VireoClip's nominal subscription credit valuations (\$0.010 to \$0.024 per credit), the unapproved credit proposals (`QUICK` 2, `BALANCED` 3, `FULL` 5) provide a **30x to 100x coverage buffer** over raw LLM provider expenses, easily absorbing P95 generation bursts, provider fallbacks, and multi-platform expansions.
4. **Free Tier Viability**: Allocating **5 QUICK Content Studio packs per month** to Free users costs VireoClip **~\$0.0015 per active free user/month** in direct AI provider costs. This makes the free tier an extraordinarily cost-effective onboarding mechanism with near-zero marginal LLM cost risk.
5. **No Code / Schema Modifications**: In strict compliance with the planning mandate, this report modifies no production code, pricing constants, wallet balances, or payment integrations.

---

## 2. Existing Architecture Audit & System Reuse

Rather than inventing a new billing engine, our code inspection demonstrates that VireoClip already has mature, production-grade billing mechanisms that can be reused:

### 2.1 Reusable Components Identified

| Existing Component | File Path | Current Capabilities | Content Studio Reuse Plan |
|---|---|---|---|
| **Credit Wallet Service** | `server/src/services/creditWalletService.ts` | Manages wallet balance summaries, developer auto-refills, reservation lifecycle, and ledger transactions. | Direct reuse. Call `reserveCredits()`, `settleReservation()`, and `releaseReservation()` during Content Studio generation. |
| **Credit Repository** | `server/src/db/repositories/creditRepository.ts` | Atomic conditional updates (`$gte`), MongoDB session transactions, compensating rollbacks for standalone Mongo, idempotency enforcement. | Direct reuse. Provides zero double-spend guarantee and atomic balance movements. |
| **Orphaned Reservation Sweeper** | `CreditRepository.recoverExpiredReservations()` | Automatically releases reservations whose TTL has expired (`expires_at <= now`). | Direct reuse. Automatically recovers abandoned reservations if a generation worker crashes mid-stream. |
| **Credit Pricing Service** | `server/src/services/billing/creditPricingService.ts` | Central calculation of operations, free operations, and credit estimates. | Extend with Content Studio operation rates (`content_studio_quick`, `content_studio_balanced`, `content_studio_full`, etc.). |
| **Entitlement Service** | `server/src/services/entitlementService.ts` | Resolves tier limits, feature gating, and developer overrides across `free`, `creator`, `pro`, `studio`, and `developer`. | Add Content Studio mode gating (Free users limited to `QUICK` mode; `BALANCED` and `FULL` restricted to paid tiers). |
| **Video Intelligence Handoff** | `VideoIntelligenceService` | SHA-256 caching and intelligence re-use (`getContentStudioHandoff`). | Direct reuse. Free and instantaneous for already-analyzed project videos. |

---

## 3. Actual AI Generation Cost Analysis

### 3.1 Provider Pricing Verification

*Pricing verified as of November 2026 official developer pricing.*

| Provider & Model | Role | Input Rate (Prompt) | Output Rate (Completion) | Context Window |
|---|---|---:|---:|---:|
| **OpenRouter (`openai/gpt-4o-mini`)** | Primary | **\$0.150** / 1M tokens | **\$0.600** / 1M tokens | 128k |
| **Groq (`llama-3.3-70b-versatile`)** | Fallback | **\$0.590** / 1M tokens | **\$0.790** / 1M tokens | 128k |

#### Key Economic Takeaways:
- **Groq Fallback Input Multiplier**: Groq input is **3.93x** the cost of OpenRouter (\$0.59 vs \$0.15).
- **Groq Fallback Output Multiplier**: Groq output is **1.32x** the cost of OpenRouter (\$0.79 vs \$0.60).
- Fallback to Groq protects creator experience during OpenRouter 429/5xx incidents, but incurs approximately 2.4x the aggregate cost per request.

### 3.2 Application Telemetry Sample Size & Limitation

Direct query of the staging database revealed **19 documents** in `content_generation_telemetry`, all generated during automated test suites with mock telemetry fixtures. There are currently **0 live production customer observations** in the database.

Therefore, all figures below are **rigorous scenario-based modeled estimates** using production prompt schemas, real transcript sizes, and verified provider pricing, **NOT** fabricated empirical production observations.

### 3.3 Scenario-Based Cost Table

$$\text{Cost} = \left(\frac{\text{Prompt Tokens}}{1,000,000} \times \text{Input Rate}\right) + \left(\frac{\text{Completion Tokens}}{1,000,000} \times \text{Output Rate}\right)$$

| Operation / Scenario | Input Tokens (Prompt) | Output Tokens (Completion) | Primary Cost (OpenRouter) | Fallback Cost (Groq) | P95 Scenario Cost (OpenRouter) | Max Observed / Modeled Cost | Data Status |
|---|---:|---:|---:|---:|---:|---:|---|
| **QUICK Generation** (1–2 platforms) | 800 | 300 | **\$0.000300** | **\$0.000709** | \$0.000450 | \$0.000510 | Modeled |
| **BALANCED Generation** (All 6 platforms) | 1,800 | 650 | **\$0.000660** | **\$0.001576** | \$0.000990 | \$0.001260 | Modeled |
| **FULL Generation** (Deep multi-variant) | 3,200 | 1,100 | **\$0.001140** | **\$0.002757** | \$0.001695 | \$0.002130 | Modeled |
| **Single-Platform Generation** (e.g. YouTube) | 1,400 | 400 | **\$0.000450** | **\$0.001142** | \$0.000660 | \$0.000840 | Modeled |
| **Multi-Platform Generation** (2–3 platforms) | 1,600 | 550 | **\$0.000570** | **\$0.001379** | \$0.000840 | \$0.001080 | Modeled |
| **All-Six-Platform Generation** | 1,800 | 850 | **\$0.000780** | **\$0.001734** | \$0.001110 | \$0.001410 | Modeled |
| **Single Item Regeneration** (e.g. 1 Hook) | 800 | 80 | **\$0.000168** | **\$0.000535** | \$0.000240 | \$0.000330 | Modeled |
| **Platform Regeneration** (e.g. LinkedIn only)| 1,200 | 200 | **\$0.000300** | **\$0.000866** | \$0.000420 | \$0.000570 | Modeled |
| **Translation Handoff** (Approved pack) | 1,000 | 600 | **\$0.000510** | **\$0.001064** | \$0.000720 | \$0.000960 | Modeled |
| **Primary Failure -> Fallback Execution** | 1,800 | 650 | **\$0.001846** (wasted in + Groq) | **\$0.001576** | \$0.002850 | \$0.003600 | Modeled |

### 3.4 Crucial Cost Categorization (Separation of Concerns)

To avoid confusing token revenue with business viability, we strictly separate the five cost components of Content Studio operations:

1. **AI Provider Generation Cost**: Direct API charges from OpenRouter or Groq (\$0.00030 to \$0.00276 per generation).
2. **Video Intelligence Processing Cost**: The local CPU/GPU and Whisper compute required to extract transcripts, OCR, faces, and scenes from raw video. (If reusing an existing analyzed clip or project, this marginal cost is **\$0.00**).
3. **Storage & Infrastructure Allocation**: MongoDB database storage, Redis job queue memory, and Cloudflare R2 egress for thumbnails and video clips (~$0.0001 to $0.0005 per asset).
4. **Payment Processing Fees**: Stripe / Paddle / Razorpay transaction fees (typically 2.9% + \$0.30 per payment, which equals 3.5% to 5.5% of total subscription revenue).
5. **Revenue Allocated Per Credit**: The nominal subscription dollar value represented by a credit.

Token margin (e.g. charging \$0.048 in credit value for a \$0.00066 LLM call) is **NOT** actual business gross margin. The credit price must cover customer support, payment merchant fees, local GPU infrastructure amortized depreciation, cloud bandwidth, and long-term storage retention.

---

## 4. Credit Pricing Sensitivity Analysis

### 4.1 Evaluation of Unapproved Proposals

The product direction proposed the following operational credit charges:

| Operation | Proposed Credits | Nominal Value @ Studio (\$0.010/cr) | Nominal Value @ Pro (\$0.016/cr) | Nominal Value @ Creator (\$0.024/cr) | Typical OpenRouter Cost | Typical Groq Fallback Cost | Cost Coverage Multiplier (Primary) |
|---|---:|---:|---:|---:|---:|---:|---:|
| **QUICK** | 2 | \$0.020 | \$0.032 | \$0.048 | \$0.000300 | \$0.000709 | **66x – 160x** |
| **BALANCED** | 3 | \$0.030 | \$0.048 | \$0.072 | \$0.000660 | \$0.001576 | **45x – 109x** |
| **FULL** | 5 | \$0.050 | \$0.080 | \$0.120 | \$0.001140 | \$0.002757 | **43x – 105x** |
| **Item Regen** | 1 | \$0.010 | \$0.016 | \$0.024 | \$0.000168 | \$0.000535 | **59x – 142x** |
| **Platform Regen**| 2 | \$0.020 | \$0.032 | \$0.048 | \$0.000300 | \$0.000866 | **66x – 160x** |
| **Translation** | 2 | \$0.020 | \$0.032 | \$0.048 | \$0.000510 | \$0.001064 | **39x – 94x** |

### 4.2 Free Actions (Strictly Zero Credits)
To preserve creator trust and align with existing VireoClip product philosophy, the following actions must remain **strictly free (0 credits)**:
- Manual copy editing and adjustments.
- Locking / unlocking items.
- Approving items or packs.
- Copying text to clipboard or exporting JSON/Markdown.
- Querying and viewing previously generated packs (`listRecentPacks`, `getPack`).
- Compatibility-cached Video Intelligence handoff reuse.

### 4.3 Recommended Pricing Range & Trade-Offs

| Option | QUICK | BALANCED | FULL | Item Regen | Recommendation & Assessment |
|---|---:|---:|---:|---:|---|
| **Option A (Proposed)** | 2 cr | 3 cr | 5 cr | 1 cr | **Balanced & Recommended**: Strong consumer adoption; simple round numbers; safe gross margins across all paid plans. |
| **Option B (Lean / Creator-Friendly)** | 1 cr | 2 cr | 4 cr | 1 cr / 2 items | Maximizes adoption and encourages experimentation. Slightly faster credit burn on clipping vs content creation. |
| **Option C (Conservative / Premium)** | 3 cr | 5 cr | 8 cr | 2 cr | Over-penalizes creators for text generation when video clipping is priced at 4 cr/minute. Not recommended. |

*In all scenarios, the base video processing rate of 1 credit per 15 seconds (4 credits per source minute) remains completely untouched.*

---

## 5. Monthly Quota and Plan Analysis

### 5.1 Plan Audit & Allowance Architecture

| Plan Tier | Price / Month | Current Monthly Credits | Content Studio Gating | Proposed Monthly Pack Quota | Marginal Monthly LLM Cost to Vireo |
|---|---|---|---|---|---|
| **Free** | \$0 | 60 cr (watermarked) | **QUICK Mode Only** | **5 packs / month** | **\$0.0015 / user / mo** |
| **Creator** | \$12 | 500 cr | All Modes | **50 packs / month** (or credit-metered) | **\$0.033 / user / mo** |
| **Pro** | \$24 | 1,500 cr | All Modes | **200 packs / month** (or credit-metered) | **\$0.132 / user / mo** |
| **Studio** | \$49 | 4,000 cr | All Modes | **500 packs / month** (or credit-metered) | **\$0.570 / user / mo** |
| **Developer** | \$0 (internal) | 999,999 cr | All Modes | **Unlimited** | Variable (internal testing) |

### 5.2 Plan Rule Definitions

1. **What Counts as One Monthly Pack**:
   - Only an initial content pack generation that succeeds, passes Claim Guard validation, and is persisted to `content_packs` increments the monthly pack counter.
2. **Impact of Regeneration and Translation**:
   - Single item regenerations, platform regenerations, and translations **do NOT consume a monthly pack allowance**.
   - For paid users, regenerations and translations consume standard wallet credits (e.g. 1 credit for an item, 2 credits for translation).
   - For Free users, regenerations are permitted within the 5 generated packs (up to a bounded limit of 3 item regenerations per pack) without deducting secondary credits.
3. **Failed Generations**:
   - A generation that encounters an unrecoverable provider failure, timeout, or validation rejection **NEVER** consumes a monthly pack quota.
4. **Monthly Reset & Timezone**:
   - Resets strictly at `00:00:00 UTC` on the 1st of each calendar month, matching existing `getBillingResetDate()` and `getCurrentBillingPeriod()`.
5. **Concurrent Generation Limits**:
   - Free: 1 active generation at a time per user.
   - Creator: 2 concurrent generations.
   - Pro: 5 concurrent generations.
   - Studio: 10 concurrent generations.
   - Developer: Unlimited.

---

## 6. Atomic Billing Architecture Design

### 6.1 State Machine & Reservation Lifecycle

```
[Idle] 
  │
  ▼
[reserveCredits(attemptId, amount)] (Atomic conditional: available >= amount)
  │
  ├── Failure: available < amount ────────► [403 INSUFFICIENT_CREDITS]
  ├── Failure: monthly_packs >= limit ────► [403 QUOTA_EXCEEDED]
  │
  ▼
[Status: 'reserved']
  │
  ├── Provider Execution (OpenRouter / Groq)
  │     │
  │     ├── Provider Success ────────► [settleReservation] ──► [Status: 'settled'] ──► ContentPack Saved
  │     │                               (reserved -> consumed)
  │     │
  │     └── Provider Failure ────────► [releaseReservation] ─► [Status: 'released'] ─► 502 Clean Error
  │                                     (reserved -> available)
  │
  └── Server Crash / Abandoned ──────► [TTL Sweeper] ────────► [Status: 'released'] ─► Credits Restored
                                        (expires_at <= now)
```

### 6.2 Preventing Critical Billing Vulnerabilities

1. **Double Charging Prevention**:
   - Every reservation generates a deterministic `attempt_id` (or hashes user ID + client `idempotencyKey`).
   - If a duplicate request arrives while a reservation is `reserved` or `settled`, `CreditRepository.reserveCredits` returns `{ idempotent: true, allowed: true }` without mutating balances again.
2. **Negative Balance Prevention**:
   - Credit deduction uses MongoDB atomic conditional operators: `{ id: wallet.id, available_credits: { $gte: amount } }`.
   - If available credits are less than `amount`, `matchedCount` is 0, and the operation fails cleanly with `INSUFFICIENT_CREDITS`.
3. **Double Refund / Release Prevention**:
   - `settleReservation` and `releaseReservation` conditionally update on `{ status: 'reserved' }`.
   - If status is already `settled` or `released`, the second call is an idempotent no-op.
4. **Abandoned Reservation Recovery**:
   - Every reservation has `expires_at = now + 10 minutes`.
   - The background sweeper `CreditWalletService.cleanupOrphanedReservations()` runs periodically and releases any reservations that exceed TTL.

### 6.3 Database Constraints & Indexes Required

To ensure consistency in MongoDB, the following compound unique indexes must exist:

```javascript
// 1. Unique index on credit reservations attempt ID
db.credit_reservations.createIndex(
  { attempt_id: 1 },
  { unique: true }
);

// 2. Unique index on credit transaction idempotency key
db.credit_transactions.createIndex(
  { idempotency_key: 1 },
  { unique: true }
);

// 3. Compound index for orphan reservation recovery
db.credit_reservations.createIndex(
  { status: 1, expires_at: 1 }
);

// 4. Monthly content pack quota index
db.content_packs.createIndex(
  { user_id: 1, created_at: -1 }
);
```

---

## 7. Provider Failure and Billing Rules Matrix

| Provider Outcome | Technical Event | Wallet Action | Quota Action | Client Status |
|---|---|---|---|---|
| **Primary Immediate Success** | OpenRouter returns valid JSON on attempt 1 | Settle reservation (`settledAmount: required`) | Increment monthly pack count | 200 OK |
| **Primary Transient Recovery** | OpenRouter succeeds on attempt 2 or 3 | Settle reservation (`settledAmount: required`) | Increment monthly pack count | 200 OK |
| **Fallback Success** | OpenRouter fails retries; Groq succeeds | Settle reservation (`settledAmount: required`) | Increment monthly pack count | 200 OK (no duplicate charge) |
| **Both Providers Fail** | OpenRouter and Groq both fail (5xx/429) | **Release reservation** (`refund: required`) | **Zero quota consumed** | 502 `AI_GENERATION_FAILED` |
| **Client Error (400/422)** | Invalid prompt schema or rejected parameters | **Release reservation** (`refund: required`) | **Zero quota consumed** | 400 `INVALID_INPUT` |
| **Provider Auth/Payment Error** | OpenRouter returns 401 or 402; Groq fails | **Release reservation** (`refund: required`) | **Zero quota consumed** | 503 `PROVIDER_ERROR` |
| **Timeout Mid-Stream** | Request aborts after 30s | **Release reservation** (`refund: required`) | **Zero quota consumed** | 504 `REQUEST_TIMEOUT` |
| **Worker Crash Mid-Flight** | Server terminates before persistence | **Auto-release via TTL sweeper** | **Zero quota consumed** | Recovered on next cycle |
| **Telemetry Write Error** | ContentPack saved, but telemetry insert fails | **Settle reservation** (content was delivered) | Increment monthly pack count | 200 OK (telemetry isolated) |

---

## 8. Telemetry Improvements: `ProviderAttemptTrace[]` Design

To resolve the limitation identified in the Phase 4B.2 audit (where intermediate attempts were not persisted), we recommend introducing a discrete attempt trace in Phase 4B.3:

```typescript
export interface ProviderAttemptTrace {
  attempt_index: number;              // 1, 2, 3
  provider: 'openrouter' | 'groq';
  model: string;                      // e.g. 'openai/gpt-4o-mini'
  is_fallback: boolean;
  latency_ms: number;
  http_status?: number;               // e.g. 429, 502, 200
  status: 'success' | 'transient_failure' | 'permanent_failure';
  error_message?: string;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
}
```

- **Isolation Principle**: Telemetry records are strictly diagnostic and stored in `content_generation_telemetry`.
- **Zero Billing Coupling**: A telemetry failure will **never** roll back an active wallet transaction or content pack creation.

---

## 9. Security & Abuse Prevention

1. **Server-Authoritative Pricing**: The client never passes a credit amount or pricing override; `CreditPricingService` derives required credits strictly on the server from validated request parameters.
2. **Replay & Idempotency Protection**: Client-provided `idempotencyKey` is bound to the user's ID (`hash(userId, idempotencyKey)`). Replayed requests safely return the original content pack without re-executing LLMs or double-billing.
3. **Atomic Quota Counter**: Monthly quota checks execute server-side within the database transaction or using atomic MongoDB aggregation `$count`.
4. **Claim Guard & Token Limit Enforcement**: System prompts strictly bound `max_tokens` (1200 for QUICK, 2500 for BALANCED, 3500 for FULL) to prevent runaway completion loops and excessive token billing.

---

## 10. Phase 4B.3 Implementation Sequence (When Authorized)

When approved, Phase 4B.3 should be executed in three disciplined sub-steps:

1. **Step 1: Pricing & Quota Gating Service**:
   - Register Content Studio operations in `CreditPricingService`.
   - Add monthly pack count resolver and tier gating in `EntitlementService`.
2. **Step 2: Content Studio Reservation & Settlement Integration**:
   - Wrap `ContentPackService.generateContentPack` in atomic reservation, settlement, and release blocks using `CreditWalletService`.
   - Add `ProviderAttemptTrace[]` to telemetry collection.
3. **Step 3: Comprehensive Concurrency & Financial Verification**:
   - Write at least 20 focused unit/integration tests in `phase4b3CreditBillingAndQuotas.test.ts` covering double-spend attempts, concurrent generation races, idempotency replays, provider failure refunds, and monthly quota enforcement.

---

> [!IMPORTANT]
> **AUDIT AND PLANNING COMPLETE — EXECUTION HALTED**  
> In accordance with user instructions, this document constitutes a **technical and financial plan ONLY**. No production code, pricing tables, database collections, or subscription limits have been modified. Awaiting user review and explicit authorization before proceeding to Phase 4B.3 implementation.

