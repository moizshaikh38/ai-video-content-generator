# Core completion to selection outbox, dormant backend contract

`VIREO_CORE_SELECTION_CONTINUATION_V1=1` requires both durable core and selection
switches. Defaults remain off. No resource count or live config is selected.
The API only accepts explicit `continue_to_selection:true` with protocol header
`x-vireo-core-continuation:1`, never subtitles. A request while unavailable
refuses rather than silently starting transcription without its requested step.
Existing clients do not send this opt-in, so their behavior is unchanged.

Core admission saves exact attempt/source and normalized request preferences,
custom notes and current project notes. The existing wallet settlement/project
publication transaction writes an immutable continuation outbox row with the
completed transcript/source receipt and final project context. No provider work
runs in that transaction. Project notes or preference edits while processing create a
review-required continuation, not rollback/refund of completed transcription.
The transcript's ordinary completion enrichment may update genre context;
selection receives the completed project snapshot and immutable request options.

A separate worker delivers pending outbox rows to the existing exact-input
idempotent selection queue, then records its job id. If acknowledgement is lost,
re-delivery can only look up/enqueue that same immutable intent. It does not run
a provider. Known context/source changes and active distinct selection refuse
and mark review. Unknown database/delivery failures keep the outbox pending.
Selection-provider failures remain governed by selection worker quarantine and
do not undo settled transcription credits. Process lifecycle covers delivery.

## Limits before enabling

This is a backend explicit-request contract, not ordinary mounted app proof.
Frontend wiring must send the opt-in with saved options, read/join continuation
status, and avoid submitting a separate conflicting selection request. It is
not enabled here. Default UI still requests selection after transcription.
Rollout also needs staged version handshake, measured resources, indexes,
retention, deletion cleanup, stopped-work recovery and review controls. No
implicit migration, automatic manual-review bypass, final clip creation/render,
new model, real-provider evaluation or output-quality claim is included.
