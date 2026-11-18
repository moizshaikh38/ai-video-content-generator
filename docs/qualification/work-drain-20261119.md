# Process-local admission and bounded drain qualification

2026-11-19 IST. Backup branch only, not a production rollout or a completed restart qualification.

## Defect and lifecycle map

The old signal handler stopped timers and closed HTTP, then immediately closed Mongo and exited successfully. Detached work could still be rendering, transcribing, publishing or finalizing records. Closing a client socket also did not prove its async handler had finished. Startup/bootstrap could finish after shutdown and start new timers.

The affected lifetimes checked in source are:

- admitted HTTP response lifetime and separately the actual async handler promise, including disconnected clients;
- detached inline/direct clip renders, reserved render slots and final cleanup;
- project transcription/processing and its background outcome/reservation cleanup;
- smart reframe analysis and subtitle-burn workers;
- immediate/retry and scheduled publishing jobs;
- multimodal processing and render/multimodal sweeps;
- initialization/bootstrap, reservation/cache/OAuth maintenance;
- in-flight render, autopilot and video-intelligence heartbeat callbacks.

Other work that is awaited by the HTTP async handler is covered by that handler lifetime, not a claim that every individual service has a new wrapper.

## Implementation

`WorkLifecycle` records admission synchronously before the first await and removes it only after work/finally cleanup settles. Draining rejects new root work with 503 `SERVER_DRAINING`. A child of work still admitted can finish necessary downstream work. An orphan callback cannot use an ended context to reopen admission during drain. Separately registered children remain tracked after their parent returns.

Readiness reports `not_ready` during drain without opening a new database check. Process liveness remains available. HTTP admission returns 503 and closes the connection for new non-probe traffic. Pollers stop; already running sweeps have tracked lifetimes and do not start another loop iteration. Startup checks the drain flag before retries/worker startup, and the actual bootstrap operation is tracked even if its startup timeout wins.

One shared existing 10-second deadline covers HTTP close, tracked work and Mongo close. Database close begins only after HTTP and all tracked work settle. Repeated signals share the same shutdown promise. A timeout or close failure cannot report a successful graceful exit. Timeout does not clear leases, mark jobs complete, delete data or close Mongo underneath work that remains active. The process-level caller exits nonzero on that outcome.

An initial actual HTTP fixture found that render work became idle before the launcher's reserved-slot `finally` ran. The slot cleanup was moved inside its own tracked inline-launch lifetime. The fixture was rerun and verifies zero render occupancy before database-close invocation.

## Evidence

- Final focused regression group: 84 tests pass, including 10 lifecycle tests and existing admission/render recovery/caption/revision/retry/upload checks. Frontend/server typechecks pass. Existing source-wiring regression expectations were updated for the tracked sweep and shared timer shutdown, not removed.
- `work-drain-http.mts`: five checks over an actual loopback HTTP server and actual admission/async-handler/service wrapper paths. Render execution is an injected deferred function, and database close is a counting function. Checks include HTTP 202 while render remains active, client disconnect while its handler remains active, 503 admission/readiness during drain with live health response, real detached entry-point rejection, and HTTP/background/slot cleanup before close.
- `work-drain-real-mongo.mts`: four checks with an actual isolated loopback Mongo transaction and client close. Database `vireo_drain_transaction_20261119_0100` was new and contains one retained synthetic completed record. The transaction is held while drain starts, the pool stays open, new root admission is refused, then the transaction/session finishes before the pool closes. A separate loopback client confirms the committed record afterward.
- Unit negatives cover stalled HTTP/work, late completion after timeout, close errors, repeated shutdown calls, child admission, orphan callbacks and detached-child lifetime. They do not terminate the test runner or any real worker.

## Still unqualified

No signal was sent to the actual server; no process was killed or restarted; no encoder/provider/storage operation was used in these checks. Child-process reaping, external-provider cancellation, host/container stop grace periods, real-load queue handoff, interrupted transcription/import and production database topology remain open. The 10-second deadline is not evidence that a long real render will finish in time. The process-local registry is not a distributed lock, recovery protocol or an exactly-once guarantee.

No production mutation, user-data read/deletion, media acquisition, ASR, video encode, external storage write, install or spend occurred. This is measured shutdown-ordering improvement, not full production readiness.

## Later owned-fixture signal check

Under a separately confirmed narrow scope, `work-drain-signal.mjs` bundles the actual coordinator unchanged into a tiny owned Node fixture. Four sequential child scenarios passed: graceful SIGTERM ordering; two observed SIGTERM deliveries with one database-close callback; stalled-work nonzero timeout without database closure; and a fresh child with admission open after the failed fixture. Only test-owned child PIDs receive signals. No application server, real database, media, provider, existing process or deployment starts. The observed RSS peak was below 64 MiB, every scenario below five seconds, and evidence below 32 KiB. Exact measurements are in its result JSON. This is real signal/coordinator fixture proof, not actual application restart, production lease recovery or FFmpeg-child reaping proof.
