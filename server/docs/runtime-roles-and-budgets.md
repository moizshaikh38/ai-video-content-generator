# Runtime roles and render budgets

No hosting configuration is changed by this code. `VIREO_SERVICE_ROLE` accepts:

- `combined` (default): existing HTTP and background-worker deployment shape.
- `api`: application HTTP routes and durable job admission remain available. Inline rendering and render/multimodal/publishing sweeps do not run here.
- `worker`: health/readiness HTTP endpoints remain for supervision; application `/api` requests return `WORKER_ONLY`. Background queue processing runs here.

A split deployment needs API and worker instances pointing to the same transactional Mongo database and object storage, with the same compatible code and secrets. Do not enable API-only mode without an available worker. Mongo leases still own job claims and terminal writes. Roles do not replace ownership, admission or lease fencing.

## Queue pickup

Committed queued-render inserts/updates wake the existing worker drain using a Mongo change stream. Notifications are coalesced and drains do not overlap within the notification scheduler. A notification is not a lease or success receipt. The existing periodic recovery sweep remains for disconnects, missed events and retries. Its default is still 60 seconds. `VIREO_RENDER_SWEEP_INTERVAL_MS` can explicitly select 1000 through 60000 milliseconds; faster fallback polling adds database work and needs measurement before rollout.

An independent writer-process test with local transactional Mongo checks that an uncommitted job is not observed and a committed job wakes the callback without waiting for the periodic sweep. This is pickup evidence, not an end-to-end encoding speed or hosted availability guarantee. Terminal stream errors and closes trigger a reopen with bounded 1-to-30-second exponential backoff, plus a recovery drain after reopening. Stale streams cannot request drains, shutdown cancels reconnect, and watch-construction errors do not crash startup. Local tests cover those controls and a real Mongo stream close with work queued during the outage. This is not a hosted network-partition or Mongo restart test. Warnings and periodic recovery remain; pickup during an outage can still wait for the fallback interval. No uninterrupted-notification guarantee is made.

## Explicit budgets, not new unmeasured defaults

Default render capacity honors available CPU affinity and readable cgroup-v2 CPU quota, even when explicit budget variables are absent. Existing encoder/thread defaults are preserved when the following variables are absent. No lower preset, resolution, frame rate or CRF is selected by this feature.

- `VIREO_RENDER_MAX_CONCURRENT`: positive integer upper bound, still subject to the existing maximum of four renders per process.
- `VIREO_FFMPEG_THREADS`: positive integer decoder/filter/encoder thread setting for the Quick and Pro final render invocation paths. This is not a process-wide bound on every Python/OpenCV or media helper.
- `VIREO_RENDER_MEMORY_BUDGET_MB` and `VIREO_RENDER_ESTIMATED_JOB_MB`: configure together. A conservative per-job estimate must come from representative measurement, not a short demo. The configured total, cgroup-v2 limit when readable, and live cgroup headroom constrain admission. No free slot leaves the job queued.
- `VIREO_RENDER_MEMORY_RESERVE_MB`: positive reserve, default 256 only within the opt-in memory policy. This reserve is an operator safety allocation, not a measured application requirement.

CPU affinity/available parallelism and readable cgroup-v2 CPU quota constrain default capacity; explicit render/thread caps can reduce it further. Unavailable cgroup metrics are not a proof of unlimited resources; the explicit memory budget still applies. These are per-process controls. Replica multiplication and other workers require a separate deployment-wide capacity budget.

Lower concurrency can increase queue wait; fewer threads can slow an individual render. API isolation protects responsiveness but does not eliminate rendering CPU work. Do not claim reduced total cost, instant output, unchanged latency or a customer capacity without a representative before/after benchmark.

## Still open

Source extraction/transcription and several explicit analysis/CV HTTP workflows still run inline. This role split is not complete isolation of all expensive operations. Those workflows need durable queue/admission and recovery design before moving them off API processes. Runtime image dependencies, full build/typecheck, hosted two-role deployment, representative media latency/throughput/RAM/scratch measurements and chosen budget values remain rollout checks. Do not substitute notification tests or small retained-source renders for those checks.

## Owner-fair render dispatch

