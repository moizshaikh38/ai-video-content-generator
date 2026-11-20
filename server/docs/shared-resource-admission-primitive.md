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

This is not yet permit integration. Qualification-only slice staging, source processing and parent-worker death
recovery are not supervised by this change. Render heartbeat
loss/uncertainty now cancels the nested supervised CV path, and all three normal FFmpeg encoder routes now use the same signal on Linux.
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

Render heartbeat renewal now matches job, clip, user, worker and processing
status, using Mongo time and a bounded majority write. A missing match or
ambiguous database failure aborts the render's CV signal. The signal passes
through render-time auto-reframe into the actual analyzer, and cancellation is
checked before track persistence and before proceeding beyond auto-reframe.
Fencing, cancellation, unverified stop and resource-policy errors must propagate,
not turn into ordinary center-crop fallback followed by more expensive encoding.
Ordinary analyzer errors keep the existing fallback behavior. Detection still
uses the existing 15-second heartbeat cadence; this is not instantaneous lease
loss detection or cancellation of every media process.

An unverified process stop retains the CV duplicate guard/temp files and
quarantines the render's local capacity slot rather than pretending it was freed.
There is no automatic clear/restart recovery for that quarantine. A supervisor
must prove exit before freeing capacity; a restart alone is not that proof.
This can reduce availability, intentionally, rather than overadmit after an
unknown stop. The shared pool ledger remains unused. A real Mongo/harmless-child
regression covers lease replacement and cancellation, and a stubbed analyzer
orchestration test checks retained guards/files without launching unsafe work.
Stage progress updates no longer overwrite the claim's server-clock `started_at`,
so owner-fair history is not silently changed at the cutting stage.


The existing explicit-argv compiled-graph encoder and quick-clip music/ducking
encoder now call the same supervised process execution with the render signal.
The argv generation, codec/quality flags and duration are unchanged. Encoder
timeout/cancellation waits for owned-group exit on Linux. Hardware fallback does
not start a software encoder after timeout, cancellation, fencing, missing exit
proof or admission-policy failure; ordinary hardware initialization failures
still use the existing software fallback. Filter scripts and staged intermediate
files are retained when the encoder stop is unverified.

A tiny synthetic 64x96, two-frame H.264 encode checks the actual executor's codec,
dimensions, frame count and decoded red pixel. Real FFmpeg realtime null-output
fixtures check timeout and cancellation. These prove execution/cancellation
mechanics only, not customer output quality, long-video performance or multi-user
capacity. Offline slice preparation and source processing still prevent describing
complete shared heavy-work admission or activating a measured shared pool.


The ordinary quick-clip fluent builder now also executes its existing argv through
the supervised Linux executor. A compatibility boundary checks the pinned
fluent-ffmpeg private `_getArguments` API and matches native spawn's numeric argv
string conversion. The current fixed H.264/AAC MP4 options have no experimental
codec additions in fluent's native preparation. Tests compare all four
linear/labeled and audio/muted fixture argv arrays to native prepared arguments,
then encode each through the actual adapter and check codec, dimensions, frame
count, audio presence and a decoded pixel. Timeout and cancellation also pass
through the adapter. This compatibility check must be revisited on any fluent
upgrade or codec/output-mode change; unknown argv construction fails rather than
running a guessed command. Native stderr timestamps retain bounded progress
updates. Diagnostic output is bounded by the supervised executor; non-Linux keeps
the old fluent execution and has no group guarantee.

This closes the main normal encoder process-group gap, not the whole source/CV/
render shared-admission outcome. Qualification-only slice preparation, ancillary
probes/reviews, source processing, actual host policy sizing and crash recovery
remain separate. The shared resource permit is still not activated. Tiny fixture
encodes and argv equivalence do not replace representative integrated customer
output testing or concurrent media capacity measurements.

## Source audio extraction and its parallel header probe

On Linux, the actual MP3 extraction and A/V start-time ffprobe now use supervised
owned groups. The MP3 codec, bitrate choice/re-encode policy, mono/16kHz settings,
`aresample=async=1:first_pts=0`, and timestamp options are unchanged. Extraction
failure cancels and joins the parallel header probe before deleting owned
scratch. Ordinary probe errors still degrade to `probed:false`; cancellation or
missing exit proof cannot be disguised as an ordinary unprobed source.

The extractor retains owned source/audio files when either process stop is
unverified. The main source-processing caller also retains its borrowed source
and duplicate guard in that case. Intelligence and content-handoff optional
fallbacks propagate lifecycle errors instead of starting more work after them;
bookkeeping failure must not replace that error with an ordinary fallback.
Those caller guards have source-wiring qualification, not full paid workflow
execution. There is still no automatic proven-exit recovery for quarantine.

A short synthetic source with offset audio compares the production supervised
extractor to native fluent extraction with the same settings. Decoded PCM is
identical, as are A/V start diagnostics. Actual timeout/probe-join, pre-cancel,
owned-scratch cleanup and borrowed-source retention checks pass without any
transcription or billing provider. This does not prove linguistic word timing,
all container formats, source-processing throughput or a shared memory budget.
The full source pipeline still includes source resolution, fire-and-forget
poster work, provider/chunk processing and downstream analysis that are not
covered by this extraction-only lifecycle change. Non-Linux extraction retains
the legacy execution path and has no process-group guarantee.
