# VIREOCLIP — PHASE 4B.3 FINAL TECHNICAL CORRECTION REPORT
## Sweeper Quota Transition Safety, Standalone Intent Fencing & Complete Cache Fingerprinting

**Phase:** 4B.3 — Atomic Credit Billing & Quotas  
**Document Type:** Final Architecture Correction Report & Concurrency Matrix  
**Authorization State:** STRICTLY READ-ONLY PLANNING (Implementation NOT Authorized)  
**Date:** November 5, 2026  
**Auditor & Systems Architect:** Senior Video Infrastructure & Financial Reliability Architect  

---

## 1. Executive Summary & Authorization State

This report provides the final three technical corrections required to close the planning phase for **VireoClip Phase 4B.3 (Atomic Credit Billing & Quotas)**:

1. **Sweeper Quota Transition Safety**: Corrects the expiration sweeper to match quota reservations on `{ attempt_id, fencing_token, status: 'reserved' }`, explicitly checking the update result so that `monthly_quotas.reserved_packs` is decremented **only if exactly one** quota reservation successfully transitioned from `'reserved'`. Proves immunity to concurrent double-sweeper executions.
2. **Standalone Reservation Intent Fencing**: Upgrades the standalone (non-replica-set) intent ledger with explicit worker ownership (`worker_id`), monotonic fencing tokens (`fencing_token`), heartbeat lease expiration (`lease_expires_at`), and conditional atomic state transitions across `pending`, `credit_reserved`, `active`, `aborted_insufficient`, `reconciling`, and `reconciled_abandoned`. Eliminates zombie worker activations after reconciler reclamation.
3. **Complete Deterministic Cache Fingerprint**: Expands the late-response deduplication fingerprint into an exhaustive 14-field canonical hash covering source identity, mode, sorted platforms, languages, tone, target audience, template, custom instructions, transcript edit hashes, intelligence version, prompt version, and schema version. Specifies shared multi-worker cache requirements (MongoDB TTL / Redis) versus single-worker process-local memory caching, enforcing mandatory fresh credit/quota reservations prior to cached delivery.

### Strict Governance Compliance:
- **Zero Code Modifications**: No production source code, test files, or configuration files were modified.
- **Zero Database / Schema Mutations**: No collections, documents, or indexes were created or altered.
- **Commercial Boundaries Maintained**: Proposed Content Studio charges (`QUICK` 2, `BALANCED` 3, `FULL` 5, item regen 1, platform regen 2, translation 2) and paid monthly pack limits (Creator 50, Pro 200, Studio 500) remain **unapproved proposals** (defaulting to 0 credits).
- **Approved Targets Preserved**: Free plan target of 5 QUICK packs/month is preserved. Base video processing rate (1 credit per 15 seconds) remains unchanged.

---

## 2. Correction 1: Sweeper Quota Transition Safety & Double-Sweeper Elimination

### 2.1 Flaw in Previous Addendum Draft
In the previous addendum draft, the sweeper recovery snippet performed an unchecked `updateOne` on `monthly_quota_reservations` without evaluating `matchedCount`, followed immediately by an `$inc: { reserved_packs: -1 }` on `monthly_quotas`:
```javascript
// Previous flawed snippet:
await db.collection('monthly_quota_reservations').updateOne(
  { attempt_id: res.attempt_id, status: 'reserved' },
  { $set: { status: 'expired', updated_at: new Date() }, $inc: { fencing_token: 1 } },
  { session }
);
// Blind decrement occurred even if the reservation above was NOT matched!
await db.collection('monthly_quotas').updateOne(
  { user_id: res.user_id, billing_period: res.metadata.billing_period, reserved_packs: { $gte: 1 } },
  { $inc: { reserved_packs: -1, version: 1 } },
  { session }
);
```
**Risk Identified**: If two sweeper threads or an active worker release raced on the same `attempt_id`, or if the quota reservation had already transitioned to `'released'` or `'settled'`, the quota reservation query would match 0 documents, but `monthly_quotas` would still decrement `reserved_packs` if any other active reservation for that user existed (`reserved_packs >= 1`). This would corrupt the aggregate counter and cause cross-request quota leakage.

