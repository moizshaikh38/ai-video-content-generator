# Bounded gaming review receipt scope

Contract checks only. No output-quality, visual/generalization or release claim.

## Prior evidence reconciled

The original successful GTA upload-to-captioned-output run uses a roughly 12-second source, below requested 15-30s preference. No selector proposals were returned; existing short-source fallback remains Unranked. UI already exposes unranked status/reason. No ranked highlight proof. Source-side HUD crop remains unresolved, and HUD integration/default activation remains paused. Neither issue is solved by this change.

## Scope failures and fix

The shared proposal helper previously lacked duration validation, accepted nonfinite source dimensions and fractional measurement counts. The shared planner could assign clip-wide gaming geometry from a 12-second receipt to a different-duration request. Ingest had a duration check, but repeated consumers must not assume all saved evidence passed that check. Preview/export option construction also now checks receipt hash against analyzed source metadata instead of accepting the review marker alone.

Three initial adversarial tests failed before the fix. Review receipts now require finite source dimensions and a 6-30s finite duration, matching existing bounded ingest. Semantic samples must be ordered with the existing ingest's beginning/middle/end shape, fall inside the source duration, and retain existing gaming/confidence requirements. This is an input contract, NOT a calibrated semantic coverage or model-truth claim. Three sparse frames cannot prove every intervening frame. Measurement counts must be integers. The shared planner compares duration within .05s; genre join compares against transcript duration when supplied. Other source/manual/cut/policy gates remain.

## Recorded receipt control

Original already-observed receipt: /downloads/vireo-gta5-upload-auto-caption-1832/automatic-evidence/evidence.json . Source SHA feb7a2a42019938b8140ffb6caee4f187948a4ad4cc0f1632093edc7d3e48473, duration 12.011s. Existing receipt passes without mutation. Wrong duration, missing duration, unobserved tail, late-only opening, beyond-source sample, nonfinite dimension, fractional observation count all abstain. Wrong analyzed-source hash is rejected by shared preview/export option construction. No media was decoded/rendered/downloaded, no external or paid calls.

Run: server `node --import tsx scripts/local-qualification/gaming-evidence-scope.mts RECEIPT_JSON NEW_OUTPUT_DIR`. Result retained here and in /downloads/vireo-gaming-evidence-scope-2126.

22 focused gaming/scope/shot-options/selection-fallback tests pass. Frontend/server TypeScript clean. Separate existing gameplayFalseDetections assertion still fails identically on unchanged backup 601b752; broader suite not cleared. No full4K attempts, weights, spending, HUD activation, production/main release or expanded Auto claim.

Original source https://archive.org/details/twitch-clips-744197206 has no established reuse license here, private technical diagnostic only, excluded from website/promotional demos.
