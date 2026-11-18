# Faithful caption fallback for unreliable word clocks

18 Nov 2026. Local source only, no deployment.

## Defect found in an actual source-bound export

A real source-bound transcription contained words whose clocks overlapped previous utterances or went backward in the provider's original word order. Caption extraction sorted by start time, mixing spoken phrases. That output was rejected, not treated as a successful deliverable. No source-specific phrase rewrite or extra paid transcription was used to fix it.

## General behavior

- Check finite positive ordered word windows before grouping. A small 80ms overlap tolerance accommodates rounding without allowing backward word starts.
- Reliable ordered words retain word mode and original text order. No sort may change the spoken sequence.
- Unreliable words use genuine ordered segment text, with no invented word timestamps or karaoke accuracy claim.
- If word timing is unreliable and ordered segment fallback is missing, caption extraction requires review.
- Provider normalization retains the actual words/clocks and records an unordered/overlapping clock issue. It does not silently repair timestamps.
- Caption quality checks allow only this specific word-clock issue with valid ordered segments. Other quality flags remain blocked.
- General transcript reuse and automatic clip analysis remain strict by default. Existing selected-clip receipt checks opt into segment fallback while still checking owner, signed transcript content, current source key, ETag/size and source receipt. A changed quality record also changes the signed transcript identity. This is not permission to re-sign stale decisions.

## Checks

25 focused tests passed: seven ordered-caption fallback tests, four existing mocked-provider timing tests, twelve fail-closed output validation tests and two source-lineage tests. The lineage test uses existing local qualification Mongo plus a local HEAD responder; it reaches failure paths before any media render. It confirms stale source, changed transcript and wrong-owner decisions fail; strict reuse and non-timing quality flags remain blocked. TypeScript and whitespace checks passed.

A separate private real-source preflight exercised editor initialization and ASS generation after these guards, with seven unchanged genuine segment phrases. No media render or paid call occurred in that preflight. Actual final output checks are reported separately.

## Remaining limitations

Segment clocks are still provider clocks, not forced-alignment or independent word accuracy. Phrase-level timing can be coarse, especially with overlapping game/streamer speech. Existing manually edited caption cues are not automatically rewritten. This change does not migrate deployed transcripts or repair saved captions. Review flags do not automatically authorize another transcription or charge.
