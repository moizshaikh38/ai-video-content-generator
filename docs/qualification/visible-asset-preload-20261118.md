# Excluded editor assets stay out of preload work

2026-11-18. Local product change only, no media/network/provider execution or release.

`preloadRemoteOverlayAssets` previously iterated every item regardless of hidden track/item state. Compilation excludes hidden tracks/items, so hidden media could still cause a remote fetch, full in-memory buffer, cache write and source-path mutation before an export that never uses it. This is unnecessary work on the existing upload/editor/export path, especially with limited temporary disk.

The preloader now selects only non-hidden items on non-hidden tracks with a source path through the pure `visibleEditorAssetItems` helper. Returned references preserve the existing cache-path mutation for visible assets in the render project copy. Hidden saved asset intent remains untouched, so unhiding it makes it eligible on a later render. Track kinds, visible source paths, security allowlist checks, redirect refusal and cache behavior are unchanged. This does NOT cap visible download size/time, sandbox downloads or establish sufficient export resources.

The three new pure tests import only Node test/assert and the inert selector. Complete test/helper files were inspected before direct execution. They cover hidden item/track exclusions, all visible media kinds/reference behavior and toggling visibility. Combined with four primary-video source-window tests,7 passed in0.254s. Server TypeScript check passed after correcting the helper's type constraint to support the existing nullable source_path contract. `git diff --check` passed. No application imports, network, filesystem preloading, FFmpeg, API, database or paid call was executed by these tests.

Static production wiring was inspected. There is no actual preloader/network execution or rendered-output proof in this milestone. Actual-output follow-through remains deferred under the no-media boundary;4K remains unqualified and its historical cause unresolved.
