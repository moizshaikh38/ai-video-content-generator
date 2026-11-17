# On-stage panel crop (local only)

2026-11-17. Existing multi-panel controls now open the source crop editor inside the preview stage, rather than a separate centered modal. No changes to saved crop data, export mapping, presets, detectors or defaults. Context-window editing is not part of this change.

The panel crop portal uses the unscaled stage viewport. An initial attempt using the design-resolution canvas made the phone controls too small; rejected after screenshot inspection. Stage crop content is capped at 560px wide, scrolls if height-constrained, and keeps existing panel-specific aspect ratios.

Qualification uses the real Studio + local API, mocked local authentication and a synthetic two-panel Gameplay fixture on the recovered Beast source. It is deliberately an arbitrary two-view crop exercise, not a recommended edit or an automatic gameplay detection result. Captions remain OFF. The original source contains cuts within the 4 seconds.

- At390x844: open Panel1, resize then Close, API slots unchanged and zero save requests.
- Desktop: resize Panel1, Apply, Save. Both editor and clip PATCH200. Panel1 scale1.256/focus0,.1046; Panel2 unchanged. Reload/reopen shows same crop.
- At390x844 with dispatched real touch events: resize Panel2, tap Apply, Save, both PATCH200. Panel2 scale1.238/focus.6043,0; Panel1 unchanged. Reload shows both persisted views.
- Actual720p API export completed,4s/720x1280, first frame and sampled moving frames inspected. Preview/export first-frame content has the two expected independent crops. No pixel-exact parity or automatic output quality claim.
- Screenshots inspected: phone editor open, phone adjusted box, reloaded panel composition, desktop crop reopen, native first export frame, moving-output contact sheet.
- Frontend TypeScript passes.36 focused cropBox/panelSourceRegion/panelKitPrimitives tests pass. Whitespace check passes. Full-suite and all-layout interactive regression not run.

Run panel-inline-fixture.mts then panel-inline-ui.cjs with existing local Mongo27019, recovered source and local puppeteer-core. Local fixture server also initializes synthetic database state and copies the source; never production. Original manual4:3 fixture can be restored with beast-manual-band-recompare.mts. No new paid calls, full4K probe, live release or retention deletion.
