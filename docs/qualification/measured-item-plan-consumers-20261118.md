# Measured item composition boundary, 2026-11-18

Local development only. No main/release/deploy or migration.

Normal Pro adaptive shot-composition computation now calls the item resolver instead of directly taking clip-level analysis as the item's plan. Quick composition uses the same boundary. The actual downloaded source SHA comes from renderClipJob's existing file measurement, not copied out of the saved analysis. Decoded dimensions come from the actual probe. The context carries source storage path and clip asset ID separately. Analysis must match bytes/path/asset, source anchor/range, aspect, dimensions and recorded positive analysis version. Each effective scene must name the same source if it has explicit identifiers and be contained inside the analyzed interval. Normal Pro caption-composition windows use the same resolver. Results are computed fresh, not a persistent cache.

A deterministic SHA256 configuration fingerprint includes every option actually supplied to computeShotComposition: dimensions/duration, raw samples, cuts, protected regions, window scope, fit policy, current scene's candidate flag and layout policy. Object key order does not alter it; array order still matters. Unrelated speed/freeze controls do not enter source identity. This binds one item result, not a general whole-project quality certificate. Existing item IDs for render-only expanded scenes remain render-only.

Manual crop, panels, accepted framing window, enabled tracker and user layout bypass this adaptive-composition resolver. No saved values are edited. Quick explicit user layouts no longer enter the candidate-composition branch; they continue through their existing selected-layout path rather than being stamped as a ready automatic plan.

Invalid automatic provenance or invalid computed geometry raises AUTOMATIC_PLAN_REVIEW_REQUIRED rather than silently returning a different crop. Quick's generic reframe-error catch deliberately does not swallow this review error. This is an availability/compatibility change: legacy automatic records without verified identities need review/reanalysis. There is no migration or new recovery UI here, so this is not release-ready. Legacy group/tracking/blur paths and tracker handoff computation are not a complete identity rewrite. Preview transport still supplies a clip-level plan and does not carry this per-item result identity. No preview/export identity-parity claim.

## Evidence

- Focused item contract + new normal Quick/Pro consumers:21tests pass, zero failures/skips. The tests use explicitly marked synthetic context fixtures. No claim of real analysis from these.
- Prior focused actual FFmpeg/synthetic generated-media composition/body/split lane plus item tests:36tests pass before adding the final Quick-specific test. Existing wiring/layout lanes27tests pass. These lanes overlap.
- Frontend/server types pass.
- `item-plan-bound-export.mts` executes a positive real-media720x1280/90-frame walking slice and rejects wrong source hash/path/decoded width before compilation. It also compares the complete valid-input compiled graph against the immediately previous direct-compute path: exact same graph. Project input remains unchanged.
- Fresh output `/downloads/vireo-item-bound-0352/actual-bound-walking.mp4`; decoded contact at0/1/2/2.9seconds visually inspected. The person and feet are visible in these four samples. This does not establish continuous tracking quality.
- Detection samples in that actual-media render are an archived replay. Their original source association was not freshly verified and no CV runtime ran. The script records this explicitly. A newly hashed file plus stamped fixture metadata is NOT new CV provenance or recognition-quality evidence. The render qualifies guard mechanics and unchanged valid geometry, not automatic scene accuracy.
- The broad enumerated safe suite after initial wiring showed two stale source-signature assertions (419pass/2fail/1skip). Those exact call-signature assertions were updated to include the newly supplied decoded dimensions and pass in the27test wiring lane. Final broad rerun recorded separately when available; no whole-repository all-green claim.
