# Hook regeneration source span, 18 Nov 2026 IST

Found and fixed a source-boundary defect in the live hook-regeneration service: its opening prompt used clipStart+40 seconds but did not cap the span at the clip's trimmed end. A short clip could therefore have its hook generated from later speech absent from the delivered clip.

A shared pure collector now bounds source evidence to [start_seconds+trim_start_offset, min(end_seconds-trim_end_offset,start+40)]. Only complete valid words or complete segments inside this window are admitted; crossing boundaries are not partially quoted as if whole. Word mode is preferred only when actual word entries exist. Invalid clocks, empty evidence and ambiguous overlapping spans fail closed with HOOK_NO_SPEECH. No invented word timing, transcript rewrite, or segment-to-word timing fabrication.

The service returns the selected evidence granularity/source interval/spans alongside hook/title. This is supporting input provenance, not proof the generated claim is truthful. Claim entailment, output-length checks, title safety and manual-review UI remain further work. Whole-segment rejection at a boundary is deliberately conservative and may produce review-needed/no-speech when only coarse crossing segments exist.

Nine tests pass: five pure span tests plus four real HTTP/localMongo regeneration cases, including actual captured provider prompt for a trimmed5sclip proving later words absent. Existing provider-missing and ownership behavior retained. Server typecheck passed after the final HTTP assertion. All provider calls mocked; no credits or external services used. No visual/UI change or production release.
