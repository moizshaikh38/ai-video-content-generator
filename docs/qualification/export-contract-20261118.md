# Qualification manifest and stub-worker boundary

2026-11-18. Implementation only in `server/scripts/local-qualification/`. No production call sites, guard, data migration, queue changes, media, paid processing or release.

## What changed

`export_contract.py` validates a strictly allowlisted proposed ordinary-single-slice manifest. It returns a detached canonical JSON snapshot and SHA256 binding. UUIDs, revision/hash syntax, editor version, vertical resolution tier/dimensions and finite clock numbers are checked. Base duration must match endpoint difference within2ms; trim/source and single-slice speed/canvas/output clocks must agree. Negative trimEnd is accepted when bounded by known source duration. Source/output windows are bounded to30s. Boolean/numeric-string/null/NaN durations and unsupported fields are rejected.

This is qualification-specific, not a production legacy-compatibility policy. Multi-slice edits, cold opens, transitions, title/freeze/gaps and other project shapes are not accepted or silently flattened. Ordinary2x and0.5x speed examples and bounded tail extension are tested. Missing legacy duration is not silently filled by this strict manifest helper. No stored user record was changed.

`export_stub_adapter.py` is deliberately stub-only. It cannot choose an arbitrary executable, shell, media command, HTTP/API route or database worker. It writes the snapshot under a new private directory, marks it read-only, then runs its fixed Python stub entry point through the observer. The subprocess revalidates the snapshot against the expected digest before doing stub work. Filesystem read-only mode is not tamper-proof isolation from the same user; revalidation detects changed bytes at that point, not malicious later behavior.

The adapter wrapper labels its result `worker_kind=non-media-stub` and `actual_export_verified=false`, even on a complete successful stub. It does not claim an immutable live source, verified graph or successful encoder execution. Manifest source/hash values are synthetic/caller-supplied assertions. Hash syntax/binding is not measurement of the referenced source, revision or graph.

## Private-safe diagnostic channel

The observer accepts an optional manifest digest. During periodic receipt persistence and at final cleanup it reads `owned-work/diagnostics.json` through a nonblocking, no-follow open. Only a regular file at most8192bytes is accepted, with at most16 events. Each event permits exactly sequence, stage, code and manifest digest. Stages/codes are fixed enums, sequence must be contiguous, normal stages cannot skip/reorder, and no event can follow terminal complete/failed. Failure needs a non-NONE code. Extra fields, arbitrary messages, wrong bindings, oversized files and symlinks are rejected without copying raw content. Raw stdout/stderr remain drained and suppressed.

These are worker-reported stage/code statements, not proof that an operation occurred. `status=validated` means schema/binding validation, not output validation. Partial timeout diagnostics are retained with `terminal=false`; they do not become successful export results. No raw private transcript/filter/source URL field is supported. No arbitrary actual-FFmpeg stderr classifier was added or tested.

## Non-media verification

Imports and top-level hooks for the contract, observer, adapter and direct tests were inspected. Only Python standard-library modules and these inert local modules are imported. Test entry points are run directly, without repository-wide discovery. Child programs are the fixed Python stubs or previously reviewed sleep/write/allocation stubs. No application imports, encoder capability probes, media or provider work.

Fresh run:

-9 contract/adapter tests passed in0.570s.
-13 observer tests passed in0.818s.
-`git diff --check` passed.

Contract coverage includes detached snapshot/digest change, legitimate speed/extension clocks, malformed/legacy/private-field refusals, rechecking changed manifest bytes, safe enum/order/binding checks, no-follow/oversize/private-payload refusal and end-to-end observed stub routes. Observer process/resource limitations remain as documented in `export-observer-20261118.md`.

Fresh retained synthetic receipts are under `/downloads/vireo-export-contract-2212`:

| Stub | Actual observed result |
|---|---|
| success | Worker0, safe ordered events through complete, no remaining session PID. Still `actual_export_verified=false`. |
| encoder-failure | Worker7, safe failed/ENCODER_EXIT event. No encoder was run. |
| malformed-diagnostics | Worker9, diagnostic status rejected with no raw private field retained. |
| timeout | Supervisor wall-clock safety stop, safe preflight event retained, terminalfalse, no remaining session PID. |

Final process read found no FFmpeg or stub-worker process. Available disk576MiB. Only small JSON evidence/snapshots were retained.

## Remaining actual-export requirements

This implements the manifest/protocol boundary and a fixed stub integration, not the real export worker adapter. Before real execution:

1. Independently measure/bind live source bytes, editor revision and compiled graph; bind actual limits/encoder policy and expected output to that manifest. Do not substitute synthetic/caller hashes.
2. Build a queue-isolated real worker that cannot consume shared retries, routes every artifact to owned-work, produces safe structured stage/error categories, and cannot silently launch outside the owned resource domain. Map actual FFmpeg errors without private stderr leakage. The current stub does none of these real operations.
3. Establish private kernel resource/process ownership or equivalent containment, independent watchdog/parent-loss cleanup and sufficient measured disk/memory reserve. A sampled Linux session can miss `setsid` escape, /proc races and supervisorSIGKILL. Current helper is not a sandbox.
4. Resolve actual environment headroom and explicitly lift the existing no-media stop before execution. Stub passes do not establish4K capacity, historicalOOM cause, media correctness or output quality.
5. Require successful independent stream/dimension/duration/audio probing and actual pixel inspection of the eventual API output, not only worker complete events or production probe-unavailable fallback.

No actual4K qualification or historical-cause conclusion was added.
