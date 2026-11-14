#!/usr/bin/env python3
"""Evaluate YuNet vs the repo's Haar pipeline on the 4-clip regression corpus.
Same sampling (4fps) as smart_reframe.py. Prints per-clip stats as JSON.
Model: opencv_zoo face_detection_yunet_2023mar.onnx (MIT, OpenCV team).
"""
import sys, os, json
import cv2

MODEL = '/tmp/realmedia/models/face_detection_yunet_2023mar.onnx'

def analyze(video_path, sample_fps=4.0, score_thresh=0.9):
    cap = cv2.VideoCapture(video_path)
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)); h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    det = cv2.FaceDetectorYN_create(MODEL, '', (w, h), score_thresh, 0.3, 5000)
    interval = max(1, int(round(src_fps / sample_fps)))
    frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    samples, positives, dets = 0, 0, []
    fi = 0
    while fi < frames:
        cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
        ret, frame = cap.read()
        if not ret:
            break
        t = round(fi / src_fps, 3)
        _, faces = det.detect(frame)
        n = 0 if faces is None else len(faces)
        samples += 1
        if n: positives += 1
        if faces is not None:
            for f in faces:
                x, y, fw, fh = f[:4]
                score = float(f[-1])
                dets.append({'t': t, 'cx': round(float((x + fw/2) / w), 4),
                             'cy': round(float((y + fh/2) / h), 4),
                             'w': round(float(fw / w), 4), 'h': round(float(fh / h), 4),
                             'score': round(float(score), 3)})
        fi += interval
    cap.release()
    return {'clip': os.path.basename(video_path), 'samples': samples,
            'positive': positives, 'rate': round(positives / max(samples, 1), 3),
            'detections': len(dets), 'dets': dets}

if __name__ == '__main__':
    out = []
    for p in sys.argv[1:]:
        out.append(analyze(p))
        r = out[-1]
        print(json.dumps({k: v for k, v in r.items() if k != 'dets'}), flush=True)
    with open('/tmp/realmedia/yunet_dets.json', 'w') as f:
        json.dump(out, f)
