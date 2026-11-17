# Mobile framing tools disclosure (local qualification)

2026-11-17. Not released. Existing framing behavior and saved project fields unchanged.

- Same real Studio + local API Beast fixture, before and after actual browser screenshots at 390x844.
- Default mobile view replaces the wrapped toolbar with an aspect/layout summary and 36px-high Framing tools button. Expanded view retains all controls and Done returns stage space. Disclosure is local UI state, resets on reload, never saved to project.
- Decoded screenshots inspected: baseline visible canvas about 226x403; collapsed about 244x435. Gain about 32px height on this fixture, not the 94px difference between collapsed and expanded-with-summary.
- Background and Tracker menus now align to the toolbar instead of individual buttons on phones. Tracker menu buttons are block-level and wrap. Initial screenshot caught clipped Background labels; fixed and fresh screenshots checked. Desktop positioning retained.
- Interactive test: touch open/close, Layout menu, Background menu, Tracker menu, reload collapsed, desktop toolbar visible and summary hidden; 320/360/390 widths. Zero page errors and no PATCH/DELETE project requests. Existing local fixture server initializes synthetic database state; no production requests or paid services.
- Layout/Background/Tracker menus were opened but their edit actions were not applied. This is UI-only qualification, not a new render or automatic-framing result. Test uses existing synthetic local authentication, not live auth. Frontend TypeScript and diff whitespace checks passed.
- Script depends on existing local Mongo/source fixture and local puppeteer-core install. Run with CAPTURE_BASELINE=1 against prior PreviewCanvas to capture baseline.
