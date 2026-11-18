# Shared fallback recorded-state nonregression

18 November 2026. Evidence-only follow-up to `fcfb025`, no product change.

Compared the previous `legacyFit43Plan` from pinned `dc8f54a3da8fc2ffc9ca7a64546251106eb2ad3c` with the current helper, using the same current group-geometry computation on ordinary recorded tracks. Temporary baseline module is removed after import. Report: `/downloads/vireo-shared-fallback-recorded-final-1649.json`.

- 20 distinct analysis states, from 17 source hashes. Repeated copies of identical analysis payloads are deduplicated; different states for the same source are not independent holdouts.
- 14 states do not enter this fallback, unchanged.
- Of 6 helper fallback states, 4 are byte-equivalent. The known natural pair and mixed body/pair source gain full-source repeated-face containment: outside boxes 19/100 to 0/100 and 11/90 to 0/90 respectively. All keyframe timestamps stay unchanged.
- Actual ordinary routing is checked separately using `explicitAutoLayoutPlan` before the fallback. Mixed body/pair source already has an explicit shot-local plan, so its ordinary Auto result is unchanged. Only the known natural pair with Fit-only policy changes in this replay. Default pair Split and other ordinary plans are unchanged.
- The replay includes recorded single-person studio/radio states. It is not a fresh single-person render and does not prove pixel equivalence on arbitrary media.

`shared-fallback-recorded-regression.mts NEW_JSON_OUTPUT` replays against the existing local track files. No new inference, source download or provider call. It uses recorded source hashes and records each source file; it does not share footage or treat those records as current account state.

Expanded focused suites: 53 tests pass, covering uncertain-speaker fallback, repeated-face anchoring, explicit Auto, measured-context bridge, preview identity/ownership and existing speaker-framing tests. Existing safe suite remains 421 pass, 0 fail, 1 skipped from the product-fix run. Whole-repository green is not claimed.

No new active-speaker identity, speaker-turn, semantic scene or no-edit-quality capability is established. Small people/background tradeoff remains. Natural portrait cut rendering and broader source-quality qualification remain open.
