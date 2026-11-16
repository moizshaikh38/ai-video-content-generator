# Typewriter size calibration, 17 November 2026

## Scope

Isolated measurement on integrated commit bc9ecdf. No preset default, font, typing model, service or Studio changes. Existing default remains 74. Explicit size 75 remains a supported saved override. Size 87 is a measured candidate for this reference phrase, not established visual parity.

Reference: approved independent Opus Copy draft,
https://clip.opus.pro/editor-ux/P31116181V7e.3Xx1VOscNwLs?clipId=3Xx1VOscNwLs&clipRank=4&editType=normal

Reference visible words: `hit the hay in`. Opus Font panel: JetBrains Mono Bold, 47px. Native canvas width: 720px. Measurement excludes the yellow caret and background. Reference font file implementation is not copied; local preview and export use the existing bundled JetBrainsMono-Bold.ttf.

## Pixel observations

White glyph bounding boxes at native 720px width, using RGB channels >180 and channel spread <35 in a tight text-only region:

| Local ASS size | CSS glyph bounds | ASS glyph bounds |
| --- | --- | --- |
| Reference | 306 x 35px | Not available |
| 74 | 260 x 31px | 260 x 31px |
| 75 | 264 x 31px | 263 x 31px |
| 86 | 302 x 36px | 302 x 36px |
| 87 | 306 x 36px | 305 x 35px |
| 88 | 310 x 36px | 308 x 36px |

CSS was rendered through actual Vite/index.css and CaptionPresetRenderer, with font loading awaited. ASS was rendered by FFmpeg/libass with the same local bundled bold font, 720x1280 output. Frame was selected after all letters were visible. Source word timings were retained in the local fixture; this does not assert that the reference uses the same typing model. Vertical caption placement is deliberately not compared.

## Limits and next qualification

- One full phrase supports 87 as a size-only candidate; it is not a general mapping for all phrases or fonts.
- This direct-cue render does not prove the real CaptionService, PreviewCanvas, Studio edit/save/reopen or final render paths.
- Earlier reference frame-grid prose was misread and corrected. Do not use it to infer typing onset or speed. Editor clock increments alone do not establish clock-to-canvas synchronization or original source frame rate.
- Owner must compare 75 and 87 in the actual Studio and save/render path, including short and two-line phrases, before changing the default.
- A concrete readability result here is restoration of phrase glyph width from 264px to 306px at native720, without changing words or reveal states. This is a measured difference, not a claim of improved user comprehension or superiority over Opus.

## Regression checks

`captionTypewriterSizeCalibration.test.ts` covers default/override separation, CSS glyph sizing and ASS font size, retained font, unchanged reveal states/source word times, deterministic seek and explicit two-line manual-center caret geometry. The test intentionally leaves the default at 74. 74 targeted tests and both TypeScript checks passed on this isolated commit.
