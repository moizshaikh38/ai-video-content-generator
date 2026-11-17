# Fresh Studio palette mismatch and frame-stepped audit, 2026-11-18

Local-only fix. No deployment, saved-project migration or recognition-quality claim.

## Reproduced defect

A fresh Studio project initialized from the real saved-provider-response clip materialized legacy yellow `#FACC15` over Comic Punch's green palette. The untouched clip export retained the actual preset green. Frame-stepped comparison showed NEED, PHASE, SERIOUSLY and EXTREMELY yellow in preview and green in the encoded Pro output. Initial fixture attempts with insufficient flex sizing or loose paused seek assumptions were discarded, not used as parity evidence.

## Change

Only fresh editor initialization now reads preset text/accent colors, including clip palette overrides, rather than applying legacy white/yellow to every style. Comic cue motion starts without inherited word pop. Legacy non-preset styles retain existing defaults. Producer emphasis precedence remains unchanged. Existing saved editors return before initialization and are not modified. This does not repair old saved yellow projects or claim other typography overrides are mapped correctly.

## Verification

- Fresh actual Pro candidate transaction, editor initialization, FFmpeg render, upload and signed-download fixture completed again using saved real provider words. No new provider call.
- Actual PreviewCanvas mounted from the newly initialized editor, with source explicitly sought to each audit timestamp. No production seek policy changed.
- Captured 240 frames at 30 fps across source 0-4 and 18-22 seconds, canvas about704x1252; paired at416x740 against actual Pro MP4. Browser decoded timestamps within0.000002 seconds of requested times; zero page errors.
- Pixel inspection of paired video samples/contact shows the green accents now agree at the inspected phrases. Numeric yellow remains visible.
- Limited encoded-pixel measurement: green presence threshold in the caption band agrees for240/240 sampled frame pairs. This is not OCR, exact geometry equivalence or complete motion parity. Shape/antialiasing differ across browser and ASS.
- Source is29.97fps, output30fps. A cut-boundary image difference remains visible in paired samples; exact source-frame cadence analysis is still open. Do not claim frame-perfect video parity.
- Focused fresh-palette, Comic Punch, motion-selection and new-default tests21/21 pass. Frontend/server type checks pass. Broad suite's previously recorded6failures/1skip are not erased by these passes.

Evidence at `/downloads/vireo-real-caption-motion/`: `before-paired.mp4`, `before-contact.png`, updated `paired.mp4`, `contact.png`, `preview-states.json`, `green-accent-measurement.json`, captured preview PNG sequence and runner sibling. These are working evidence paths, not published deliverables. Frame stepping does not verify real-time playback, listening quality, transcription accuracy or automatic selection/composition. Manual whole-source candidate and center crop remain fixture choices.

## Compact Creator follow-up,0330IST

Actual saved-provider words were rendered using Compact Creator, then fresh Studio was frame-stepped against that MP4. This exposed another initialization defect: legacy `animation: highlight` became a `wordAnimationType: none` override in the preview mapper. Fresh preset initialization now leaves default word motion intact and preserves explicit animation/scale overrides. Existing saved projects are not rewritten. All-preset motion round-trip plus spacing/selection checks11/11pass; both type checks pass.

A fresh240-frame after capture records actual CSS zoom1.0-1.18rather than the pre-fix constant1.0. Adjacent browser glyph advance boxes have positive gaps, minimum11.76pxon704pxcanvas in166adjacent pairs. This does not measure stroke/shadow collision or exported glyph bounds. Inspected paired output still shows smaller/different preview typography, so Compact Creator is NOT qualified or finished.

Actual browser platform-font evidence identifies LiberationSans-Bold for requested Arial Black. Arial Black is not bundled; local fontconfig resolves its bold request to DejaVuSans-Bold. An export/browser fallback mismatch is the next issue, not a reason to retune all saved/manual styles by sight. No catalogue face replacement was made. Further explicit bundled-font override experiments must remain separate from the current saved/default appearance.

Reusable local-only `caption-motion-frames.cjs` mounts the real PreviewCanvas through `harness-caption-motion.html`; it refuses an existing output or public fixture directory, copies explicit local media, blocks non-local/non-GET requests, uses exact seeks, requires a700pxminimumcanvas, records word geometry/platform fonts/errors and cleans fixture files/browser/Vite in `finally`. Default240frames; AUDIT_FRAME_COUNT allows a1-frame font diagnostic and must not be reported as a motion audit. Tests/scripts are not production auth or user-media access proof.

Updated evidence: `/downloads/vireo-compact-real-caption-motion`(before), `/downloads/vireo-compact-pop-verified-0327`(after pop), `/downloads/vireo-compact-font-diagnostic-0330b`(actual platform fonts). Paired MP4s and contacts were inspected and reported with their unresolved size/face mismatch.
