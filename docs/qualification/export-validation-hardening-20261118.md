# Export validation hardening, 18 Nov 2026

Local source change only. No release, authentication change, migration, hosting purchase or real 4K execution.

## Changed

- Ordinary output validation now rejects unavailable, timed-out, denied, overflowing or malformed ffprobe output instead of accepting an unchecked export. It verifies finite positive duration, video dimensions and expected audio before upload/ready. Raw process stderr is not sent in the validation error.
- OUTPUT_VALIDATION_FAILED is explicitly permanent in retry classification. Export cannot spend three attempts repeating a known-unverifiable output.
- Caption source dimensions use the existing bounded video-stream probe. Previously this call requested width/height but then searched for codec_type, a field it had not requested. It also lacked an execution timeout.
- Updated the older regression that deliberately expected missing output to pass. That older file contains media-generating fixtures and was NOT executed in this no-heavy-media safety check.

## Checks performed

Twelve focused tests in outputValidationFailClosed.test.ts passed, using injected probe responses or errors, with no subprocess media execution, network or database. Server TypeScript and diff whitespace checks passed. Cases cover stream/audio/dimension/duration failures, unavailable probes, malformed data, execution limits, expected-duration validation and permanent retry classification. A source-order assertion confirms the ordinary orchestration invokes validation before upload. This assertion is not a completed failed-job integration test.

## Recovery and billing implications

The existing render catch writes clip/render-job failed state, clears worker/lock/retry fields for a permanent error and runs temp cleanup. Failure-state DB writes are best-effort and can themselves fail. This patch does not repair that distributed recovery risk and has not simulated a DB outage or stale-worker race.

Source inspection found credit reservation and settlement in core project processing, not a per-export charge in clipController/clipRepository/ClipRenderService. Core processing credits can already have settled before an export fails. This patch neither adds an export charge nor refunds earlier successful transcription. It does NOT establish that all failures are free or all billing behavior is production-correct. End-to-end wallet behavior needs separate verification and product policy, not an invented refund promise.

Operational consequence: hosts must supply working ffprobe. Missing ffprobe now blocks ready exports, intentionally. Resolve that prerequisite before deployment rather than bypass this gate. Source-dimension probing remains best-effort because output validation independently establishes final dimensions.

Actual source-bound 720p output work is separate. Passing these focused tests does not prove production sign-in, upload/export/save/reopen, concurrency isolation, security, billing or full 4K readiness.
