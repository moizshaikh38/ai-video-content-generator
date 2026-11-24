# Durable clip-selection handoff, dormant

`VIREO_CLIP_SELECTION_DISPATCH_V1=1` requires an explicit positive
`VIREO_CLIP_SELECTION_MAX_ACTIVE`. Neither is enabled or sized by this change.
This is a shared count bound, not measured host resource sizing.

API accepts a saved selection request only from clients declaring protocol1.
It validates current source-bound usable transcript, stores immutable project
context, transcript/source receipt and normalized request preferences/notes,
then returns202 with a saved job id. Waiting does not reserve wallet credits.
The default-off synchronous route is unchanged. Stored project preferences are
not rewritten by the dormant queue route: the saved request options are its
intent, and current project preference/notes edits invalidate that intent.

Worker checks owner/source/deletion/transcript/context before selector entry.
The selector rechecks saved context before provider entry. Durable selection
uses the saved semantic context and does not launch optional retained-source
genre refresh, which could otherwise call a provider before this gate or alter
the immutable context itself. Default synchronous genre refresh is unchanged. Existing final source/context and deletion publication fences
remain necessary. Process lifecycle covers claim through reconciliation.
Shared capacity counts processing and review-required work. There is no timeout
reclaim. After selector entry any error is review-required and quarantines
local/shared capacity, even when a provider or publication may have succeeded.
No automatic retry, refund or provider-replay is inferred.

The frontend service submits once and GET-polls only the exact saved job, then
returns the existing completed-candidates shape. Empty completed results are
valid, waiting is not empty completion. Read errors, unknown states and timeout
are explicit and never resubmit generation. A completed-job read returns its
recorded candidate ids only, not newer unrelated suggestions. Project source
and settings changes or missing candidates refuse old completion readback.

## Not rollout-ready

Still required before enabling: compatible API/worker/client rollout handshake;
measured provider/CPU/memory limits; production indexes and retention policy;
verified stopped-worker/manual reconciliation procedure; durable atomic
publication/job receipt to distinguish successful publication with lost job
acknowledgement; browser navigation/reload UX that rejoins a saved request
without triggering a new analysis; actual provider and source-disjoint editorial
quality evaluation. Current tests substitute selector method output and use
local synthetic source HEAD only. They do not prove real moment quality,
automatic gaming framing, final rendered clips or production readiness.

No browser-independent orchestration from transcription to selection is added:
the present app still initiates selection when it observes transcription done.
This durable stage survives disconnect after selection has been accepted, not
a disconnect before that request. Final clip creation/render remains separate.
