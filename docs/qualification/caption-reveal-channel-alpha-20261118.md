# Reveal channel opacity correction

## Reproduced defect

Actual Soft Build normal Pro output at `/downloads/vireo-catalogue-soft_build-baseline-0521` had opaque dark export shadows against preview white glyphs. ASS reveal used global alpha, overriding the BackColour alpha corresponding to preset shadowOpacity .22. This is separate from the earlier line-background color-reset defect.

## Bounded change

Reveal words now set fill, secondary, outline/background and shadow alpha individually. Each channel multiplies its own opacity by reveal and cue-exit opacity. Hidden-character suppression remains global transparent; caret drawing unchanged. Saved/manual shadow opacity is respected rather than replaced. No palette, geometry, font, duration or reveal boundary changes.

## Evidence

Fresh actual normal Pro creation/job/local storage/upload/signed download rerenders and PreviewCanvas pairs at .267/1.667/19.1s:

- `/downloads/vireo-catalogue-soft_build-alpha-0527[-ui]`: inspected all three pairs; dark export shadows corrected toward preview, including bright 19.1s sample. Readability against bright footage remains weak in both.
- `/downloads/vireo-catalogue-typewriter-alpha-0528[-ui]`: inspected partial character and caret states at all three times, matching sampled placements. No full timing approval.

Focused alpha/box/font/E2 tests: 45 pass, zero fail (`/downloads/vireo-caption-alpha-focused-0528.log`). Broad safe: 421 pass, zero fail, one skipped out of 422 (`/downloads/vireo-safe-20261118-0528.log`). Frontend/server typechecks pass (`/downloads/vireo-{frontend,server}-types-0528.log`). New alpha tests cover .22 visible shadow, partial reveal multiplication, explicit box and hidden typewriter characters. Explicit box suppresses shadow under existing resolver rules; not changed.

Auth/entitlement/encoder/local object storage doubles remain. Same source and unchanged saved actual provider response, manually selected whole-source interval and center crop. Not recognition accuracy, independent reference fidelity, real production storage, listening or full temporal acceptance. Global-alpha issues in other independent motion branches were not changed or qualified.
