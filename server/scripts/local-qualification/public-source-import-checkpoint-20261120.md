# Public video-source import checkpoint, 2026-11-20

Backup branch only. No deployment, account connection, paid transcription or default processing activation.

## Implemented
- Dropbox single-file shares (`/s/.../file`, `/scl/fi/.../file`) normalize download flags while retaining `rlkey`.
- Google Drive single-file share IDs normalize to public download URLs while retaining resource keys. Ordinary same-file Google download-confirmation forms are supported; login/folder/arbitrary-action forms are not.
- Kick completed clip/VOD metadata resolution uses no saved login or cookies. Media acquisition uses public HTTPS downloads. Completed clear muxed HLS is mirrored to local files before remuxing, including exact explicit byte ranges. FFmpeg has only the file protocol. Live/encrypted/DRM/init-map/separate-audio/unsupported manifests fail closed. Known master variants are capped at1080p and prefer detail within that ceiling.
- Existing source probe/import endpoints and project response shapes are unchanged. Provenance survives project persistence. Ranges for these sources are selected after import.
- Download redirects remain manually checked and every network connection is pinned to a validated public address. Request, byte, segment-count, nesting, duration and overall HLS time limits apply.

## Measured acceptance
- Actual external Dropbox sample: 1,601,434 bytes, H264+A/V,9.85s1280x720. Passed source URL through subtitle controller, external download, actual FFmpeg probe, local object-storage PUT, source cache and isolated Mongo insert/list. Auth/plan synthetic, storage local. No hosted-auth claim.
- Actual external Drive sample:1,154,782bytes,26.35s H264+A/V1920x1440. Passed source URL through subtitle controller, external download, actual FFmpeg probe, local storage/cache and isolated Mongo insert/list. Two upstream fixtures were removed; one university sample required sign-in and was rejected; another public file exceeded small local caps.
- Drive fixture leg: actual parser/controller/FFmpeg/storage/Mongo passed with HTTP acquisition replaced by retained media. This is not full actual-site acceptance.
- Kick actual public clip metadata returned200. A smaller completed clip passed all8 exact byte ranges and local remux:15,318,423-byte MP4,16.019s H264+A/V1920x1080at60fps. Audio/video durations agree within0.4ms; audio starts21ms after video. Sampled contact pixels inspected. API duration15s differed from HLS16s; preserved the available segment span. A larger43s/52MB clip was not fully acquired near the disk floor, though its first range also passed.
- Kick local direct-media source-to-project fixture passed with metadata/acquisition replaced by retained media. Clear HLS local-file mirror/remux test passed. A single fresh-network Kick source-to-project run and current VOD acquisition remain unverified. Upstream VOD test link returned404.

## Sources
- https://help.dropbox.com/share/force-download
- https://developers.google.com/workspace/drive/api/guides/resource-keys
- https://developers.google.com/workspace/drive/api/guides/manage-downloads
- https://www.labnol.org/internet/direct-links-for-google-drive/28356
- https://raw.githubusercontent.com/yt-dlp/yt-dlp/master/yt_dlp/extractor/kick.py
- https://raw.githubusercontent.com/yt-dlp/yt-dlp/master/yt_dlp/extractor/googledrive.py
- https://raw.githubusercontent.com/yt-dlp/yt-dlp/master/yt_dlp/extractor/dropbox.py

This checkpoint is implementation plus bounded evidence, not a hosted all-source readiness claim. Private files, subscriber-only video, restricted downloads, unsupported HLS formats and expired source links remain explicit failures, never bypass targets.
