# Face-observation coverage versus ordinary route

18 November 2026. Recorded-evidence audit only; no product threshold change.

`face-coverage-route-audit.mts NEW_JSON_OUTPUT` inventories one ordinary recorded track per distinct analyzed source hash from existing `fresh-normal-track.json` evidence. It reports observed face-sample share, longest gap between positive face samples, clip-wide dominant score and current ordinary default route for each face-free sample. Current route is computed through explicit Auto, legacy Fit and policy fallback helpers. It does not rerun inference or infer scene importance.

Report: `/downloads/vireo-face-coverage-routes-1727.json`. 20 distinct source hashes. 11 have dominant score at least .3 and face detections in under80% of samples. This is a descriptive cut, not a proposed product threshold or a failure-rate estimate.

- Eight of those sources route their face-free samples to review Fit under current ordinary planning.
- Two controlled mixed-body sources route the body-only section to the previously qualified full-height body proposal. A missing face does not imply no visible person.
- The remaining studio camera-tilt interval routes15 face-free samples through legacy portrait tracking before its first face observation at3.6s. The actual source was already inspected: it intentionally starts on hands/documents and tilts up. These are not established face-detector misses. We have no semantic ground truth that portrait is the right or wrong opening view.

The recorded clip-wide score is a subject-selection heuristic, not a probability of correct framing or speaker identity. Applying a face-coverage cutoff globally could degrade body/action sources and add presentation switching without evidence. No cutoff was added and no layout was changed on the basis of this audit.

Caveats: repeated runs can differ; choosing one recorded state per source is not a full history comparison. Cut lists and stored measurements can be incomplete. The longest gap measures sampled observations, not exact continuous face absence. Review Fit is a route name, not a claim of semantic safety, legibility or complete body/object retention. No automatic speaker binding, no-edit output quality or cross-source accuracy claim.

The next quality work needs source meaning/role evidence and actual output review, not simply increasing a dominant-score floor. Existing source-camera tilts, sparse/occluded people, body/action and screen/document examples should remain separate evidence classes. The failed audiovisual model and one-fixture screen-detail candidate remain offline.
