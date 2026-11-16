# Unresolved context review experiment, 16 Nov 2026

Local experiment, not an accepted automatic-output policy. No production caller selects `unresolvedContextPolicy: 'shared-subject-window'`.

Default behavior is unchanged. `preserve` retains the widest required window across every shot. The explicit review candidate sizes the shared window from subject or crowd constraints, excluding shots with no stable subject anchor. If that crops an unresolved shot, the plan records `unresolved-review-required` and the reason. An all-unknown clip remains full source. Crowd evidence is not discarded as unknown.

The candidate avoids the universal thin-band consequence of one unresolved shot while keeping a constant source-window size. It DOES NOT establish important scene/object boundaries or safe framing. A centered crop of an unresolved shot needs review and must not silently become accepted automatic output.

Evidence generated from the actual crop-filter builder:
- 9s Blender scene-cut excerpt: shared width 0.637504 and height 1; the overhead scene is explicitly unresolved. Person shots are larger, but scene importance remains unqualified.
- 16s heldout Hichilema interview excerpt at source 72-88s: three shots, shared width 0.666489 and height 1, opposite-side subject anchors. Person boxes still do not prove hand containment.
- 12s Hichilema interview excerpt at source 114-126s: width 0.645481, height 0.9711. Visual samples show hand-edge risk, so not accepted quality.

The two heldout excerpts add new moments from an existing independent interview source. They are not two new independent source videos.

Source: VOA Africa, "VOA Interview, Part 2- Zambia's New President Hakainde Hichilema", 25 Aug 2021. Commons marks this particular file free of known copyright restrictions. It is separate from the Leon Panetta two-feed source.
https://commons.wikimedia.org/wiki/File:VOA_Interview%2C_Part_2-_Zambia%E2%80%99s_New_President_Hakainde_Hichilema.webm
Blender footage: (CC) Blender Foundation | mango.blender.org.

Checks: 16 shot-composition, associated-body and uncertainty tests pass; server TypeScript check passes. No production/default configuration change, model promotion or release. Actual rendered files remain review evidence, not product acceptance.

## Protected content qualification, 20:47 IST

Fresh Panetta two-feed analysis exposed a failure independent of the Hichilema hand-margin check: the body-only source window (width .979351, height .8364) clipped the lower third. Subject boxes do not measure text or graphics.

A separate LOCAL Tesseract probe at 1 Hz, PSM11, 2x upscale measures line boxes with at least two alphanumeric words at >=70 confidence. A line must recur at another sampled time with >=60% overlap relative to the smaller box before the rendering helper uses it. This is a geometry guard, not text-importance classification. No recognized words are executed or used as instructions. OCR is not added to runtime and the existing model/default configuration is unchanged.

`protectedContentRegions` is an optional measured-region constraint on `computeShotComposition`. Valid overlapping regions add 2.5% source margin and union with the subject window before constant clip-wide size is chosen. Invalid, weak, and out-of-time regions are ignored. A protected unknown shot is not discarded by the subject-window review opt-in. This conservative API does not automatically establish the caller's evidence quality.

Panetta probe: 13 line detections across seconds 2-7, 12 spatially repeated regions accepted. Actual rendered output expands to width1, height .945292; decoded checks at 0/2/3/5/7/9 seconds preserve the previously clipped "VOA NEWS" and bottom ticker. Both people remain visible. The view is still a short horizontal band, not a large-speaker or active-speaker result. No safe-region claim for unmeasured graphics, transient/low-resolution text or unsampled frames. Source: https://commons.wikimedia.org/wiki/File:VOA_Interview-_Leon_Panetta.webm .

The same probe found zero qualifying lines in 12s Hichilema gestures and 9s Blender footage. That is not proof those scenes lack important content. No semantic framing promotion follows from this probe. The new text-aware output retains source audio and has 360 decoded video frames at30fps over12s.

Trimmed-source check: original Panetta excerpt3.2-6.8s was rendered with the already measured full-excerpt plan, passing start3.2/duration3.6 to the slice filter and trimming the source input at3.2. The output has108 video frames and3.6s audio/video. Decoded frame at local1.2s retains both people and lower-third. SSIM against the same interval of the full12s compressed output is .995289, not pixel identity. This is low-level filter/source-time evidence only: protected regions have no persistence/editor schema integration and no Quick/Pro UI parity acceptance.

Related framing tests:15 pass in addition to20 focused tests. A broader unrelated workflow suite was attempted without Mongo configuration: its setup returned DATABASE_UNAVAILABLE and12 tests were cancelled, not passed. No claim of full-suite success.
