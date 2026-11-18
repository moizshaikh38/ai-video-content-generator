# Body-camera path budget, November 18

A narrow camera-path consistency repair, not a new subject-detection or composition-quality claim.

Previously the moving-body proposal could produce more than40 camera keys. Preview used the full proposal; GroupFit export uniformly reduced it to40 keys. On the existing walking and mixed body/pair tracks, that produced maximum normalized center differences of about0.00921/0.00976, measured on a1ms grid. Neither track showed a measured body-margin failure under the old reduction.

The proposal now reduces its own path using worst interpolation error first, with0.001 maximum normalized X/Y center error and39 points, leaving room for the render shot-end anchor. Preview and export receive this same path. If the budget cannot meet the error bound, or the reduced path fails a sampled body/face/protected-region lateral constraint, the proposal abstains. Existing downstream fallback remains. GroupFit handling of other plans and legacy tracks is unchanged.

On those same two tracks the new shared paths contain33/32 keys including the end anchor. Maximum difference from the old full camera is0.000849/0.000925. Measured body-margin failures remain zero. These are path-coordinate comparisons, not pixel-exact preview/export claims. Detector sampling, expression rounding and between-sample motion remain limits.

Fresh walking source normal analysis, actual EditorShell Auto controls save/reload, and normal queued720p export were exercised. The12s output decoded with the person retained in inspected frames. This is a manually bounded full-source visual fixture with mocked account/storage/entitlements, not genuine automatic clip selection or genre proof. No paid calls, deployment or full4K attempt.

Evidence retained locally:
- vireo-bounded-body-ui-1030: UI fixture and controls
- vireo-bounded-body-job-1031/layout-auto-job.mp4: fresh normal queued output
- vireo-bounded-body-comparison-1031.json: old/new coordinate comparison
- vireo-camera-expanded-1030.log:115 tests pass
- vireo-camera-safe-1030.log:421 pass,0 fail,1 skip
- vireo-camera-backtypes-1030.log and vireo-camera-fronttypes-1030.log: types pass

Unit tests cover turn retention, endpoint preservation, input immutability, invalid clocks, fixed-budget rejection, sampled-margin preservation and existing weak/missing/competing-body negatives. Audio/listening quality, unseen side content, full-body detector truth, broader genres and automatic selection remain unqualified.
