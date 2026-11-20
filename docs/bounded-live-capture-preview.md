# Bounded live capture preview, 2026-11-20

This is an explicit local-preview capture milestone, not verified platform-wide livestream support and not live-clipping completion. No production deployment or automatic activation.

## Current implementation

- Authenticated `/api/live-captures/capabilities`, POST `/api/live-captures`, GET `/:id`, POST `/:id/stop`, GET `/:id/download`, DELETE `/:id` for explicit owner Discard.
- Disabled unless `VIREO_LIVE_CAPTURE_ENABLED=true`, and always disabled in production for this preview. Capabilities report this fact, process-local state and no externally verified providers.
- Start requires `{url, start:"now", durationSeconds:5..120, maxHeight:360|480|720}`. Defaults only quality to720p. No duration or capture-start decision is inferred. URL paste/probe never starts capture.
- Per-capture byte cap is minimum of server cap, plan cap and128MiB. Working-space precheck reserves3xthat cap plus8MiB above the1GiBfloor. Ongoing checks preserve additional assembly space. This intentionally blocks current low-capacity external tests.
- One active capture per local server, with authenticated owner-only status/Stop/download. Session discovery is memory-only and does not survive restart. Completed files remain on disk but restart discovery/recovery is not implemented; this preview must not be treated as durable media storage. Incomplete/failed session state expires30minutes after session start; completed MP4s are not automatically deleted, and are retained until an explicit owner Discard. No object-storage upload, persistent project or clip is automatically created.
- Initial media playlist is a baseline. Only newly published segments after that baseline are acquired, not rewind or the previous hours of a stream. Segment sequence numbers prevent duplicates; missed segments, discontinuities, early stream end, stall, timeout, oversized output and incompatible media fail explicitly with no partial accepted file. Stop cancels and discards the incomplete capture.
- Clear muxed MPEG-TS HLS only. Separate audio, encryption, init maps/fMP4, byte ranges, low-latency parts and gaps are not implemented. HTTPS requests use existing public-address-pinned downloader. FFmpeg reads locally named files with file protocol only, never source URLs, remote manifests or keys. Output is probed for A/V, quality and requested duration within1second remux tolerance.
- Kick resolver reads current channel metadata. YouTube/Twitch resolver runs one bounded public metadata-only yt-dlp command with no config/cache/plugins/saved login, requires currently-live muxed HLS within quality cap. Resolution may fail on access controls, challenges or unsupported representations. These are not bypassed or retried.

## Evidence and limits

- Local rolling-playlist unit tests cover explicit input validation, initial-history skip, sequence deduplication, storage cap before media, gap/stall/early end/cancel, unsupported HLS families and controller owner/parallel/session gates.
- Actual generated A/V TS through the live engine and shared FFmpeg resolver yields a playable2second MP4. This is controlled fixture evidence, not a public provider capture.
- External Kick metadata/one manifest was inspected earlier,0media segments. Public YouTube/Twitch live capture remains unverified. User's separate completed29.983s Kick clip is blocked on storage, not solved by this module.
- Live clipping still needs capture-to-project integration, user-approved transcription/provider costs if any, selection pipeline, persistence/restart recovery, multi-instance concurrency/leases, a durable retention policy and UI acceptance before a production rollout. This preview does not offer background auto-watch, chat capture or autonomous AI processing.

## PeakCut reference and license

Inspected public PeakCut commit1bef2b48385568c26a798f2ef20152d2b0f531dd LICENSE and `studio/live.py` on2026-11-20. Its rolling6s capture, continuous transcription/AI/chat/watch architecture informed the review; Vireo implementation above is a separate bounded workflow using its existing URL security and FFmpeg runtime. No PeakCut scripts are executed. The source MIT copyright/permission notice is preserved at `docs/third-party/PeakCut-LICENSE.txt`.

- https://github.com/haziqahmedqasmi/PeakCut/blob/main/LICENSE
- https://github.com/haziqahmedqasmi/PeakCut/blob/main/studio/live.py
- https://raw.githubusercontent.com/yt-dlp/yt-dlp/master/yt_dlp/extractor/kick.py
- https://raw.githubusercontent.com/yt-dlp/yt-dlp/master/yt_dlp/extractor/twitch.py
- https://github.com/yt-dlp/yt-dlp/
