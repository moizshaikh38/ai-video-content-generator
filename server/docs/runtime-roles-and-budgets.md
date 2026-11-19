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

Existing render/thread behavior is preserved when the following variables are absent. No lower preset, resolution, frame rate or CRF is selected by this feature.

- `VIREO_RENDER_MAX_CONCURRENT`: positive integer upper bound, still subject to the existing maximum of four renders per process.
- `VIREO_FFMPEG_THREADS`: positive integer decoder/filter/encoder thread setting for the Quick and Pro final render invocation paths. This is not a process-wide bound on every Python/OpenCV or media helper.
- `VIREO_RENDER_MEMORY_BUDGET_MB` and `VIREO_RENDER_ESTIMATED_JOB_MB`: configure together. A conservative per-job estimate must come from representative measurement, not a short demo. The configured total, cgroup-v2 limit when readable, and live cgroup headroom constrain admission. No free slot leaves the job queued.
- `VIREO_RENDER_MEMORY_RESERVE_MB`: positive reserve, default 256 only within the opt-in memory policy. This reserve is an operator safety allocation, not a measured application requirement.

With budgets enabled, CPU affinity/available parallelism and readable cgroup-v2 CPU quota constrain capacity too. Unavailable cgroup metrics are not a proof of unlimited resources; the explicit memory budget still applies. These are per-process controls. Replica multiplication and other workers require a separate deployment-wide capacity budget.

Lower concurrency can increase queue wait; fewer threads can slow an individual render. API isolation protects responsiveness but does not eliminate rendering CPU work. Do not claim reduced total cost, instant output, unchanged latency or a customer capacity without a representative before/after benchmark.

## Still open

Source extraction/transcription and several explicit analysis/CV HTTP workflows still run inline. This role split is not complete isolation of all expensive operations. Those workflows need durable queue/admission and recovery design before moving them off API processes. Runtime image dependencies, full build/typecheck, hosted two-role deployment, representative media latency/throughput/RAM/scratch measurements and chosen budget values remain rollout checks. Do not substitute notification tests or small retained-source renders for those checks.
