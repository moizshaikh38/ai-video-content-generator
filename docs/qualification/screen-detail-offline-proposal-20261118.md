# Offline overview plus detail screen proposal

18 November2026. Review candidate only. No product import, API/EditorShell hook or default activation. Independent measured-image/region logic; no Recordly code copied.

## Source and proposal

Existing8s960x540 screencast source with normal measured OCR track. Validate source SHA before use. At4samples/s compare blurred480x270source to an unchanged baseline. Large/global changes reset the reference. A bounded change component must dominate changed-pixel mass and overlap at least3measured text-region candidates, with neighboring stable location. This proposes a detail rectangle only when explicitly treating the input as screen-role review. It does not establish screen role, click target, semantic importance or meaningful action. Motion/text are insufficient to classify a video as ScreenShare.

Raw proposals appear during the opened search menu, with a gap around4.5s. Full-source overview plus enlarged detail render made text visibly larger, but actual moving output exposed the pane flicker. That first candidate is not acceptable for product integration.

An offline episode pass groups proposals only with rectangleIoU>=.8, gap<=.75s and no intervening global reset or near-zero-change frame. It bridges at most.5s missing detections, requires.75s admitted span, and uses the measured episode rectangle union to avoid per-sample crop jitter. This is offline lookahead, not real-time cursor tracking. It can be wrong about activity during a gap; no semantic guarantee follows.

Final screen episode3.0-7.0s uses normalized boxx.06458,y.10833,width.53021,height.50926. Detail linear scale is about1.886x the full overview at the same720px width. The whole source remains in a fixed720x405overview near the top at all times, detail appears below only during the episode. The source menu closes at7s, and the final refresh/global-change source frame has no detail. Black empty canvas and abrupt detail entrance/exit remain rough design, not final editor styling.

## Actual visual checks

- Source contact frames inspected.
- Raw candidate rectangle overlay and moving offline output inspected, flicker found and retained as failure.
- Final8s720x1280review MP4 and exact4.5s pixels inspected. Overview stays in fixed position. Detail text larger and menu visible through the raw gap, not proof of readable text on every phone or full OCR detection.
- Decoded every final output frame for detail-pane presence:240frames,120with detail, exactly two state transitions at frames90and210, or3.0and7.0s. This verifies pane presence cadence, not camera comfort/semantic correctness. No repeated detail-pane dropout in this fixture.
- Entire12s pair and8.008s radio inputs with their real OCR tracks yield no proposal episodes. The earlier preliminary pair check covered only8s; full12s rerun now explicit.

Local artifacts vireo-screen-review-proposal-1534(raw/flicker), vireo-screen-review-stable-1535(final), vireo-screen-review-pair-fullnegative-1536 and vireo-screen-review-radio-fullnegative-1537. Existing originals and evidence retained. Final render's disposable intermediate is deleted only after successful H264 conversion; no other media cleanup. Disk247MBfree, no dependency install or paid/provider call.

## Reproduction and limits

screen-detail-review.py NEW_OUTPUT SOURCE_MP4 NORMAL_TRACK_JSON [--render]. Requires existing CVenvironment,NumPy/OpenCV andffmpeg. No model/network calls. Max12source seconds. Source hash checked, proposal JSON/overlay emitted, optional silent overview/detail MP4. It is a standalone offline fixture, not the real renderer, UI/save/reload or queued-export proof. It does not use source audio/transcript intent.

Keep it out of Auto until role ownership, source/context constraints, motion design, false-positive screen/video/animation/scroll negatives and actual UI/queued-export behavior are qualified. Further concerns: text boxes can be incomplete; baseline differences can confuse scrolling or dynamic imagery; narrow region changes may be irrelevant; text input suggestions can be transient; offscreen actions/audio goals remain unknown. Full overview keeps pixels but small text can still be unreadable. Screen-role classification and publish-ready automatic selection remain unfinished.

Source already inspected: https://github.com/narakeet/examples/blob/master/screencast-demo-video/screencast.mp4 . This is a review of an existing qualification source, not a new claim about the source vendor or implementation.

## Broader bounded checks,14:46IST

No threshold changes. Fresh actual analyzer calls with bounded automatic OCR requested produced:

| Source window | Successful OCR samples | Measured text regions | Detail episodes |
| --- | ---: | ---: | ---: |
| Same screencast, later30-38s |15|156|0|
| Existing podium8s source |12|0|0|
| Existing edited speech/title-card, first8s of private derivative |16|17|0|
| Controlled vertical translation of later-screen pixels,180px over8s |15|130|0|

Source/overlay boards inspected. No observed detail false-positive on these inputs, but not a role-classifier score or independent accuracy estimate. The controlled vertical translation is synthetic stress, not natural scrolling. Zero episodes in scrolling and the later screen also means no useful detail behavior there, so this does not qualify recall/readability. Full source overview fallback remains necessary. Podcast pair/radio negatives do not exhaust non-screen dynamic text, animation, game HUD, cursor noise, picture-in-picture, rapid transitions or unrelated popup cases.

Artifacts vireo-screen-proposal-holdout-1546 and vireo-screen-scroll-stress-1547. Reproduction scripts screen-detail-source-negatives.py NEW_OUTPUT and screen-detail-scroll-stress.py NEW_OUTPUT invoke the existing actual analyzer with local paths/models/CVenvironment and no providers; the stress script expects the preserved later-screen derivative under the first artifact directory. Both are qualification-only with local preconditions, not portable product tests. Source hash checked before the proposal consumer. Current source derivative files are bounded8s, not full4K. Added media/data about4MB in this check; free241MB, no install. No product/default/UI/queued-render integration or screen Auto acceptance.
