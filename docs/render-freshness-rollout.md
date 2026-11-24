# Saved-render freshness: compatibility and enablement proposal

Status: PROPOSED, not an enablement approval. Default remains unchanged.
Scope: `VIREO_SAVED_RENDER_FRESHNESS_V1` in saved MP4 preview/download signing.

## Current behavior and verified boundary

When the flag is absent or not `1`, compatibility behavior skips the saved-editor
freshness check. A completed earlier export can still be signed after an editor
save. Other source, entitlement and ready-state checks still run.

With the flag set to `1`, signing requires a completed job with matching clip,
owner, render/editor versions and saved editor snapshot. Pending projection sync,
a changed saved editor or an interleaved clip change rejects signing with
`409 RENDER_INPUT_CHANGED`. Missing job/snapshot provenance rejects with
`409 RENDER_FRESHNESS_UNVERIFIED`. An explicit null snapshot represents a render
without an editor project; it must still match the current absence of one.

On 2026-11-24, isolated actual-controller checks established:
- unchanged saved editor2/clip3: preview and download200 with flag1;
- saved editor3/clip4 after a placement edit: both409 with flag1;
- that same stale fixture: both200 with flag0.
These are local DEV fixture checks, not production rollout or full browser proof.
Existing immutable artifacts were preserved. No provider request was needed.

The guard does not revoke already issued URLs, prevent a save after its final
read, or prove media quality. Existing signed links can remain usable until their
own expiration. This is not a guarantee that an open tab displays the latest save.

## Compatibility decision required before enablement

Inventory ready clips read-only and report counts, grouped by owner without
exporting private content, for:
1. verified current completed provenance;
2. stale saved input or pending projection sync;
3. missing/incomplete historical job or snapshot provenance;
4. missing source, inaccessible objects, or unrelated existing access failures.

Do not synthesize historical snapshots from today's editor or relabel an old
artifact as current. Keep legacy objects intact. Propose an explicit recovery
path: show last export as historical, save/reconcile edits, then queue a new
render under current ownership, entitlement, quota and source checks. A rerender
may consume credits or provider work and must not be triggered by a GET/signing
request or an inventory script.

Release owner must choose how historical downloads remain available without
claiming they represent current edits. The existing global flag has no per-owner
allowlist, historical-export endpoint or built-in dry-run mode. Such a design,
if chosen, needs separately reviewed implementation and authorization. Do not
pretend a global production enablement is a narrow canary.

## Proposed preflight and qualification

- Confirm all serving builds use the same reviewed guard, snapshot format and
  revision-fenced admission/worker behavior; do not enable during mixed versions.
- Inventory legacy impact and approve the recovery/user-facing compatibility
  policy. Confirm backup/rollback ownership and preserve existing artifact keys.
- Qualify in an isolated non-production environment with the flag explicitly
  recorded: current→200, pending save→409, synced changed input→409, missing
  provenance→409, no-editor/null snapshot→200, editor added→409, and concurrent
  save/admission/output change→409. Unauthorized and entitlement checks must
  retain their existing behavior.
- Verify actual app behavior for Quick and Studio preview/download, both direct
  entry and after save/reload. Show actionable rerender guidance on409, retain
  local edits, and never silently return the old file as the latest export.
- Verify legitimate revision-bound rerender→completed immutable artifact→200.
  Check preview/download exact bytes, no duplicate job, and both720/1080 sizes.
- Run focused guard/revision tests, server/client typechecks and relevant build.
  Unit mocks and controller fixtures do not replace the app/worker acceptance.

## Explicit release step and rollback

Only after the above evidence and an explicit release decision should the
operator set `VIREO_SAVED_RENDER_FRESHNESS_V1=1` on the approved serving scope.
Record commit, environment, time, inventory impact, approver and verification.
This document does not authorize that change or any deployment.

Observe signing200/409/5xx rates and support impact without logging signed URLs
or private media. Stop if current qualified exports are rejected, unauthorized
access regresses, or the client loses edits/loops rerenders. Disabling the flag
restores compatibility signing, including the stale-export exposure; it does
not repair provenance, undo edits, revoke links, or certify a latest export.
Communicate that tradeoff and retain artifacts. No automatic rollback toggle is
implemented here.

## Still open

Legacy inventory, recovery policy, app409 UX, full fresh-browser route, measured
mixed-version safety, production monitoring thresholds and release approval.
Default latest-edit freshness remains OPEN until qualified and explicitly enabled.
