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
