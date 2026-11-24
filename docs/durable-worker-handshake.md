# Dormant durable-worker announcement gate

Existing durable core/selection flags now require a recent compatible worker
announcement before a new immutable intent is saved. Defaults stay off. No
worker count, provider, deployment or production configuration is chosen.

After bootstrap, a worker-capable process registers core, selection and enabled
continuation poller capabilities with protocol 1 and the configured stage count.
It renews every 10 seconds, single-flight and tracked by process lifecycle.
API-only processes never announce. Shutdown stops renewal; an in-flight write
may finish, but no later stage starts after stop/drain is observed. Rows use
server-written dates and exact indexed stage/protocol/count keys, no TTL.

Admission requires a matching announcement within 30 seconds by database server
time. Future dates refuse too. New core continuation intents require all three
stages. Reads occur inside existing intent-admission transactions, bounded by
the transaction deadline and a 1-second server read limit. Missing/incompatible,
stale or unreadable state fails closed with no new intent or credit reservation.
An exact saved-intent replay still returns the same record without requiring a
fresh announcement, because replay is not permission to dispatch again.

This is a recent protocol/poller-registration signal, not worker liveness or
successful work. A process can disappear immediately after renewal/admission;
an announcement can remain fresh for up to 30 seconds after it stops. It does
not prove CPU/RAM/scratch capacity, free shared slots, provider entitlement,
source-disclosure permission, transaction health or measured quality. Existing
claim-time count policy, permanent claims, quarantine and publication fences
remain authoritative. No timeout, stale announcement or flag change releases
claimed capacity, retries a provider, refunds credits or proves stopped work.

Roll out compatible workers before API/client opt-in. Queued work still needs
operational monitoring and explicitly verified stopped-work reconciliation.
No production handshake rows are created by this source change itself. Local
qualification uses disposable synthetic Mongo records and substituted providers.
