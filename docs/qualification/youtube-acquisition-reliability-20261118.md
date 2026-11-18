# YouTube acquisition reliability correction

Local implementation and deterministic qualification, 2026-11-18. Not deployed. No claim of successful live YouTube acquisition or end-to-end automatic clipping.

## Changes

- A single monotonic 120-second deadline now covers the ingestion metadata and download phase together. Each ordered extraction profile receives only the remaining time. Direct metadata/download helper calls also share their configured deadline across profiles.
- Verification challenges and HTTP 429 throttling terminate the operation. The importer does not rotate player clients after those responses. Hidden downloader, extractor and fragment retries are disabled. Recoverable format/extractor errors may still use the existing ordered fallback profiles within the same deadline.
- An exit-zero downloader result is not enough to accept a partial file. Only an exact completed merge target is selected. Partial files, format-specific video/audio fragments, sidecars, directories, symlinks and ambiguous non-MP4 final targets are rejected. Accepted non-MP4 containers retain their actual MIME type. Failed/leftover attempt artifacts are removed. The existing independent media probe remains mandatory in the ordinary ingestion workflow.
- Source selection now prioritizes resolution, then frame rate, then H.264/AAC convenience. The previous H.264-first alternative could select a 360p H.264 stream while a 1080p VP9 stream was available. Every alternative now respects the 1080 acquisition ceiling. This ceiling is not a declaration that 4K is implemented or qualified.

## Evidence

- 63 focused Node tests passed, including comic palette tests plus importer error, deadline, artifact and integration regressions. Importer integration tests run a fixed local fake executable, never a network downloader or encoder. Cases include one-call challenge/throttle stops, cleanup, successful recoverable format fallback, metadata blocking media download, subtracting metadata time, partial-only exit-zero refusal and completed WebM MIME/leftover handling.
- Eight offline tests use the already installed downloader's real format sorting/selection parser on synthetic formats. Network and subprocess creation are prohibited. The old selector picks 360p in the regression fixture; the new selector picks 1080p. Equal-detail codec preference, higher frame rate, 1080 ceiling, muxed fallback, low-resolution availability and audio-only refusal are covered.
- Server TypeScript and whitespace checks passed.

## Limits and next gates

No new live extraction, media acquisition, paid request, render, install, resource purchase or production deployment was performed for these changes. These tests do not establish current source access, visual quality of future downloads, credential validity, queue/worker isolation, recovery after process loss, caption accuracy, Auto Layout, Auto Genre or production readiness. The local downloader also warns that its Python 3.10 support is deprecated; no runtime upgrade was attempted here.

The default 1080 acquisition policy needs an explicit, separately resource-qualified path before accepting a genuine 4K import/export request. Automatic client retries are not an acceptable substitute for solving source access through a permitted route.

## Integration reconciliation

The backup integration already contained an earlier supported-JavaScript-runtime argument helper and terminal challenge/throttle classifications. Both were preserved. The new integrated delta is the shared operation deadline, disabled hidden retries, resolution-first selection and completed-artifact/MIME/cleanup handling. Terminal classification is not counted as newly implemented a second time.
