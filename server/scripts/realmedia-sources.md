# Real-media test corpus (local audit only, not shipped)

Clips live in /tmp/realmedia on the audit machine (gitignored by location, not committed).
All are Blender Foundation open movies, Creative Commons Attribution 3.0/4.0.

| Clip | Window used | Source | License |
|------|-------------|--------|---------|
| Sintel | 10s, 1280x544 | https://test-videos.co.uk/vids/sintel/mp4/h264/720/Sintel_720_10s_1MB.mp4 | CC BY 3.0 (Blender Foundation) |
| Big Buck Bunny | 10s, 1280x720 | https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4 | CC BY 3.0 (Blender Foundation) |
| Tears of Steel (two-shot) | film t=30-39s, 1728x720 | HLS https://s.fastmotion.io/cd7ec8f0-3136-41cd-bb8b-117edb7cda39/playlist.m3u8 via https://fastmotion.io/free-test-videos/tears-of-steel | CC BY 3.0 (Blender Foundation) |
| Tears of Steel (talking head) | film t=420-429s, 1728x720 | same stream | CC BY 3.0 (Blender Foundation) |

Reproduce:

    # download
    curl -L -o /tmp/realmedia/Sintel_720_10s_1MB.mp4 'https://test-videos.co.uk/vids/sintel/mp4/h264/720/Sintel_720_10s_1MB.mp4'
    curl -L -o /tmp/realmedia/Big_Buck_Bunny_720_10s_1MB.mp4 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4'
    ffmpeg -ss 30  -i 'https://s.fastmotion.io/cd7ec8f0-3136-41cd-bb8b-117edb7cda39/playlist.m3u8' -t 14 -c copy /tmp/realmedia/tos-30-44.mp4
    ffmpeg -ss 420 -i 'https://s.fastmotion.io/cd7ec8f0-3136-41cd-bb8b-117edb7cda39/playlist.m3u8' -t 16 -c copy /tmp/realmedia/tos-420-436.mp4
    ffmpeg -ss 0 -i /tmp/realmedia/tos-30-44.mp4  -t 9 -c:v libx264 -crf 20 -c:a aac /tmp/realmedia/tos-twoshot.mp4
    ffmpeg -ss 0 -i /tmp/realmedia/tos-420-436.mp4 -t 9 -c:v libx264 -crf 20 -c:a aac /tmp/realmedia/tos-talkinghead.mp4

    # analyze + emit ffmpeg crop filter (from server/)
    FILTER_OUT=/tmp/realmedia/filter.txt npx tsx scripts/realmedia-reframe.ts /tmp/realmedia/<clip>.mp4
    ffmpeg -i /tmp/realmedia/<clip>.mp4 -filter_complex_script /tmp/realmedia/filter.txt -c:v libx264 -crf 20 -c:a aac /tmp/realmedia/<clip>-reframed.mp4

dump-detections.ts prints every raw detection (time, box, confidence) for a clip.

## YuNet detector candidate (experimental, env-gated)

- Model: face_detection_yunet_2023mar.onnx (232 KB), OpenCV team, opencv_zoo, MIT license.
  URL: https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx
  Local path on audit machine: /tmp/realmedia/models/face_detection_yunet_2023mar.onnx (not committed; re-download from URL).
- Activation: SMART_REFRAME_YUNET_MODEL=<model path> (+ optional SMART_REFRAME_YUNET_THRESHOLD, default 0.6).
  When set, smart_reframe.py uses YuNet INSTEAD of the Haar cascades - Haar never runs per-frame, so no-face
  false positives cannot silently return. Default (env unset) is the unchanged Haar behavior.
- YuNet scores are detector scores, not calibrated probabilities; detection-positive rates here are sample
  rates, not recall/precision (no labeled ground truth).
- Threshold sweep + full-chain A/B results: /tmp/realmedia/yunet-sweep-notes.md on the audit machine.
- Eval script: server/scripts/yunet_eval.py (runs YuNet over a clip at 4 fps, prints per-clip stats).

## Held-out clip (Nov 15, not used for any threshold/parameter choice)

- tos-heldout.mp4: Tears of Steel (Blender Foundation, CC BY 3.0), t=200-212s via the
  same HLS playlist as above. Real humans: sniper close-up (off-center), interior
  three-person scene, console/machine segments. True cuts frame-verified at ~1.25s,
  ~6.75s, ~8.75s. Note: t=600-610s of this film is the end-credit title cards - unusable.
- Held-out results: HSV cut flag detected 3/3 true cuts, zero false positives
  (default gray path detected 1/3). YuNet flag retained the off-center sniper's face
  where the default lost him; interior segment equivalent across configs; YuNet
  console-segment framing at t7.5 is a tight blurry crop (sub-optimal, no face in source).
