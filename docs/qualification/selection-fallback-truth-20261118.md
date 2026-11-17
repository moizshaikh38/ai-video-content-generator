# Unranked selection fallback and transcript review boundary

This is a narrow E2 truth-handling change, not a selection-quality benchmark.
No STT or generative provider was called against real footage for this work.

## Defects and changes

The no-proposal branch previously assigned invented hook/standalone/insight
scores of 85, emotion 80 and platform 85, copied the first speech fragment into
a hook and described the result as the strongest standalone moment. Its comment
said short source, but it did not actually enforce total source duration.

A fallback is now limited to declared finite source durations from 2 seconds to
under 15 seconds, with valid ordered transcript segments inside that source.
It covers the available transcript span, not necessarily all source frames.
It has no generated hook or fabricated model subscores. Long or unknown sources
with no provider proposals return no candidates rather than an invented winner.

Persisted fallback metadata identifies short-source-fallback, unranked status,
unreviewed narrative evidence, null vireo_score and null explanation. The legacy
required numeric engagement_score is 0 only as a database sorting sentinel.
It is NOT a quality rating. Current score-display consumers suppress that sentinel
using the shared candidateRankingDisplay helper. Historical records are not
migrated; legacy scored records keep their prior display behavior.

Selection now rejects needs_review transcripts and invalid/missing/non-numeric
segment clocks before provider use. It no longer coerces missing clocks to zero.
The controller returns a specific 409 review/invalid-clock response instead of a
generic server failure. Missing diagnostics remain unverified, not automatically
accurate.

## Verification

- Pure fallback/display tests: no invented subscores/hook, real short-source
  bounds, invalid/overlapping/out-of-source segment rejection, finite score rules.
- Real local Mongo replica-set integration: short fallback metadata persisted;
  long no-proposal source produced no candidates; review/invalid inputs were
  stopped before the provider stub was called; controller returned 409 codes.
  The provider intentionally returned no proposals. This is pipeline evidence,
  not provider quality. A standalone Mongo attempt could not run the repository's
  transaction and was rerun on the existing local replica set, not bypassed.
- Selection/fallback/clip-quality set: 22 tests passed. Both TypeScript checks
  passed. The fresh six-suite baseline remained 88/88.
- Actual ClipWorkspace component, mocked service data, desktop and 390px mobile
  screenshots inspected. The 8-second fixture displays Unranked and the explicit
  unverified-story/ranking explanation, with no numeric rank. The video area is
  intentionally blank in this UI-only harness. Other score-display surfaces use
  the same helper but were not individually pixel-qualified in this change.

## Remaining E2 gaps

The normal multimodal scorer still mixes default visual/audio values when data
is absent. Timeline fusion also fabricates a numeric audio default when a volume
measurement is unavailable; some detectors return empty arrays on failure. Their
signal origins must be carried explicitly before missing values can safely be
removed or reweighted. This patch does NOT fix those paths or establish that
provider proposals are factually grounded, complete stories or better rankings.
Hardcoded platform-suitability rules/reasons also need separate current-policy
verification, not another remembered duration limit.

E1 remains incomplete: an untouched provider transcript tied to exact source
bytes plus independent source-audio/reference checks is still required. No manual
or synthetic fixture here substitutes for that evidence. No production merge,
deploy, login/auth change, new spend or 4K attempt occurred.
