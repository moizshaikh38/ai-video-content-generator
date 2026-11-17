# Panel layout and Fill follow-up

2026-11-17, local only. Real Studio/local API on synthetic Beast fixture, no paid calls or production access.

15 UI cases: Three/Four/ScreenShare/Game screen first/Fill at1440x1000,390x844,320x844. In each panel layout, last panel opened/cancelled without persisted slot change, then Reset/Apply/Save writes both endpoints200; untouched panels' persisted slots unchanged. Fill opens, Reset/Apply/Save200 with mouse atdesktop and tap on phones. No page errors. This does not render all15 combinations or prove temporal parity. Prior Gameplay720p4s render remains the output evidence; not rebuilt.

Pixel checks found two usability failures despite initial API assertions passing:
- Fill still used the scaled design canvas, making phone labels/actions tiny. Changed it to use the same unscaled stage as panels.
- Four at320px kept the expanded toolbar above crop and clipped Apply below stage. Opening any crop now collapses mobile toolbar first. Fresh320px screenshots show readable source/crop/actions, Apply fully above timeline. Desktop remains on-stage.

Native320/390 screenshots and desktop representative inspected. Reopened screenshot capture now waits for video ready/seek completion; early captures sometimes showed black source, which was not accepted as ready evidence. Some long interactive sequences showed timeline playback advancing; this run did not isolate whether touch Apply, harness event sequencing, or existing playback state causes it. No claim of paused-transport correctness.

Frontend TypeScript and diff checks pass. Earlier36 crop/panel focused tests pass; full suite not run. Manual4:3 fixture restored afterward. No release, paid calls,4Kprobe or deletion.
