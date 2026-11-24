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

## Current integrated boundaries

Candidate replacement and exact job/worker/context completion receipt commit in
one transaction. A lost selector acknowledgement reconciles that receipt, not
another provider call. Tests cover wrong-worker rollback and acknowledged or
lost-acknowledgement completion. This does not certify external provider quality.

Explicit core continuation can persist a selection outbox in the transcription
settlement transaction and deliver the same immutable selection intent without
a browser remaining open. See `core-selection-continuation-rollout.md`. This is
an opt-in backend contract, not the default mounted UI or final clip rendering.
The client continuation change remains held locally pending mounted lifecycle
and pixel evidence; source/callback tests do not substitute for that proof.

New intents require the recent compatible registration described in
`durable-worker-handshake.md`. Registration is not current worker liveness,
free slots, provider readiness or measured resource capacity. A worker may stop
immediately after admission. Exact saved-intent replay does not need renewal.
Additive index definitions exist but no deployed index build is certified.
Startup refuses a known persisted count-policy mismatch; claim-time checks
remain necessary for policy changes after that read.

Project deletion removes continuation outbox and redacts durable core/selection
payload while preserving uncertain processing/review capacity and worker fences.
Financial completion snapshots remain unchanged. This is not all-storage erasure
or a complete retention policy. `durable-dispatch-inspection.md` describes a
read-only exact-job diagnostic; it never proves stop or performs recovery.

## Not rollout-ready

Still required before enabling: staged compatible deployment and monitoring;
measured provider/CPU/RAM/scratch envelopes; planned production index build and
retention/audit-snapshot policy; verified stopped-worker/manual reconciliation;
mounted navigation/reload UX; actual provider and source-disjoint editorial
quality evaluation. No stage/count/flag is enabled here.

Local evidence includes a tiny synthetic video through actual download/audio
extraction, substituted ASR/selection replies and persisted unranked fallback
candidate, plus a real selector path with a synthetic proposed moment. These
prove narrow wiring, not editorial selection quality, automatic gaming framing,
final rendered clips or production readiness. Final clip creation/render remains
separate. Never select production concurrency from this tiny synthetic fixture.
