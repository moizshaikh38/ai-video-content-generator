# Reviewed path to a safe actual export

Status: proposal only, 2026-11-18. No runtime behavior, stored data, flags, retry policy or render execution changed. The actual4K failure remains unresolved. This plan does not lift the existing stop.

## 1. Separate three clocks before adding a guard

### Base candidate interval

`start_seconds` and `end_seconds` describe the original source interval; `duration_seconds` is its redundant base length. Normal creation computes the latter as end minus start. An old SQL definition stores all three at millisecond precision and checks positive duration, but does not check equality. Current repository numeric validation checks finite nonnegative numbers, not this cross-field invariant. Direct Mongo writes can bypass repository validation entirely.

A narrow base consistency check should classify, not immediately rewrite:

| Record | Proposed classification | Compatibility concern |
|---|---|---|
| Finite nonnegative start, end greater than start, positive finite stored duration consistent at storage precision | Consistent base | Floating-point subtraction and independent millisecond rounding must be tolerated. |
| Missing/null/zero base duration with valid endpoints | Legacy-derived base | Existing renderer falls back to end minus start. Preserve this explicit compatibility path until a census says otherwise. Zero is currently treated as absent, not a valid zero-length clip. |
| Positive stored duration materially different from end minus start | Needs duration review | Do not silently choose a different length or repair the database. The first historical4K fixture belongs here. |
| Negative/nonfinite values, reversed endpoints, nonnumeric values | Invalid or legacy format requiring review | Do not silently coerce empty strings/booleans. Old numeric strings need an explicit read-compatibility decision, even though ordinary current writes reject them. |

A proposed millisecond tolerance must be tested against the actual serialization path and a read-only historical-data census before it becomes an enforcement rule. Do not reuse the output-validation0.5s tolerance for this base invariant. The malformed historical fixture differs by32.59s, so its classification does not depend on a borderline tolerance.

A conservative rollout would first add report-only receipts for ordinary jobs and strict rejection only inside a new qualification preflight. Enforcing on all existing user records is a separate compatibility decision. No census or rollout was performed here.

### Trimmed source window

Base duration is not trimmed duration. The editor stores `trim_start_offset` and `trim_end_offset` separately. A negative end offset is an intentional tail extension, allowed only when the source bound is known and not exceeded. Trims must not rewrite the base duration or be subtracted twice.

For the existing regression, base30s with start trim2s and end trim5s means a23s selected window. A guard that compares stored base30 to that23 would be wrong. Beyond-candidate extension similarly must not be mistaken for a corrupted base record.

### Output timeline

Canvas duration is not necessarily source interval duration. The inspected code supports:

- Playback speed: selected12s at2x produces6s; at0.5x it can produce24s. `singleItemSourceWindow` explicitly relates these clocks.
- Ripple cuts: disjoint source slices form one edited timeline. Source-envelope length is not the sum of selected slice lengths.
- Cold opens: the default editor adds teaser duration before the main interval.
- Transitions: overlapping clips shorten the concatenated program.
- Gaps, freeze/title cards, overlays and additional tracks: output can contain time that is not one contiguous source interval.

Never require canvas duration to equal base duration. A qualification manifest must record all three clocks, visible slices/speeds, source boundaries, expected output duration and the rule that produced it. The output expectation must come from the compiled supported timeline, not guessed clip metadata. Unsupported cases should be refused by the qualification harness rather than flattened.

## 2. Concrete observability losses in the inspected paths

- The development logger's human formatter prints only selected fields plus `detail`, `reason` and `error`. The render failure call supplies `{clipId, code, message}` as arbitrary context, so its code/message are not printed there. Production JSON retains fields, making this environment-dependent.
- FFmpeg exec failures append a short stderr tail to a message. Clip/job error fields retain only the first500characters. A long command in the message can consume that space before the useful tail.
- No durable structured receipt records exit code, signal, killed flag, timeout owner, buffer-overflow condition, RSS or disk state for the full ordinary attempt.
- Render temp directories are removed in `finally`; a diagnostic left only there can disappear before inspection.
- The render path can run normalization/measurement before final encoding. Encoder capability discovery runs its own tiny media probes even when a software override is later selected. A failed hardware render may be followed by software fallback, and transient job failure may schedule further attempts. Observing one child PID is not observing the whole attempt.
- Normal output validation accepts a render when the external probe is unavailable. That policy cannot support an actual4K qualification claim; the qualification harness must require an independent successful stream/duration/dimension probe and pixel inspection.

