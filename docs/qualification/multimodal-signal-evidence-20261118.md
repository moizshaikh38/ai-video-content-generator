# Multimodal extraction execution receipts

This change records signal execution status from the existing scene/silence/audio
and face extraction paths through fusion and the persisted scoring explanation.
It is preparatory truth handling, not ranking calibration or source freshness.

Statuses: completed, partial, unavailable, not-run, legacy-unverified. A completed
receipt means the extractor process returned successfully with the expected
measurement where applicable. It does not establish detector accuracy, full
semantic coverage, sentence completeness or a correct source-object version.
Face evidence is explicitly sampled-source. Audio volume is whole-source, not a
measurement local to each candidate.

- Scene and silence detectors retain compatible array returns, with explicit
  per-call receipt outputs. Successful zero-result scans are distinguishable from
  decoder failure; recovered results from a nonzero process are partial.
- Volume retains legacy numeric defaults for compatibility, but absent/invalid
  meter output marks them unavailable. Parseable numbers from a failed process
  are partial, not completed. An unrun measurement cannot gain evidence from the
  default -24 dB value.
- Face analysis reports unavailable for no samples/failure, completed only for a
  returned sample set. Existing confidence/default behavior is not recalibrated.
- The worker propagates receipts into timeline fusion. Transcript-only on-demand
  fusion explicitly marks all four signals not-run. Older callers/timelines
  without receipts remain legacy-unverified. No migration stamps old records.
- Scoring copies receipts into the persisted explanation. Its old numeric blend
  remains unchanged, with an explicit warning when signals are missing/partial/
  unverified. The misleading steady-shot, clear-speech and zero-truncation claims
  are removed. Evidence-backed reasons describe the actual heuristic and limits.

Tests: actual corrupt-media FFmpeg failures, actual successful zero-cut and
non-silent 0.5s media, a bounded nonzero extractor fixture returning parseable
partial results, volume parser missing fields, receipt cloning/fusion/scoring,
and missing-evidence rationale checks. Focused receipt + Phase16 set: 18 tests
passed. Server TypeScript passed; fresh six-suite baseline: 88 tests passed.

An additional PhaseACGenreIntelligence run had one existing failure: registry
contains 14 genres while its test expects exactly 12. Neither the registry nor
that test was changed. Its other tests passed in the initial 28-test run (27
passed, 1 failed). Do not call the larger selection suite all green.

Limits: no current-source hash/receipt is attached to these multimodal timelines;
receipts are execution provenance only. OCR still has its existing separate status,
not this receipt schema. No real video-analysis worker/provider end-to-end run,
UI pixel check, human selection benchmark, score reweighting, STT accuracy or
E1 completion is claimed. Existing numeric defaults and legacy records remain
explicit work for the next change. No spend, auth change, merge, deploy or 4K
attempt occurred.
