# Antigravity advantage audit and port decisions

18 November 2026. Compared Antigravity 9797715 with current bf0fe72, retaining the original pre-fix comparison at Antigravity 4f6984a/current 98fd298. This checkpoint does not release either branch.

## Verdict

Do not merge the whole branch. One cut-time sanitizer is a justified narrow code port. The demonstrated caption readability advantage can be recreated through intentional styling without restoring the old rendering bug. Other tested categories are ties, current advantages, or incomplete comparisons, not reasons to import old code.

## Decision register

| Area | Evidence | Decision |
| --- | --- | --- |
| Soft Build on bright footage | Original same-source moving comparison and fresh current normal jobs. Antigravity's dark shadow improves contrast on the explosion shot. Both branches define 22% shadow, but old reveal ASS uses global alpha and makes the shadow effectively opaque. | Do not merge old reveal code. Keep separate fill/box/shadow alpha. Current explicit shadow-opacity=1 reproduces the strong shadow in a fresh job. A default aesthetic change needs more backgrounds and actual UI qualification. No preset default changed. |
| Other caption looks | Compact differs in font/size/position; aesthetic superiority was not established. Soft Backdrop's stray black segment is corrected in current. | No old caption renderer/font binding port. Preserve current fixes. |
| Rapid/unsorted cut sanitation | Identical measurement calls on frozen branches: current selects 5.58 instead of earliest 5.50 from unsorted near duplicates; current drops second cut at 3.35 after 3.00. Antigravity handles both. | Port sorting-before-dedup and frame-rate-aware separation only. Add source FPS to the real analyzer call and tests. Do not port its environment override or global cache. |
| Global cut-cache bridge | Antigravity has precomputed-cut lookup and source hash/cache code. No controlled real-source speed/quality advantage established. This crosses persistence, source identity and trim-clock boundaries. | Defer. Needs measured reuse benefit, invalidation and engine/version/trim checks under current source receipts. Not an advantage merely because the code exists. |
| Split geometry/identity stack | Antigravity adds a shared source-bounds contract and unresolved-geometry fallback. Initial ordinary pair/studio outputs tied; initial experimental pair clipped one person on Antigravity. Current later normal-job pair Split is verified. | No wholesale port. Audit specific geometry/identity cases independently before replacing current panel, hand/context, trim and ownership protections. Test count is not output quality. |
| Default/manual framing | Initial matched ordinary UI pair/studio four-mode outputs tied. Current later fixes pair Auto Split, walking portrait, measured Fill and ordinary Fit retention. | Preserve current. No demonstrated old framing advantage to merge. Remaining sports/screen negatives do not prove old was better. |
| Audio | Five original matched output pairs have identical native-rate/channel decoded PCM. | Tie. No audio code port justified by these fixtures. Listening and recognition are distinct unpassed checks. |
| Automatic clip selection | Only Antigravity produced the three real provider-selected wiki clips. Current rejects their invalid transcript clocks. Old clips have mid-thought openings/endings and timing gaps; no qualified current automatic equivalent exists. | No winner. Do not remove the current gate or port permissive behavior merely to generate clips. |
| Background | The narrow mode-selection fix is already applied to both branches. Antigravity preview/export blur strength remained different. | Already shared where justified; no old blur regression import. |
| Website/learning assets | Antigravity has separate page/assets history; the history-preserving backup already carries it. This audit is about clipping comparison. | No website merge, page creation, deployment or reapproval implied. |

## Cut sanitizer port

Adapted from Antigravity commit 4f6984a. Scope: smoothAndGenerateKeyframes only, plus passing source_fps from the actual CV result. Earliest sorted cut wins among duplicates. Separation is max(0.12 seconds, 3.5/sourceFPS), falling back to 30fps for invalid FPS. Existing clip-edge exclusions and all later composition/ownership logic are unchanged.

The environment-adjustable threshold was deliberately not copied. Neither global cache lookup nor the split-geometry rewrite was copied. No transcription review, selection binding, caption alpha, manual crop or layout default was removed.

### Validation and limits

- 31 focused tests pass, including unsorted/rapid cut cases, 24fps/30fps/invalid-fps behavior, duplicate/bounds cases, existing shot-aware tests and ordinary Auto Split regressions.
- Frontend and backend typechecks pass.
- Existing safe suite: 421 pass, 0 fail, 1 skip. This is not a whole-repository green claim.
- A synthetic 10-second, three-shot moving crop proof was rendered through the real smoothing and smart-crop filter. At 3.5 seconds, the old surviving-cut behavior places the cyan target at the right edge, while the narrow port centers it. Actual exported MP4 and exact decoded frames were inspected. This is a synthetic camera-clock regression, not a natural-video quality score or ordinary UI acceptance.
- A fresh natural 12-second source interval (original 8-20 seconds) completed ordinary UI preview, saved-project and normal queued export. Exact adjacent decoded source frames confirm camera changes between local 1.50/1.62 seconds and 1.84/1.96 seconds; a wider shot with timer follows between 2.17/2.29 seconds. The ordinary bounded discovery reports cuts at 1.067733 and then 2.569233 seconds, missing these rapid changes. Its entire emitted list has no consecutive gap below 0.4 seconds, so this job does not exercise the sanitizer's rapid-cut advantage. Natural improvement remains unverified, rather than passed. Existing timer/context cropping also remains.
- The independent diagnostic uses a lower frame-discontinuity threshold only to locate frames for inspection. Those diagnostic cuts were not injected into Auto, and the product threshold was not tuned to this fixture. Current and Antigravity use the same dense-discontinuity threshold; this is not evidence of an old-branch discovery advantage.

## Reproducibility

Original matched output manifest: vireo-branch-comparison-0538/manifest.json in the local qualification collection. Caption evidence: soft_build-pairs.png and soft_build-silent.mp4. Fresh current default and explicit-shadow jobs: vireo-shadow-current-1305 and vireo-shadow-explicit100-1306. Both use unchanged saved provider response and identical source bytes, manually matched interval/crop, not new selection evidence.

Cut comparison measurements: vireo-cut-audit-current-1310.jsonl and vireo-cut-audit-antigravity-1310.jsonl. Synthetic visual proof: vireo-cut-port-visual-1317. The synthetic generator and audit harness are archived alongside this note, not loaded by product code.

## Next checks

1. Natural rapid-cut ordinary UI/job check attempted and recorded above. Next acceptance needs a held-out source whose real upstream detector supplies consecutive rapid cuts, or a separately qualified discovery improvement. Do not confuse successful job completion with exercising the port.
2. Intentional stronger Soft Build shadow works in the renderer's saved override, but the current editor exposes Shadow On/Off rather than opacity. Therefore stronger-opacity editor save/reload qualification is not complete. Do not claim users already have a qualified strength control or revert alpha channel fixes.
3. Run specific held-out split identity and cached-cut source/trim cases before any additional port.

Main/live remain unchanged. No paid call, broad merge, new website page or 4K attempt.
