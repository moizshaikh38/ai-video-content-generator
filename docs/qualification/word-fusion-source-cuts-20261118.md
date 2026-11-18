# Preserve source camera cuts through word timing alignment

18 November 2026. Local/backup only, no main/live release.

## Confirmed defect

The real shot smoother emits a pair of camera keyframes at cut-minus1ms and cut. Word alignment treated that jump as a discretionary speaker switch. With a2.000s cut and a controlled1.8-2.2s word interval, it moved the second anchor to2.200s. With a broad word interval whose closest boundary is outside the snap allowance, minimum-gap repair still changed2.000 to2.020. Both stretch a source cut into a pan.

Before fix:2of4initial targeted tests failed, including direct real-smoother-to-fusion integration. Synthetic video source plus real smoother/fusion/crop filter render reproduced missing post-cut target at2.067s before the fix, target present after. Inspected both moving output contact frames and exact2.067s pixels in vireo-word-cut-timing-1501 and final reusable harness run vireo-word-cut-timing-repro-1502. Left before, right after. Synthetic word timing is explicitly not spoken content and never persisted as a real transcript.

## Narrow fix

Preserve both adjacent step anchors with positive separation<=2.001ms and horizontal or vertical change>4% of source. This matches the existing millisecond shot-smoother encoding and also protects abrupt encoded geometry, not speaker identity. These anchors bypass both transcript snapping and generic21ms minimum-gap repair. Existing ordinary word-boundary alignment and no-word behavior remain.

No face thresholds, cut-discovery/sanitizer thresholds, layout selection, transcript/provider selection gates, source trim or production defaults changed. A single isolated source-cut keyframe without an encoded step pair is not newly protected by this patch. Existing metadata does not label these keyframes explicitly; structural matching is intentionally narrow.

## Validation and limits

Five targeted regressions cover horizontal/vertical, unsorted input, changing adjacent trajectory, broad/narrow word interval, no words, no input mutation and unchanged ordinary discretionary alignment. Combined with existing phaseGamingAdvantage suite20tests pass. Backend types pass. Safe suite421pass0fail1skip. This is not whole-repository green or natural-footage speech qualification.

The reproducible local word-cut-timing-review.mts harness loads the old utility from pinned repository commit68a8674acf5195b55be8787ccc2ab1bb6d23a726 into a temporary directory and removes it after import. It makes a4s960x540 source, uses the actual smoother/filter, and renders before/after. Requires git history, existing Node dependencies and ffmpeg. No model download/provider request. All generated media stays local.

The inspected pair, studio and radio visual fixtures have no source audio track, verified with ffprobe. AAC tracks in generated outputs can be synthetic silence, not proof of original dialogue. Mouth-motion scoring and word-boundary alignment do not bind a voice to a visible person or establish diarization. Shared stable composition under uncertainty and actual active-speaker association remain separate unfinished work.
