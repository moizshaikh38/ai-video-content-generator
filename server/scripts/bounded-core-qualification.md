# Bounded core qualification

Local checkpoint: 16 Nov 2026, 22:32 IST. This is not a release pass.

## Agreed scope

Talking-head, interview and moving-person upload, edit/save, trim, final export and safe fallback before gaming. Cooking/sports perfection is not a gate. Gaming remains paused. Framing changes remain on the backup branch. No new production/default/provider configuration change is covered by this checkpoint.

## Fresh actual dashboard check

The normal `/dashboard` flow selected the independently sourced Walking in the sands 0-12s MP4. Browser auth, object storage and wallet were isolated local fixtures. The synthetic local user received 100 fixture credits; no real balance or provider was used. Transcription provider keys were deliberately unset to exercise processing failure after confirmed upload.

Before the fix, a successful upload followed by a processing failure left the selected source as a file. Retry would create another project/upload. Reload also restored the invalid source type `upload`, outside the workflow's file/url/project variants. Recovery showed an irrelevant YouTube/direct-upload suggestion, while the dashboard implied the uploaded project was queued.

The local fix retains a confirmed source as a project before attempting processing. URL ingestion also retains its confirmed project. Reload restores an uploaded project as ready to process; an incomplete upload asks the user to select the file again. Direct upload is offered only while URL ingestion is unresolved. Idle uploaded projects are not counted as processing and show "Source saved. Processing has not started." Provider setup errors use creator-facing text rather than server environment instructions.

Actual repeated browser/API qualification, after the fix:

- One real create-project HTTP 201, one signed upload URL HTTP 200, one browser PUT, one confirmation HTTP 200.
- Stored 3,554,201 bytes match source SHA256 `025269ca2fd13e928e35e78eb15636f6165b6d834bed4d715d5e15353af9e638`.
- Initial processing attempt, Retry Generation, then reload/Generate Clips: three HTTP 503 processing responses against the same project.
- Exactly one project, upload grant and confirmation across all three attempts. No replacement source upload.
- Desktop and mobile recovery views inspected. Six regression guards (five source guards plus behavioral error-copy test) and frontend TypeScript pass.
- Provider calls were not made. The 503 is an intentional seam check, not successful transcription or moment selection.

Evidence harness and logs for this local run: `/tmp/core-upload-qualification.mts`, `/tmp/core-upload-qualification.log`, `/tmp/core-upload-retry-results.json`. Screenshots: `/tmp/core-upload-reloaded-retry.png`, `/tmp/core-upload-mobile.png`.

## Evidence that is separate, not a stitched end-to-end pass

Earlier walking checks used the real track API, source-bound editor and actual local Quick/Pro render jobs. Quick produced 12s/360 frames/audio; Pro source 2.7-7.9s produced 5.2s/156 frames/audio. Those projects were seeded with local media/analysis data. They do not prove that this newly uploaded source automatically passes transcription, moment selection, reframe analysis and export without intervention.

Earlier talking-head/interview checks demonstrated selected local editor save/reload and trim/render behaviors. They are not a fresh held-out upload-to-export qualification of every supported lane. Optional measured text protection is not fully in the normal runtime/editor flow. Candidate framing is not the production/default detector configuration.

## Remaining gates

1. Qualify one source-bound upload-to-final-output chain per bounded lane, including actual transcription/selection rather than seeded analysis. Investigate provider routing without spending or changing settings outside existing authority.
2. Recheck edits, reload, fractional trim and output download through the normal path for each chain. Verify actual decoded audio/video and full moving output.
3. Exercise uncertain detections and explicit safe fallback without implying that a preserved wide scene is good vertical framing.
4. Production authentication/save/export remains unpassed. The prior live Supabase DNS failure is not repaired by local auth fixtures.

The source default for transcription is `groq` when `TRANSCRIPTION_PROVIDER` is absent. This local provider-unconfigured test inherited that default. It is distinct from LLM/model selection, and is not evidence of the current deployed provider environment. The user's stated AI direction is OpenRouter only; do not silently provision or change providers or invoke them as a fix.

## Explicit OpenRouter routing boundary

