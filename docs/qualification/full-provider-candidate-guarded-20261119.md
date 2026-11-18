# Full retained provider-candidate qualification, guarded stops

2026-11-19, approximately 02:17 to 02:21 IST. No finished output was produced.

## Input and authority scope

The approved no-new-spend attempt used the already retained provider-origin 0 to 28.44-second candidate without manually shortening or replacing it. Source bytes were SHA256 `77077a07ad64772757648b96a98f4ed05b0beaf50df231fabd767dd768a2d70d`, 7,427,704 bytes, 854x480 H264/AAC, 28.462-second container. Genuine ASR reuse remained two segments/89 words with matching prepared-audio and original transcript-content receipts, not independent speech/timing approval. The selection was from the prompt revision before fd6fe94 and spans essentially the entire source. This is not long-form highlight quality or 4K evidence.

The goal was normal fresh Auto analysis followed by actual Studio save/reload and one full-duration 720x1280 export. No new provider, ASR, acquisition, optional model download, manual crop substitute, offline staging or production deployment was allowed. The single encode attempt remained unused.

## First run

Retained isolated database: `vireo_studio_fullcandidate_20261119_0216`.

- Actual HTTP POST /reframe/analyze returned 202.
- Actual normal local CV completed, source/hash/window bound, 122 samples at the configured nominal 250ms interval, 854x480 source. It reported seven detector tracks and a dominant heuristic score of 0.58. No detector/identity/layout-quality approval follows from those numbers.
- One actual CV process: sampled peak RSS 94,982,144 bytes, 43.03 seconds, no child guard breach.
- The outer run then stopped after 50.28 seconds while the browser/development frontend was loading. No visible Studio page, save/reload or encode was completed.
- No encode-count marker or output MP4 exists. Only one CV attempt occurred.
- The original outer launcher unfortunately recorded a combined resource-floor reason without the triggering sample values. Available evidence supports browser plus development-preparation memory pressure as the hypothesis; exact triggering memory/disk/size values and total peak are unverified.
- Stopped-page screenshot was inspected and is blank, not a usable product screenshot.

The first process-group stop did not close Puppeteer's separately spawned Chrome process group. That specific browser was subsequently bound to this exact fixture by its DevTools tab URL, then closed through its debugging connection. Unrelated pre-existing browser groups were left untouched. API/storage ports closed. This limitation must be fixed in any future supervisor rather than claimed as clean historical shutdown.

## Revised sequential static preparation

A revised allowance permitted preparing the same page/hooks as static assets with no browser/CV running, then resuming the retained candidate. Preparation alone stopped at its 512 MiB aggregate process-group RSS cap, after 4.19 seconds:

- Sampled group RSS at stop: 538,931,200 bytes, about 514 MiB. A polling guard can overshoot.
- Available system RAM: 960,303,104 bytes.
- Free disk: 1,257,533,440 bytes.
- Stage: Vite production build, transforming modules.

This was the build-group cap, not the shared RAM/disk floor. It shows only that this preparation exceeded 512 MiB, not its unconstrained peak. No static bundle finished. No resumed browser or encoder started. The stop remained in place with no allowance for another build/UI/media retry or cap escalation. No further attempt was made.

The attempted build used the current Vite/React configuration with public-asset copying disabled, so copying the font/public directory was not this build's task. Exact transformation/allocation drivers were not profiled. Dependency/package graph inspection may support a lower-load future plan, but is not a measured successful build.

## Open outcome

Ordinary full-candidate export, visual/moving-output quality, caption correctness/sync, source acquisition, long-form selection and genuine 4K remain unqualified. The guard failures and actual successful CV stage are separate facts. Increasing a cap, changing layout defaults or replaying another tiny manually selected interval is not an unapproved fallback.
