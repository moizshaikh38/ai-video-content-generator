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

## Explicit bundled-font experiment,0335IST

Fresh initialization now preserves explicit clip font family/size/weight overrides. Removed a separate fresh house-style hardcode that materialized size136even where the preview resolver would clamp it on reload; the preset still defines its own unchanged default. This change is only in fresh construction. Actual existing-project retrieval was tested with manual Arial73/yellow-custom/animation-none fields and did not reinitialize them.

No Compact Creator catalogue font was replaced. A separate local fixture explicitly selected Inter Bold over Compact Creator, which is a manual appearance input and not an untouched-default result. Actual fresh editor, Pro encode, download and240PreviewCanvas frames were produced again. Browser font evidence now reports custom Inter-Bold from bundled assets, and inspected paired images show near-matching letterforms/size, unlike the old host-dependent Arial Black result. DOM zoom changes1.0-1.18. Whole eight-second frame-stepped paired sequence and outlier contact were inspected through rendered samples; this is not a claim of real-time playback/listening qualification.

Limited cyan-mask check in a central caption band:235frame pairs contain cyan in both,5in neither,0presence disagreements; median maximum bounding-edge difference1px,p953pxat416x740. Raw maximum82pxwas retained, not hidden: nine >8pxoutliers were extracted and inspected, showing matching phrases and some chroma/noise-sensitive bounds rather than an independently verified82pxcaption shift. Thresholded colors are not exact glyph geometry or OCR, and this is not full parity certification.

Evidence: `/downloads/vireo-compact-inter-verified-0332/{paired.mp4,contact.png,preview-states.json,cyan-bounds-measurement.json,outlier-contact.png}` and `/downloads/vireo-real-transcript-compact_creator-pro-inter-bold/actual-download.mp4`. Preset is still Compact Creator plus explicit Inter/bold override. No provider request, catalogue migration, main push or deployment. Default Compact Creator remains unqualified because its unbundled Arial Black can select different host faces. A future deliberate default/version choice requires its own review, not silent substitution.

Fresh font/motion/default tests26/26pass; frontend/server types pass. Actual replica-set generated-Free fixture1/1also passes, including existing manual-editor preservation. Broad safe baseline remains415pass/6fail/1skip of422and does not include all these selected files.
