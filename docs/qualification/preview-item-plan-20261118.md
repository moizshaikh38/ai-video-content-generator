# Preview item-plan binding checkpoint, 2026-11-18

Local only. This closes a scoped consumer-wiring gap, not the whole composition or clean-clip quality gate.

## Contract and normal consumers

Normal GET clip reframe now returns the measured adaptive plan with its source/version/range/geometry/analysis/configuration identity in one envelope. It only issues that envelope after current source-object receipt verification. Preview provenance explicitly says recorded decoded geometry bound to unchanged verified source bytes. Export separately hashes and probes its actual input file. These are different verification routes and must not be described as a fresh browser-side decode/hash of the source object.

The envelope retains its parent analysis identity and shots together. EditorShell selects the effective source-clock scene using the same render-only expansion as Pro, including scene override IDs and exact source bounds, and checks item source, output aspect, range, per-scene candidate and policy before deriving a contained item result. Where available, the clip's selection source digest must also match. Pure tests compare this resulting identity and shot array against the normal Pro resolver's result, including an override scene. Full compute-options fingerprints still include measured samples and cuts; local mutable settings are separately compared through a stable configuration key.

A mismatch no longer silently applies a clip-global adaptive array to a different scene. It shows a visible review notice and a full-source preview, explicitly not an export-qualified layout. Desktop and phone labels say full-source/Review rather than falsely saying4:3orFill. A manual crop, panel layout, accepted context window, enabled tracker or explicit user layout bypasses the adaptive envelope check. No persisted row or manual value is migrated. Invalid scene expansion is caught rather than crashing the editor. Expansion is cached per source item instead of revalidating the whole item on every playhead update.

This is not a general per-item preview recomputation service: when an unsaved scene-specific policy differs from the clip-level response, preview abstains visibly. Pro may compute that scene's actual policy on export. Legacy group/tracking/blur paths and tracker handoff are not a full identity rewrite. Cached responses are not a substitute for verification before actual export. No claim of all-path or all-source preview/export parity.

The planner options type moved to a shared type-only module. This avoids pulling backend implementation dependencies into frontend typechecking. No planner algorithm or detector policy was changed by that extraction.

## Evidence lanes

- Pure/focused item + normal Quick/Pro + preview identity tests30/30pass, including exact equivalent preview/Pro results, source/config mismatch, manual bypass, immutable copies, effective override scene IDs/ranges and missing receipt rejection. These are contract fixtures, not CV quality.
- Actual local Mongo replica-set + object download/HEAD + normal getClipReframe controller integration2top-level tests pass. Synthetic analysis and simulated object server are explicit. Verified source yields a contained accepted preview result; replacement ETag yields stale status and null envelope. Real production auth/storage was not exercised.
- Real EditorShell desktop/phone capture with mocked analysis/entitlements passes valid, candidate, changed policy, wrong asset and manual Fit cases. No mutation endpoint was called. The notice is readable on phone with no horizontal overflow. Actual source video is used; this lane is not authenticated API end-to-end. The browser's small native remote-media icon appears on some Fit screenshots and is not part of the encoded video.
- Fresh broad enumerated safe suite421pass/0fail/1skip of422. This excludes several new focused files and is not whole-repository green. Frontend/server types pass.

## Fresh CV, separate from the earlier archive replay

The default Python lacked OpenCV, but a restored project CV environment and model files were found and verified. An earlier parent report saying local CV was absent was too broad and was corrected immediately. The earlier archived walking render remains an archive replay; it is not retroactively fresh analysis.

`/downloads/vireo-fresh-cv-walking-0409` records a NEW local8.82secondCV execution on exact12second854x480source bytes, SHA256 `5ede85ca40525e7c5986cc409783fed564abd454a64d1512ff8b8559be124fc5`. Source hashes before/after match.45sample records, local YuNet threshold.85and NanoDet model;0provider calls, no model install/download. Recorded inputs, runtime output and model identity are retained. This is sampled face/body geometry, not semantic context or speaker identity. Faces were absent in the inspected first sample; body evidence exists. The normal stable planner chose a review-marked4:3Fit, not a claimed confident portrait.

Fresh real720x1280/90-frame output from this new evidence: `/downloads/vireo-fresh-bound-walking-0410/actual-bound-walking.mp4`. Valid compiled graph still exactly equals the former direct-compute graph; source/project identity reject regressions still run. This shows current guards do not alter geometry for this valid input, not that the chosen composition is optimal.

Fresh PreviewCanvas versus encoded first-frame pair and decoded output0/1/2/2.9secondcontact inspected: `/downloads/vireo-preview-fresh-ui-0410/valid-pair.png` and `fresh-output-contact.png`. The first pair has broadly similar sharp Fit framing/band placement, but the blurred background treatment visibly differs. This is NOT whole-presentation parity; person/feet are visible in the four output samples. These are sampled pixels, not a continuous-motion, complete limb-visibility or editorial-quality benchmark. UI receipt verification is mocked even in this fresh-CV visual lane. Manual source interval2.7-5.7still prevents calling it an untouched automatic selection run.

The original archive-replay visuals remain separate at `/downloads/vireo-preview-item-ui-0408`. No new default review experiment, HUD integration, paid run,4Kattempt, push or deployment.

## Final producer/clock follow-up

The server envelope producer now owns plan computation from the bound options, rather than accepting a free-standing supplied shot array to stamp. It rejects compute-option mutation and invalid context before computation. Normal controller integration was rerun2/2and focused identity consumers31/31after this change. EditorShell's source-time labels, plan application context, scene-layout actions and PreviewCanvas now use one accepted analysis source anchor; stale trim checks on manually accepted context windows remain intact. Latest phone/valid-canvas captures were inspected under `/downloads/vireo-preview-final-ui-0416`.

The main reviewer correctly flagged the visible blur-treatment difference in the fresh pair. Preserve this as a real presentation gap. Neither source identity equality nor matching sharp band geometry proves matching blur, motion, listening or editorial quality. Next substantive check should use the combined normal source-object/controller/browser/render-job/download path, followed by this blur difference, rather than more guard-only summaries.

Reusable bounded offlineCVrunner: `fresh-cv-source.py SOURCE NEW_OUTPUT`. Records existing model/runtime paths, code/model hashes, exact source hash before/after and full output, without installs/downloads/provider calls. A second fresh12second910x480two-person source run is prepared at `/downloads/vireo-fresh-cv-pair-0417`,50sample records,9.55seconds, SHA256 `c486f16a5f8c36bb1152fdfa8e826dce216e34dc85c34e2d7bd3bd14a88e7fd9`. This is analysis preparation only: no second-source export or visual-quality claim yet.
