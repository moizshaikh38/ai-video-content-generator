# Background control scene-override correction

Clip-wide Framing Strategy now drops stale scene layout overrides when changing Fill/Fit/Blur/Smart. This fixes Background Color preview/export mismatch and the Color-to-Blur preview remaining black. No default automatic policy change.

Actual qualification: both original branches reproduced the defect in real editor UI, then saved project/readback/normal render job/local storage PUT/signed download. Corrected branches visually inspected at0,6,11.7 seconds with the same12s silent two-person source. Color is black in preview/export; Blur is blurred in preview/export. Safe-area preview guides are not export content. Manual Fill still crops faces; this patch does not solve that.

Current focused20/20, broad safe421pass/0fail/1skip; frontend/server typechecks pass. Antigravity focused18/18 and frontend/server typechecks pass. Antigravity broad safe418pass/3fail/1skip: existing phase2 clipStartSec source-regex mismatch; canonical genres14 versus expected12; zoom_lite transition FFmpeg size mismatch. These files were not changed by this patch. Do not call full suite green.

Original versions preserved in comparison artifacts: Antigravity4f6984a/current98fd298. Auth/entitlements/storage mocked locally. Current saved-job silent-source fixture has explicitly synthetic empty transcript binding, no provider/selection accuracy evidence. No paid calls or production release. Antigravity fresh eight-state harness stalled during Auto restore; narrowed actual Color/Blur UI rerun completed and both normal saved jobs completed. Failed and successful outputs preserved.
