# Shared-input slice buffering: bounded resource investigation

Scope: local diagnostic of the saved six-slice fixture at 720x1280, not another
4K API attempt. No production execution path was changed. No ASS subtitle file,
watermark, x264 encoder, storage request, UI, or output-quality qualification.

Source: rank1-clean-source-approx-aligned.mp4, SHA256
77077a07ad64772757648b96a98f4ed05b0beaf50df231fabd767dd768a2d70d.
Compiler: 1f53817e9f4b82b007c21b6ee251f89eb232d411.

FFmpeg decoded the real source through the compiled layout graph to null output.
A Python parent sampled only its child RSS and thread count every 50ms. Each
probe had a 15-second deadline and a 420000 KiB sampled-RSS safety stop, killing
only its own process group. Sampling can overshoot and is not host peak memory.

| Case | Result | Sampled peak KiB | Seconds |
|---|---|---:|---:|
| One 2s slice | Finished | 78512 | 0.553 |
| Two 2s slices | Finished | 172676 | 1.005 |
| Three 2s slices | Finished | 306800 | 1.307 |
| Six 2s slices, bounded filter threads | Safety stop | 426072 | 1.024 |
| Six 2s slices, default filter threads | Safety stop | 425940 | 1.023 |
| Six 2s slices, silent source context | Safety stop | 434092 | 1.024 |
| Six plain 2s copies, no complex layouts | Safety stop | 450544 | 0.321 |
| Six 0.25s slices | Finished | 192240 | 0.302 |
| Six plain 2s copies, independent source inputs | Finished | 184384 | 0.804 |

The independent-input variant was a diagnostic graph transformation, not an app
feature. It uses one separately limited input per slice, with identical source
windows. It does not yet prove output equivalence. It used 25 threads versus 4
for the bounded shared-input case. Multiple decoders may become expensive with
large source dimensions or many slices, so it is not a general memory bound.

These controls isolate a duration/branch-buffering problem in the shared-input
multi-slice graph even at 720p. Captions, encoding, 4K resolution and a high
filter-thread count are not necessary for this reproduction. They do not prove
the historical 4K stalls had this exact cause. Do not resume 4K qualification on
this evidence alone.

An initial 180x320 probe failed at graph configuration because one branch had a
270x480 minimum. It was discarded as a memory experiment, not counted as a
successful low-resolution render. Supported export-size behavior was unchanged.

## Reproduction and next gate

The companion render-graph-resource-probe.py accepts a saved CompiledRenderGraph
JSON. It does not construct arbitrary shell commands and refuses diagnostic
limits above 30 seconds or 500000 KiB. Its normal exit status is nonzero on a
safety stop. Use a fresh output directory each time.

Next: establish decoded video/audio equivalence for a bounded execution strategy
on short fixtures, then qualify transitions, gaps, nonzero trims, speed changes,
freeze/title cards, overlays, normalization and captions before considering
production integration. A sequential segment-execution route offers a stronger
memory bound than opening unbounded independent decoders. Do not silently change
saved edits, frame clocks or audio behavior to lower memory.

Evidence is saved separately under vireo-resource-isolation, including compiled
graphs, commands, per-case results and FFmpeg logs. This note is measured resource
evidence only, not a visual or final-output milestone.

## Follow-on staged implementation (offline only)

The compiler can now describe ordinary cut slices and the untouched post-concat
filter tail. `buildSliceRenderStaging` builds a separate execution plan, limited
to 2-12 ordinary cuts, one real source input and no transitions. It is NOT called
by normal render jobs. Graph mutations after compilation, measurement graphs,
additional music/overlay inputs, freeze/title cards and synthetic silent-source
inputs are refused. The helper never changes the saved project.

Each slice is rendered sequentially to lossless FFV1 video and float PCM in NUT.
The final pass uses the original concat, global captions/audio filters and final
maps. An initial signed-16-bit PCM intermediate changed sample hashes. Float PCM
removed that mismatch. Do not substitute an integer intermediate.

Measured follow-on evidence:
- A 1.5-second six-layout fixture matched the original shared-input graph exactly
  in 44 decoded video frames and 67 PCM framehash packets, including timestamps,
  sizes and hashes. This was deliberately short enough to stay under the cap.
- The full 12-second 720x1280 six-layout fixture matched an independent-input
  diagnostic baseline in all 360 decoded video frames and 522 PCM framehash
  packets. The long shared-input graph was NOT retried as a reference.
