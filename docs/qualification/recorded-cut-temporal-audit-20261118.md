# Recorded-sample source-cut timing audit

18 November 2026. Local-only temporal regression audit, not visual qualification.

After the measured source-cut fix, replayed the current default smoother on all existing `/downloads/*/fresh-normal-track.json` records carrying cuts. This is 89 track records but only 12 distinct analyzed source hashes, including repeated qualifications and controlled fixtures. It is not 89 independent holdouts.

For each record, use its recorded sample geometry, dominant track, source dimensions, duration and measured cut list. Recompute 9:16 keyframes with current default smoothing parameters. Then run actual `applyWordEnergyFusion` with deliberately controlled word windows spanning 200ms before/after each recorded boundary. These are stress timings, not actual transcript words or speaker turns.

Result: 211 existing millisecond-rounded measured-cut anchors, zero changed or missing anchors after fusion; zero non-increasing output timelines. Harness records track-file SHA256 and per-track counts. Raw private report: `/downloads/vireo-recorded-cut-temporal-1619.json`.

Reproduce from server directory with existing recorded evidence:

```sh
./node_modules/.bin/tsx scripts/local-qualification/recorded-cut-temporal-audit.mts NEW_JSON_OUTPUT
```

This neither reruns the analyzer nor reproduces original genre-tuned smoothing parameters. It checks timing invariants only. It says nothing about correct camera identity, audio-to-person binding, measured-cut correctness, selection, missing cuts, motion/readability or no-edit quality. No new source download, model, paid call or product change.

An accompanying evidence inventory found zero portrait-source records among the 89 recorded tracks with cuts. Natural portrait vertical-cut render qualification therefore remains open; landscape-source records cannot stand in for it. The synthetic vertical-cut rendering remains the decisive pixel proof for that narrow defect.

Resource prerequisite: bounded cleanup verified 71 reproducible source-cache copies against retained source/evidence files using full SHA256 and size, then removed only those duplicate cache entries. Retained originals were not removed. 426,140,355 bytes were reclaimed, increasing free space from about 200MB to 592MB. Cache links were not left pointing at originals because a fallback cache writer can overwrite in place. Manifest: `/downloads/vireo-cache-safe-dedupe-1617.json`. This is execution hygiene, not a product source-cache policy change.
