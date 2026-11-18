# Caption acceptance correction and bounded recovery

18 Nov 2026. Local source only. No deployment.

The earlier ordered-segment fallback preserved text order but did not establish synchronization. An actual exported clip was rejected: monotonic provider segment clocks still placed a phrase several seconds before its speech. The earlier fallback qualification is superseded by this correction.

## General changes

- Known unreliable word clocks now stop caption extraction and transcript reuse even when provider segment clocks are monotonic. No automatic segment override clears the review flag.
- Segment-only legacy input remains explicitly phrase-level. It is not proof of word accuracy.
- Overlapping chunk ownership now stops for review when it would discard a word not recognized in an owning neighbour. That disagreement does not automatically trigger another paid whole-file request.
- A short-window planner supports explicit bounded recovery of spans up to 60 seconds. It does not initiate paid recovery or change default processing.
- Provider normalization retains valid probability or confidence values, anonymous speaker labels when actually returned, and audio-event/redaction annotations. Speaker labels are not identities. Event/redaction tokens require review before treating them as spoken words. Low confidence alone is retained evidence, not automatic rejection of accents or noisy speech.
- Single-word preset override uses one genuine timed word per cue. Tests do not establish that a given provider's word matches audio.

## Checks

49 focused tests passed across timestamp recovery evidence, ordered caption guards, provider timing, output validation, source receipts, transcript quality and processing speed. Server TypeScript passed. These checks use pure fixtures and scoped local DB/HTTP lineage checks, not live media or paid calls. No all-suite or production readiness claim.

Separate source-bound recovery diagnostics found conflicting text across recognizers in overlapping streamer/game audio. No candidate was automatically installed or rendered. Complete text and synchronization remain unresolved. There is no native independent listening verification here. Model agreement or readable screenshots do not substitute for audio acceptance.

## Next acceptance work

The requested corrected single-word clip remains incomplete. Speaker-aware recognition needs actual speaker metadata and a grounded primary-speaker policy, not inferred identities or silent omission of uncertain game dialogue. A production automatic pipeline still needs real source acquisition, moment selection, adaptive framing, word-level captions, export and save/reopen qualification across different sources. Review-required guards prevent unsafe success, but do not themselves fulfill that outcome.

## Verified optional diarization route

OpenRouter documents multipart diarize=true with verbose_json and anonymous word speaker/speaker_label fields. Scribe v2 supports it. The adapter now exposes an explicit Scribe-only opt-in, default off, and preserves actual returned labels. Mocked request tests only, no diarization request was executed. The API warns that providers may charge extra; an exact current diarization surcharge is not verified. Speaker labels do not identify the streamer, and requesting them does not authorize removing other speech.

Sources checked: https://openrouter.ai/docs/api/api-reference/stt/create-transcription and https://openrouter.ai/blog/announcements/elevenlabs-on-openrouter/
