# Caption placement review candidate, 18 Nov 2026 IST

This module is off the application path. No default, Studio or API placement behavior changes. It is an inspectable caption-specific geometry candidate, not automatic region detection.

Inputs require item/source/composition-revision and interval identity, accepted canvas-space picture bounds, a whole-interval caption envelope including asymmetric glyph-origin offsets, and supplied canvas-space protected-region unions. Manual positions are preserved without a safety claim. Incomplete evidence, invalid identity/geometry, unsupported region provenance, no viable anchor or an oversized caption causes review-required. One decision covers the interval, not each word. A candidate may overlap unprotected picture and explicitly says context still needs review. Source-to-canvas projection and provenance validation against live editor state remain caller responsibilities and are not implemented by this module.

Proof fixture:
- Existing cottonbro-two-person-12s local qualification footage, excerpt at 3s. Synthetic phrase MAKE THIS MOMENT COUNT, unrelated to source speech. Silent output.
- Explicitly generated portrait composition: 1080x1920 canvas, 1080x810 sharp source picture at y555 with blurred background. This fixture is not Auto Layout evidence and cropping in it is not newly qualified.
- Actual ASS/libass alpha union sampled at 60fps for 3 seconds, using flattened bundled fonts. Envelope 859x116, offsetX -426 and offsetY -45 relative to a centered anchor; includes Comic halo/stroke and maximum phrase overshoot. This only measures this phrase/style/render setup, not all captions.
- Lower fixture chooses y.8125 outside sharp picture. Synthetic lower HUD-region fixture chooses y.194531, also outside sharp picture. No real HUD was detected; region is manual test input. Unknown evidence returns no anchor.
- Rendered 3s clips and actual pixels inspected at 540x960. Caption avoids picture in both controlled cases and remains stable through the sampled output. Not a Studio/preview-export parity claim.
- 30 review/legacy-placement/adaptive-contract tests pass; server typecheck clean. No paid calls, main merge, deployment, entitlement changes or 4K run.

Evidence directory: /downloads/caption-placement-review including envelope.json, review.json, alpha masks, rendered MP4s and PNGs. The script in server/scripts/local-qualification/caption-placement-review.mts emits measure.ass and candidate scripts; external ffmpeg builds the manual test composition. It is a test harness, not a production endpoint.

Next: integrate verified item-bound accepted composition and interval evidence, compute actual per-cue/per-preset motion bounds in preview/export, compare actual Studio/API output on multiple sources, and only activate qualified behavior. Current application fixed anchors remain unchanged.