Local follow-up at 22:38 IST: the failover factory now respects an explicit OpenRouter selection as a service boundary. Failure propagates without calling a separately configured direct Groq service. Unsupported provider names fail closed instead of silently selecting Groq. Existing environment/default selection is unchanged, as is legacy explicitly selected Groq-to-OpenRouter failover. This is a backup-only code guard, not a deployed configuration change. A no-network test installs fixture provider methods with both fixture keys present, forces an OpenRouter timeout and checks that Groq is never called. Nineteen routing/recovery/reliability tests and server TypeScript pass. This does not verify live OpenRouter model availability, pricing or transcription accuracy. OpenRouter can route internally to its upstream providers; this guard concerns only the application's direct service boundary.

## Failed-transfer retry and late metadata

A further actual browser run injected HTTP 503 on the first storage PUT, before confirmation. It exposed duplicate project creation on retry and a separate late metadata callback that could overwrite the retained project ID. The file selection now retains its created project through transfer failure; metadata updates only the same currently selected file and merges its duration without replacing newer state. Fresh retry/reload qualification yields exactly one project, two signed upload grants (one failed transfer, one successful retry), one confirmation and three processing attempts. The saved bytes still match the original SHA256. This extends the earlier post-confirmation proof, not production storage qualification. Reload during an incomplete upload cannot retain the browser File; the user is explicitly asked to select it again. Eight source/recovery guards and frontend TypeScript pass.

## Idle processing claim and fresh paid transcription

At 22:47 a fresh normal speech upload hit HTTP409 "already started" while the project still remained uploaded. No provider request occurred. The idle claim compared `updated_at` as well as status, so unrelated concurrent metadata/poster updates could make an idle project falsely look claimed. The candidate now fences idle-to-processing by owner/id/status; stale active processing/transcribing recovery retains exact timestamp fencing. A local Mongo test injects a poster update and checks exactly one winner from two concurrent idle claims, stale-active rejection and wrong-owner rejection. Ten focused tests including this integration test pass with no skip, and server TypeScript passes.

At 22:49 the normal local dashboard uploaded the 12s Hichilema speech excerpt to a new random fixture user's project `6ea445f1-98b4-4ed2-9176-2a7f3e6997f5`. Signed upload and confirmation succeeded, processing returned HTTP202, audio was extracted and exactly one real OpenRouter transcription request succeeded. The project persisted as transcribed with 12.01s duration, 5 segments and 8 timestamped words. This is a sparse speech excerpt, not a transcript-accuracy or caption-sync pass.

The user's original Nov16 04:59:48 cap was $0.20 total (message `wamid.HBgMOTE3MjE5MzExODY2FQIAEhgUM0ExOEJENDZGQzNGMEQyREMwMjcA`). A current read-only key check reported $0.039403018 current-month usage; assigning all of it to this cap was conservative. The exact model was present in the live STT catalog and official model page displayed duration pricing. A harness request gate allowed only one POST to the STT endpoint with model `openai/whisper-large-v3-turbo` and audio <=1MiB, blocking all other external AI calls. Response usage: 12.01 seconds, exact cost $0.0000399933. The immediate post-call key summary had not yet advanced, so the response receipt is the charge evidence. Conservative month-before plus receipt = $0.0394430113, below the cap. No direct Groq request or persistent provider/default/deployment setting changed. Credential file was deleted.

The UI subsequently attempted clip analysis. The gate deliberately blocked it; this is NOT an automatic upload-to-final-export pass. Local auth, storage and wallet remain fixtures. Need bound the next clip-analysis request separately or label a downstream manual clip honestly. Artifacts: `/tmp/core-speech-chain.mts`, `/tmp/core-speech-chain.log`, `/tmp/core-speech-chain-result.json`, `/tmp/core-speech-provider-receipt.json`, `/tmp/core-speech-chain-usage.json`; no key in these files.

Sources checked: https://openrouter.ai/api/v1/models?output_modalities=transcription , https://openrouter.ai/openai/whisper-large-v3-turbo , https://openrouter.ai/docs/guides/overview/multimodal/stt . Account usage read from authenticated https://openrouter.ai/api/v1/key .
