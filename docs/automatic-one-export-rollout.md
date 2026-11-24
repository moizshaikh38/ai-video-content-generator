# Automatic one-export continuation, V1

Default OFF. This is an explicit per-request option, not default permission to
spend, publish, upgrade a model, or bypass plan features. Existing manual flow
and legacy model defaults remain unchanged.

Enable only on compatible API and worker builds with:

- `VIREO_AUTOMATIC_ONE_EXPORT_V1=1`
- durable core processing, selection, and core-selection continuation enabled,
  with their explicit active-count settings and live worker announcements
- `VIREO_RENDER_ADMISSION_V1=1`
- independently approved explicit final-speech mode:
  `VIREO_FINAL_SPEECH_ADMISSION=gpt-4.1-mini` and
  `OPENROUTER_TEXT_MODEL=openai/gpt-4.1-mini`

Those settings can add provider cost; this switch does not authorize it. Obtain
owner approval for production cost/default changes separately. No public posting
is performed. The processing request still uses the existing credit reservation
and settlement path. The normal clip creation controller enforces render quota,
smart-crop entitlement, caption presets and source verification.

API accepts `automatic_export_one` only with explicit `continue_to_selection`,
continuation protocol header and version 1 / enabled true. Settings are immutable
for the processing attempt. Candidate publication transaction writes an outbox
for newly published candidate IDs. Delivery selects the first ranked provider
proposal carrying final presented-speech admission, never short-source fallback.
Stable creation ID goes through normal prepare/admit and existing render queue.
No eligible candidate, stale attempt/context/source or known creation refusal
requires review. Unknown controller outcomes defer the same pending intent for 30 seconds. Three
unknown delivery failures require review, so one unavailable row cannot starve
later users. Retries cannot mint a second creation ID. An already admitted,
verified creation receipt is reconciled before checking later context edits;
reconciliation reports the saved outcome and never authorizes new admission. Browser closure does not stop delivery.

Status reads expose the outbox state and bound clip render status. Pending or
queued rendering does not require the browser to create the clip. Existing
render failures need review, not another automatic selection or render request.
Project deletion removes its outbox alongside existing private payload cleanup.

Qualification: local Mongo mechanics tests use synthetic admission metadata and
stub rendering. A separate 3-second synthetic blue-frame/sine-source test uses
actual FFmpeg rendering and local storage, with CV auto-analysis disabled. This
proves automatic handoff can reach a saved render without an operator create
call. It does not establish speech quality, real smart framing, provider
availability or fresh whole-pipeline success. No production enablement is implied.
