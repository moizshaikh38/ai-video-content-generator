# Fit-only ordinary Auto measured-context regression

18 November 2026. Local qualification only, not production.

## Defect and narrow change

`SmartReframeService.explicitAutoLayoutPlan` accepted explicit Auto only if a policy allowed Fill or Split. Fit-only therefore exited before the existing source-bound measured-context rule. The ordinary legacy fallback then chose a generic 4:3 sharp window even when it cut the OCR regions that the planner had already protected.

The entry guard now accepts Fit as a supported policy choice. All existing per-branch checks still apply. Fit-only cannot select Split or Fill. Manual ownership, stale or unbound analysis and unsupported content policies remain excluded. No classifier, model, OCR budget or feature flag changed.

## Fresh actual-output evidence

- Source: existing `/downloads/recovered-source/screencast-new-8s-1217.mp4`, 960x540, 8 seconds, no speech fixture.
- Before: `/downloads/vireo-fitonly-before-1603`.
- After: `/downloads/vireo-fitonly-after-1604`.
- Separate save/reload, render worker and signed-download result: `/downloads/vireo-fitonly-job-1605`.
- Both analysis runs used normal bounded automatic OCR, not manually supplied regions. Both produced 395 measured text regions. Experimental shot-composition/adaptive flags were off.
- Before controller: width .75, height 1, no presentation protection. Direct graph cropped 720x540 out of 960x540. Actual preview visibly lost left title letters and right panel context.
- After controller: width 1, height 1, measured-context protection and unresolved-review status. Direct graph cropped 960x540. Actual EditorShell Auto preview and rendered movie show the complete source width.
- Separate after job: saved the project captured from actual EditorShell Auto, reloaded it, ran `ClipRenderService.renderClipJob`, uploaded to local fixture storage, obtained signed download and downloaded the MP4. Inspected the resulting 8-second movie.
- Direct and job outputs each decoded 240 frames; all 240 decoded frame checksums matched. See `decoded-parity.json` in the job directory.

This is a local storage/auth/entitlement-mocked qualification. Source interval selection was manual. The job uses an explicitly empty transcript protocol fixture for a non-speech source, not real transcription or selection accuracy evidence. No production upload, new provider call, paid inference or main deployment occurred.

## Reproduction

From server directory with the existing local Mongo, CV and UI-driver setup:

```sh
./node_modules/.bin/tsx scripts/local-qualification/fit-only-context-review.mts NEW_UI_OUTPUT /downloads/recovered-source/screencast-new-8s-1217.mp4
VIREO_CONTROLS_ROOT=NEW_UI_OUTPUT ./node_modules/.bin/tsx scripts/local-qualification/fit-only-saved-job.mts NEW_JOB_OUTPUT /downloads/recovered-source/screencast-new-8s-1217.mp4
```

The UI harness requires the existing `harness-item-plan.html` fixture page and its actual EditorShell bridge. It does not substitute a mock UI. Those pre-existing qualification assets are not newly introduced by this change.

## Tests and limits

Focused bridge/policy/cut/text/caption/gaming tests: 35 pass, 0 fail. New regressions cover Fit-only source-bound context, missing/weak evidence and Fit-only scene cuts without Split or Fill. Backend type check passes. Safe suite: 421 pass, 0 fail, 1 skipped.

Full-width screen content is smaller. This fix prevents one policy-specific crop regression; it does not solve text readability, semantic screen detail, natural scrolling, active speaker association or no-edit clip quality. The offline screen-detail proposal remains offline. The short OCR budget and unknown-on-failure rules are unchanged.
