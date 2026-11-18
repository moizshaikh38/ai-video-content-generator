# Primary video source-window parity

2026-11-18. Local product code correction, no release or media execution. Not4K qualification.

## Concrete mismatch

`renderClipJob` previously counted every item on every visible VIDEO track when choosing single-slice input seeking. That included hidden items and visible secondary B-roll tracks. `ProEditorService.compileRenderGraph` instead defines the base timeline as visible items on the first visible VIDEO track; later VIDEO tracks are composited overlays. A main clip plus hidden cut or B-roll could therefore make orchestration skip input seeking, even though compilation still uses its single-item path, whose filter clock assumes the caller pre-seeked the source. For a nonzero trim/source start this could select the wrong content.

The shared pure `primaryVisibleVideoItems` helper now owns selection/order for both paths. It selects the first visible VIDEO track, excludes hidden items, returns a new timeline-sorted array and does not mutate saved tracks/items. The compiler's existing primary-track semantics are preserved, including not promoting B-roll into an empty primary track. Orchestration now chooses single/multi and its input source window from that same selection. Secondary overlay rendering is unchanged.

## Non-media verification

Only the new `primaryVideoItems.test.ts` was executed. Its imports are Node test/assert and two pure shared helpers whose complete files were inspected first. No service/application imports, hooks, subprocesses, encoders, API, source downloads, database or providers.

4 tests passed:

- One visible main clip remains single-slice with a hidden cut, a secondary B-roll track, or both; source31.62..33.62 retains that2s source window.
- Multiple genuinely visible main slices remain multi-slice and timeline-ordered without reordering persisted items.
- Hidden tracks/non-video lanes cannot become primary; a fully hidden primary lane does not promote an overlay lane.
-2x and0.5x primary playback with B-roll preserves source12s and output6s/24s clocks.

The first test draft used exact floating-point equality for33.62-31.62 and failed on a3.6e-15 difference. Its assertion was corrected to a1e-9 duration tolerance without changing production clock arithmetic. Initial TypeScript check exposed generic inference loss at the untyped orchestrator project; explicit EditorTrackItem typing fixed it. Final server TypeScript check and `git diff --check` passed.

These verify helper selection and arithmetic plus static production wiring. They do not prove actual decoded output, overlay timing, audio/normalization execution or UI save/reload. Those media checks remain deferred under the existing stop. No historical4K causal conclusion follows from this different integration bug.

## Actual4K capability gate

Read-only checks at22:14 found:

- Unprivileged user+PID namespace with a single `/bin/true` child succeeds. bwrap/unshare/prlimit are installed. No resource setting was changed.
- Current cgroup/user is root-owned. cgroup.procs, subtree_control, memory.max/high and pids.max are not writable. There are no effective capabilities. No user service-manager bus is available.
- Shared memory limit1,944,928,256bytes with usage1,170,059,264bytes at that snapshot. Available temporary disk603,545,600bytes.

Namespace availability can aid process containment but does not provide dedicated aggregate memory reserve or make per-process prlimit a process-tree bound. The present stop is retained. Minimal external requirement is a queue-isolated execution environment with delegated enforced aggregate process/memory ownership and sufficient measured temporary disk for the specific source, normalized audio, intermediates, output, evidence and reserve. Then explicit lifting of the media stop and real-output qualification are still required. No external capacity purchase, resource change or media attempt occurred here.