- Actual native-helper stage RSS peaks: 208284-249668 KiB. Final raw-hash pass:
  119056 KiB. Final H264/AAC encode: 137124 KiB. Each process completed under the
  same 420000 KiB / 15-second safety limits.
- Final controlled output: 12.000 seconds, 720x1280 H264, 360 video frames,
  44100 Hz stereo AAC. Actual six-view contact sheet and the split frame were
  inspected. These preserve this fixture's existing composition, not a new
  layout-quality judgment. ASS captions were intentionally absent.
- A generated-source regression with nonzero source trims and a 2x speed change
  also matched exact decoded video and PCM hashes. Staging, silent-source and
  layout-chain tests: 15 passed; server TypeScript check passed.

Caveats before normal export integration: temporary-disk bounds, deadline and
cleanup ownership, multi-process work budgeting, longer edits, production
hardware-encoder path, actual captions/watermarks, source EOF, transitions,
overlays, music, title/freeze, silent sources and normalization modes still need
qualification or explicit exclusion. This does not establish general 4K capacity
or justify removing the earlier stop. FFmpeg in this environment was 4.4.2,
matching the installed ffmpeg-static executable.

## Bounded offline preparation and real ASS follow-up

`prepareSliceRender` now owns a private temporary directory, sequential child
processes and a single preparation deadline. Defaults: 60 seconds, 256 MiB of
temporary files and 420000 KiB sampled child RSS. Limits are polled at 50ms and
can overshoot; they are safety stops, not OS-enforced reservations. Failures kill
the current child and remove its owned directory. Success returns an explicit
idempotent cleanup function for after final encoding. It does not own the final
encode deadline or global job concurrency, and remains outside normal exports.

Tests cover successful preparation/cleanup, deliberate disk-limit failure,
deadline failure, and refusing unsupported graphs without creating a directory.
The trim/speed hash regression now also burns an actual generated ASS file and
keeps the original global audio filters.

A second actual 12s 720p controlled render used the saved fixture's six synthetic
caption cues and explicit coordinates via the caption extractor and ASS builder.
The native preparation helper peaked at 249660 KiB and generated 84355389 bytes
of intermediates. The guarded final H264/AAC pass peaked at 156976 KiB. Its
temporary intermediates were removed afterward; saved project JSON was unchanged.
The actual contact sheet was inspected: the synthetic POSITION CHECK text is
visible across all six existing layouts. This is a direct helper/render exercise,
not an authenticated Studio/API/export-job test, language-accuracy evidence or a
claim that all caption styles and animations are qualified.

## Disabled-by-default render-job integration qualification

`CLIP_RENDER_SLICE_STAGING_QUALIFICATION=1` now selects preparation in the real
multi-track job path. The default is OFF. Unsupported graphs fail clearly rather
than falling back to the memory-heavy shared-input graph while this flag is on.
Preparation and final encoding share the existing render execution deadline.
Intermediate cleanup happens after encode, with the job's outer temporary-dir
cleanup covering earlier errors. No login, auth middleware or plan policy changed.

`server/scripts/local-qualification/staged-render-api.mts` creates new UUID
fixtures in a separate local Mongo database. It exercises the actual HTTP render
route, job lifecycle, local S3 GET/HEAD/PUT protocol and real FFmpeg. Identity,
plan and one-thread CPU encoder selection are mocked for the fixture only;
watermark enforcement is explicitly on. No connected account or paid provider is
used. Original fixture records are read as templates, not edited.

The final run was accepted (202), reached clip ready AND job completed, uploaded
an actual 12s 720x1280 H264/AAC file, retained the saved tracks byte-for-byte, and
removed the job's temporary directory. Preparation recorded 92830807 bytes and a
227416 KiB sampled child peak. The six-view contact sheet was inspected: all six
saved manual layout modes, synthetic captions and watermark are present.

Important: this API fixture has no reframe analysis track. Its manual split uses
existing fallback geometry rather than the earlier helper fixture's analyzed
speaker zoom. It has 359 encoded frames, not the 360 of the earlier analyzed
fixture. Do not call the two exports picture-identical or Auto-qualified. It is
also an upscaled 854x480 source, not native 720p detail. The first harness attempt
observed clip ready before job completion; the harness was corrected to wait for
both states and the fresh run passed. This was not a 4K attempt or a release.
