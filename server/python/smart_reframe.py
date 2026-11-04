#!/usr/bin/env python3
"""
Vireo Smart Reframe — Face Detection & Tracking Analyzer
Uses OpenCV Haar Cascade for local face detection.
No paid APIs. No biometric identification. No model downloads at runtime.

Input: JSON on stdin with { "videoPath": "...", "sampleFps": 4 }
Output: JSON on stdout with detected face samples per frame.

Invoked ONLY by Node.js backend via execFile — never by frontend.
"""

import sys
import json
import os
import cv2
import numpy as np


def load_cascades():
    """Load bundled Haar cascades for frontal and profile face detection."""
    frontal_path = os.path.join(cv2.data.haarcascades, 'haarcascade_frontalface_default.xml')
    profile_path = os.path.join(cv2.data.haarcascades, 'haarcascade_profileface.xml')
    if not os.path.isfile(frontal_path):
        raise RuntimeError(f"Frontal Haar cascade not found at {frontal_path}")
    frontal = cv2.CascadeClassifier(frontal_path)
    if frontal.empty():
        raise RuntimeError("Failed to load frontal Haar cascade classifier")

    profile = None
    if os.path.isfile(profile_path):
        p_cascade = cv2.CascadeClassifier(profile_path)
        if not p_cascade.empty():
            profile = p_cascade
    return frontal, profile


def compute_iou(boxA, boxB):
    """Compute Intersection over Union between two (x, y, w, h) boxes."""
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[0] + boxA[2], boxB[0] + boxB[2])
    yB = min(boxA[1] + boxA[3], boxB[1] + boxB[3])
    interW = max(0, xB - xA)
    interH = max(0, yB - yA)
    interArea = interW * interH
    if interArea <= 0:
        return 0.0
    boxAArea = boxA[2] * boxA[3]
    boxBArea = boxB[2] * boxB[3]
    unionArea = boxAArea + boxBArea - interArea
    return interArea / float(unionArea) if unionArea > 0 else 0.0


def apply_nms(detections, iou_thresh=0.35):
    """
    Deduplicate face detections using IoU non-maximum suppression.
    Each item: dict with { "rect": (x, y, w, h), "confidence": float, "is_frontal": bool }
    """
    if not detections:
        return []
    # Sort primarily by is_frontal (True first), then by confidence desc
    sorted_dets = sorted(detections, key=lambda d: (d["is_frontal"], d["confidence"]), reverse=True)
    kept = []
    for candidate in sorted_dets:
        boxC = candidate["rect"]
        overlap = False
        for k in kept:
            if compute_iou(boxC, k["rect"]) > iou_thresh:
                overlap = True
                break
        if not overlap:
            kept.append(candidate)
    return kept


def compute_mouth_score(gray, prev_gray, face_box, prev_box):
    """
    Measures normalized mouth aperture and speech activity score (0.0 to 1.0).
    Uses mouth ROI vs forehead/eye ROI delta so whole-head movement is canceled out.
    """
    ih, iw = gray.shape
    x, y, w, h = face_box

    # Lower-central mouth ROI (58% to 92% of face height)
    mx1 = max(0, min(iw - 1, int(x + 0.22 * w)))
    mx2 = max(mx1 + 1, min(iw, int(x + 0.78 * w)))
    my1 = max(0, min(ih - 1, int(y + 0.58 * h)))
    my2 = max(my1 + 1, min(ih, int(y + 0.92 * h)))

    # Upper forehead/eye ROI (12% to 42% of face height)
    fx1 = max(0, min(iw - 1, int(x + 0.22 * w)))
    fx2 = max(fx1 + 1, min(iw, int(x + 0.78 * w)))
    fy1 = max(0, min(ih - 1, int(y + 0.12 * h)))
    fy2 = max(fy1 + 1, min(ih, int(y + 0.42 * h)))

    mouth_roi = gray[my1:my2, mx1:mx2]
    forehead_roi = gray[fy1:fy2, fx1:fx2]
    if mouth_roi.size == 0 or forehead_roi.size == 0:
        return 0.0

    m_grid = cv2.resize(mouth_roi, (24, 16)).astype(np.float32)
    f_grid = cv2.resize(forehead_roi, (24, 16)).astype(np.float32)

    # Intra-frame vertical gradient in mouth (lip aperture / opening)
    m_sobel_y = np.abs(cv2.Sobel(m_grid, cv2.CV_32F, 0, 1, ksize=3))
    sobel_energy = float(np.mean(m_sobel_y))

    temporal_delta = 0.0
    if prev_gray is not None and prev_box is not None:
        px, py, pw, ph = prev_box
        pmx1 = max(0, min(iw - 1, int(px + 0.22 * pw)))
        pmx2 = max(pmx1 + 1, min(iw, int(px + 0.78 * pw)))
        pmy1 = max(0, min(ih - 1, int(py + 0.58 * ph)))
        pmy2 = max(pmy1 + 1, min(ih, int(py + 0.92 * ph)))

        pfx1 = max(0, min(iw - 1, int(px + 0.22 * pw)))
        pfx2 = max(pfx1 + 1, min(iw, int(px + 0.78 * pw)))
        pfy1 = max(0, min(ih - 1, int(py + 0.12 * ph)))
        pfy2 = max(pfy1 + 1, min(ih, int(py + 0.42 * ph)))

        p_m_roi = prev_gray[pmy1:pmy2, pmx1:pmx2]
        p_f_roi = prev_gray[pfy1:pfy2, pfx1:pfx2]
        if p_m_roi.size > 0 and p_f_roi.size > 0:
            pm_grid = cv2.resize(p_m_roi, (24, 16)).astype(np.float32)
            pf_grid = cv2.resize(p_f_roi, (24, 16)).astype(np.float32)

            m_diff = float(np.mean(np.abs(m_grid - pm_grid)))
            f_diff = float(np.mean(np.abs(f_grid - pf_grid)))
            # Subtract forehead motion so head bobbing / camera panning is canceled
            temporal_delta = max(0.0, m_diff - 0.7 * f_diff)

    # Combined normalized score (0.0 - 1.0)
    score = (0.6 * min(1.0, temporal_delta / 18.0)) + (0.4 * min(1.0, sobel_energy / 80.0))
    return round(float(np.clip(score, 0.0, 1.0)), 3)


