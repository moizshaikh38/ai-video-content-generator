# Database bootstrap and readiness

The application already requires replica-set or mongos transaction topology for financial operations. Bootstrap now checks that same necessary prerequisite before listing or changing collections and indexes. A standalone or unverifiable database cannot complete bootstrap and become API-ready merely because ping works.

The read-only hello operation uses the driver's 2000ms operation timeout. Only a CommandNotFound error permits one bounded legacy isMaster attempt. Network, timeout and permission failures propagate; they do not trigger a second handshake. The existing financial topology assertion uses the same bounded helper. No probe starts a financial transaction or changes documents.

This is a necessary topology shape check, not proof of transaction permissions, majority-write availability, commit health, hosted network behavior, schema completion, old-writer retirement or compatible worker rollout. The normal schema/index bootstrap must still complete, and actual transactional qualification is still needed before release. The application bootstrap retry/degraded-mode behavior remains; this change does not force a successful start or silently allow standalone mode.

The existing readiness endpoint still reports dependency configuration for Supabase/storage/AI, not actual provider operations. Render-admission enablement and optional CV capability remain informational. No live Render healthcheck, flags, credentials, schema or deployment was changed by implementing this prerequisite.

Local fixture tests call actual bootstrap code with a database-shaped fake. They verify handshake-before-schema ordering, standalone refusal without schema effects, replica-set/mongos continuation, legacy fallback and no retry on permission/network/timeout failure. These do not qualify a real Mongo deployment. Local API tests separately verify pending/failed bootstrap gives503 and completed bootstrap allows normal authentication. No real database was started for this patch.

## Bounded supervisor probes

Readiness starts the core Mongo check and advisory queue/CV probes concurrently. The Mongo HTTP wait has a2000ms deadline and fails closed on timeout or rejection. Queue and CV advisory waits have500ms deadlines; missing/timed-out advisory results return null, not a false statement that CV is unavailable or a queue is empty. Queue counts also use500ms driver and server operation limits. Shutdown is rechecked after all awaits, so a drain that begins during a probe cannot return a stale ready response.

These deadlines bound the HTTP wait, not cancellation of a shared connection attempt or the cached Python capability probe. Late failures are handled; late completion is not cached as a permanent readiness failure. A cached runtime check may still settle after the HTTP response. This is not a hard real-time guarantee under CPU/event-loop starvation or a full dependency acceptance test.

Actual local HTTP tests use a fake Mongo client and stalled advisory callbacks. They cover bounded advisory response, core-timeout503, later recovery and drain-during-probe503. They do not connect to a real database, run Python, encode media or validate hosted supervision timeouts.

## Connection lifetime during close/retry

Closing the pool fences its current connection generation and closes both established and in-flight clients. A connect or ping that finishes after close cannot publish that candidate as the process client. Its failure also cannot clear a newer generation's shared connection promise. Multiple callers still share one current attempt; an ordinary current-generation failure can retry normally.

Controlled-promise tests on the actual pool module cover close during connect, close during ping, old connect rejection after a newer attempt begins, shared fresh callers and normal retry. Client methods are fixtures; no network connection is made. These tests do not replace real driver/network/shutdown acceptance. Pool close remains reusable by later callers and is not a permanent process-wide admission stop; the shutdown lifecycle owns stopping new application work.

## Bootstrap wait ownership

The startup supervisor still has its existing15-second per-wait deadline and retry budget. A wait timeout is not cancellation of schema/index work. Retries now attach to the same tracked pending bootstrap attempt instead of launching another potentially overlapping bootstrap writer. A genuine underlying rejection releases ownership for a new attempt; a completed success can be reused. Each wait clears its timer on settlement.

The normal work lifecycle continues tracking the underlying attempt after an HTTP/supervisor wait expires. Shutdown must still drain that work or report its existing deadline failure. Exhausting startup waits does not turn an eventual late completion into a ready deployment automatically; degraded mode remains until a normal accepted bootstrap/start cycle succeeds. No stuck operation is declared cancelled or successful merely because a timer fired.

Controlled-promise tests verify single ownership across timeout/retry and concurrent waiters, late success, current/late failure retry, invalid deadlines and drain tracking. This is not real Mongo slow-index-build or hosted restart qualification.
