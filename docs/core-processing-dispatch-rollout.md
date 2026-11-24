# Core processing intent dispatch V1

Dormant, not enabled or deployed. Requires explicit `VIREO_CORE_PROCESSING_DISPATCH_V1=1` and positive operator-supplied `VIREO_CORE_PROCESSING_MAX_ACTIVE`. No production count is chosen. Defaults retain existing API-only refusal and combined inline behavior.

API admission persists owner/project/source/request-attempt intent before credit reservation. Waiting jobs hold no wallet credits. Same attempt is idempotent; another queued/processing/review-required intent for that owner/project refuses. Current completed-attempt readback and explicit recover-only behavior precede queue admission. This is a new processing request, not permission inferred from an email or another account.

The worker atomically claims queued work under a shared persisted active-count policy. Processing/review-required jobs count until known terminal; no stale timeout reclaim. Process-local single-flight and WorkLifecycle cover claim, awaited existing admission/pipeline and final reconciliation. Unknown outcomes retain claim and quarantine the process slot. A 202 idempotent reservation acknowledgement is not completion or stop proof and requires review.

Worker continues through the existing core controller's current ownership/source/state/provider/entitlement checks, transcript reuse, reservation, project claim and existing processing executor, awaited rather than detached. It establishes owner context from the persisted intent. The request contains no user-controlled internal-worker bypass. Existing wallet settlement, completion receipt and source/run-token fences remain the authority. The queue itself never reserves, charges or refunds credits. A source replacement/deletion before worker continuation refuses. Active-source changes later still rely on existing executor fences.

The core executor ends at transcription. An explicitly requested transactional continuation outbox can now deliver an immutable selection intent without a browser remaining open. The client continuation change is still held pending mounted lifecycle/pixel proof. Genre/layout/framing, caption review, render admission and final clip output are separate existing stages. This handoff is not automatic upload-to-final-clip completion or output quality evidence.

Do not enable without compatible API/workers, database/storage/provider configuration and source-disclosure/cost permission. A recent stage/protocol/count registration gate and additive query-index definitions now exist. Registration is not worker liveness, free capacity or provider readiness; no deployed index build is certified. Measured CPU/RAM/scratch envelopes, retention/audit-snapshot policy, cancellation/recovery UI and verified stopped-worker reconciliation remain open. The active count is not a measured host-resource budget. No automatic policy migration or expiry-based capacity release. A crash after claim can block indefinitely and needs explicit stopped-worker review, not blind retry. Do not change count policy during active work.

Local tests use a synthetic source-bound transcript and local HEAD fixture through actual API, durable queue, worker continuation and existing zero-credit settlement/publication. No external ASR/provider or source media upload, and no automatic clipping/GPU claim. The new fresh paid-provider path is not externally exercised by this qualification. New intents require a recent matching registration, but a worker can disappear immediately afterward, so saved jobs can still wait indefinitely. Flag off does not cancel already queued/claimed work or release a wallet reservation.

## Project status read projection

New queued intents atomically attach an exact job-key/source/attempt pointer to
the owned project. List/get reads use those indexed job keys, not history scans.
A queued successor stays queued even when its earlier transcript is complete.
Source replacement or a newer actual attempt supersedes the pointer. Reads do
not fabricate a run token, reserve credits or change stored admission status.

Pre-pointer dormant intents from earlier builds remain claimable but are not
discovered by this projection. Explicitly reconcile/drain those rows before
rollout. There is no implicit migration and toggling the flag does not repair
them. Persisted pointers are still read after the rollout flag is turned off.

Lookup errors, missing pointed rows or mismatched data are unknown, not proof
of completion. They leave list/get available and conservatively project the
pointed project as in-progress with unavailable status and an explanatory error.
That can hide an actually completed project until status storage is readable.
Unrelated projects without pointers do not query the dispatch collection.

Qualification here is API/status evidence only. Existing frontend queued
polling is the intended consumer; mounted browser polling/reload behavior has
not been demonstrated by these tests and is not claimed as verified.

## Operational evidence and remaining limits

Startup compares configured counts with existing v1 capacity rows before index
or schema writes. Missing policy is not silently initialized by that read, and
a post-read change still relies on claim-time contention checks. No count is
selected or migrated. The read-only diagnostic in
`durable-dispatch-inspection.md` reports exact lifecycle state, never verified
stop, replay permission or a recovery action.

Project deletion removes/redacts durable dispatch payload while retaining
uncertain active/review state and worker fences. Wallet, ledger, reservations
and full financial completion snapshots are unchanged. This is not a complete
retention or erasure policy.

A fresh tiny synthetic source fixture now exercises actual download, probe,
FFmpeg audio extraction, wallet settlement and substituted ASR; a continuation
fixture adds real selection persistence with a synthetic response and unranked
fallback. None proves actual ASR quality, source-disjoint selection quality,
GPU/CV capability or final export. No production resource envelope or safe
concurrency follows from these small synthetic fixtures.
