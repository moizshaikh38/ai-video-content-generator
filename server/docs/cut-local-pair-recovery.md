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

- Mixed source 1280x720, source28.169..63.898,149samples. Coarse relative2.631..6.231 and17.991..20.871 recover Split. With bounded existing cut refinement, these become2.431..6.151 and17.791..20.711. Refinement intentionally changes scene boundaries; unchanged baseline objects applies to the padding-only comparison, not refined timing. The latter shot removes overlapping synthetic padding only after every sampled face/body has one unique owner and all measured rectangles remain contained. The final pair scene remains Fit:16/26 samples have both faces, below the unchanged80% coverage guard. Fresh local analysis took about24seconds with configured models.
- Photoreal-game DEV: no qualified Split. Source has no natural detected cuts, so it does not exercise recovery's cut gate. Explicit synthetic cut stress at[10] and[4,8,12,16] also produced no Split. These are mutations, not natural-cut or independent-source evidence. Natural cut-bearing photoreal coverage remains unmeasured.
- Source-disjoint1080p real interview yielded zero faces at YuNet.85 and stayed Fit, a known recall miss. Same-family short real-pair control recovered Split, not independent podcast coverage.
- Fresh analyzer through persistence, actual reframe controller with local object HEAD validation, real editor creation, shared Pro caption windows and manual scene Fit save/reload passed in isolated fixture DB. Retained source was used. Actual isolated project/upload-grant/PUT/confirm/snapshot-download followed by fresh analysis and editor creation also passed with localhost storage and developer entitlement stub. Clip selection was a fixture. No speech recognition, provider, browser file-picker or deployed-worker claim.
- Actual35.729second normal-selector and Pro-compiled picture renders inspected. Two people are top/bottom in the recovered shot; generated captions use the seam when active and sit below Fit picture elsewhere. Small side-padding differences and source-subtitle duplication/cropping remain. Automatic caption windows align internal cuts to the picture renderer's cumulative30fps ticks and floor to ASS centiseconds, preventing the prior seam anchor from leaking onto the first new Fit frame. Item endpoints and explicit/manual positions remain unchanged. Pro caption overlay used a separate ASS pass and is not final typography proof.

Planner cache version: `normal-auto-refined-pair-bounded-v7`. Prior snapshots invalidated. Backup only; main/live are separate.

## Incremental timeline scope

Cut-local recovered splits are qualified only for one unedited source item, speed1, timeline0..duration and30fps. Edited, speed-changed, multi-item or transformed timelines receive an explicit automatic Fit fallback for these recovered splits; manual and other existing layout channels remain unchanged. Recovered shots carry explicit versioned provenance; missing timeline eligibility fails closed. Prior cache versions are invalidated. This scope is enforced again on hydrated plans and shared by Pro picture/caption resolution and live preview. New automatic caption-cut quantization is confined to that qualified timeline shape. General transformed-timeline source/frame clock work remains outstanding.

Ordinary explicit Auto now refines existing coarse cut candidates locally when duration<=60s, dimensions<=1920x1080, fps<=60 and candidate count<=30. It does not discover omitted cuts. Dense discovery still skips the35.729s source because its separate budget is30s. Independent fresh Python qualification produced the same seven refined boundaries in22.9s/209MiB; application proof before refinement used actual upload/controllers and fresh CV, while refined Pro proof applied actual refinement output to the persisted track.

Validation caveat: explicitAutoSplit.test.ts has three failing old expectations on exact d75 base as well as this delta (17pass/3fail). They are baseline failures, not silently marked fixed here.

Padding separation additionally requires refined evidence matching every current cut. Existing coarse-cut tracks retain their earlier recovery behavior until reanalysis, even after plan-cache invalidation. A cache refresh is not cut refinement.
