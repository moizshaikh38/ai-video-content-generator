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