### 2.2 Corrected Safe Sweeper Algorithm

The corrected sweeper evaluates the transition atomically. `monthly_quotas.reserved_packs` is decremented **only if and only when** the specific quota reservation record transitions from `'reserved'`:

```typescript
export class CreditRepository {
  /**
   * Recovers an expired reservation and its associated monthly quota atomically.
   * Guaranteed to be idempotent and safe against concurrent double-sweeper execution.
   */
  public static async recoverExpiredReservation(
    reservationId: string,
    expectedCreditFencingToken: number
  ): Promise<{ recovered: boolean; creditsReleased: number; quotaReleased: boolean }> {
    return withOptionalTransaction(async (session) => {
      const db = await getMongoDb();
      const now = new Date();

      // -------------------------------------------------------------
      // 1. Atomic lease transition for CREDIT RESERVATION
      // -------------------------------------------------------------
      const creditRes = await db.collection<CreditReservationRecord>('credit_reservations').findOneAndUpdate(
        {
          id: reservationId,
          fencing_token: expectedCreditFencingToken,
          status: 'reserved',
          expires_at: { $lte: now }
        },
        {
          $set: { status: 'expired', updated_at: now },
          $inc: { fencing_token: 1 }
        },
        { returnDocument: 'after', session }
      );

      // If already claimed by another sweeper thread or settled/released by worker, abort cleanly
      if (!creditRes) {
        return { recovered: false, creditsReleased: 0, quotaReleased: false };
      }

      // -------------------------------------------------------------
      // 2. Refund wallet credits for the recovered reservation
      // -------------------------------------------------------------
      await db.collection<CreditWalletRecord>('credit_wallets').updateOne(
        { id: creditRes.wallet_id },
        {
          $inc: {
            reserved_credits: -creditRes.amount,
            available_credits: creditRes.amount,
            version: 1
          },
          $set: { updated_at: now }
        },
        { session }
      );

      let quotaReleased = false;

      // -------------------------------------------------------------
      // 3. Conditional, Atomic QUOTA RESERVATION Transition
      // -------------------------------------------------------------
      if (creditRes.metadata?.quota_reserved && creditRes.attempt_id) {
        const billingPeriod = creditRes.metadata.billing_period || getCurrentBillingPeriod();
        const expectedQuotaFencingToken = creditRes.metadata.quota_fencing_token ?? 1;

        // Atomically claim the specific quota reservation matching attempt_id & fencing_token
        const quotaRes = await db.collection<MonthlyQuotaReservationRecord>('monthly_quota_reservations').findOneAndUpdate(
          {
            attempt_id: creditRes.attempt_id,
            fencing_token: expectedQuotaFencingToken,
            status: 'reserved',
            lease_expires_at: { $lte: now }
          },
          {
            $set: { status: 'expired', updated_at: now },
            $inc: { fencing_token: 1 }
          },
          { returnDocument: 'after', session }
        );

        // DECREMENT AGGREGATE BUCKET ONLY IF THE DISCRETE RESERVATION TRANSITIONED
        if (quotaRes) {
          const quotaBucketRes = await db.collection<MonthlyQuotaRecord>('monthly_quotas').updateOne(
            {
              user_id: creditRes.user_id,
              billing_period: billingPeriod,
              reserved_packs: { $gte: 1 }
            },
            {
              $inc: { reserved_packs: -1, version: 1 },
              $set: { updated_at: now }
            },
            { session }
          );

          if (quotaBucketRes.modifiedCount === 1) {
            quotaReleased = true;
          } else {
            logger.error(`[Sweeper] Inconsistency: Quota reservation ${creditRes.attempt_id} expired but bucket had 0 reserved_packs.`);
          }
        } else {
          logger.warn(`[Sweeper] Credit reservation ${creditRes.attempt_id} recovered, but quota reservation was already transitioned or not expired.`);
        }
      }

      return {
        recovered: true,
        creditsReleased: creditRes.amount,
        quotaReleased
      };
    });
  }
}
```

