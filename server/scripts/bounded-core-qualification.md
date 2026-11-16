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
