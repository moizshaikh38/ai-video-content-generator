# Developmental Auto review checkpoint

Local checkpoint, not release or main-merge approval.

The separate `bodyOnlyPortraitReview` option proposes a static portrait at full source height from repeated narrow/tall body detections when frontal-face evidence is absent. It does not infer importance or semantic safety. No production caller enables it. Existing review-only pair-focus rejection remains in force.

Qualification performed at bfc4be2:
- 40 focused tests pass across reframe, shot-aware reframe, speaker framing, interpolation, pair-focus, pair-quality, body-only and centered-contain tests.
- Server TypeScript no-emit check passes.
- Scan of six existing analyses proposes one body-only portrait, in rank1 at 25.5922 to 26.6933 seconds. This is observed output, never a timestamp input.
- Full 28.429-second rank1 720p API render completes with both developmental review options supplied only by the local harness.
- Five decoded output frames across the body-only interval show the reaching subject larger. Missing detections, hands at source edges and semantic context remain unverified.

This is not an Opus parity result. The reference comparison uses manual caption text/styling, approximate source alignment and unequal original encodes. The rejected pair-focus crop is no longer used in this render. No genre/HUD activation, login changes, purchase, 4K attempt, push, merge or deploy.

The centered-contain proposal is offline only, not integrated in Studio or export. Its extra padding and moving inset are an explicit visual tradeoff, not a claimed improvement.

## Later time-segment qualification, no threshold changes

Fresh analyses cover seconds 24-36 and 48-60 of the existing original two-person and single-person studio recordings. These are held-out time intervals of the same source recordings, not independent new-source or new-person validation. Each interval yields 50 samples at the existing analysis settings.

- Body-only proposes nothing across these four intervals.
- Studio intervals remain unchanged 4:3 Fit.
- Pair-focus proposes both two-person intervals under its existing review-only option. Existing proxy flags are empty.
- Both pair intervals complete actual 12-second 720p API export. Decoded frames at 0.5-second intervals and sampled video frames were inspected. Faces are centered at inspected frames, with locked source windows.
- Studio preview at six seconds of the 24-36 segment agrees with the exported panel composition at that inspected time. No UI claim for the 48-60 segment.
- Important negative: around two seconds into the 24-36 export, a gesturing hand from outside the selected subject view intrudes. The existing face-associated body-box fragment proxy does not catch disconnected hands or limbs. Empty flags are NOT a semantic or no-fragment pass. Do not describe this as a clean composition result or as fixing the rejected original sample.
- The 48-60 export's inspected frames show centered head/shoulder views. Lack of a noticed fragment in those frames does not establish absence over the whole video or fix the known diagnostic coverage gap.

Expanded current Auto regression check: 94 tests pass across 17 selected framing/interpolation/quality suites. This remains a targeted selection, not a complete suite or current-main integration result. No product code or thresholds were changed after these held-out findings.