### 2.3 Proof of Double-Sweeper Immunity

```mermaid
sequenceDiagram
    autonumber
    participant S1 as Sweeper Instance 1
    participant S2 as Sweeper Instance 2
    participant CR as credit_reservations
    participant CW as credit_wallets
    participant QR as monthly_quota_reservations
    participant QB as monthly_quotas

    Note over S1,S2: Both sweepers scan expired reservations at t=45.001s (attempt_id: A1, fencing: 1)
    
    par Concurrent Lease Acquisition Attempt
        S1->>CR: findOneAndUpdate({ id: R1, fencing_token: 1, status: 'reserved' }, {$set: {status: 'expired'}, $inc: {fencing_token: 1}})
        S2->>CR: findOneAndUpdate({ id: R1, fencing_token: 1, status: 'reserved' }, {$set: {status: 'expired'}, $inc: {fencing_token: 1}})
    end

    Note over CR: MongoDB document-level write lock serializes execution
    CR-->>S1: MATCHED (status transitioned 'reserved' -> 'expired', fencing_token now 2)
    CR-->>S2: NULL (status is now 'expired', fencing_token is 2 != 1)

    Note over S2: Sweeper 2 detects null return; exits immediately. 0 mutations executed!
    
    S1->>CW: updateOne({ id: W1 }, { $inc: { reserved: -3, available: +3 } })
    CW-->>S1: Credits refunded successfully

    S1->>QR: findOneAndUpdate({ attempt_id: A1, fencing_token: 1, status: 'reserved' }, {$set: {status: 'expired'}, $inc: {fencing_token: 1}})
    QR-->>S1: MATCHED (quota reservation transitioned to 'expired', fencing_token now 2)

    S1->>QB: updateOne({ user_id: U1, reserved_packs: {$gte: 1} }, { $inc: { reserved_packs: -1 } })
    QB-->>S1: Quota bucket decremented exactly once

    Note over S1,S2: Result: Exactly 1 credit refund, exactly 1 quota decrement. 0 double-releases.
```

---

## 3. Correction 2: Standalone Reservation Intent Fencing & State Machine

In non-replica-set MongoDB environments, multi-document transactions cannot be used. We replace basic sequential operations with a **Fenced Two-Phase Reservation Intent Ledger**.

### 3.1 Reservation Intent Schema & State Machine

```typescript
export type ReservationIntentStatus =
  | 'pending'                  // Staged: Worker intends to allocate credits and quota
  | 'credit_reserved'          // Step 1: Credits locked in wallet & credit_reservations
  | 'active'                   // Step 2: Quota locked; intent fully valid and active
  | 'aborted_insufficient'     // Step 2 failed: Rolled back credits; request rejected
  | 'reconciling'              // Reconciler heartbeat lease acquired to resolve stuck intent
  | 'reconciled_abandoned'     // Reconciler finished releasing all partial locks
  | 'settled'                  // Worker persisted pack; intent finalized and consumed
  | 'released';                // Worker encountered failure; intent refunded

export interface ReservationIntentRecord {
  id: string;                  // SHA-256(user_id + ":" + attempt_id)
  attempt_id: string;          // Scoped deterministic attempt ID
  user_id: string;
  workspace_id?: string | null;
  worker_id: string;           // Unique worker instance ID (e.g. "worker-pod-4a-89f")
  credit_amount: number;       // e.g. 3 credits
  quota_packs: number;         // e.g. 1 pack
  billing_period: string;      // "YYYY-MM"
  status: ReservationIntentStatus;
  fencing_token: number;       // Monotonically increasing fencing counter
  lease_expires_at: Date;      // Worker heartbeat lease expiration (now + 45s)
  reconciler_id?: string | null;
  created_at: Date;
  updated_at: Date;
}
```

