# Animation Auto negative and preview repair

Source: BigBuckBunny120-132s,1280x720,12s at24fps. Retrieved via current README https://github.com/video-commander/public-test-streams/blob/main/README.md linking https://uploads.video-commander.com/sample/BigBuckBunny.mp4 . Manually specified interval, not automatic selection or genre. Source and ordinary actual outputs inspected.

Ordinary fresh analyzer reported zero cuts, two cartoonface tracks, dominant score.646. Its legacy facecenter crosses unrelated animal/tree/bunny shots. Actual normaljob badly crops some animals and misses context. This remains a failing holdout, not a new quality pass. Source audio kept in actualjobs but not independently speech/accuracy qualified; side-by-side comparisons silent. Local auth/entitlement/storage adapters, captions off, no provider call.

Existing SMART_REFRAME_DENSE_CUTS review flag finds0.916667/3.5/6.916667s, each with1/24s frameuncertainty. Independent fresh analyzer+UI+normaljob with that flag yields scene-local4:3Fit, showing more animals/butterfly/context at smaller sharp size. Side crop still exists, no semantic/allcontent safety claim. No detector/default switch made. Ordinary failure retained.

## Preview-only mismatch

Initial ordinary UI0 invented4:3Fit while actualjob0 followed a usable legacy camera path to a tight owl portrait. PreviewCanvas created its fallback whenever no shotplan existed, even with legacykeyframes. It now invents reviewFit only if explicitAuto has neither shotplan, legacy camera nor groupcamera. Missing-evidence fallback stays. Manual/sceneplan precedence stays. Fresh actualUI0 now shows tight owl portrait like unchanged export0. This repairs misleading preview, not missedcuts/cropquality. OldUI, badexport and optionaldense-review outputs retained separately.

31 focusedtests and front/backendtypes pass; expanded143pass/0fail; safe421pass/0fail/1skip. No production release, provider call, OCR/HUD activation, full4K attempt or claim of allgenrescomplete.
