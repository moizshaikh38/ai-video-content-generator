# Caption reference coverage, 2026-11-16

This is an implementation checkpoint, not a claim that Vireo matches all Opus presets.

Observed gallery: signed-in OpusClip editor, Captions > Presets. Exact account-specific source
reference retained separately with the private research evidence, not embedded in distributable code.

The canonical observed 44 exact labels and candidate/unmatched state are in
`server/src/shared/captionReferenceCatalog.ts`. No reference is marked verified.
Same-name styles already in Vireo are not counted as matches.

## First independent candidates

- Word Cut: Inter bold, white, a small shadow, one word per cue.
- Soft Build: League Spartan regular, white, a small shadow, timed word accumulation with a short fade.
- Typewriter: JetBrains Mono bold, white, timed character accumulation. Includes an independently implemented yellow caret (#F7C204), following the timed reveal.

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

41 styles are unmatched; the 3 candidates are unverified. The Typewriter full-sized
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

Final checkpoint checks:98 targeted tests pass and both TypeScript checks pass.

The three candidate gallery cards carry a separate "In testing" badge; exact preset names stay unchanged.
The original preset ID list stays in its existing order; new IDs are appended.

## Typewriter caret checkpoint

A yellow block caret is now rendered from time-derived character counts. The preview uses an
inline overlay; ASS uses a separate vector layer, so neither changes paragraph width. Direct-cue
manual x/y and two-line placement were compared as actual Chrome and FFmpeg pixels. Gallery
pixels were also inspected. This is internal parity, not Opus timing or export parity.

Important existing integration gap: `regroupCuesForPreset` drops cue position and style metadata
when it flattens/rebuilds timed cues, and the segment fallback also rebuilds a reduced cue object.
The direct-cue caret respects manual coordinates, but through-regroup persistence remains unverified
until the caption/layout integration owner preserves that metadata or reapplies it afterward.
No competing grouping or anchor contract was added here.

## Unicode safety

Typewriter character reveal uses grapheme clusters, so joined emoji, flags, accents and Indic
clusters do not appear as broken partial glyphs. An older browser without Intl.Segmenter degrades
to whole-word reveal. The monospaced caret is deliberately omitted for non-ASCII glyphs or
proportional font overrides until actual fallback-font metrics are qualified. This is safer than
a cursor that drifts across Hindi or emoji captions. Non-Latin typography is not claimed qualified.

## Metadata-preserving regroup integration checkpoint

The caption integration owner's regroup function has been ported, not replaced with a separate
policy: group within each input cue, preserve parent metadata and mixed segment cues, never
merge across scene/manual boundaries. Its4 tests were ported; the scene test uses already-placed
inputs because this isolated base does not contain the owner's scene-placement module.
One old test expecting cross-cue recombination was updated to test casing and long-cue wrapping
without violating the no-cross-boundary contract.109 targeted tests pass.

Through-regroup manual x=.7/y=.65 Chrome/FFmpeg pixels exposed preview-only rewrapping because
manual left positioning shrank the available paragraph width. CaptionPresetRenderer now retains
its original content width when positioned manually. Rechecked pixels agree on one-line layout
and caret placement. The actual scene-center anchor renderer remains the integration owner's
work and is not included here.

Unicode screenshot caveat: the joined-emoji cluster remains intact but renders missing-glyph boxes
in this environment. Grapheme safety is not font-coverage support. Do not claim non-Latin/emoji
rendering is qualified.

## Soft Cut checkpoint

Fourth independent candidate: exact name Soft Cut, cream #F0E6B5, Figtree Semibold600,
one-word replacement and two hard vertical shadow layers. Public Figtree OFL and font
are bundled. Public provenance: https://github.com/google/fonts/blob/main/ofl/figtree/METADATA.pb
and https://github.com/google/fonts/blob/main/ofl/figtree/OFL.txt . Static weight600 instance
updates font names. ASS selects Figtree SemiBold explicitly with boolean Bold0;
using Bold600 in an ASS style is incorrect and selected fallback Bold700 in testing.

CSS uses two text-shadow layers; ASS uses two translucent positioned glyph passes plus
the fill. Explicit positioning avoids libass collision relocation of the duplicate passes;
existing manual position tags are preserved, never prefixed with a competing default.
Explicit shadow/box controls replace these preset layers. Actual Chrome/FFmpeg pixels
were inspected on three words and manual x=.7/y=.65 through regroup. Baseline drift
is within1px on that fixture. A default font override remains supported, not guaranteed
to preserve reference typography. No scene-center anchor logic changed in this branch.

Current coverage supersedes earlier counts:4 candidates,40 unmatched,0 Opus-verified.
Full-sized applied reference timing/segmentation/shadow comparison remains open.

## Gallery inherited-font correction

The full styled gallery exposed nested Typewriter glyph spans inheriting a smaller generic
monospace size while the caret kept its fixed geometric size. Shared preview glyph spans now
carry the exact same explicit em size as the line. Rechecked actual gallery pixels show normal
text/caret proportion. This is a preview styling correction, not a change to ASS timing/geometry.

## Experimental Retro 3D and bundled-font size bounds

Not counted as an accepted fifth candidate until integrated serialization/save/render checks pass.
Current coverage remains4 candidates,40 unmatched,0 verified. Retro 3D is exposed locally with
the exact name and In testing badge: public OFL Bungee, yellow#FFD23F, white active word,
dark#1B1B1Boutline, six orange#E4572Ediagonal extrusion passes and a small settling lift.
Its timing and line spacing are independent candidate parameters, not a reference match.
Font provenance: https://github.com/google/fonts/blob/main/ofl/bungee/METADATA.pb and
https://github.com/google/fonts/blob/main/ofl/bungee/OFL.txt .

Actual Bungee Windows metrics are1000units per em over2574ascent+descent. Matching70px
em needs180ASSunits, so the previous blanket110cap cannot represent it. Exact bundled
family Bungee alone now has shared bounds32..284; all other/unknown families retain32..110.
getCaptionFontSizeBounds and clampCaptionFontSize are the source of truth. Sanitization
requires explicit family or caller-supplied preset family context for high metric-size values.
The isolated UI's number input and slider use these bounds;180->200updates were exercised
as actual pixels. Production API/save validators still belong to the integration owner and
are not changed here. This is why the coverage record remains unmatched/experimental.

Lift uses deterministic20mssteps and separate positioned per-word events. Other words remain
hidden but retain layout width. ASS polygon-baseline tags were experimentally found ineffective
for ordinary text and are not used. Segment-only cues stay static. More than6edited words,
custom glyph scaling or custom effects disable lift consistently in preview/export until those
combinations are qualified. Existing scene/manual position tags are kept.

Outline order matters: CSS text-shadow covered the front outline differently from ASS. Preview
now paints separate glyph-shadow spans behind the outlined fill, with actual losslessFFmpeg
and Chrome pixels rechecked for Retro and Soft Cut. Approximate glyph bounds differ by up
to1px vertically and2px horizontally on the tested phrase. No pixel-perfect/reference claim.

Gallery scale now also respects a vertical estimate, preventing two-line presets with large
metric line boxes from clipping card edges. Nested monospace wrapper font sizes are pinned
to the shared line size, keeping the Typewriter caret on its text baseline. Actual styled gallery
and size customizer screenshots were inspected. These are not backend save/reload proof.

Plan producer caveat: a declared font parameter is not enough to enable Bungee bounds if the
producer does not actually apply that family. Unknown/unbound plan contexts keep110. Direct
save/render paths need the validated effective family. This lane does not alter producer behavior.
