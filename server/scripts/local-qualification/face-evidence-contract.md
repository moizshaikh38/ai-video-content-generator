# Face-evidence contract correction

Local engineering result, 17 November 2026. No activation or eligibility change.

## Contract

New optional `face_evidence` preserves detector identity, source pixel dimensions, original unclipped box, clipping flags, original score where available, and YuNet's five measured landmark coordinates when emitted. The existing visible box, normalized confidence, mouth score, tracking and layout choices are unchanged. Haar emits its detector identity and raw rectangle but no invented landmarks or raw probability. Raw score is omitted on Haar because existing confidence is a derived value.

Verification remains `unknown / detector-candidate-only`. A supplied verification claim cannot upgrade that state. Missing legacy evidence stays absent and means unknown, not rejected. Invalid optional evidence does not delete a geometrically valid face. All current consumers continue their existing behavior; none may interpret the new provenance as verified identity or role. Persistence, stillness and mouth-gradient scores still do not verify a face.

This corrects evidence loss, not Auto quality. In particular the old static-geometry facecam suggestion remains behaviorally unchanged, including its known false-positive risk.

## Tests

The final durable checkpoint tree passed:

- 34 TypeScript tests: contract, source-measurement regressions, existing reframe/shot/scene isolation and facecam behavior.
- 43 Python tests: provenance, exact coordinate mapping, clipping, detector pyramid, scene/source-clock and existing geometry tests.
- Clean TypeScript typecheck.

The real Python analyzer was exercised on a separate bounded 1-second C3 window at 2 fps, single detector thread. Both samples emitted face evidence for every face candidate (3 and 2 candidates). The TypeScript tests cover normalization, association, JSON storage serialization, reload and normalization. This is not an actual production database/API qualification.

All six archived current-planner outputs, recomputed as plans after the contract correction, were byte-identical to their pre-change plans. No output pixels were changed by an intentional layout rule.

## Source-separated report-only verifier evaluation

The collection plan and topology diagnostic were fixed before results. Eighteen sequential native-resolution frames from six existing sources produced 26 candidates. Sources were split as walking/pair/DUST development and studio/C3/Freedom source-held-out. C3 used 6.5, 9 and 11 seconds to include its interview; others used 0.5, 6 and 10 seconds, relative to each frozen source window. This was not a blind or randomly sampled benchmark. It has no gaming facecam, avatar or poster coverage, and development has no nonface samples.

Source crops were visually labeled before calculating diagnostic outcomes. Real profiles, partial faces and small faces count as positives. Six visually confirmed nonface candidates included three repeated door-latch samples, microphone hardware, chair/jacket, and a uniform patch. Repeated samples from a track are not independent examples.

Fixed diagnostic: define the eye baseline in pixel space, orient its normal downwards, require nose below eyes and mouth below nose, and require all five landmarks inside the raw box. Missing or degenerate measurements produce unknown. Failure is only suspicious; passing is only plausible topology.

| Split | Real face samples | Nonface samples |
|---|---|---|
| Development | 11 plausible, 1 suspicious | None available |
| Source-held-out | 8 plausible, 0 suspicious | 4 plausible, 2 suspicious |

This diagnostic is not supported as a generic verifier. All three latch samples and the Freedom uniform patch pass plausible topology. It also flags a real DUST profile face. Activating it would retain known false faces while risking a real face. The two C3 nonfaces it flags do not rescue that failure.

No score threshold was tuned to C3, no candidate labels were changed after diagnostic results, and no rejection rule was enabled. The report generator initially looked for an incorrect heldout split spelling; that empty-count aggregation was corrected to the manifest's `held-out` identifier before reporting counts. Candidate measurements and source labels were unchanged.

## Conclusion

The evidence contract is an actionable information-loss fix and now has regression coverage. Generic false-face verification remains unsupported by this small source-separated evaluation. More thresholds or stationary/person-box/mouth-motion vetoes are not justified by these results. Better identity verification would still not establish editorial importance, facecam ownership, lower-third legibility, or action context. Broad Auto Layout remains open.

No language-model inference, spend, external footage disclosure, login change, 4K attempt, merge or deploy occurred. Only local single-thread detector collection was used. The original oracle branch stays closed. Checkpoints are preserved separately; the evidence-only checkpoint does not include unrelated developmental hand changes.
