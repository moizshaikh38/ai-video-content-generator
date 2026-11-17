# Prism Stamp independent candidate

17 November 2026. Original Vireo implementation, not a purchased or imported After Effects pack and not an Opus parity claim. Existing preset labels and default remain unchanged.

## Reference inspection

Public rendered previews were used as visual references, not source code or packaged assets:

- https://www.motioncaption.com/presets : sample181 shows a moving capsule and changing active-word colors; sample198 shows extruded gold text rotating in depth; sample246 shows timed keyword scale/color and emoji. Existing Vireo moving-box/chip/pop mechanisms already cover parts of this design space, so no renamed duplicates were added.
- https://elements.envato.com/100-creative-subtitle-caption-styles-FGXWYYK : public preview shows layered multicolor outlines/offsets and staggered text entrances. Only its rendered public preview was inspected. No template/source pack was purchased or downloaded.
- https://captions.ai/help/docs/api/video-caption-templates : inspected rendered preview clips with progressive word emphasis and large keyword cuts.
- https://www.submagic.co/ai-caption : inspected the rendered hero preview with short high-contrast phrase captions and keyword emphasis.

These examples do not establish a universal best preset, comprehension improvement, or Vireo equivalence to the products.

## New behavior

ID `vireo_prism_stamp`, label `Vireo Prism Stamp`, gallery group Neon & Color Pop, marked In testing. One timed word per cue by default. Montserrat Bold96 uses the existing bundled preview/export font files. A word enters at76% scale and an8-degree tilt, reaches106% scale with a small opposite tilt, then settles at100%. Cyan/coral offset glyph passes sit behind white fill. The motion uses original numeric keypoints rather than third-party animation data.

Timeline-only state is quantized at20ms and stored as explicit ASS event slices. The preview wrapper has CSS transitions explicitly disabled so seeking does not start a second wall-clock animation. Cue timing is never invented for individual words. Segment-only cues animate the whole real cue, not fabricated words.

Shared owner width-aware grouping is retained. No alternative grouping/anchoring model is added. Manual center/bottom positioning and preset boundaries remain metadata boundaries. Existing Opus names and reference-catalog qualification counts are unchanged.

## Qualification

- Actual Vite/index.css + CaptionPresetRenderer screenshots paired with FFmpeg/libass renders using the exact bundled Montserrat-Bold font.
- Inspected early, peak, settled, next-word, manual-center, two-line, square and landscape frames.
- Measured white-glyph bounds at720px output width: early115x36 CSS/116x36 ASS; peak130x34/130x33; settled123x29/122x29; manual-center130x33/130x33; two-line327x106/330x105. Small rasterization differences remain, not pixel identity.
- Actual CaptionService method, with repository reads replaced by local fixture data, reaches the new preset after shared regrouping and emits the new motion in ASS while preserving source timestamps, manual position and another preset's override. This is a service-path contract test, not a real-account API/save/reload/render E2E test.
- 242 focused caption/expanded-preset tests passed,1 skipped. Broader caption run has5 failures in two older accuracy suites. All5 reproduce unchanged on the isolated owner baseline aa31753: three incomplete response mocks, one project lookup mock and one edited-cue mock. No broad green-suite claim.
- Frontend build and both TypeScript checks passed. Build retains existing bundle-size warnings.

## Supported edits and limits

Font, size, fill, uppercase, spacing and line/word settings remain editable through existing controls. Explicit shadow controls replace the preset's layered offsets. Box, pop override, left/right alignment, or token custom styles deliberately use the existing static/general renderer in both preview and export rather than approximating the stamp. These fallbacks are tested.

The existing oversized-token, complex-shaping, and segment-only physical-width limits are not solved by this preset. Position near a canvas edge can still place tilted text beyond the canvas; no global clipping/nowrap change was introduced. Real Studio selection/edit/save/reopen/project export qualification remains outstanding before any release claim.

## Baseline and reproduction

Remote source base affd0f96 plus the runtime owner's caption-only width/timing packet is recorded locally as aa31753. The new preset commit is separable from that baseline. It does not include Auto Layout, tracker/decode, tutorials, external assets, dependency-lock changes, or a push/deployment.

The accompanying local fixtures render720px portrait, square and landscape samples. Libass must receive a flat directory containing the existing font files; pointing fontsdir at their parent directory silently substitutes fonts and invalidates the size comparison. The decisive fontselect log names Montserrat-Bold.
