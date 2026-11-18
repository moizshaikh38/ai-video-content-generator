# Re-select a manual scene without widening it

Bug: actual scene layout callbacks found ranges only in an automatic preview plan. A manual layout correctly bypassed that plan, so the next choice could call applyItemLayout, clear scene overrides and change the whole source item. Fixed through applyLayoutAtSourceTime: retain the current saved scene interval or implicit gap first, then consider an analysis shot. Explicit whole-clip action unchanged. Source-clock/speed, locks and manual choices remain intact.

Actual EditorShell fixture deliberately starts first-half Fit, second-half Blur. First scene selected Fill then Four through actual toolbar. Captured projects retain exactly two ranges; second Blur remains. Actual service update/get and ordinary local HTTP job/storage render completed. Actual MP4 decoded samples inspected: first half Four with seam captions, second half blurred full-source with lower captions. This is deliberately seeded manual scene boundaries, NOT natural scene detection.

Framing drawer selection previously read only the base item and could highlight the wrong layout despite a saved scene override. It now resolves the scene at source-clock playhead. Actual screenshot inspected: Four highlighted for current first scene. No crop changes from this label correction.

121 focused related tests pass and both TypeScript checks clean. Includes manual re-selection with no automatic shot, implicit gap despite a broad analysis shot,2xsource clock and out-of-range rejection. Source and local-review caveats remain the same as manual-four-caption-job-20261118. No paid calls or default changes.
