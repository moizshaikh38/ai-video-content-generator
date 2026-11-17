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

## Follow-on: omit unmeasured dimensions

The score now omits visual/audio dimensions unless their extraction receipts are
completed and overlapping segment numbers are finite. Audio also requires a
completed silence scan because that heuristic uses silence-derived density.
Face/silence/visual bonuses to provider subscores are gated on their own receipts.
Legacy numeric defaults do not count. Timeline fusion cannot certify its default
volume if the actual volume argument was absent, even if a caller supplied a
completed receipt.

With no supported weighted dimensions, scoring returns insufficient-evidence and
only a numeric storage sentinel of zero. Provider proposals with that status are
persisted unranked with null public vireo_score, just like the separate review
fallback display rule. A real provider subscore can still produce a heuristic
ranking without imaginary sensor dimensions. The duration/platform term alone
cannot mint a winner. This is not a probability or a calibrated quality score.

Unknown visual/audio scores are null in explanations and displayed as '-' in the
actual ClipWorkspace component. A 390px mobile and desktop mocked-data view was
inspected. Its 80-point provider rank is explicitly harness data, not a measured
ranking result; it demonstrates missing sensor scores, not real clip quality.
The first visual inspection caught an empty Visual badge for null and the guard
was fixed, then screenshots were recaptured and inspected.

A real local Mongo selection test now also persists a provider proposal with no
subscores/no sensor timeline as unranked, rather than a default-driven winner.
The focused score/selection/Phase16/clip-quality set passed 44 tests. Both type
checks passed; the selected baseline passed 88/88. The genre audio fixture now
supplies explicitly declared synthetic extraction receipts and asserts the more
honest audio-volume-derived explanation. Its numeric dynamic-energy checks pass;
the unrelated 14-versus-12 genre-count failure remains (11 pass, 1 fail).

Still open: exact source-version and transcript identity binding, independent
human ranking benchmarks, detector accuracy/coverage, actual worker/provider
end-to-end qualification and current platform-rule verification. Completed
execution receipts still do not establish fresh or accurate source evidence.
