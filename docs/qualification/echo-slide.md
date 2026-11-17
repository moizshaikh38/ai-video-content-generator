# Echo Slide independent candidate

17 November 2026. A second original Vireo mechanism, not an imported template, vendor asset or parity claim. Existing preset labels/defaults and the Opus reference catalog counts remain unchanged.

ID `vireo_echo_slide`, label `Vireo Echo Slide`, Clean & Readable group, In testing. Existing bundled Inter Bold88. Up to four words form a short phrase through the owner's shared width-aware grouping. A cubic40-unit horizontal entrance lasts at most260ms; two blue echo glyph passes fade to zero, leaving clean stationary white text. There is no rotation, overshoot, blur or permanent shadow by default. This differs from Prism Stamp's rotating/scaling word entrance.

## Implementation boundary

The first preset's internal `cueStamp` flag is generalized to `cueMotion: 'stamp' | 'echo'`. Its existing motion math is unchanged and its tests still pass. Both use explicit20ms timeline states in preview and ASS, with CSS transitions disabled on the moving wrapper. Echo's offset and layer alpha are sampled from the same pure function. Parent positioning remains unchanged; only visual displacement is added around the existing anchor. No grouping/placement/service changes or font assets were introduced.

Selecting either self-animated preset clears an inherited pop/karaoke/bounce setting, extending the separately delivered selection fix. Later explicit box/pop/left-right/token-custom edits still fall back consistently to the existing general renderer. Supported font/size/fill/shadow controls remain editable. Explicit shadow controls replace the built-in echo passes.

## Evidence

Public reference inspection is described in prism-stamp.md. Layered colored text and timed entrances informed the design direction. Neither these sources nor this local sample establishes global best quality or vendor equivalence.

Actual Vite/index.css + CaptionPresetRenderer pixels were inspected beside FFmpeg/libass with a flat directory of the existing bundled fonts. Early/peak/settled/manual-center/two-line/square/landscape examples were checked. The first short phrase was not truly two lines, so that fixture was replaced with `Extraordinary ideas deserve room`, using the real preset's grouping rules.

At720px output width, two-line white glyph bounds are390x90px in both paths, with a1px vertical difference. Ordinary settled phrase bounds are465x38 CSS versus468x38 ASS; manual phrase465x38 versus468x38,2px vertical difference. This is sampled agreement with small rasterization/metric differences, not pixel identity.

252 focused caption/expanded-preset tests passed,1 skipped. Both TypeScript checks and frontend build passed, with the existing bundle-size warning. The same5 older accuracy-suite failures documented in prism-stamp.md remain excluded from the focused result; they were already reproduced on the unchanged owner baseline.

New checks cover monotonic motion/fading trail, seek independence, fractional starts, invalid clocks, short cues, bounded event count, gallery reachability, JSON selection roundtrip, source word timing, manual/two-line geometry, edits and fallbacks. An actual CaptionService method test with local repository fixtures reaches Echo after shared grouping, preserving phrase timing/manual anchor and another preset boundary. This is not a real-account API or Studio save/export E2E test.

## Remaining qualification and limits

Owner should inspect the phrase slide and disappearing trails in actual Studio, save/reopen, and project export. The existing Prism/input paths need no duplicate rerun for this mechanism. Keep the gallery In testing until sufficient qualification is complete.

Existing oversized-token/complex-shaping/segment-width limits remain. Segment-only captions use the real cue's timing for the entire phrase; no word timing is fabricated. Near-edge placement can still move text outside the canvas, especially with long phrases; no global clipping/no-wrap hack was added.

## Integration

This delta follows f85d372 (Prism) and the equivalent of a89483c (selection correction, cherry-picked locally as19d2919). The patch is relative to19d2919 and contains only Echo plus the internal motion-flag generalization and its tests/docs. The independently delivered font-input correction89eac6d is not bundled into this branch. Do not apply duplicate baseline/Prism/selection commits from the fetchable bundle if they are already integrated.
