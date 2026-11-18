# Captions with constrained shared Fit

18 November 2026. Placement-only synthetic-label qualification; no new product change.

On the existing 12s pair source and Fit-only ordinary Auto, added one explicit test cue, `PLACEMENT TEST`, from 1-11s. This is not transcript text, automatic selection, speech timing or speaker association evidence.

## What was checked

- Normal analysis, source-bound measured track, shared full-source Fit from the earlier repeated-face fix.
- Saved project/reload, render worker, local upload and signed-download movies for automatic default caption placement and explicit manual `position_y=.23`.
- Actual EditorShell preview at2s with the same synthetic cue, after supplying cue props to the qualification fixture.
- Worker movies inspected: automatic caption is below the sharp shared video band; manual y.23 caption is above it. Both sampled views keep the caption away from the two faces.
- Actual preview screenshots inspected: same lower/upper placement distinction. Not claiming pixel or typography parity. The preview's visible typeface differs from the worker's stylized preset in this synthetic setup; fixture settings were not normalized enough to conclude a new product style bug.
- Existing caption/shared-fallback/audio-sync focused tests:12 pass,0 fail,1 skipped. No new product test claim or whole-repository green claim.

## Evidence and failed attempts

- Worker evidence initially inspected: `/downloads/vireo-shared-caption-final-1706/caption-auto-job.mp4` and `caption-manual-job.mp4`.
- Later visible-preview run: `/downloads/vireo-shared-caption-visible-1710/caption-auto-ui/layout-auto-preview-2.png` and matching manual path, with worker movies retained in the same parent directory.
- Initial1705 attempt inherited a muted caption item and is not a caption pass. It was corrected before1706.
- Initial UI fixture passed no cue props and showed no captions. A corrected fixture passed the test cue and produced visible previews. Original pre-existing harness file was restored afterward.
- A synchronous child process initially blocked the fixture HTTP server; changed to awaited asynchronous spawn. This was a harness timeout, not a product availability failure.

Bare `compileRenderGraph` does not itself add the worker's caption-burning stage. Its direct MP4 therefore has no caption; direct/job frame comparison only matched30/360 frames. This is not a successful direct/job caption parity check and is not presented as a product defect. Worker/upload/download placement and actual preview position are the covered claims.

## Reproduction and limits

`shared-fallback-caption-review.mts NEW_OUTPUT SOURCE`, with `VIREO_CONTROLS_ROOT` pointing to the existing ordinary-Auto UI fixture, adds the synthetic cue, captures actual EditorShell and renders worker variants. Its companion `shared-caption-ui.cjs` now creates a temporary caption-aware copy of the existing local UI harness and removes it afterward. That final packaging was syntax-checked; the decisive visible-preview run used an equivalent temporary edit of the existing harness, then restored it. The adapter's dependency on the pre-existing local harness/Mongo/CV/font environment remains explicit.

No source download, provider call, paid inference, production upload, feature activation or main/Antigravity update. Auth/storage/entitlements remain local fixtures; empty transcript protocol data is not real transcription evidence. Fixed placement does not prove broader readability, semantic completeness, multilingual captions, style parity or no-edit output quality.
