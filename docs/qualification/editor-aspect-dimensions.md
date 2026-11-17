# Editor aspect design-canvas dimension repair

Pre-existing UI aspect callback only changed aspect_ratio, preserving old width/height. Backend partial save merged it unchanged. Actual square editor render encoded720x720 but graph validation expected720x1280 because stored design dimensions were1080x1920 with aspect1:1. Job failed OUTPUT_VALIDATION_FAILED.

Known canonical aspects now update design dimensions at UI change and backend canvas save through shared normalization. Other settings and tracks are preserved. Custom/unknown ratios remain unchanged. Three focused tests pass, both TypeScript checks pass. Real local UI save and editor API720p exports passed dimensions720x720,1280x720,720x1280 for1:1,16:9,9:16. Pixels inspected.

This does not close aspect roundtrip preview parity. Opening in a nonportrait aspect and returning to portrait without remount can retain stale/missing reframe plan. Reload refetches and restores correct full-source Fit in the tested case. Existing reframe effects depend only on clip identity. Fix needs saved-state invalidation, not a race-prone fetch before backend save. No live deployment or backup push. Backdrop color/edge approximation residuals remain separate.
