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

## Client continuation status/rejoin candidate

Owned project reads expose capability only when all three stages are enabled.
Clients opt in on an explicit Generate action, after a fresh project capability
read; unknown capability does not silently grant an opt-in. Existing callers
without selection options retain their original request shape.

Saved continuation status takes precedence over legacy post-transcript analysis,
including reload. Reads bind exact outbox and delivered job identity to current
owner/source/context/transcript. Missing or unreadable state is unavailable,
never completion or an invitation to run selection again. Old delivered outbox
rows without selection_job_key require explicit reconciliation before rollout;
no implicit migration or success inference is performed.

Polling must remain active across a transient completed-job GET failure and
across continuation intent appearing between two project reads. The current
candidate preserves the interval until workflow state actually changes.
Three consecutive completed saved-result read failures stop with an explicit
saved-request error. Project-fetch network failures retain the legacy retry
behavior and do not accumulate into this saved-result error; successful legacy
ticks reset saved-result accounting. Temporary saved-result errors still retry;
reload can check that same request, never replay generation. Poll callbacks are
single-flight so slow reads cannot multiply concurrent requests.
Mounted browser recovery, reload and pixel evidence is still required before
claiming browser verification. Local browser fixture launch/connect is blocked;
source/API tests alone do not establish these mounted behaviors.


## Mounted synthetic regression

Run from repository root with local Vite fixture settings (synthetic Supabase URL http://127.0.0.1:54321, API URL http://127.0.0.1:5556/api, waitlist disabled). Start a disposable local Chrome debugging endpoint separately after checking memory. Then run `node scripts/tests/core-selection-mounted.mjs reload-pending`. Set VIREO_FIXTURE_BASE, VIREO_FIXTURE_BROWSER and VIREO_FIXTURE_OUT for local ports/output. The script connects only, intercepts synthetic API calls, closes its own page and disconnects; it does not stop Chrome. No real account or provider is used.

Other explicit cases: transient-result, persistent-result-reload, late-intent, slow-result-home, unmount-project, unmount-result, full-account-project, full-account-result. account-result is a narrower owner-module seam, not full AuthProvider proof. The unmount destination /resources is a404 but actually unmounts Home. Check assertions, source-before/after digests, served module response digest and screenshots, not exit status alone. Source binding and actual runtime checks qualify lifecycle recovery, not automatic clip quality or real backend export.
