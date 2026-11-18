# Actual local HTTP drain wiring

2026-11-19 approximately 02:36 IST. `server/scripts/local-qualification/drain-http.mts` used the real work admission middleware and shutdown coordinator on a new loopback HTTP server, with synthetic background work and a database-close spy.

A POST returned 202 while its registered background task remained tracked after the HTTP response finished. Beginning shutdown stopped new admission. An actual subsequent HTTP request returned 503/SERVER_DRAINING and Connection: close. It did not add a new work item. The HTTP listener then closed, while the synthetic background task still prevented database-close invocation. Releasing that task produced background cleanup before the single database-close spy call. Shutdown returned true.

This checks actual response-lifetime wiring and process-local drain ordering, not a real operating-system restart, database connection teardown, distributed queue lease, live renderer cleanup or production readiness. No existing process was interrupted and no provider/media/database work ran. Sampled process-group RSS was 164,495,360 bytes over 0.35 seconds, no guard breach. Receipt: `evidence/20261119/drain-http.json`.
