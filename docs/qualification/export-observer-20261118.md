# Qualification observer, non-media implementation

2026-11-18. `server/scripts/local-qualification/export_observer.py` is a standalone, opt-in module. It has no CLI auto-start, application imports or production call sites. No render defaults, queues, guards, source records or release state changed.

## Implemented and verified

The caller supplies an argument vector and a new evidence directory. There is no shell interpolation. The observer creates a separate owned-work directory, runs one worker in a new Linux session and writes atomic, flushed/fsynced receipts before launch, periodically during execution and on handled completion. Evidence survives removal of owned-work. Command arguments are hashed, not stored. stdout/stderr are continuously drained and counted, never retained, to avoid copying signed URLs, source text or secrets into diagnostic artifacts.

The receipt includes configured limits, elapsed time, sampled peak session RSS/work size, available disk before/after, worker returncode/signal, stop reason, remaining session PIDs and before/after cgroup memory state. Session membership is read from `/proc`; descendants changing process group within that session are included. Completion checks distinguish a worker exit with surviving descendants. Owned session groups are killed and child reaped on a safety stop. SIGTERM/SIGINT received by the supervisor trigger handled cleanup and a final receipt. Prior signal handlers are restored.

Safety conditions implemented: total wall time, sampled session RSS, owned-work size, minimum free filesystem reserve, cancellation callback, and preflight disk reserve. Limits are bounded to30s,500MiB sampled RSS and512MiB owned-work at most. Sampling is configurable10-250ms; default50ms. These are diagnostic ceilings, not authorization to run media and not sufficient machine reserve calculations.

`test_export_observer.py` imports only Python standard-library modules and this inert observer. Imports and top-level hooks were inspected before executing it directly. It does not discover application tests. All child programs are Python sleep/write/allocation stubs, no FFmpeg, encoder capability probe, API, database or provider work.

13 tests passed in0.812s:

- Natural exit, nonzero exit and private log-content suppression.
- Draining2MB stdout and2MB stderr without retaining contents.
- Timeout cleanup of parent/descendant, including descendant new process group in the same session.
- Root exit leaving a child is not treated as clean success.
- Sampled memory stop, owned-work disk stop and disk reserve preflight.
- Cancellation and supervisor SIGTERM finalization/cleanup.
- Spawn failure receipt, refusal of existing evidence directories and invalid limits.

Every successful test checked the final on-disk receipt against the returned result, no remaining observed session PIDs and removal of owned-work. A final process read found no FFmpeg or Python sleep-stub process. Available disk was576MiB. This is observer/stub evidence only, not export or4K qualification.

## Explicit gaps before actual media

1. This observes a Linux session, not a private cgroup. A process that calls `setsid` can escape. No test claims to contain escaped descendants. Before real media, use a dedicated cgroup/container or enforce and verify a no-session-escape worker contract. Shared cumulative cgroup OOM events do not attribute a failure.
2. Supervisor SIGKILL, machine loss, repeated signals during finalization, evidence-filesystem failure and cleanup failure are not guaranteed to leave a final receipt. A last started/progress receipt is incomplete, not a successful attempt. No independent watchdog/parent-death mechanism was added.
3. RSS/disk checks are sampled and can overshoot. Observer overhead, page cache, unrelated services and shared filesystem growth are not bounded by session RSS. `/proc` races/unreadable records can undercount. Directory scanning has no hard execution bound. This is not a kernel-enforced limit.
4. Owned-work accounting excludes symlinks and paths elsewhere. The observer does not sandbox file access or prevent a worker writing outside it. A future adapter must route every source download, normalized audio, intermediate and output to its owned directory, and isolation must enforce that if untrusted behavior is possible.
5. No worker/API adapter, validated source/editor/graph manifest, durable attempt-specific retry ownership or queue isolation is implemented. A worker that consumes shared jobs is explicitly unsupported. Existing production retry and hardware-fallback behavior is unchanged.
6. Log contents are deliberately suppressed. No safe structured worker error-category/stage channel is implemented yet, so this observer alone cannot recover the historical missing FFmpeg stderr. Add an allowlisted, bounded, schema-validated diagnostic channel without raw command/filter/source text, before claiming encoder cause visibility.
7. No historical-data census/base-duration guard is active. No real-output validation/pixel/audio checks are present. No resource headroom requirement is waived by these stub tests.

## Next useful bounded step

Build a qualification-only adapter that accepts a reviewed immutable manifest, cannot consume shared retries, emits safe stage/error diagnostics and proves artifact paths stay owned. Verify that adapter with inert injected worker functions before choosing a media command. Add isolated kernel resource ownership/independent watchdog support where available. Actual media remains stopped until those gaps and machine headroom are separately resolved and the stop is explicitly lifted.
