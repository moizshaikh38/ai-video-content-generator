# Real transcription and encoded-audio checkpoint, 2026-11-18

Local qualification only. Not deployed and not a claim of transcript accuracy or publishable clip quality.

## Real provider evidence

One existing OpenRouter adapter request used `openai/whisper-large-v3-turbo` on the 28.444-second mono 16 kHz prepared audio. Returned words and segments were preserved unchanged: 89 words, 2 segments, English, no normalized timing issues. Source SHA-256: `77077a07ad64772757648b96a98f4ed05b0beaf50df231fabd767dd768a2d70d`. Prepared audio SHA-256: `d07121767b9f60865ae7f4fedd829c4e9ee381b75d13091825b130c112c61f53`.

Provider-reported cost: $0.00009471852. Conservatively added to previous accounted spend: $0.05557072577888863 cumulative, $0.14442927422111138 under the $0.20 cap. Usage counter lagged immediately after the response. Recheck current usage and authority before another paid request. No further provider request is needed for the saved-response export fixture.

`real-transcript-once.mts` refuses a repeat when its attempt receipt exists. It is historical qualification code, not approval for future spending. Its credential input is a disposable private file, deleted in `finally`.

No independent word/timing reference, WER, Hindi/noisy-source qualification or locked holdout result exists for this checkpoint.

## Actual output and audio gap

`real-transcript-caption-export.mts` uses the saved provider result, a real source download receipt, candidate transaction, render worker, FFmpeg, local object storage and signed download. Candidate interval and center crop are manual. Entitlement, watermark and hardware choice are local fixtures. Caption preset: Comic Punch, 35 cues. No generated hook or transcription correction. Source is 854x480, upscaled to 720x1280, not native 720 detail.

Actual 28.44-second H.264/AAC exports were produced through Quick and initialized Pro paths. The existing Quick path preserved hot source audio; encoded-output measurement was -7.1 LUFS / +1.7 dBTP. The existing initialized Pro normalization path measured -16.0 LUFS / -7.4 dBTP. This is a measured divergence, not an audio policy change or proof of listening quality. Automatic global normalization and changes to saved/manual settings are not part of this patch.

## Added diagnostics

The worker measures the encoded file before upload using the existing strict ebur128 parser. It stores actual finite loudness/true-peak/range values or explicit unavailable state. True peak at or above 0 dBTP requests review. Muted exports do not claim measurements. Every result sets `listening_verified: false`.

ExportDialog reports measured, review or unavailable states for the ready current export. It never labels measured audio approved. Historical exports without measurements explicitly say unavailable. No automatic gain or content change is made.

## Checks

- Two real AAC/missing-file meter tests pass.
- Two source-receipt consumer tests pass alongside them (4 total, zero failed).
- Frontend and server type checks pass.
- Real Quick export rerun successfully recorded the above hot-audio review in its ready clip.
- Real ExportDialog desktop and 390px phone browser fixtures were rendered and inspected. Hot-peak and unavailable states were readable, with no horizontal overflow. Temporary fixture changes were restored.
- Broad suite has previously recorded 6 failures and 1 skip; this checkpoint does not claim all-green.

External evidence is retained under `/downloads/vireo-real-transcript-20261118`, `/downloads/vireo-real-transcript-export`, `/downloads/vireo-real-transcript-pro-export` and `/downloads/vireo-encoded-audio-ui`. These are local working evidence paths, not user delivery links. Recognition accuracy, continuous preview/export motion parity, automatic selection/composition quality, listening review, and legacy source-receipt recovery remain open.
