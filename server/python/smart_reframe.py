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
import subprocess
import re
import cv2
import numpy as np
from detector_geometry import visible_detector_rect
from sample_clock import sample_relative_time


SHORT_AUTO_MAX_DURATION_SECONDS = 180
SHORT_AUTO_MAX_PIXEL_FRAMES = 1800*1920*1080


def short_auto_cut_budget(duration, width, height, fps):
    # Decode-work proxy (not a measured resource bound): frames x pixels may not exceed
    # 1800 frames of 1920x1080 and duration <= 180s. Every input the old 60s/1800-frame
    # rule accepted is still accepted; lower-resolution longer sources now qualify.
    return all(np.isfinite(v) for v in [duration,width,height,fps]) and 0 < duration <= SHORT_AUTO_MAX_DURATION_SECONDS and 0 < width <= 1920 and 0 < height <= 1080 and 0 < fps <= 60 and duration*fps*width*height <= SHORT_AUTO_MAX_PIXEL_FRAMES


def short_auto_refine_budget(duration,width,height,fps,count):
    return all(np.isfinite(v) for v in [duration,width,height,fps,count]) and 0 < duration <= 60 and 0 < width <= 1920 and 0 < height <= 1080 and 0 < fps <= 60 and 0 < count <= 30


def discover_dense_scene_cuts(video_path, start_sec, duration_sec, source_fps):
    """Opt-in frame-level visual discontinuities, not semantic scene proof.

    Decode sequentially into a small analysis image. Unlike sparse color
    histograms this can discover rapid cuts between similarly colored shots.
    A false boundary only separates windows; it must not authorize a crop.
    """
    if duration_sec <= 0 or duration_sec > 180:
        return []  # Bounded qualification candidate, no unbounded source pass.
    run = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'info', '-threads', '2',
                          '-ss', str(start_sec), '-i', video_path, '-t', str(duration_sec),
                          '-an', '-vf', "scale=320:-1,select='gt(scene,0.28)',showinfo",
                          '-f', 'null', '-'], capture_output=True, text=True, timeout=45,
                         check=True)
    # showinfo uses limited decimal precision; snap CFR frame evidence onto
    # the same source-frame/requested-trim clock as sampled detections.
    times = sorted(set(sample_relative_time(round((start_sec+float(t))*source_fps),source_fps,start_sec)
                       for t in re.findall(r'pts_time:([0-9.]+)', run.stderr)))
    selected = []
    for t in times:
        if .04 < t < duration_sec-.04 and (not selected or t-selected[-1] >= .16):
            selected.append(t)
    return [{"time": round(t, 6), "coarse_time": round(t, 6), "refined": True,
             "uncertainty_seconds": round(1/source_fps, 6), "method": "dense-luma-discontinuity"}
            for t in selected]


def refine_scene_cuts(video_path, coarse_cuts, start_sec, sample_interval, source_fps):
    """Local frame-accurate refinement, only around already-detected cuts.

    Color histograms are discovery evidence, not proof of a semantic shot.
    Keep this opt-in and retain coarse timestamps and frame uncertainty.
    """
    cap = cv2.VideoCapture(video_path)
    results = []
    fps = float(source_fps)
    if not cap.isOpened() or fps <= 0:
        cap.release()
        return [{"time": float(t), "coarse_time": float(t), "refined": False} for t in coarse_cuts]
    for coarse in coarse_cuts:
        # Sample times mark the first sampled frame after a change. Inspect
        # its preceding interval plus one frame on either side, not the clip.
        lo = max(int(round(start_sec * fps)), int(np.floor((start_sec + coarse - sample_interval) * fps)) - 1)
        hi = int(np.ceil((start_sec + coarse) * fps)) + 1
        cap.set(cv2.CAP_PROP_POS_FRAMES, lo)
        previous = None
        best = None
        for frame_no in range(lo, hi + 1):
            ok, frame = cap.read()
            if not ok:
                break
            frame = cv2.resize(frame, (320, 180))
            hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
            hist = cv2.calcHist([hsv], [0, 1], None, [24, 24], [0, 180, 0, 256])
            cv2.normalize(hist, hist, 0, 1, cv2.NORM_MINMAX)
            if previous is not None:
                correlation = float(cv2.compareHist(previous, hist, cv2.HISTCMP_CORREL))
                if best is None or correlation < best[0]:
                    best = (correlation, frame_no)
            previous = hist
        if best is None:
            results.append({"time": float(coarse), "coarse_time": float(coarse), "refined": False})
        else:
            results.append({"time": round(best[1] / fps - start_sec, 6),
                            "coarse_time": float(coarse), "refined": True,
                            "uncertainty_seconds": round(1 / fps, 6),
                            "correlation": round(best[0], 6)})
    cap.release()
    return results


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
        return 0.0, 0.0, 0.0

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
    temporal_norm = min(1.0, temporal_delta / 18.0)
    static_norm = min(1.0, sobel_energy / 80.0)
    score = (0.6 * temporal_norm) + (0.4 * static_norm)
    return round(float(np.clip(score, 0.0, 1.0)), 3), round(temporal_norm, 3), round(static_norm, 3)


