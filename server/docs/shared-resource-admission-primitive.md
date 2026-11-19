# Shared resource admission primitive, not activated

`resourcePoolAdmission.ts` is a code-only accounting primitive. No production service imports it, no startup collection/index is added, and it changes no runtime defaults or media quality. Owner-fair dispatch in `ownerFairRenderQueue.ts` remains a separate concern.

## Contract

- A caller must supply a shared pool identity, explicit measured policy revision, memory MB, CPU millicores, scratch MB, and maximum simultaneous reservations. These are policy inputs, not measured automatically by this helper.
- Each job needs a measured or conservatively validated resource envelope for its actual operations. Short diagnostic 1080 outputs do not supply general 4K or long-source costs.
- `initialize` records an immutable policy digest. Conflicting policy and missing pool refuse admission, rather than silently creating another capacity pool or guessing limits.
- Atomic single-document updates enforce all resource axes and reservation count together across processes/connections. Each identity contains an unpredictable reservation ID, owner, worker, kind and scope.
- Duplicate IDs do not reserve twice. Wrong-owner/worker renewal or release fails. Reservation values are literal data, not database expressions.
- Mongo time controls lease start/renewal/expiry. Renewal after expiry fails. Admission operations have bounded database timeouts and no local fallback on database failure.

## Expiry is quarantine, not free capacity

Expired reservations continue to count. A stopped heartbeat does not prove a child process exited. Automatically deleting expired reservations would allow new work while an old FFmpeg/Python process might still consume RAM, CPU or scratch.

`releaseAfterWorkStopped` must only be called after the owning supervisor verifies that all work and children using that reservation have exited. The method verifies reservation identity, not OS process death. There is deliberately no public route, automatic TTL deletion or timer-based reclaim. This is safe against automatic overadmission after expiry, but it can strand capacity until proper recovery exists. Do not describe it as complete crash recovery.

## Required integration before activation

1. A supervisor owns the process group and awaits child exit on cancellation, timeout, lease loss and shutdown. Failed renewals stop new work/publication, cancel owned children and retain capacity until exit is proved.
2. Nested render-to-CV work either uses a verified combined envelope or an explicit safe escalation protocol. A second independent reservation can deadlock; reusing an insufficient parent envelope can overadmit.
3. Render capacity denial leaves the existing durable job queued and does not spend execution/pre-lease attempts. Source processing and explicit CV need durable job/usage semantics too, rather than being marked media failures on saturation.
4. Workers sharing a host/pool must share one identity and exact policy. Separate IDs on the same machine can bypass the budget. Physical limits and system reserve must be validated against the target host; limits cannot be inferred from this local environment.
5. Startup/readiness must expose missing or conflicting required policy. A permit ledger does not measure actual memory consumption, prevent an underestimated job from exceeding its envelope, or create processing capacity.
6. Representative actual media plus concurrent control and failure qualification must precede activation. A synthetic weighted-budget test is not throughput, latency or an instant-results promise.

## Local evidence

The targeted fixture uses the existing isolated local `render_jobs` collection only as an injected document store for the primitive. Its documents have synthetic prefixed IDs and no queued render status; they are deleted in `finally`. No new collection/index is created, and the helper is not wired to real render jobs.

Tests cover cross-connection races, independent memory/CPU/scratch/count gates, duplicate IDs, policy mismatch, missing pool, wrong identity, literal owner values, renewal and expiry quarantine, release after fixture work stopped, and database outage propagation. Fixture resource numbers are arbitrary test units, not production capacity recommendations. Full application typing/build, nested scopes, real child-process cancellation, durable queue integration and hosted behavior remain unverified.

## First supervised workload path

On Linux, `SmartReframeService.runCvAnalyzer` now uses `supervisedExecFile` for its
actual Python launch. The helper creates a dedicated process group, captures
bounded stdout/stderr, sends input without a shell, and stops the owned group on
timeout, cancellation or output overflow. It waits for child close and checks
`/proc` for remaining non-exited group members before returning. A successful
leader cannot leave silent same-group descendants running. A supplied
`AbortSignal` is optional and leaves existing callers unchanged. The former
CV timeout could reject immediately after issuing kill, before exit was known.

The timeout error remains `REFRAME_ANALYSIS_TIMEOUT`; malformed JSON and provider
status errors remain distinct. Local fixture executable tests exercise the real
service launch path as well as the low-level child tests. One retained gaming
source's 0..1 second interval produced an exactly equal analyzer JSON result
through the service and standalone Python with the same inputs/environment.
This is a narrow correctness check, not representative quality/capacity evidence.

This is not yet permit integration. Render FFmpeg execution, source processing,
parent-worker death recovery and lease-loss cancellation are not supervised by
this change. Existing callers do not yet pass a distributed lease-loss signal.
A child deliberately escaping its process group is outside this helper's scope;
the trusted CV script's ordinary FFmpeg/Tesseract children inherit the group.
A worker killed outright may leave children behind, so expired resource permits
must still quarantine capacity. Non-Linux uses direct execFile and has no group
exit guarantee. An unreadable `/proc` or unverified stop must never be interpreted
as permission to free a resource reservation. Uninterruptible kernel work can
prevent close; the helper must not claim it has exited.

Detached groups also change local measurement: a guard that sums only the
parent's process group omits the analyzer. Qualification must sum the recursive
owned descendant tree, retain observed reparented children in that accounting,
and include those children in guard-stop cleanup. Summed RSS can double-count
shared pages and sampling can miss short peaks. The local guard limits are not
production resource policy.
