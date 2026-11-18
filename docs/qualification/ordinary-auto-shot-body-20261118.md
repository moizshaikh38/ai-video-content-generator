# Ordinary Auto: shot-local single-body path

The ordinary explicit Auto bridge already accepts complete face-less single-body tracks at full source height, and already separates unrelated shots with review Fit. This change tries that same strict body proposal independently inside each cut scene before choosing review Fit. Measured eligible pair Split is unchanged. No manual or inferred ownership, experimental metadata, stale source, known screen/action/scene policy or embedded-camera evidence gains this path. Fit/Fill policy restrictions remain. Body evidence never crosses a scene cut.

A proposal still needs complete sampled single-body detections, no faces, enough samples and duration, bounded movement, full-height portrait containment and all supplied protected-region constraints. No detector threshold or tolerance was relaxed. Missing evidence chooses Fit. Side context and between-sample motion remain unverified and explicitly review-required.

## Actual evidence

- Retained first negative: existing 910x480 walking/studio24s construction has missing body detections at7.68/11.04s. It remains Fit in both shots. Fresh controller/UI/direct plus normal job inspected; no claimed improvement.
- Independent uniform960x540 walking12s/studio12s construction has45 complete body samples in first scene. Real UI Whole clip Auto, save/reload, queued job, local upload/signed download inspected. First scene uses portrait full source height; later studio stays reviewFit. Before/after24s silent comparison inspected. Head/feet visible in sampled motion, not a guarantee across unobserved content. Source resized from854x480 and910x480 respectively, so output is not native720p detail.
- Same-source before is baseline direct export; candidate is normal job. Local auth, entitlement and object-storage adapters are not production acceptance.
- Saved real game/b-roll and game/interview raw tracks retain Fit across cuts in a fresh current planner check. No game roles inferred. This check is planner-level, not a new video export of those unchanged negatives.
-46 focused tests and current frontend/backend typechecks. Safe suite421 passed,0 failed,1 skipped. Not the entire repository suite.

No paid provider call, transcript repair, automatic genre selection, default HUD change, production release or full4K attempt. The original missing-detection negative is retained, not tuned away.