def analyze_video(video_path: str, sample_fps: float = 4.0, start_sec: float = 0.0, duration_sec: float = 0.0, max_samples: int = 600, discover_short_auto_cuts: bool = False, discover_short_auto_text: bool = False):
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
    import math
    requested_interval = max(1, int(round(source_fps / effective_sample_fps)))
    total_frames = max(1, end_frame - start_frame)
    if max_samples > 0 and (total_frames / requested_interval) > max_samples:
        frame_interval = max(requested_interval, int(math.ceil(total_frames / max_samples)))
    else:
        frame_interval = requested_interval

    # Separate model lifetime: finish the bounded text pass before allocating
    # face/person nets. This avoids retaining both activation pools together.
    geometry_result = None
    geometry_model = os.environ.get('SMART_REFRAME_TEXT_GEOMETRY_MODEL','')
    if geometry_model:
        from source_text_geometry import collect_isolated
        indices=[];last=-1.0
        for index in list(range(start_frame,end_frame,frame_interval))[:max_samples]:
            time=sample_relative_time(index,source_fps,start_sec)
            if time-last>=.49:indices.append(index);last=time
        cap.release()
        geometry_result=collect_isolated(video_path,geometry_model,indices,source_fps,start_sec,effective_duration)
        cap=cv2.VideoCapture(video_path)
        if not cap.isOpened():raise RuntimeError('Cannot reopen source after text pass')

    frontal_cascade, profile_cascade = load_cascades()

    # Optional YuNet DNN detector (env-gated): real detection scores, no new service.
    yunet_detector = None
    yunet_model = os.environ.get('SMART_REFRAME_YUNET_MODEL', '')
    if yunet_model:
        # Explicit opt-in: never silently fall back to Haar (that would quietly
        # reintroduce Haar's no-face false positives). Fail loudly instead.
        if not hasattr(cv2, 'FaceDetectorYN_create'):
            print("ERROR: SMART_REFRAME_YUNET_MODEL set but this OpenCV build lacks "
                  "cv2.FaceDetectorYN_create (requires opencv-python >= 4.5.4).", file=sys.stderr)
            sys.exit(2)
        if not os.path.isfile(yunet_model):
            print("ERROR: SMART_REFRAME_YUNET_MODEL set but model file not found: %s" % yunet_model, file=sys.stderr)
            sys.exit(2)
        try:
            yunet_detector = cv2.FaceDetectorYN_create(
                yunet_model, '', (source_width, source_height),
                float(os.environ.get('SMART_REFRAME_YUNET_THRESHOLD', '0.6')), 0.3, 5000
            )
        except Exception as exc:
            print("ERROR: failed to load YuNet model %s: %s" % (yunet_model, exc), file=sys.stderr)
            sys.exit(2)

    person_detector = None
    person_model = os.environ.get('SMART_REFRAME_PERSON_MODEL', '')
    if person_model:
        from person_regions import PersonRegions
        person_detector = PersonRegions(person_model)

    ocr_sample_times = []
    from auto_text_budget import AutoTextBudget
    auto_text=AutoTextBudget(discover_short_auto_text,effective_duration,source_width,source_height,source_fps)

    samples = []
    protected_content_regions = []
    last_text_sample = -1.0
    last_general_text_sample = -1.0
    word_region_samples = []
    text_geometry_sample_times = []
    if geometry_result:
        for sample in geometry_result["samples"]:
            text_geometry_sample_times.append(sample["time"])
            for region in sample["regions"]:
                protected_content_regions.append({**region,"start":max(0,sample["time"]-.3),"end":min(effective_duration,sample["time"]+.8)})
    scene_cuts = []
    frame_index = start_frame
    # max_samples enforced via parameter and uniform interval decimation

    prev_gray = None
    prev_face_boxes = []  # List of (x, y, w, h) from previous frame
    prev_hist = None
    prev_hsv_hist = None
    hsv_cuts_enabled = os.environ.get('SMART_REFRAME_HSV_CUTS', '') == '1'

    min_size = (int(source_width * 0.04), int(source_height * 0.04))

    # Qualification opt-in: same exact sample indices/pixels, fewer GOP seeks.
    reader = None
    if os.environ.get('SMART_REFRAME_SEQUENTIAL_DECODE') == '1':
        from sparse_frame_reader import SparseFrameReader
        reader = SparseFrameReader(cap)
    while len(samples) < max_samples and frame_index < end_frame:
        if reader is not None:
            ret, frame = reader.read_at(frame_index)
        else:
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
            ret, frame = cap.read()
        if not ret:
            break

        time_sec = sample_relative_time(frame_index, source_fps, start_sec)
        if os.environ.get('SMART_REFRAME_SOURCE_CLOCK_TEXT', '') == '1' and time_sec-last_text_sample>=.49:
            from source_overlay_text import clock_overlay
            for region in clock_overlay(frame):
                protected_content_regions.append({**region,'start':max(0,time_sec-.3),'end':min(effective_duration,time_sec+.3)})
            last_text_sample=time_sec
        # Review-only local OCR. Fail visibly if explicitly requested but the
        # host lacks Tesseract; never silently claim text coverage.
        if time_sec-last_general_text_sample>=.49:
            regions=None
            if os.environ.get('SMART_REFRAME_SOURCE_TEXT_OCR', '') == '1':
                from source_text_regions import source_text_regions
                regions=source_text_regions(frame,include_word_candidates=True)
            else:
                regions=auto_text.run(frame)
            last_general_text_sample=time_sec
            if regions is not None:
                word_region_samples.append({'time':time_sec,'regions':[r for r in regions if r['kind']=='ocr-word-candidate']})
                for region in regions:
                    if region['kind']!='ocr-word-candidate':
                        protected_content_regions.append({**region,'start':max(0,time_sec-.3),'end':min(effective_duration,time_sec+.8)})
                ocr_sample_times.append(time_sec)
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        # 1. Fast scene cut detection via normalized histogram correlation
        hist = cv2.calcHist([gray], [0], None, [32], [0, 256])
        cv2.normalize(hist, hist, alpha=0, beta=1, norm_type=cv2.NORM_MINMAX)
        hsv_hist = None
        if hsv_cuts_enabled:
            # EXPERIMENTAL (SMART_REFRAME_HSV_CUTS=1): luma-only histograms miss
            # cuts between same-lighting scenes (measured gray correl min 0.739
            # on a person-to-person cut). Hue+saturation separates them.
            hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
            hsv_hist = cv2.calcHist([hsv], [0, 1], None, [24, 24], [0, 180, 0, 256])
            cv2.normalize(hsv_hist, hsv_hist, alpha=0, beta=1, norm_type=cv2.NORM_MINMAX)
        if prev_hist is not None:
            correl = float(cv2.compareHist(prev_hist, hist, cv2.HISTCMP_CORREL))
            is_cut = correl < 0.50
            if hsv_cuts_enabled and prev_hsv_hist is not None:
                hsv_correl = float(cv2.compareHist(prev_hsv_hist, hsv_hist, cv2.HISTCMP_CORREL))
                # Tightened from 0.50: real person-to-person cuts register at
                # 0.01-0.11 while fast in-shot motion dips to ~0.38 (Sintel t=2.5
                # false positive at 0.50). 0.25 separates the measured cases;
                # env-overridable for wider fixture tuning.
                hsv_cut_threshold = float(os.environ.get('SMART_REFRAME_HSV_CUT_THRESHOLD', '0.25'))
                is_cut = is_cut or hsv_correl < hsv_cut_threshold
            if is_cut and time_sec > 0.4:
                # Dedup window: 1.0s on the classic gray path (unchanged default);
                # with HSV enabled, 0.5s - at 4fps sampling a single cut registers
                # on exactly one sample pair, so 0.5s (two samples) is the minimum
                # window that prevents double-counting one cut while still
                # allowing genuinely rapid successive cuts (e.g. 0.75s apart).
                dedup = 0.5 if hsv_cuts_enabled else 1.0
                if not scene_cuts or (time_sec - scene_cuts[-1]) >= dedup:
                    scene_cuts.append(time_sec)
        prev_hist = hist
        prev_hsv_hist = hsv_hist

        # 2. Face detection: YuNet DNN when enabled, else Haar cascades
        raw_candidates = []
        if yunet_detector is not None:
            from yunet_pyramid import detect_candidates
            raw_candidates.extend(detect_candidates(yunet_detector,frame,os.environ.get('SMART_REFRAME_YUNET_PYRAMID','')=='1'))
        else:
            # Multi-Cascade detection: Frontal face
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

        from face_evidence import candidate_evidence
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

            mouth_score, mouth_temporal, mouth_static = compute_mouth_score(gray, prev_gray, (x, y, w, h), prev_match)

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
                "mouth_score": mouth_score,
                "face_evidence": item.get("face_evidence") or candidate_evidence("opencv-haar-cascade", item["rect"], source_width, source_height)
            })
            if os.environ.get('SMART_REFRAME_DUMP_MOUTH_COMPONENTS'):
                face_list[-1]["mouth_temporal"] = mouth_temporal
                face_list[-1]["mouth_static"] = mouth_static

        sample = {"time": time_sec, "faces": face_list}
        if person_detector is not None:
            if os.environ.get('SMART_REFRAME_OBJECT_CONTEXT') == '1':
                sample["persons"], sample["objects"] = person_detector.infer_with_context(frame)
            else:
                sample["persons"] = person_detector.infer(frame)
        samples.append(sample)

        prev_gray = gray
        prev_face_boxes = curr_face_boxes

        frame_index += frame_interval
        if frame_index >= frame_count:
            break

    cap.release()

    if word_region_samples:
        from source_text_regions import persistent_word_regions
        for region in persistent_word_regions(word_region_samples):
            region['end']=min(effective_duration,region['end']);protected_content_regions.append(region)

    cut_evidence = []
    bounded_refinement = discover_short_auto_cuts is True and short_auto_refine_budget(effective_duration,source_width,source_height,source_fps,len(scene_cuts))
    if (os.environ.get('SMART_REFRAME_REFINE_CUTS', '') == '1' or bounded_refinement) and scene_cuts:
        cut_evidence = refine_scene_cuts(video_path, scene_cuts, start_sec,
                                         frame_interval / source_fps, source_fps)
        scene_cuts = sorted(set(e["time"] for e in cut_evidence if e["time"] > 0))

    # Ordinary short explicit Auto requests a bounded pass. The decoder's
    # actual geometry/fps, not caller metadata, enforces the source budget.
    bounded_auto = discover_short_auto_cuts is True and short_auto_cut_budget(effective_duration,source_width,source_height,source_fps)
    pixel_frames = float(effective_duration)*float(source_fps)*float(source_width)*float(source_height) if all(np.isfinite(v) for v in [effective_duration,source_fps,source_width,source_height]) else None
    cut_discovery = {"mode":"short-explicit-auto" if discover_short_auto_cuts is True else "legacy-sampled", "status":"not-requested", "duration_seconds":effective_duration,
                     "budget":{"unit":"frames*width*height","max_pixel_frames":SHORT_AUTO_MAX_PIXEL_FRAMES,"max_duration_seconds":SHORT_AUTO_MAX_DURATION_SECONDS,
                               "max_width":1920,"max_height":1080,"max_fps":60,"pixel_frames":pixel_frames,"source_width":source_width,"source_height":source_height,"source_fps":source_fps,
                               "note":"decode-work proxy, not a measured resource bound; 1800 frames of 1920x1080 is the legacy reference"}}
    if discover_short_auto_cuts is True and not bounded_auto:
        cut_discovery.update(status="skipped-budget", reason="Source exceeds the duration, dimension, fps or frames*pixels decode-work budget")
    if os.environ.get('SMART_REFRAME_DENSE_CUTS', '') == '1' or bounded_auto:
        dense_evidence = discover_dense_scene_cuts(video_path, start_sec, effective_duration, source_fps)
        cut_discovery.update(status="completed")
        # Prefer precise dense boundaries near a sampled color boundary. Keep
        # other refined color boundaries, but never double one visual change.
        cut_evidence = dense_evidence + [e for e in cut_evidence
            if not any(abs(e["time"]-d["time"]) < .3 for d in dense_evidence)]
        if not cut_evidence:
            cut_evidence = [{"time": t, "coarse_time": t, "refined": False} for t in scene_cuts]
        scene_cuts = sorted(set(e["time"] for e in cut_evidence if e["time"] > 0))

    from source_text_geometry import coverage_record
    text_detectors = (['tesseract-review-v2'] if ocr_sample_times else []) + (['db-ic15-resnet18-sha1-'+__import__('source_text_geometry').MODEL_SHA1] if geometry_model else [])
    text_coverage = coverage_record(ocr_sample_times+text_geometry_sample_times,effective_duration,len([r for r in protected_content_regions if r.get('kind')!='numeric-clock-overlay']),text_detectors)
    text_coverage['automatic_execution']=auto_text.record
    if geometry_result:
        text_coverage["geometry_execution"]={k:v for k,v in geometry_result.items()if k!="samples"}
    return {
        "scene_cut_discovery": cut_discovery,
        "measured_capabilities": __import__('measured_capabilities').measured_capabilities(yunet_detector is not None, person_detector is not None, samples),
        "source_text_coverage": text_coverage,
        "face_resolution_passes": __import__('yunet_pyramid').inference_sizes(source_width,source_height,os.environ.get('SMART_REFRAME_YUNET_PYRAMID','')=='1') if yunet_detector else None,
        **({"person_detector": "nanodet-2022nov-sha256-" + __import__("person_regions").MODEL_SHA256} if person_detector else {}),
        "protected_content_regions": protected_content_regions,
        "source_text_detector": "tesseract-local-lines-and-persistent-words-review-v2" if ocr_sample_times else None,
        "scene_cut_evidence": cut_evidence,
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
        max_samples = int(params.get("maxSamples", 600))

        # Validate input — only accept an existing file path
        if not video_path or not isinstance(video_path, str):
            raise ValueError("Missing or invalid videoPath")
        if not os.path.isfile(video_path):
            raise FileNotFoundError(f"Video not found: {video_path}")

        # Clamp sample FPS
        sample_fps = max(0.1, min(10.0, sample_fps))
        start_sec = max(0.0, start_sec)
        duration_sec = max(0.0, duration_sec)

        result = analyze_video(video_path, sample_fps, start_sec, duration_sec, max_samples, params.get("discoverShortAutoCuts") is True, params.get("discoverShortAutoText") is True)

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