def analyze_video(video_path: str, sample_fps: float = 4.0, start_sec: float = 0.0, duration_sec: float = 0.0):
    """
    Sample frames from video and detect faces within [start_sec, start_sec + duration_sec].
    Returns normalized face bounding boxes, mouth_scores, and lightweight scene cuts.
    """
    if not os.path.isfile(video_path):
        raise FileNotFoundError(f"Video file not found: {video_path}")

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    source_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    source_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    source_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_video_duration = frame_count / source_fps if source_fps > 0 else 0

    if frame_count <= 0 or source_width <= 0 or source_height <= 0:
        cap.release()
        raise RuntimeError("Invalid video dimensions or frame count")

    # Clamp start_sec and compute start_frame / end_frame
    start_sec = max(0.0, min(total_video_duration, start_sec))
    start_frame = int(round(start_sec * source_fps))

    if duration_sec > 0:
        effective_duration = min(duration_sec, total_video_duration - start_sec)
    else:
        effective_duration = total_video_duration - start_sec
    end_frame = min(frame_count, start_frame + int(round(effective_duration * source_fps)))

    # Calculate frame sampling interval
    effective_sample_fps = min(sample_fps, source_fps)
    frame_interval = max(1, int(round(source_fps / effective_sample_fps)))

    frontal_cascade, profile_cascade = load_cascades()

    samples = []
    scene_cuts = []
    frame_index = start_frame
    max_samples = 600  # Safety cap

    prev_gray = None
    prev_face_boxes = []  # List of (x, y, w, h) from previous frame
    prev_hist = None

    min_size = (int(source_width * 0.04), int(source_height * 0.04))

    while len(samples) < max_samples and frame_index < end_frame:
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
        ret, frame = cap.read()
        if not ret:
            break

        time_sec = round((frame_index - start_frame) / source_fps, 3)
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        # 1. Fast scene cut detection via normalized histogram correlation
        hist = cv2.calcHist([gray], [0], None, [32], [0, 256])
        cv2.normalize(hist, hist, alpha=0, beta=1, norm_type=cv2.NORM_MINMAX)
        if prev_hist is not None:
            correl = float(cv2.compareHist(prev_hist, hist, cv2.HISTCMP_CORREL))
            if correl < 0.50 and time_sec > 0.4:
                # Add scene cut if not within 1.0s of previous detected cut
                if not scene_cuts or (time_sec - scene_cuts[-1]) >= 1.0:
                    scene_cuts.append(time_sec)
        prev_hist = hist

        # 2. Multi-Cascade detection: Frontal face
        raw_candidates = []
        try:
            f_rects, _, f_weights = frontal_cascade.detectMultiScale3(
                gray, scaleFactor=1.1, minNeighbors=5, minSize=min_size, flags=cv2.CASCADE_SCALE_IMAGE, outputRejectLevels=True
            )
            for (x, y, w, h), w_val in zip(f_rects, f_weights):
                conf = min(0.98, max(0.65, 0.65 + float(w_val) / 25.0))
                raw_candidates.append({
                    "rect": (int(x), int(y), int(w), int(h)),
                    "confidence": round(conf, 2),
                    "is_frontal": True
                })
        except Exception:
            f_rects = frontal_cascade.detectMultiScale(
                gray, scaleFactor=1.1, minNeighbors=5, minSize=min_size, flags=cv2.CASCADE_SCALE_IMAGE
            )
            for (x, y, w, h) in f_rects:
                raw_candidates.append({
                    "rect": (int(x), int(y), int(w), int(h)),
                    "confidence": 0.85,
                    "is_frontal": True
                })

        # Fallback to histogram equalized image if no frontal face detected in low-contrast conditions
        if len(raw_candidates) == 0:
            eq_gray = cv2.equalizeHist(gray)
            f_eq_rects = frontal_cascade.detectMultiScale(
                eq_gray, scaleFactor=1.1, minNeighbors=4, minSize=min_size, flags=cv2.CASCADE_SCALE_IMAGE
            )
            for (x, y, w, h) in f_eq_rects:
                raw_candidates.append({
                    "rect": (int(x), int(y), int(w), int(h)),
                    "confidence": 0.78,
                    "is_frontal": True
                })

        # 3. Profile face cascade on side angles (normal + flipped)
        if profile_cascade is not None:
            # Normal profile (facing right)
            p_rects = profile_cascade.detectMultiScale(
                gray, scaleFactor=1.1, minNeighbors=5, minSize=min_size, flags=cv2.CASCADE_SCALE_IMAGE
            )
            for (x, y, w, h) in p_rects:
                raw_candidates.append({
                    "rect": (int(x), int(y), int(w), int(h)),
                    "confidence": 0.80,
                    "is_frontal": False
                })

            # Flipped profile (facing left)
            flipped_gray = cv2.flip(gray, 1)
            flip_p_rects = profile_cascade.detectMultiScale(
                flipped_gray, scaleFactor=1.1, minNeighbors=5, minSize=min_size, flags=cv2.CASCADE_SCALE_IMAGE
            )
            for (fx, fy, fw, fh) in flip_p_rects:
                unflipped_x = source_width - (int(fx) + int(fw))
                raw_candidates.append({
                    "rect": (unflipped_x, int(fy), int(fw), int(fh)),
                    "confidence": 0.80,
                    "is_frontal": False
                })

        # 4. IoU Non-Maximum Suppression (0.35 IoU threshold)
        deduped = apply_nms(raw_candidates, iou_thresh=0.35)

        # 5. Extract mouth_score and normalize
        face_list = []
        curr_face_boxes = []

        for item in deduped:
            x, y, w, h = item["rect"]
            curr_face_boxes.append((x, y, w, h))

            # Match with nearest previous face box for temporal mouth diff
            prev_match = None
            best_dist = float('inf')
            cx = x + w / 2.0
            cy = y + h / 2.0
            for pbox in prev_face_boxes:
                pcx = pbox[0] + pbox[2] / 2.0
                pcy = pbox[1] + pbox[3] / 2.0
                dist = np.hypot(cx - pcx, cy - pcy)
                if dist < (w * 0.8) and dist < best_dist:
                    best_dist = dist
                    prev_match = pbox

            mouth_score = compute_mouth_score(gray, prev_gray, (x, y, w, h), prev_match)

            nx = round(x / source_width, 4)
            ny = round(y / source_height, 4)
            nw = round(w / source_width, 4)
            nh = round(h / source_height, 4)
            area = round(nw * nh, 6)
            norm_cx = round(cx / source_width, 4)
            norm_cy = round(cy / source_height, 4)

            face_list.append({
                "x": nx,
                "y": ny,
                "width": nw,
                "height": nh,
                "center_x": norm_cx,
                "center_y": norm_cy,
                "area": area,
                "confidence": item["confidence"],
                "mouth_score": mouth_score
            })

        samples.append({
            "time": time_sec,
            "faces": face_list
        })

        prev_gray = gray
        prev_face_boxes = curr_face_boxes

        frame_index += frame_interval
        if frame_index >= frame_count:
            break

    cap.release()

    return {
        "source_width": source_width,
        "source_height": source_height,
        "source_fps": round(source_fps, 2),
        "duration": round(effective_duration, 3),
        "total_video_duration": round(total_video_duration, 3),
        "sample_fps": round(effective_sample_fps, 2),
        "sample_count": len(samples),
        "scene_cuts": scene_cuts,
        "samples": samples
    }


def main():
    try:
        raw_input = sys.stdin.read()
        params = json.loads(raw_input)

        video_path = params.get("videoPath", "")
        sample_fps = float(params.get("sampleFps", 4.0))
        start_sec = float(params.get("startSec", 0.0))
        duration_sec = float(params.get("durationSec", 0.0))

        # Validate input — only accept an existing file path
        if not video_path or not isinstance(video_path, str):
            raise ValueError("Missing or invalid videoPath")
        if not os.path.isfile(video_path):
            raise FileNotFoundError(f"Video not found: {video_path}")

        # Clamp sample FPS
        sample_fps = max(1.0, min(10.0, sample_fps))
        start_sec = max(0.0, start_sec)
        duration_sec = max(0.0, duration_sec)

        result = analyze_video(video_path, sample_fps, start_sec, duration_sec)

        # Output structured JSON
        print(json.dumps({"status": "ok", **result}))

    except Exception as e:
        error_result = {
            "status": "error",
            "error_code": type(e).__name__,
            "error_message": str(e)
        }
        print(json.dumps(error_result))
        sys.exit(1)


if __name__ == "__main__":
    main()

