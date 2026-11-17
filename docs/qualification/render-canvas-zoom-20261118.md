# Render canvas / zoom transition checkpoint, 2026-11-18

Local only. No deployment or4Kexecution.

## Reproduced

The broad safe suite had a real FFmpeg failure inside zoom_lite, not only stale genre expectations. A noncanonical stored canvas320x568was used for the zoom head, while the slice crop helper already emitted1080x1920for its9:16aspect. Concat rejected these dimensions. Earlier summaries grouping all remaining failures as genre/scoring were inaccurate; the parent was notified as soon as the actual failure was inspected.

## Change

At compileRenderGraph entry, normalize known editor aspects to their canonical design dimensions using the existing helper, on a render-only copy. Derive crop aspect from that canvas too, preserving the remaining supplied context. Every crop, transition, title/overlay canvas then uses the same design space times explicit canvasScale. The output tier remains explicit; stored width/height do not independently become a second resolution knob. Existing API canvas updates already normalize known aspects this way. Unknown/custom aspects keep their previous geometry helper behavior and are not newly qualified.

No saved project row is changed by compilation. Noncanonical legacy known-aspect geometry now renders consistently with the design contract; this is a compatibility judgment to review before release, not permission for a migration. Manual item values are not rewritten. A real existing-project retrieval test elsewhere preserves saved manual caption values.

## Evidence

- Focused transition and per-slice parity tests31/31pass, including real FFmpeg representatives for zoom, slide, blur, pixelate, radial, squeeze, plus speed and gap cases. These prove executability/duration assertions, not aesthetic quality.
- Graph-only geometry checks cover720portrait,2160portrait,square andlandscape using explicit canvasScaleand verify the caller project is not mutated. The2160case only inspects a filter string. No4Kencode/APIrequest was made.
- `zoom-canvas-export.mts` created a fresh real-source720x1280H264/AAC output, about3.6seconds, with manual source0-2and3.3-5.3intervals and0.4secondzoom transition. Original source SHA and full graph/argv/probe saved. Real decoded samples and1.6/1.7/1.8/1.9/2.0secondtransition frames were inspected. They show the intended blended zoom without a size mismatch; not continuous-motion smoothness or listening approval.
- Evidence: `/downloads/vireo-zoom-canvas-0342/actual-transition.mp4`, `transition-contact.png`, `prepared.json`, `result.json`.
- Fresh broad safe suite422tests:417pass,4fail,1skip. Remaining4are three score/reason expectations and the14versus12genre-count assertion. Test:safedoes not include all newly selected source/caption/audio tests. Neither this result nor a transition render is a publishable-output/no-rescue quality gate.
- Frontend/server types pass.
