# Current plan consumer inventory, 2026-11-24

Scope: source inspection at backup83df30c31a783f33a540ab7838b7910f2f4f657b, not runtime parity qualification. No architecture rewrite or behavior change.

| Route | Current decision inputs/storage | Consumers | Remaining verification |
|---|---|---|---|
| Normal Auto snapshot | server/src/shared/automaticScenePlan.ts normal-auto-baseline-v3, inputSha256/planSha256/segments; smartReframeService.ts snapshots into track.metadata.automatic_scene_plan | explicitAutoLayoutPlan reads snapshot then can recompute normal plan | persisted plan not universally present; fallback behavior/config invalidation must be measured |
| Quick export | clipRenderService.ts resolveReframeDecision | explicitAutoLayoutPlan, legacyFit43Plan, legacyPolicyFallback, measured item resolver, group/split/blur/dynamic tracking | multiple decision paths, cannot assume one universal stored plan |
| Preview API | clipController.ts get reframe response shotComposition | explicitAuto plan or legacyFit43 or policy or measuredComposition, plus separate groupFrame | compare same source/config/trim/output decisions with Quick and Studio |
| Adaptive item plan | itemAutomaticPlan.ts + itemShotPlanService.ts identity bound by source version/asset/item/analysis interval/dimensions/config | proEditorService.ts resolveMeasuredItemPlan; previewItemAutomaticPlan.ts verified envelope | shared compute helper does not alone prove persisted geometry identity |
| Editor manual scenes | project tracks/items/scene_layout_overrides, crop/panels/framing_window/tracker | resolveSceneLayoutItem/expandSceneLayoutProject, PreviewCanvas, proEditor compiler | whole-item/scene precedence and trim/speed/reorder parity require scenario references |
| Manual Gameplay | ItemPanels sourceRect/focus/fit/topFraction with user ownership | shared panelLayouts materialization/compiler and PanelsPreview | role selection human-set unless independently source-proven; no automatic player identity |
| Tracker | item.tracker measured bounds/keyframes, trackerEvidence/handoff | preview+expanded scene compiler with fallback outside measured range | LK selected-target performance not fullclip success; latest1195 only request safety |
| Captions | track.caption cues/styles, source text review, picture-band windows | preview preset/style paths vs in-house ASS generation | no complete real multilingual caption-accuracy baseline; sparse timing/semantic unknowns |
| Selection | provider proposals followed by boundary/fusion/duration/ranking invalidation | persisted clip selection source/transcript receipts | retained interview proposals fragmented, synthetic clean-boundary metrics not semantic completeness |

Existing benchmark runner server/src/tests/benchmarks/runSelectionBenchmark.ts explicitly synthetic golden/degraded + deterministic post-provider chain. Human/LLM dimensions not measured. Reuse its tested metric math, not its synthetic fixture count as real corpus admission.

Evaluation prerequisite gaps:14 inspected retained byte-distinct candidate files, zero admitted with currently source-specific verified rights/reference labels, zero sealed holdout. Byte-distinct is not source-independent: derivatives/windows from same original must share sourceGroup. Already exposed/tuned clips can be dev only. Unknown exposure is not blind holdout. Need20+ legitimate varied source clips, source-disjoint dev/holdout split frozen before tuning, references for selections/word timing/visible target/action/speaker and allowed crop tradeoffs. Missing values report not-measured, never zero-error/pass.