## 3. Minimal receipt and ownership requirements

Before any new media attempt, implement and review these in a qualification-only path. Do not change ordinary execution merely to collect a one-off result.

1. A validated manifest binds code revision, clip/editor/job IDs and versions, immutable source receipt/hash, requested resolution, all clocks, graph hash, encoder policy, flags and configured limits. Do not persist credentials, signed URLs, transcript words or caption/filter text in a general receipt.
2. One supervisor owns the whole isolated worker process group, including normalization, capability probes, encoder fallback and any child process. Disable queued retry consumption for that isolated qualification. Use one total budget, not a fresh timeout for every fallback. Do not kill unrelated service/database processes.
3. Persist a started receipt before spawning. Stream bounded/redacted diagnostic logs to a separate evidence directory, outside the auto-cleaned media directory. Update a small atomic receipt throughout execution and in all exit paths. Retain a complete diagnostic error category and safe bounded tail separately from the500character user-facing error.
4. Sample process-tree RSS/threads, cgroup current/peak and event counters, disk/inodes, input/output/intermediate sizes and elapsed time. Record polling interval and overshoot limitations. A pre/post OOM counter delta only ties the event to this attempt if the cgroup is isolated; a shared counter is supporting evidence, not attribution.
5. Distinguish natural encoder exit, signal, caller deadline, supervisor safety kill, disk reserve stop, buffer-limit failure and unknown interruption. A safety kill is not an OOM. Failure to save a final receipt must remain unknown, not successful cleanup.
6. If the frontend/caller disappears, supervisor must still enforce limits, reap its children, retain evidence and clean its owned media files. A caller kill must not orphan FFmpeg or leave a retry queue running.
7. Exercise observer serialization, limits, cancellation, log redaction and cleanup with non-media stubs first, after inspecting every import/hook for side effects. No such execution was performed during this review.

## 4. Resource gate, current snapshot is insufficient

Read-only snapshot at2026-11-18 21:54:55 local time:

- Cgroup memory limit:1,944,928,256bytes.
- Current usage:1,163,194,368bytes, headroom781,733,888bytes at that instant.
- Peak:1,890,516,992bytes; cumulative `oom_kill` counter7. Neither has a matching historical attempt/time binding, so neither explains the old4K failure.
- Available temporary disk:604,135,424bytes. Inodes were not constrained.

The existing staging helper caps intermediates at256MiB by default, configurable only up to512MiB, checks child RSS at50ms intervals and is limited to a supported2-12slice graph. It is not a whole-worker/resource-tree bound. The final ordinary encode lacks equivalent memory/disk safety checks. Lossless intermediate size depends on content and duration; compressed output cannot be budgeted from raw dimensions alone. The current disk snapshot does not establish enough reserve for4K source download, normalized audio, intermediates, final output, evidence and an operating-system/database margin.

Required before a new actual export:

- A fresh measured resource baseline in an isolated environment with enough memory and disk for the specific manifest, including existing services and sampled-limit overshoot reserve.
- A clear source/intermediate/output budget and a nonzero reserved-free-disk stop. Staging intermediate caps are not a substitute for checking available filesystem space and all attempt artifacts.
- A graph that is either supported by the existing measured strategy or separately qualified. The six-slice720p buffering result does not diagnose the historical single-slice4K failure. Do not enable staged rendering as a general fix.
- Reviewed supervisor/receipt behavior and a fully consistent fixture. The historical2s correction has no surviving readback and is not usable proof of a corrected attempt.
- Separate approval to lift the current no-media stop. Start only with the smallest supported actual API case under explicit limits; advance one controlled variable at a time and verify source/content/captions/dimensions/duration/audio from real output. Synthetic geometry checks do not replace that acceptance.

## Decision

This boundary can complete a reviewed guard policy and observability design, not identify the missing historical resource cause or prove an actual export. The next useful implementation is qualification-only supervision/receipts plus a report-only base invariant audit, followed by non-media observer tests. A production-enforced duration guard, historical-data repair, new render or environment purchase is not authorized by this document.
