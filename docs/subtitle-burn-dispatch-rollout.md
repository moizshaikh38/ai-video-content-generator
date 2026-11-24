# Durable subtitle burn dispatch V1

Status: implemented behind an off-by-default flag. Not enabled or deployed.

`VIREO_SUBTITLE_BURN_DISPATCH_V1=1` switches full-video subtitle burn admission to a Mongo transaction: the current project's run token/rendering state and a queued immutable execution snapshot commit together. The existing API controller still performs authenticated owned lookup, source/cue checks, source-binding HEAD and preset entitlement before admission. The flag does not enable transcription, imports or GPU work.

A worker-role process with the same flag drains one job at a time every five seconds after database bootstrap. Atomic queued-to-processing and processing-to-executing transitions prevent duplicate claim or duplicate invocation of a claimed job. Worker entry rechecks the current project token, deletion marker and input identity against its saved snapshot before calling the existing fenced burn executor. That executor still downloads/verifies source, encodes, uploads and uses the existing transactional publication fence. Other worker processes can consume different jobs. This is not a global capacity or fairness policy.

Rollout requires API and workers that all understand this version and share the same database and storage credentials. Keep the flag off until those versions, capacity and existing source/preset policy are qualified. A worker must have FFmpeg/fonts and source-storage access. Never enable API queue admission with no compatible worker. There is no readiness handshake in this version, so queued work can wait indefinitely if workers are unavailable.

No timeout or age grants permission to reclaim an admitted job. A crash after claim can leave processing/executing work blocked. An ambiguous executor outcome is marked review_required, retaining any live project run token. Do not clear its token or retry until the original process and descendants are proved stopped and output/publication state is reconciled. Automatic reclaim, cancellation/recovery UI, dead-letter operations, queue indexes and retention are not provided here. Do not enable at scale before those operational gaps are addressed.

Disabling the flag stops queue consumption and restores API refusal/combined inline behavior for new requests. It does not cancel queued jobs or clear project tokens. Drain/reconcile existing jobs before disabling. There is no destructive fallback or migration.

Qualification uses disposable local Mongo replica-set transactions and separate clients, the actual API service and worker entry, local synthetic HEAD responses, and a synthetic burn executor. It proves durable handoff and state fencing, not a real remote worker deployment, an encoded output, visual quality or GPU readiness. Existing inline burn behavior is unchanged with the flag off.