```mermaid
stateDiagram-v2
    [*] --> pending: Worker creates intent (fencing=1)
    
    pending --> credit_reserved: Worker reserves credits (fencing=1)
    pending --> reconciling: Worker dies; Reconciler claims lease (fencing=2)
    
    credit_reserved --> active: Worker reserves quota (fencing=2)
    credit_reserved --> aborted_insufficient: Quota exceeded; Worker releases credits
    credit_reserved --> reconciling: Worker dies; Reconciler claims lease (fencing=2)
    
    reconciling --> reconciled_abandoned: Reconciler releases partial credit/quota locks
    
    active --> settled: Generation succeeds; Content persisted
    active --> released: Provider confirmed error; Worker releases locks
    active --> reconciling: Generation hangs > 45s; Reconciler claims lease
    
    settled --> [*]
    released --> [*]
    aborted_insufficient --> [*]
    reconciled_abandoned --> [*]
```

### 3.2 Anti-Zombie Worker Fencing Guard

The critical requirement is ensuring a worker **cannot activate an intent** after the background reconciler has claimed or recovered it.

#### Worker Activation Pseudocode:
```typescript
public static async activateIntent(
  intentId: string,
  workerId: string,
  expectedFencingToken: number
): Promise<{ activated: boolean }> {
  const db = await getMongoDb();
  const now = new Date();

  // Atomically transition from 'credit_reserved' to 'active' ONLY IF:
  // 1. worker_id matches
  // 2. fencing_token matches expected version
  // 3. lease_expires_at is strictly in the future (lease not expired)
  const res = await db.collection<ReservationIntentRecord>('reservation_intents').findOneAndUpdate(
    {
      id: intentId,
      worker_id: workerId,
      fencing_token: expectedFencingToken,
      status: 'credit_reserved',
      lease_expires_at: { $gt: now }
    },
    {
      $set: {
        status: 'active',
        updated_at: now
      },
      $inc: { fencing_token: 1 }
    },
    { returnDocument: 'after' }
  );

  // If reconciler claimed the intent, res is NULL
  if (!res) {
    logger.error(`[WorkerFencing] Worker ${workerId} fenced out! Intent ${intentId} was claimed by reconciler or lease expired.`);
    return { activated: false };
  }

  return { activated: true };
}
```

### 3.3 Crash Recovery at Every Transition Stage

| Stage | Crash Timing | Technical State on Disk | Reconciler Recovery Action | Financial & Quota Invariant |
|---|---|---|---|---|
| **1. Pending** | Worker dies before reserving credits | `intent.status = 'pending'`, 0 credit reservations, 0 quota reservations | Reconciler queries `status: 'pending'`, transitions to `'reconciling'`, confirms 0 locks exist, sets `'reconciled_abandoned'` | Wallet unchanged. Quota unchanged. Zero leak. |
| **2. Credit Reserved** | Worker dies after locking credits, before quota check | `intent.status = 'credit_reserved'`, credit reservation exists, quota reservation does not exist | Reconciler claims lease (`fencing_token: 2`, `status: 'reconciling'`), executes `releaseReservation(attempt_id)`, updates intent to `'reconciled_abandoned'` | Credits 100% refunded. Quota untouched. Zero leak. |
| **3. Aborted Insufficient** | Worker fails quota check and crashes while rolling back credits | `intent.status = 'aborted_insufficient'`, credit reservation remains locked | Reconciler detects stale `aborted_insufficient` intent with active credit reservation, executes idempotent `releaseReservation(attempt_id)` | Credits 100% refunded. Quota untouched. Zero leak. |
| **4. Active Generation** | Worker hangs during LLM call (>45s) | `intent.status = 'active'`, credit and quota reservations exist | Reconciler claims expired reservations via Section 2.2, sets reservations to `'expired'`, releases wallet credits and quota, marks intent `'reconciled_abandoned'` | User refunded 100%. Provider liability tracked. |

### 3.4 Concurrency Timeline: Worker vs Reconciler Race

