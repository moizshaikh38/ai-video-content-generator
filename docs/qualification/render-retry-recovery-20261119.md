# Retry-budget and stale-job recovery, 2026-11-19

## Corrected behavior

The queue previously requeued every stale processing job, including a final exhausted attempt, then selected only jobs with attempts below a hardcoded three. Exhausted jobs could stay queued forever. A job-specific max_attempts above three was also ignored by selection. Three enqueue paths initialized attempts to one and the lease claim incremented it again before the first execution.

The local correction uses one retry-budget policy for JavaScript decisions and MongoDB due/claim expressions. Missing legacy counts default to zero and missing maximum to three. Nonnegative safe integer counts are required; malformed values fail closed. A maximum of zero permits no executions. New enqueue paths start at zero. Transient pre-lease launch failures use a separate bounded prelease_failures counter rather than consuming acquired render executions. This counter wiring has focused source checks; a full pre-lease outage drill remains open. An atomic acquired lease increments exactly once, including a null legacy count.

The real lease claim binds job, clip and owner; respects the configured budget; and requires either a clean queued job or an expired processing heartbeat. It records original render/editor revisions. Two competing fresh claims cannot both acquire the job.

Recovery is now a maximum 25-record batch, not an unguarded bulk reset. Each transaction rechecks the exact scanned worker token, heartbeat, owner, clip and state. A refreshed/replaced worker defeats recovery. Retryable stale processing jobs become queued without inventing another consumed execution. Exhausted or malformed queued/stale jobs become failed. Clip display state changes only for a revision-bound latest job, only if the clip still has that version and an active queued/rendering/uploading state. An old or unbound legacy job cannot overwrite a newer ready clip.

## Evidence

39 focused tests passed across retry budget, lease commit, startup recovery wiring and render parity. Server TypeScript passed after integration. This is not the full repository test suite.

Real MongoDB 7.0.16 replica-set tests used only a new loopback database, vireo_render_retry_20261119_0015. No existing database content was inspected or changed, and no document/database was deleted. Final retained records: 26 jobs and 9 clips.

Seven actual recovery scenarios passed:

- Retryable stale jobs requeue atomically, including a configured budget of five.
- Exhausted and invalid-count jobs fail rather than stay queued forever.
- Fresh heartbeat stays unchanged.
- A legacy unbound job does not authorize changing clip display state.
- A heartbeat/token changed after the initial scan prevents recovery of that worker.
- An old job cannot overwrite a newer ready clip version.
- Actual Mongo expressions match JavaScript policy for ten missing, null, valid, configured and malformed inputs.

Six additional checks called the same production lease-claim function used by renderClipJob: first execution count one, null legacy count, configured maximum five, exhausted denial, owner/clip denial, exactly one winner from two simultaneous claims, and acquisition of the final allowed execution from an expired processing lease. The first check combines zero/null cases; the owner check combines owner/clip cases.

Each real test group finished in 0.50 seconds under the existing 15-second/20-MiB work guard. Shared-memory peaks were 1,358,835,712 and 1,364,557,824 bytes; retained evidence work stayed under 12 KiB. This does not cap the database's global storage/cache, so fixture counts were separately bounded. No encoder, media, provider or real object storage was used.

Scripts: render-retry-real-mongo.mts and render-claim-real-mongo.mts under server/scripts/local-qualification. They refuse unexpected pre-existing fixture state.

### Actual queue sweep integration

The actual ClipRenderService.processDueRenderJobs method ran against another new isolated loopback database, vireo_render_sweep_20261119_0018, with only three synthetic jobs and three clips. It terminalized the expired exhausted job and its bound clip, preserved a fresh worker, and selected the configured-max-five job while handing off in its correct real owner context. Only renderClipJob itself was replaced with a no-op recorder so no media, acquisition or encoding could run. All three checks passed in 0.75 seconds, shared-memory peak 1,391,374,336 bytes. The six fixtures remain for audit. This is actual sweep/database integration, not render execution or a process-kill test.

## Remaining limits

No live migration or recount of old attempt values was performed. Historical counts retain their stored meaning; the new zero-based enqueue behavior applies only to newly created jobs. Legacy unbound jobs may need reviewed UI recovery because the queue intentionally does not guess their clip revision. There is no user-data bulk repair.

This qualifies actual isolated claim/recovery database paths, not full process-kill/restart, normal HTTP render execution, production topology, service drain, R2 fault behavior, provider/caption correctness or visual acceptance. Transaction unavailability fails closed. Deployment, monitoring and a recovery drill remain required before release.