Inline launches and recovery sweeps consult the same durable ordering before
claiming a queued render. Each owner's oldest eligible job competes, and the
owner least recently started is chosen first. New owners tie at epoch and use
oldest queued creation time. History comes from actual `render_jobs.started_at`,
written with the Mongo server clock only on a successful atomic claim. An inline
request that is not next remains queued without spending an attempt. This can
increase that individual job's wait in exchange for avoiding a single owner's
backlog monopolizing every next dispatch. It is not a latency or throughput win.

The fair-head check and claim run in a snapshot transaction. A competing worker
must recheck after a write conflict. A failed query or transaction does not fall
back to an unfair or unfenced claim, and does not spend execution/pre-lease retry
budgets. Admission operations have a 2-second query/commit bound and a 5-second
transaction deadline. Jobs remain queued on admission unavailability. Bootstrap
adds queued-creation and owner-started indexes to the existing job collection;
there is no new owner-state service or table. Do not skip normal database
bootstrap during rollout. Large-backlog query cost still needs production-like
measurement. No unlimited backlog or strict maximum wait is promised.

A freed slot nudges the existing notification drain after a successful acquired
lease or meaningful queue progress. An out-of-turn inline reservation also hands
off once after release. An unchanged busy/pre-lease failure must not generate an
endless release/wake loop. If a queued job is blocked by its clip's still-active
remote/older render, its exact unclaimed snapshot is deferred for two seconds,
without spending execution or pre-lease attempts. This lets other eligible owners
advance rather than repeatedly consuming every bounded sweep. The next actual
pickup still depends on notifications/periodic recovery; two seconds is not a
latency guarantee. Notifications remain hints, not ownership. Periodic
recovery is still required when streams or workers are unavailable.

Local qualification covers a 100-job older single-owner backlog followed by two
other owners, real atomic claim races, second-connection ordering, wrong-owner
refusal, inline deferral without attempt consumption, saturated-then-freed slot
pickup, and no hot loop on an unchanged busy job. This is control-plane evidence
with synthetic jobs, not concurrent media, customer capacity, full API E2E, or
hosted Mongo availability evidence. User/plan quotas, media quality and encoder
settings are unchanged. New-owner floods, other queues, and overload admission
need their own work; fair dispatch does not create capacity.

## Resource admission still required

The host-memory/CPU resource problem is separate from dispatch fairness. Current
render budgets are opt-in and per process. Project processing/clip CV locks are
also per-identity duplicate guards, not an overall multi-user memory budget. A
configured API/worker split must not be described as complete expensive-work
isolation while those explicit processing/analysis routes still run inline.

A complete next step needs durable heavy-work admission for source processing,
CV and render work, an explicit shared host/pool identity, atomic leased resource
reservations across processes, crash/expiry recovery, and resource class costs
measured on representative inputs. New owners or retries must not bypass the
same gate. Missing/unmeasured worker policy must be visible instead of silently
reported as automatic capacity. Do not guess production memory costs from short
1080 examples, set arbitrary universal safe concurrency, reduce final quality,
or claim that slower queues are a speed improvement. No such deployment-wide
resource policy is activated by the owner-fair change.

## Optional background-worker opt-outs

`VIREO_PUBLISHING_WORKER_ENABLED` and `VIREO_MULTIMODAL_WORKER_ENABLED` independently control the persistent publishing poller and multimodal timeline poller. Each accepts `true`/`1` or `false`/`0`; absent or empty preserves the existing enabled default. Other spellings fail startup validation. The `api` role never runs either poller, even with an enabled flag. Render recovery, reservation/cache cleanup and OAuth-state cleanup are not disabled by these flags.

The flags gate timer startup and polling entry points before database work. They are deployment configuration, not a cancellation API. Restart with the reviewed configuration; this change does not cancel, delete, mark successful, or drain queued jobs. Running work is not interrupted by changing an environment variable. An available compatible enabled worker is still needed to service each queue. Disabling every consumer leaves those jobs pending, including pending provider-status resolution. Do not call a disabled optional workflow available or fully qualified.

These flags do not disable direct user-requested publishing, analysis enqueueing, source processing, or explicit analysis/CV HTTP routes. They are not feature-access controls, a platform-wide publishing kill switch, or complete API workload isolation. Existing permissions and job/lease fencing remain necessary. No hosting settings are changed by this implementation.

Local tests exercise the flag/role matrix, malformed-policy startup refusal, disabled entry-point refusal before job claim, enabled boundary reachability with fixture callbacks, and publishing timer suppression. No database, provider dispatch, actual multimodal processing, hosted restart or backlog-drain acceptance is claimed by those tests.
