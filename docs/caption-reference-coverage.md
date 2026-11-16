# Caption reference coverage, 2026-11-16

This is an implementation checkpoint, not a claim that Vireo matches all Opus presets.

Observed gallery: https://clip.opus.pro/editor-ux/P31116181V7e.t5k6CjmiGb?clipId=t5k6CjmiGb&clipRank=3&editType=normal

The canonical observed 44 exact labels and candidate/unmatched state are in
`server/src/shared/captionReferenceCatalog.ts`. No reference is marked verified.
Same-name styles already in Vireo are not counted as matches.

## First independent candidates

- Word Cut: Inter bold, white, a small shadow, one word per cue.
- Soft Build: League Spartan regular, white, a small shadow, timed word accumulation with a short fade.
- Typewriter: JetBrains Mono bold, white, timed character accumulation. Missing the reference's yellow cursor.

The gallery tile animations were observed, not downloaded, copied or embedded.
No benchmark clip preset was selected, saved or exported during this inspection.
The exact applied output and timing still need comparison on an isolated manual-inspection copy.
The font families and visible UI sizes (Word Cut63px, Soft Build63px, Typewriter47px) were
then confirmed on the independent copy. ASS sizes are converted using measured font ratios.
The fade interval and timing distribution are Vireo's own candidate parameters.
They are not inferred competitor implementation details.

## Shared renderer contract

`CaptionPresetDefinition.reveal` and `ResolvedCaptionStyle.reveal` are `all`, `build`, or `character`.
`getWordRevealState()` supplies the same time-derived visibility to preview and ASS.
Future glyphs are hidden but retain their layout width, so the paragraph does not move as words appear.
Seek does not depend on an animation having played previously.
Segment-only captions stay static instead of inventing per-character timings.
Cue manual position is retained. This change does not compute layout-aware anchors.

The three font families are bundled; production ASS render filters must receive a fontsdir containing
the font files. The font/export owner owns that separate wiring. A standalone FFmpeg qualification
used a flat fonts directory explicitly; that is not proof that all production render paths do so.

## Checks

- Frontend and backend TypeScript checks.
- New deterministic reveal, names/coverage, safe ASS, single-word grouping, Unicode and manual-position tests.
- Existing gallery/hover/grouping/render tests. One stale base test expecting per-word `fontSize`
  was updated to assert the transform the renderer actually uses. Ignored ffmpeg-static postinstall
  was supplied a local symlink to system FFmpeg for tests only; this symlink is not a code change.
- Actual headless Chrome previews and CPU FFmpeg exports, same 540x960 output and timed fixture.
  These compare internal preview/export rendering, not Opus parity.

## Still open

41 styles are unmatched; the 3 candidates are unverified. The yellow Typewriter cursor, full-sized
reference comparisons, all-font production provisioning, per-scene anchor integration and broader
aspect-ratio/word-customization tests remain. No main release is warranted by this checkpoint.

## Font qualification correction

The first reduced contact sheets hid ~15% typography drift. Full-size glyph bounds and actual
FFmpeg fontselect logs caught it. Inter and JetBrains Mono must use their Windows metric ratios,
not hhea ratios. A League Spartan static instance must update font names when instancing weight400;
otherwise libass sees the Thin family and silently falls back to DejaVu. Both are corrected.
Centisecond-quantized shared reveal boundaries avoid one-character preview/export drift.
Baseline offsets for the three newly qualified faces were then calibrated in the shared CSS.
Final glyph bounds are within1 pixel vertically and0-2 pixels horizontally at540px width on
the tested phrase. This is still not declared pixel-perfect or reference parity.

All44 individual styles have since been applied on one independent manual-inspection copy and
its Font/Effects panel values captured. This does not prove their animation timing or export behavior.
The complete observed control values are in `docs/caption-reference-visible-settings.json`.
No private implementation or animation assets are included. The exact account-source evidence
is retained separately; account-specific identifiers are omitted from the settings document.

Final checkpoint checks:70 targeted tests pass and both TypeScript checks pass.
