"""Manual subject tracker: follow a user-picked box through a clip.

stdin JSON: {videoPath, refTime, box:{x,y,w,h} (normalised 0-1 on the frame at refTime),
             startSec, endSec, sampleFps?}
stdout JSON: {status:'ok', keyframes:[{time,centerX,centerY,w,h,confidence}], scene_cuts:[...],
              lost_at: number|null}
Times are source-file seconds. Tracks forward and backward from refTime. A scene cut
(histogram jump) ends tracking in that direction: the subject is only followed inside
its own scene, matching "each subject is only tracked in its scenes".
Method: pyramidal Lucas-Kanade on features inside the box (median flow + scale from
point-spread), re-seeded from the current box; stops when too few points survive.
"""
import sys, json, os
import cv2
import numpy as np

LK = dict(winSize=(21, 21), maxLevel=3, criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01))


def hist(gray):
    h = cv2.calcHist([cv2.resize(gray, (64, 36))], [0], None, [32], [0, 256])
    return cv2.normalize(h, h).flatten()


def is_cut(a, b):
    return cv2.compareHist(a, b, cv2.HISTCMP_CORREL) < 0.80


def seed(gray, box):
    x, y, w, h = box
    mask = np.zeros_like(gray)
    mask[int(max(0, y)):int(y + h), int(max(0, x)):int(x + w)] = 255
    return cv2.goodFeaturesToTrack(gray, 60, 0.01, 4, mask=mask)


def frame_at(cap, fps, t):
    cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000.0)
    ok, f = cap.read()
    return f if ok else None


def run_direction(cap, fps, W, H, ref_t, box0, step, limit_t, sample_dt):
    out = []
    first = frame_at(cap, fps, ref_t)
    if first is None:
        return out, None
    prev = cv2.cvtColor(first, cv2.COLOR_BGR2GRAY)
    ph = hist(prev)
    box = list(box0)
    pts = seed(prev, box)
    t = ref_t
    lost = None
    while True:
        t += step * sample_dt
        if (step > 0 and t > limit_t) or (step < 0 and t < limit_t):
            break
        f = frame_at(cap, fps, t)
        if f is None:
            break
        g = cv2.cvtColor(f, cv2.COLOR_BGR2GRAY)
        gh = hist(g)
        if is_cut(ph, gh):
            lost = t
            break
        if pts is None or len(pts) < 6:
            pts = seed(prev, box)
        if pts is None or len(pts) < 4:
            lost = t
            break
        nxt, st, _ = cv2.calcOpticalFlowPyrLK(prev, g, pts, None, **LK)
        back, st2, _ = cv2.calcOpticalFlowPyrLK(g, prev, nxt, None, **LK)
        good = (st.flatten() == 1) & (st2.flatten() == 1) & (np.linalg.norm(back - pts, axis=2).flatten() < 1.5)
        if good.sum() < 4:
            lost = t
            break
        p0 = pts[good].reshape(-1, 2)
        p1 = nxt[good].reshape(-1, 2)
        d = np.median(p1 - p0, axis=0)
        s0 = np.median(np.linalg.norm(p0 - p0.mean(0), axis=1)) + 1e-6
        s1 = np.median(np.linalg.norm(p1 - p1.mean(0), axis=1)) + 1e-6
        sc = float(np.clip(s1 / s0, 0.9, 1.1))
        cx = box[0] + box[2] / 2 + d[0]
        cy = box[1] + box[3] / 2 + d[1]
        bw, bh = box[2] * sc, box[3] * sc
        box = [cx - bw / 2, cy - bh / 2, bw, bh]
        if cx < 0 or cy < 0 or cx > W or cy > H:
            lost = t
            break
        out.append({"time": round(t, 3), "centerX": float(np.clip(cx / W, 0, 1)), "centerY": float(np.clip(cy / H, 0, 1)),
                    "w": float(min(1, bw / W)), "h": float(min(1, bh / H)), "confidence": float(good.sum() / max(1, len(pts)))})
        pts = p1[:, None, :].astype(np.float32)
        prev, ph = g, gh
        # re-seed periodically so the point set follows the box, not a shrinking cloud
        if len(out) % 8 == 0:
            ns = seed(g, box)
            if ns is not None and len(ns) >= 6:
                pts = ns
    return out, lost


def track(params):
    path = params.get("videoPath", "")
    if not path or not os.path.isfile(path):
        raise FileNotFoundError("Video not found")
    ref_t = float(params["refTime"])
    b = params["box"]
    sample_fps = max(2.0, min(12.0, float(params.get("sampleFps", 8.0))))
    cap = cv2.VideoCapture(path)
    W = cap.get(cv2.CAP_PROP_FRAME_WIDTH)
    H = cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    dur = (cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0) / fps
    start = max(0.0, float(params.get("startSec", 0.0)))
    end = float(params.get("endSec", dur)) or dur
    end = min(end, dur) if dur else end
    box0 = [float(b["x"]) * W, float(b["y"]) * H, max(8.0, float(b["w"]) * W), max(8.0, float(b["h"]) * H)]
    dt = 1.0 / sample_fps
    fwd, lost_f = run_direction(cap, fps, W, H, ref_t, box0, +1, end, dt)
    bwd, lost_b = run_direction(cap, fps, W, H, ref_t, box0, -1, start, dt)
    cap.release()
    ref = {"time": round(ref_t, 3), "centerX": (box0[0] + box0[2] / 2) / W, "centerY": (box0[1] + box0[3] / 2) / H,
           "w": box0[2] / W, "h": box0[3] / H, "confidence": 1.0}
    kfs = list(reversed(bwd)) + [ref] + fwd
    return {"keyframes": kfs, "lost_after": lost_f, "lost_before": lost_b,
            "tracked_from": kfs[0]["time"], "tracked_to": kfs[-1]["time"]}


def main():
    try:
        print(json.dumps({"status": "ok", **track(json.loads(sys.stdin.read()))}))
    except Exception as e:
        print(json.dumps({"status": "error", "error_code": type(e).__name__, "error_message": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
