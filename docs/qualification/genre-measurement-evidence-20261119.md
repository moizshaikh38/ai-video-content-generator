# Auto Genre evidence inputs, 2026-11-19

## Finding

The ordinary clip-analysis caller and local genre classifier supplied compatibility numbers for unavailable measurements:135WPM, one face,3.5scene cuts/minute, and12%silence. The caller also reused populated timeline arrays without consulting the existing detector execution receipts. This could add a low-cut-rate storytelling boost to transcript-only input and returned metric values that had never been measured.

The caller mapped whole-source average volume into an input called audioPeakEnergyDb and cut-derived visual activity into visualMotionScore. Neither proves time-local reaction spikes or optical motion. Timeline face presence does not provide a count of simultaneous subjects. These are evidence/label defects even when a suggested genre happens to be correct.

## Local correction

- Missing or invalid classifier metrics are null in the returned diagnostics and cannot activate their numeric rules. Both frontend/backend shared type definitions accept null. Keyword analysis and explicitly supplied valid measured values continue to work.
- The actual ClipAnalysisService caller now uses measuredGenreSignals. Scene-cut and silence rules require completed whole-source receipts, a matching finite source duration, and valid in-range detector payloads. Legacy, unavailable, partial, sampled and malformed inputs remain unknown.
- Silence intervals are unioned so overlapping intervals cannot inflate the source pause ratio. A completed empty detector result can represent a measured zero; an unrun detector cannot.
- Positive OCR text requires explicit detected status and timestamped nonempty detector output. Empty/default metadata is not promoted into proof of a completed OCR pass. This sampled OCR density remains a heuristic feature, not text accuracy or full-source text coverage.
- Face presence is not promoted into subject count. Whole-source mean volume is not promoted into reaction-peak detection. Scene-cut activity is not promoted into optical motion. The caller no longer sends those misleading aliases. Future detector integration needs real evidence for each shape.
- The storytelling explanation now identifies a cadence/cut-rate heuristic instead of claiming stable single-camera framing.

These changes intentionally remove unsupported boosts. They do not add detectors, claim better genre accuracy, classify an external source, or enable a new layout policy. The confidence number remains an existing heuristic score, not a calibrated correctness probability.

## Verification

76 focused tests pass:12new unknown/invalid/receipt/duration/interval/source-wiring cases plus existing genre, documentary, selection-boundary and export-resolution checks. Frontend/server typechecks pass. This is not a full-app test result. No provider, media encode, acquisition, ASR, install, production or data-deletion operation was needed.

The broader suite exposed an older genre test still expecting an individual multimodal timer clearInterval statement after shutdown had moved to shared timer cleanup. Its source guard now checks the current timer list, shared shutdown coordinator and stopPollers hook. The actual cleanup check was preserved, not removed. Prior separate HTTP/Mongo/owned-signal shutdown evidence is unchanged.

Real source-specific Auto Genre accuracy and its effect on full automatic selection/layout remain unqualified. A short retained Apollo interaction export does not establish either.
