# Text-shape measurement qualification

18 November 2026. Research only, no detector default activation or model bundling.

## Actual bounded measurements

The existing isolated DB text-shape worker uses the locally available model with SHA1 19543ce09b2efd35f49705c235cc46d0e22df30b and SHA256 62fce3a058ac519952062fbd2cf45bae661130ce753d2a0fc918f4776ba3a02a. No model was downloaded in this check.

Same 8-second screencast, fresh complete source analysis: about6.4s for this text-shape route versus about38s for the earlier OCR route. Different detectors, one fixture, not a general benchmark or semantic-equivalence result. Fifteen sampled frames,1125 rectangles, maximum unsampled gap0.533334s. Isolated worker peak RSS about535MB. Real EditorShell Auto, save/reload and normal queued export inspected; complete screen retained by the existing measured-context bridge. Text still small. This is not readable automatic tutorial focus.

The 12-second pair holdout produced zero text regions in17 sampled frames, maximum gap0.72s. Actual UI/direct export inspected: pair Split still present. Two sampled frames each on walking/pair also had zero text boxes, not a universal no-false-positive claim.

Basketball's two sampled detections per frame are wall logos, not action regions or basket understanding. Radio late5/6.5/7.5s shows lower-third text detections and a badge/logo; montage2/6s shows burned subtitles,10s has none. Source overlays inspected. Individual word boxes do not by themselves prove complete line coverage, relevance, legibility or continuous safety. No artifact with basketball source pixels is approved for redistribution.

## Deployment gate

The exact weight's proprietary-product licensing/redistribution basis is still unresolved. Official OpenCV documentation pins its SHA1 and describes English-text-only ICDAR2015 training, but does not supply an explicit weight license there. The originating repository has an open request for a license file. A historical OpenCV Zoo mirror states Apache2 for its directory, but its directory listing contains helper files and no weight artifact, so that statement has not been bound to the exact local model. Do not infer that the runtime library license licenses the model. No bundling or automatic activation until resolved or a clearly licensed replacement is qualified.

Official identity/scope: https://github.com/opencv/opencv/blob/master/doc/tutorials/dnn/dnn_text_spotting/dnn_text_spotting.markdown
Upstream license request: https://github.com/MhLiao/DB/issues/359
Historical mirror statement: https://huggingface.co/opencv/opencv_zoo/blob/ea63088db2fe3b2699c1df42df2199a18f29088e/models/text_detection_db/README.md

## Proposed bounded operational policy, not implemented

A single isolated text worker per process/host budget, sequential before face/person inference; source-geometry/duration/frame-count caps; pinned available model; explicit timeout/failure result; no runtime model download; source-bound sample times and incomplete-coverage metadata. Actual multi-worker memory and deploy environment headroom need checks before activation. A successful500MB worker is not proof the production worker can fit it. Higher resolution, other languages and arbitrary long clips remain unqualified.

No additional product code since1197ae0 / backup3d33d10. Automatic screen-role/target selection, sports action, active-speaker association, Auto Genre and no-edit complete clip acceptance remain unfinished. Do not spend further time tuning this exact detector to make one sample pass.

## Local evidence

Fresh screen UI vireo-context-screen-db-ui-1421 and queued job vireo-context-screen-db-job-1422; pair vireo-context-pair-db-ui-1423. Bounded sample manifests vireo-text-shape-bounded-1419.json, vireo-text-shape-negative-bounded-1421.json and vireo-text-shape-late-holdout-1425.json. Actual output MP4s and overlay images were inspected, not just metadata. These are manually bounded visual-source fixtures, not automatic selection/transcription proof.
