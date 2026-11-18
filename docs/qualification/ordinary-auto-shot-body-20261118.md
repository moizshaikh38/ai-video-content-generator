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

## Measured-object follow-up

Body reuse now includes the same independently repeated non-person object regions as the broader planner, with each region scoped to its own scene. Explicit protected regions still apply. A repeated side object can veto portrait; it is not classified as the story's subject. An observed object inside the portrait does not veto it, and an isolated one-frame detection is not misrepresented as persistent or absent. New bridge regressions test both no-cut and shot-local behavior.

Current47 focused tests pass, front/backend typechecks pass, safe421pass/0fail/1skip. The separate objectContext suite has3pass/1fail: the earlier test expects4:3 but current presentation protection returns a more conservative view. Reproduced on unchanged backed-up281e6f0, not introduced by this bridge. Its expected result was not weakened or cleared. All focused tests including that suite:50pass/1fail.

Additional real-output check: constructed960x540 walking12s + two-person12s. Fresh ordinary Auto UI Whole clip, save/reload, normal queued jobs and signed download. Actual24s inspected: full-height walker followed by measured pair stacked split. Silent, captions off, manual source interval, local adapters. Pair views have unequal side bars and shoulder crops; no hand/action safety or calm shared-view acceptance claimed. Product delivered from2f53443, before object-constraint tightening; rechecked saved source tracks after tightening preserve same plans because no persistent object evidence is supplied there.
