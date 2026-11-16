# Isolated reliability batch

Prepared 16 Nov 2026 against GitHub main
`1754a1702a0e535d1d192c76532fe8b01f61d4de` (live branch API checked before isolation).
No remote write, merge or deployment performed. This is a local release candidate,
not overall product acceptance.

## Changes

- Pro editor-project export queues the clip before launching its worker. Previously
  it marked itself rendering and the render guard refused its own job.
- Silent/below-gate dialogue skips only loudness normalization instead of aborting
  the valid video export. Other measurement errors are rethrown. Normal non-silent
  and dynamic fallback behavior retained.
- Fresh editor projects default to plan-free clean captions instead of highlight.
  Editor caption/template application respects loaded allowed presets and shows
  paid styles as locked. Backend entitlement rules are unchanged.

No smart-framing, detector, split/group composition, watermark, font, genre policy,
shot-boundary, gaming or experimental body-model changes are included.

## Evidence on this isolated main-base tree

- Baseline before changes: frontend/backend TypeScript checks passed.
- After changes: frontend/backend TypeScript passed and frontend production build
  passed (existing >500kB chunk-size warning remains).
- Loudness: 17 actual FFmpeg tests pass, including silent output, normal measured
  loudness and infeasible-linear dynamic fallback. Silent output pixels inspected.
- Entitlements: 12 tests pass against local test Mongo replica set.
- Studio HTTP + Mongo save/reload: 8 tests pass.
- Fresh Free fixture: original clip style unset, new project generated clean.
  Real isolated frontend selected Simple, saved via PATCH200, reloaded with Simple
  and visible caption track. Actual video loaded. Paid styles visually locked.
- Direct attempt to save hormozi through the clip editor endpoint returned
  403 PRESET_RESTRICTED; existing simple style stayed unchanged.
- Actual editor-project render API: POST202 -> rendering -> job completed100%.
  Final v4 output360frames/12s30fps, audio12s, source/export pixels inspected.
  This fixture has no transcript and explicitly uses old center crop, which cuts
  both interview participants. It proves job completion, NOT framing/caption
  quality. Free-plan watermark still appears.

## Test setup and corrected harness issues

Local-only auth stub, Mongo, object-storage fixture and source media. No paid AI
calls. First frontend attempt lacked test VITE auth values and redirected to
login; fixed by supplying fake local config, not product changes. First export
runner had a response logging bug and then stopped a run at clip-ready before
job completion. Final v4 waited for completed100%; no earlier run is counted.
One entitlement invocation without Mongo env cancelled its12 tests; rerun with
local env passed12/12. No all-green claim for that first invocation.

## Release boundaries

This batch is a defensible isolated candidate for the three reliability fixes,
not authorization to merge. Main may auto-deploy. Before release, require owner
approval plus target-environment build/dependency checks, current-main drift
check, production smoke/rollback plan. Existing center framing, absent transcript
and other unfixed main behavior are not improved by this patch. Production auth,
queues, storage and concurrency have not been qualified by local fixtures.
