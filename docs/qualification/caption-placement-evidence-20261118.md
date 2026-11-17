# Caption review evidence bridge, 18 Nov 2026 IST

Off-path follow-on to a099fea. No app wiring, activation, detector or broader Auto Layout change.

Caption-specific review now rejects stale item/source/version/composition identities, absent interval coverage, sampled-only evidence, inconsistent trim/speed/timeline durations, speed ramps, freeze/title items, malformed/out-of-source regions, uncovered source intervals and unsupported stretched picture geometry. Exact source-file interval maps through a constant-speed edited VIDEO item. Accepted static source-crop and canvas picture rectangles project visible protected source regions to the caption solver; wholly cropped regions are excluded, partly cropped regions preserve their visible remainder.

Nine bridge tests plus prior placement/scene tests: 32 pass. Includes source22-26 -> editedtimeline6-8 at speed2, stale versions, evidence gaps, manual coordinates, partial crop and invalid stretch. Server typecheck passed after the final guard/tests.

Not production proof: identity strings and complete-for-interval evidence must come from a trusted caller. No current normal app consumer supplies that evidence contract yet. This does not manufacture continuous tracking from sparse detections or prove current composition from a layout label. Only static single-picture projection is supported. Moving crops, split/panels, title/freeze, speed ramps and real glyph-bound producer integration remain unsupported. Existing fixed app caption anchors remain unchanged. No visual change introduced, so earlier controlled off-path geometry images are not new app output evidence.
