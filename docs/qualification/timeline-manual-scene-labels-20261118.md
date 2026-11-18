# Timeline labels follow persisted manual scenes

Actual UI screenshots showed manual Three in the preview/toolbar but Auto Fit Review in the timeline when automaticSceneRanges was empty. The helper also labelled a whole analysis range using a single midpoint when manual overrides covered only part of it.

The helper now emits source-clock ranges for persisted scene overrides even without analysis ranges, splits labels at exact override boundaries, clips to source trims and maps speed to timeline time. Unmeasured gaps are Auto with Review, not invented Fit geometry. Returning a scene to Auto retains the original review warning. This is display/menu-range mapping only, not a planner or crop change. Tooltip no longer calls manual ranges analysis scenes.

Seven dedicated tests cover unchanged edit timing, trim/speed, manual overrides, locked controls, empty analysis, partial boundary splits and Auto uncertainty. Fresh actual editor screenshot inspected with assigned Three and a matching three (manual) timeline range. Normal enabled in-flight route, explicit controls, save/get and direct assigned/edited exports completed; no paid call, no ordinary captioned-job rerun for this label patch.

First visual attempt exhausted the local disk. Disposable failed outputs and three downloaded scouting media files were removed, retaining excerpt bytes/provenance and decisive artifacts. The local Mongo fixture had exited on disk-full diagnostic write failure and was restarted. A later Apollo run omitted the conversation flag and hit expected unassigned export guard; counted only as label visual evidence. Final in-flight enabled-route run completed. This disk issue is not proof of the older full4K resource cause; the full4K pause remains.
