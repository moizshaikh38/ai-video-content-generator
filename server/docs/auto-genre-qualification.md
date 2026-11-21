# Auto Genre candidate qualification

This backend change is a candidate, not a production release or an accuracy benchmark.

## Behavior

- Local text classification uses normalized word/phrase boundaries. Weak or tied evidence abstains to General with zero support instead of inventing a 50% confidence floor.
- Topic words alone do not make an interview a tutorial. Auto reevaluates stale genre metadata. Manual selections and accepted explicit selections remain authoritative.
- Optional semantic collection is disabled by default. `VIREO_AUTO_GENRE_REVIEW=free` opts in; `VIREO_AUTO_GENRE_MODEL` must identify an explicit `:free` image model. Live catalog prompt/completion prices and all supplied prices must be valid zero values. Missing, null and blank prices do not count as zero.
- There is one model request, no automatic retry and no paid fallback. The provider must report exact zero cost and complete valid structured output.
- Sources from 3 to 180 seconds use five uniform frame samples. Longer sources, up to 7200 seconds, use nine. Long transcript evidence uses five distributed timestamped windows when valid segments exist. Otherwise character-distributed excerpts are explicitly marked as having no clock claim.
- Receipts bind the exact source SHA-256, full transcript text digest, duration and expected sample times. Invalid or stale receipts cannot replace local evidence. Model support is not calibrated accuracy.
- Mixed, uncertain and contradictory sampled presentation abstains. A suggested model status cannot override material mixed-form evidence. Sparse sampling does not establish uniform genre throughout a source.
- Clip analysis consumes stored evidence without another provider request. Consumed evidence participates in the transactional selection-intent fence. Concurrent manual/caption edits survive processing metadata updates; source movement fails before successful enrichment/settlement.
- No crop geometry, active-speaker identity, caption default change or hosted activation is granted by genre evidence.

## Evidence collected during development

- Genuine retained GTA gameplay source with its hash-matched German provider transcript exercised compiled processing, fresh free semantic inference, persisted evidence and actual clip analysis using Gaming. STT was replayed, not freshly transcribed. The selection adapter intentionally returned no proposals; the resulting short-source fallback is unranked and is not highlight-quality proof.
- A retained game interview produced a Podcast suggestion. A Wiki conversation abstained. These are sparse-source checks, not full-video labels.
- Real software demonstration and live basketball sources produced Tutorial and Sports suggestions in visual-only checks. No STT or clip-selection claim applies to these checks.
- Full retained 231-second Wiki and 278-second game-interview sources exercised nine-frame review with no transcript supplied. Both ultimately abstained. The game interview initially received a confident Marketing model suggestion despite mixed interview/game footage; inspection led to the mixed-form guard. This is development-set correction, not held-out accuracy.
- Focused local tests cover source/text/clock/price validation, bounded long sampling, distributed transcript evidence, manual override behavior, concurrent preference preservation, BSON date schema compatibility and transaction fencing.

## Remaining gates

Full long-source ingestion and selection with a genuine complete transcript, hour-scale media, held-out mixed-content behavior, automatic highlight quality and final captioned Gaming export remain unverified. Existing transcript-quality and output-audio concerns are separate open issues. Reusing an existing transcript currently returns before new optional semantic collection; this candidate does not add a re-review endpoint. No claim of production readiness or parity with other products is made.
