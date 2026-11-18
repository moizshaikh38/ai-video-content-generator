# Bounded automatic text constraints

18 November 2026. Local/backup implementation only, no main/live release.

## Entry and limits

A newly analyzed explicit smart Auto choice in9:16 now requests text measurements without the manual OCR flag. Server admission requires a positive finite clip duration no more than12seconds. The decoder independently requires actual width<=1280, height<=720, fps<=60, duration<=12 and<=720 source frames. Manual/legacy/genre-owned crops, other canvas ratios and longer clips do not opt in. Existing tracks are not retrospectively declared analyzed.

The existing Tesseract path is used, not the uncleared DB model. It is limited to24 sampled frames and20seconds aggregate OCR time, at existing at-least0.49s intervals. Each child has a maximum5second timeout further limited by remaining source budget; one OpenMP thread. A nonblocking OS file lock permits one optional automatic OCR operation on this host at a time and releases automatically on process exit. An unavailable executable, busy lock, budget stop or failure has an explicit execution status. These statuses never assert absence of important text. Some earlier successful samples can still add constraints after a later failure; incomplete coverage remains visible.

SMART_REFRAME_AUTO_TEXT=0 disables the automatic entry. The older explicit review flag keeps its explicit fail-visible behavior, separate from the bounded automatic path. No dependency/model downloaded or bundled by this change. No new source recognition threshold, OCR word storage, scene classification or click tracking.

## Fresh visual and job checks

No OCR-enable flag was supplied for these runs:

- Screen8s: actual source analyzer, EditorShell Auto, saved/reloaded project and normal queued export. Requested=true,15samples,395protected rectangles, about9.1s OCR and12.4s total analysis. Actual preview pixels and moving MP4 contact frames inspected. Complete screen stays visible without choosing manual Full frame. Text remains small. This is automatic constraint acquisition inside a manually bounded visual fixture, not fully automatic moment selection or publish-worthy tutorial proof.
- Pair12s: actual source analyzer and EditorShell/direct export inspected.17samples,0text regions, about4.9s OCR and14.3s total analysis. Existing stable pair Split remains. No-text measurement does not establish active-speaker understanding or missing-context clearance.

Source artifacts: vireo-auto-text-screen-ui-1446, vireo-auto-text-screen-job-1447 and vireo-auto-text-pair-ui-1448 under qualification Downloads. All external calls/recognition paid providers were disabled. Empty transcript protocol fixture is not transcription evidence.

## Tests

19 Python tests pass for budget limits, missing runtime, OFF switch, nonblocking lock exclusion, timeout failure, sample/time limits, explicit OCR thread bound, parser/persistence and existing scene-cut tests.29 focused TypeScript tests pass for ownership/duration/text bridge/cuts. Frontend and backend typechecks pass. Existing safe suite421pass/0fail/1skip, not whole-repository green.

## Open limitations

Large/high-resolution/long sources are skipped, not silently downscaled into a false qualification. Multi-host global concurrency is not controlled by a per-host lock. A busy/failing OCR path preserves available constraints but may leave the legacy crop without new text measurements; unknown coverage is not a safe-crop guarantee. Production runtime installation and memory/CPU headroom remain to verify before release. Source-time sampling can miss short overlays. OCR does not identify meaningful action, speaker, screen-camera roles or legibility. Stronger screen detection/target choice, sports, audio-to-visible-person association, Auto Genre and no-edit clip selection acceptance remain open. Manual edits stay authoritative.