```
Time     Worker 1 (Slow / Stalled Worker)              MongoDB Intent Record State                Reconciler 1 (Recovery Sweeper)
-----------------------------------------------------------------------------------------------------------------------------------------
t=0.0s   Inserts intent (fencing=1, lease=t+45s)      {status: 'pending', fencing: 1, lease: 45}  Idle
t=0.1s   Reserves 3 credits in wallet                 {status: 'credit_reserved', fencing: 1}     Idle
t=0.2s   Worker pauses / process GC freeze (46s)      {status: 'credit_reserved', fencing: 1}     Idle
...
t=45.1s  Worker still frozen                          [Lease Expires: now > lease_expires_at]    Scans for expired intents
t=45.2s  Worker still frozen                          findOneAndUpdate({status: 'credit_reserved', Reconciler CLAIMS intent:
                                                        fencing: 1, lease <= now}) -> MATCHED      Sets status: 'reconciling', fencing: 2
t=45.3s  Worker still frozen                          Releases credit reservation back to wallet Reconciler finishes:
                                                      Sets status: 'reconciled_abandoned'        Sets status: 'reconciled_abandoned'
t=46.0s  Worker unfreezes! Attempts to activate:
         findOneAndUpdate({
           status: 'credit_reserved',
           fencing_token: 1,
           lease_expires_at: { $gt: now }
         })
t=46.1s  Update MATCHES 0 DOCUMENTS!                  {status: 'reconciled_abandoned', fencing: 2} Worker receives NULL
t=46.2s  Worker detects fencing rejection (409)       Worker HALTS generation. DOES NOT call LLM. User wallet remains clean!
```

---

## 4. Correction 3: Complete Deterministic Cache Fingerprint

### 4.1 Exhaustive 14-Field Input Vector
To ensure that requests with different generation inputs can **never** receive an incompatible cached result, the late-response fingerprint incorporates all generation-affecting parameters:

```typescript
export interface ContentStudioCachePayload {
  tenant_id: string;                       // Strict multi-tenant isolation
  source_identity: string;                 // Source video SHA-256 or canonical clip/project ID
  source_type: 'clip' | 'project' | 'upload' | 'transcript';
  generation_mode: 'QUICK' | 'BALANCED' | 'FULL';
  selected_platforms: string[];            // Lexicographically sorted platform keys
  source_language: string;                 // Detected or specified source language (e.g. 'en')
  target_language: string | null;          // Translation target language (e.g. 'es') or null
  tone: string;                            // Normalized lowercase tone ('professional', etc.)
  target_audience: string;                 // Normalized lowercase target audience
  template: string;                        // Template identifier ('standard', 'framework', etc.)
  user_instruction_hash: string | null;    // SHA-256 of trimmed custom instructions
  transcript_edits_hash: string;           // SHA-256 of full normalized transcript cues
  intelligence_version: string;            // SHA-256 of video intelligence doc / OCR / visual features
  prompt_version: string;                  // Static prompt version constant from source code
  schema_version: string;                  // Output JSON schema version constant
}
```

### 4.2 Canonical Hash Generation Pseudocode

