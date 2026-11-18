# Measured source-cut context and vertical step retention

18November2026. Local/backup only, no main/live deployment. Narrow follow-up to0567d8d, not a speaker-association implementation.

## Defects and fix

1. Real shot smoother emitted a cut-minus1ms/cut pair only for horizontal geometry changes. A vertical-only jump emitted a single anchor, making the crop interpolate before a measured source cut. Now the same4%geometry threshold considers the maximum of horizontal and vertical change. No new source-cut discovery or sensitivity change.
2. Word alignment could retime isolated source-cut anchors because only close paired jumps were recognized. It now accepts optional sourceCutTimes and protects only existing keyframes exactly matching the millisecond-rounded measured boundary, plus an existing immediately preceding step anchor within2.001ms. Does not add anchors, move cuts or protect a frame-wide neighborhood. Normal analysis supplies the same clip-relative measured cut list already used for smoothing. Malformed/nonpositive cuts ignored. Existing no-word behavior and ordinary discretionary alignment preserved.

## Evidence

Synthetic4s540x960source with a target at upper then lower positions, measured source cut2s, real old and new smoother, controlled1.8-2.2sword interval and real square crop renderer. Old smoother loaded from pinned11d05dc into a temporary neighboring module for valid relative imports, removed after import. No copied baseline module committed. Actual before/after video and1.8spre-cut pixels inspected. Old crop lost the yellow target early; fixed crop retained it until sourcecut. Decoded all60pre-cut frames: old15zero-target frames, fixed0zero-target frames and minimum5184yellow pixels. Local artifact vireo-vertical-cut-final-1551; earlier preliminary single-anchor timing-only render1550 retained because it exposed that timestamps alone did not cure pre-cut interpolation. Synthetic word timings are not source speech/transcript evidence.

The optional-context unit test separately covers an isolated anchor, malformed cuts, millisecond rounding, nearby nonmatching boundaries and no invented keyframes. Eight word-cut tests plus existing phaseGamingAdvantage suite total23pass. Backend TypeScript passes. Safe suite421pass0fail1skip. Service source-pin test updated to require explicit measured-boundary forwarding. Tests are not whole-repository green. No new dependency/provider/API call, no natural A/V diarization claim, no automatic no-edit selection proof.

single-cut-timing-review.mts NEW_OUTPUT regenerates the synthetic source, compares pinned old smoother against current, renders both and extracts1.8spre-cut pixels. Note: its final still name explicitly says before-cut; the earlier provisional harness named a different time and is not the final evidence. Current harness source size/aspect and timing are explicit. No private source footage used in this proof.

No layout-family decision, source receipt/selection freshness gate, OCR/role heuristic, camera meaning or manual-control authority changed. Measured cuts themselves can still miss real changes or be wrong. Abrupt vertical source geometry retention is qualified only by this synthetic path; natural vertical-camera holdouts and actual UI/save/queued render remain separate work. Screen-detail and audiovisual CPU proposals remain offline/unqualified.
