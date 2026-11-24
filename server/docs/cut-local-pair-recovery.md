# Cut-local Auto pair recovery

When a clip-wide automatic Split is rejected because unrelated shots do not share one pair, a current source-bound 9:16 Auto/Smart track can recover an individual measured two-subject shot. All other Fit segments stay unchanged. Manual choices, source freshness, layout policy, protected regions, embedded-camera/context and experimental-path guards remain final.

This is geometry-based recovery, not human-vs-animation, camera-role, identity or active-speaker verification. Recovered shots are marked Review. A game character can produce face/body detections. No universal no-game-split or complete podcast coverage is claimed.

## Runtime requirements

- Existing local OpenCV/Python environment that runs `server/python/smart_reframe.py`.
- Explicit `SMART_REFRAME_PERSON_MODEL` pointing to OpenCV Zoo NanoDet, SHA256 `4b82da9944b88577175ee23a459dce2e26e6e4be573def65b1055dc2d9720186` (3,800,954 bytes). Existing wrapper validates the hash and uses two OpenCV threads. See `server/python/third_party/nanodet/README.md` and LICENSE.
- Qualification used explicit `SMART_REFRAME_YUNET_MODEL`, threshold `.85`, and `SMART_REFRAME_HSV_CUTS=1`. YuNet SHA256 `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4`.
- No models are committed, fetched automatically or configured by this change. Without person measurements ordinary uploads keep the Fit fallback. Integration is not deployment configuration or provisioning.

The analyzer records the detectors actually run, sample counts and the fact that human/animation and active-speaker checks were not run. Current reframe responses expose this receipt in the framing panel. Old records without a receipt do not acquire one by inference.

## Qualification, 2026-11-24

- Mixed source 1280x720, source28.169..63.898,149samples. Only relative2.631..6.231 recovers Split. Seven other baseline segments deep-equal. Later real-pair scenes remain Fit. Fresh local analysis took about24seconds with configured models.
- Photoreal-game DEV: no qualified Split. Source has no natural detected cuts, so it does not exercise recovery's cut gate. Explicit synthetic cut stress at[10] and[4,8,12,16] also produced no Split. These are mutations, not natural-cut or independent-source evidence. Natural cut-bearing photoreal coverage remains unmeasured.
- Source-disjoint1080p real interview yielded zero faces at YuNet.85 and stayed Fit, a known recall miss. Same-family short real-pair control recovered Split, not independent podcast coverage.
- Fresh analyzer through persistence, actual reframe controller with local object HEAD validation, real editor creation, shared Pro caption windows and manual scene Fit save/reload passed in isolated fixture DB. Retained source was used. No fresh upload, speech recognition, provider or deployed-worker claim.
- Actual35.729second normal-selector and Pro-compiled picture renders inspected. Two people are top/bottom in the recovered shot; generated captions use the seam when active and sit below Fit picture elsewhere. Small side-padding differences and source-subtitle duplication/cropping remain. Pro caption overlay used a separate ASS pass and is not final typography proof.

Planner cache version: `normal-auto-cut-local-pair-v5`. Prior snapshots invalidated. Backup only; main/live are separate.