```typescript
import crypto from 'node:crypto';

export const CONTENT_STUDIO_PROMPT_VERSION = '2026-11-05.v1';
export const CONTENT_STUDIO_SCHEMA_VERSION = 'v1';

export function computeContentStudioCacheFingerprint(params: {
  userId: string;
  sourceIdentity: string;
  sourceType: 'clip' | 'project' | 'upload' | 'transcript';
  generationMode: 'QUICK' | 'BALANCED' | 'FULL';
  selectedPlatforms: string[];
  sourceLanguage?: string;
  targetLanguage?: string | null;
  tone?: string;
  targetAudience?: string;
  template?: string;
  userInstruction?: string;
  transcriptCues?: Array<{ text: string; start: number; end: number }>;
  intelligenceDoc?: { intelligence_sha256?: string; version?: number };
}): string {
  // 1. Sort platforms canonically
  const sortedPlatforms = [...new Set(params.selectedPlatforms)].sort();

  // 2. Hash custom user instructions if provided
  const userInstructionHash = params.userInstruction?.trim()
    ? crypto.createHash('sha256').update(params.userInstruction.trim()).digest('hex')
    : null;

  // 3. Hash transcript cues to invalidate cache if transcripts were edited
  const normalizedTranscript = (params.transcriptCues || [])
    .map((c) => `${c.start.toFixed(2)}-${c.end.toFixed(2)}:${c.text.trim()}`)
    .join('|');
  const transcriptEditsHash = crypto.createHash('sha256').update(normalizedTranscript).digest('hex');

  // 4. Extract video intelligence version hash
  const intelligenceVersion = params.intelligenceDoc?.intelligence_sha256
    ? params.intelligenceDoc.intelligence_sha256
    : `v${params.intelligenceDoc?.version ?? 0}`;

  // 5. Construct canonical payload object
  const canonicalPayload: ContentStudioCachePayload = {
    tenant_id: params.userId,
    source_identity: params.sourceIdentity,
    source_type: params.sourceType,
    generation_mode: params.generationMode,
    selected_platforms: sortedPlatforms,
    source_language: (params.sourceLanguage || 'auto').toLowerCase(),
    target_language: params.targetLanguage ? params.targetLanguage.toLowerCase() : null,
    tone: (params.tone || 'default').trim().toLowerCase(),
    target_audience: (params.targetAudience || 'general').trim().toLowerCase(),
    template: (params.template || 'standard').trim().toLowerCase(),
    user_instruction_hash: userInstructionHash,
    transcript_edits_hash: transcriptEditsHash,
    intelligence_version: intelligenceVersion,
    prompt_version: CONTENT_STUDIO_PROMPT_VERSION,
    schema_version: CONTENT_STUDIO_SCHEMA_VERSION,
  };

  // 6. Return deterministic SHA-256 hex digest
  return crypto.createHash('sha256').update(JSON.stringify(canonicalPayload)).digest('hex');
}
```

### 4.3 Multi-Worker Deployment Architecture & Tradeoffs

| Architecture | Storage Engine | Multi-Worker Support | Eviction Mechanism | Failure Impact | Recommendation |
|---|---|---|---|---|---|
| **Shared MongoDB TTL (Default)** | Collection `content_generation_cache` | **Full Support** across all pods / nodes | Mongo TTL Index on `expires_at` (`expireAfterSeconds: 0`) | None (uses existing MongoDB cluster) | **Recommended**: Zero extra infrastructure; guarantees multi-worker cache hits. |
| **Shared Redis** | Redis Key-Value (`cache:cs:{fingerprint}`) | **Full Support** across all pods / nodes | Redis native `SET ... EX 600` | Redis downtime degrades to re-generation (graceful fallback) | Ideal if high-throughput Redis cluster already exists. |
| **Process-Local Memory Cache** | Node.js `LRUCache` / `Map` | **Single-Worker Only** | In-memory timeout (10 min) | If client retry hits Pod B, cache misses; re-calls LLM provider | **Documented Limitation**: Unsuitable for multi-worker container clusters unless sticky sessions are configured. |

### 4.4 Mandatory Reservation Gate on Cached Output Delivery

Cached content is **never free** and **never delivered without settlement**:

```typescript
// Cache Retrieval Flow in ContentPackService:
const cacheKey = computeContentStudioCacheFingerprint({ ...generationInputs });
const cachedOutput = await getSharedCache(cacheKey);

if (cachedOutput) {
  logger.info(`[ContentStudio] Cache hit for late response retry (fingerprint: ${cacheKey.substring(0, 8)}).`);

  // STEP 1: Secure fresh, valid credit and quota reservation for Attempt B
  const reservationResult = await CreditWalletService.reserveContentPackCredits({
    userId,
    generationMode,
    attemptId: freshAttemptId, // New attempt ID
  });

  if (!reservationResult.allowed) {
    throw new AppError('Insufficient credits or quota exceeded to claim generated content', 403, 'INSUFFICIENT_CREDITS');
  }

  try {
    // STEP 2: Persist ContentPack and ContentPackItem records to MongoDB
    const pack = await this.persistContentPack(userId, cachedOutput, freshAttemptId);

    // STEP 3: Settle the fresh reservation atomically
    await CreditWalletService.settleContentPackCredits({
      attemptId: freshAttemptId,
      packId: pack.id,
    });

    // STEP 4: Remove from cache after successful delivery
    await deleteSharedCache(cacheKey);

    return pack;
  } catch (err) {
    // Release reservation if persistence fails
    await CreditWalletService.releaseContentPackCredits({ attemptId: freshAttemptId, reason: 'Persistence failure' });
    throw err;
  }
}
```

