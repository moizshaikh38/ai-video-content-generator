# Additive durable-dispatch query indexes

Bootstrap adds the indexes only when the existing corresponding dormant stage
switch is enabled. Defaults off means no new collection or index writes from
this helper. Transactional-topology validation remains before index writes.

Core and selection indexes cover FIFO version/status/worker claim, project
active-job lookup and exact status update/read. Outbox covers pending FIFO
delivery. Existing _id indexes serve immutable intent and continuation pointers.
These are nonunique, non-TTL indexes: no row migration, deletion, timeout reclaim
or automatic retention. No production switch/count is selected here.

Index-creation failure fails bootstrap; readiness must not imply worker-ready
until operator startup succeeds. Building indexes can consume database resources
and must be planned during staged rollout. This code is not evidence of an
index build on a deployed database. Existing duplicate rows are not repaired or
made authoritative by these nonunique indexes.

The local disposable replica-set test creates synthetic rows, calls the actual
helper twice, verifies rows unchanged and no unique/TTL additions, and checks
hinted execution plans for representative claim/read/delivery queries. A hinted
plan proves the named index can serve the query, not that the optimizer will
always select it or that production workload latency/resources are measured.
Recent compatible stage registration and startup count-policy validation are
implemented separately, neither proves worker liveness or resource sizing.
Narrow queue/outbox deletion payload cleanup exists; financial snapshots and
uncertain lifecycle fences remain. Production index deployment, measured
capacity, retention/audit policy, verified manual recovery and mounted client
proof remain open. See `durable-worker-handshake.md` and
`durable-dispatch-inspection.md`.
