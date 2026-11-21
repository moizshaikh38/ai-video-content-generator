# Database bootstrap and readiness

The application already requires replica-set or mongos transaction topology for financial operations. Bootstrap now checks that same necessary prerequisite before listing or changing collections and indexes. A standalone or unverifiable database cannot complete bootstrap and become API-ready merely because ping works.

The read-only hello operation uses the driver's 2000ms operation timeout. Only a CommandNotFound error permits one bounded legacy isMaster attempt. Network, timeout and permission failures propagate; they do not trigger a second handshake. The existing financial topology assertion uses the same bounded helper. No probe starts a financial transaction or changes documents.

This is a necessary topology shape check, not proof of transaction permissions, majority-write availability, commit health, hosted network behavior, schema completion, old-writer retirement or compatible worker rollout. The normal schema/index bootstrap must still complete, and actual transactional qualification is still needed before release. The application bootstrap retry/degraded-mode behavior remains; this change does not force a successful start or silently allow standalone mode.

The existing readiness endpoint still reports dependency configuration for Supabase/storage/AI, not actual provider operations. Render-admission enablement and optional CV capability remain informational. No live Render healthcheck, flags, credentials, schema or deployment was changed by implementing this prerequisite.

Local fixture tests call actual bootstrap code with a database-shaped fake. They verify handshake-before-schema ordering, standalone refusal without schema effects, replica-set/mongos continuation, legacy fallback and no retry on permission/network/timeout failure. These do not qualify a real Mongo deployment. Local API tests separately verify pending/failed bootstrap gives503 and completed bootstrap allows normal authentication. No real database was started for this patch.