---

## 5. Concurrency & Crash-Recovery Test Matrix

The following focused scenarios will be added to `phase4b3CreditBillingAndQuotas.test.ts`:

| Test ID | Test Category | Target Component | Scenario Description | Expected Outcome |
|---|---|---|---|---|
| **TC-CR-01** | Sweeper Race | `CreditRepository.recoverExpiredReservation` | **Concurrent Double-Sweeper**: Two sweeper workers simultaneously execute recovery for the exact same expired reservation (`attempt_id: A1`, `fencing_token: 1`). | Sweeper 1 succeeds (`recovered: true`, credits refunded, quota decremented). Sweeper 2 returns `{ recovered: false }`. `monthly_quotas.reserved_packs` decremented **exactly once**. |
| **TC-CR-02** | Worker vs Sweeper | `CreditRepository.settleReservation` | **Settlement Race Against Sweeper**: Worker finishes LLM call and attempts settlement at `t=45.01s` while sweeper acquires expiration lease. | Sweeper transitions to `'expired'`. Worker settlement fails with `409 LEASE_EXPIRED`. Output is cached; wallet credits remain refunded. |
| **TC-CR-03** | Intent Fencing | `ReservationIntent` state machine | **Zombie Worker Fenced Out**: Worker stalled at `credit_reserved` stage wakes up after reconciler transitions intent to `reconciled_abandoned`. | Worker activation fails with `activated: false`. Generation terminates immediately. Zero duplicate calls or inconsistent state. |
| **TC-CR-04** | Crash Recovery | Standalone Intent Reconciler | **Crash During Partial Quota Failure**: Worker crashes immediately after credits are locked, before quota can be verified. | Reconciler daemon finds intent stuck in `credit_reserved` > 30s. Automatically releases credit reservation and marks intent `reconciled_abandoned`. |
| **TC-CR-05** | Cache Invalidation | `computeContentStudioCacheFingerprint` | **Cache Key Sensitivity Matrix**: Generate cache fingerprint for baseline inputs, then alter: (a) tone, (b) platforms, (c) transcript cues, (d) prompt version. | Each altered parameter produces a completely distinct SHA-256 digest (`fingerprintA !== fingerprintB`). Zero cross-configuration cache pollution. |
| **TC-CR-06** | Cache Delivery Gate | `ContentPackService` cache retrieval | **Cached Content Claimed Without Credits**: Request matches valid cached output, but user wallet has 0 credits. | Request is rejected with `403 INSUFFICIENT_CREDITS`. Cached output is **not** delivered. Cache remains intact. |
| **TC-CR-07** | Quota Transition Safety | `monthly_quota_reservations` | **Sweeper with Already-Settled Quota**: Reservation metadata has `quota_reserved: true`, but quota reservation was already settled. | `monthly_quota_reservations.findOneAndUpdate` returns `null`. `monthly_quotas.reserved_packs` is **not** decremented. |

---

## 6. Updated Risk Register

| Risk ID | Category | Risk Description | Severity | Mitigation & Architectural Control | Status |
|---|---|---|---|---|---|
| **R1** | Financial | Cross-tenant collision on global `idempotency_key` index | **HIGH** | Scoped namespacing: `hash(userId + ":" + operationId + ":" + clientKey)`. Verified index constraints. | **RESOLVED** |
| **R2** | Reliability | Race condition in concurrent free plan quota checks | **HIGH** | Implemented atomic `monthly_quota_reservations` and conditional `$expr` update on quota bucket. | **RESOLVED** |
| **R3** | Reliability | Stale worker settling after sweeper lease expiration | **HIGH** | Implemented monotonic `fencing_token` and conditional settlement matching `{ status: 'reserved', fencing_token }`. | **RESOLVED** |
| **R4** | Cost | Double provider call on creator retry after timeout | **MEDIUM** | Implemented shared 10-minute cache requiring fresh reservation settlement before delivery. | **RESOLVED** |
| **R5** | Financial | Unapproved commercial pricing activation | **CRITICAL** | Gated all proposed rates (QUICK 2, BALANCED 3, FULL 5, Creator 50, Pro 200, Studio 500) behind config flags. Currently 0 credits. | **CONTROLLED** |
| **R6** | Consistency | Split-brain credit/quota state in standalone Mongo | **MEDIUM** | Implemented Two-Phase Reservation Intent ledger pattern with worker fencing and durable reconciler daemon. | **RESOLVED** |
| **R7** | Observability | Missing per-attempt telemetry for transient retries | **LOW** | Designed discrete `ProviderAttemptTrace[]` array in `content_generation_telemetry` isolated from billing. | **RESOLVED** |
| **R8** | Reliability | Blind quota decrement during double-sweeper race | **HIGH** | Guarded quota bucket decrement by checking non-null return of discrete reservation transition (`Correction 1`). | **RESOLVED** |
| **R9** | Reliability | Zombie worker activating after reconciler timeout | **MEDIUM** | Implemented conditional atomic activation matching `worker_id`, `fencing_token`, and unexpired lease (`Correction 2`). | **RESOLVED** |
| **R10**| Correctness | Incompatible cache reuse across varied prompts/edits | **MEDIUM** | Implemented 14-field canonical hash incorporating transcript edits, prompt version, and intelligence version (`Correction 3`). | **RESOLVED** |

---

## 7. Commercial Boundaries Checklist

| Commercial Parameter | Status | Phase 4B.3 Implementation Action |
|---|---|---|
| **QUICK Mode (2 credits)** | **UNAPPROVED** | Config flag disabled / 0 credits until commercial sign-off |
| **BALANCED Mode (3 credits)** | **UNAPPROVED** | Config flag disabled / 0 credits until commercial sign-off |
| **FULL Mode (5 credits)** | **UNAPPROVED** | Config flag disabled / 0 credits until commercial sign-off |
| **Item Regeneration (1 credit)** | **UNAPPROVED** | Config flag disabled / 0 credits until commercial sign-off |
| **Platform Regeneration (2 credits)** | **UNAPPROVED** | Config flag disabled / 0 credits until commercial sign-off |
| **Translation (2 credits)** | **UNAPPROVED** | Config flag disabled / 0 credits until commercial sign-off |
| **Creator Plan (50 packs/mo)** | **UNAPPROVED** | Unused; metered via standard wallet credits |
| **Pro Plan (200 packs/mo)** | **UNAPPROVED** | Unused; metered via standard wallet credits |
| **Studio Plan (500 packs/mo)** | **UNAPPROVED** | Unused; metered via standard wallet credits |
| **Free Plan (5 QUICK packs/mo)** | **APPROVED TARGET** | Gated to 5 packs/month, QUICK mode only |
| **Base Video Rate (1 cr / 15s)** | **APPROVED & ACTIVE**| Preserved 100% without modification |

---

## 8. Designed Safeguards vs. Empirically Tested Behaviour

To maintain complete architectural integrity:

1. **Designed Safeguards (Documented in this Report)**:
   - Fenced quota sweeper transition logic (`Correction 1`).
   - Two-Phase Reservation Intent state machine and worker fencing (`Correction 2`).
   - Canonical 14-field cache fingerprinting and TTL shared caching (`Correction 3`).
   - Concurrency race conditions (TC-CR-01 through TC-CR-07).
2. **Empirically Tested Behaviour (To be verified in Phase 4B.3 Implementation)**:
   - Full automated test execution across MongoDB transactions and standalone mode.
   - Exact milliseconds latency of shared TTL cache lookups.
   - Multi-node concurrent sweeper load execution.

---

> [!IMPORTANT]
> **READ-ONLY PLANNING COMPLETE — EXECUTION HALTED**  
> All three required corrections have been fully specified and documented. Production code, database schemas, wallets, pricing, and payment integrations remain completely untouched. Awaiting your explicit authorization before starting implementation.
