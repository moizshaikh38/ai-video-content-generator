import { useEffect, useState } from 'react';

/**
 * Instant timeline filmstrip: grabs frames in the browser from the same source video the
 * preview plays, so the first frames show within about a second while the server sprite
 * (src/lib/thumbnails.ts) is still generating.
 *
 * The video is loaded without CORS, so the canvases are display-only (tainted): they can be
 * drawn onto other canvases but never read back. That is all the filmstrip needs.
 */

export interface CapturedFrame {
  /** Absolute source time of the frame, in seconds. */
  time: number;
  canvas: HTMLCanvasElement;
}

const FRAME_HEIGHT = 108; // 2x the timeline lane height, crisp on retina
const MAX_PARALLEL = 2;
const TIMEOUT_MS = 12000;

const cache = new Map<string, CapturedFrame[]>();
const listeners = new Map<string, Set<(frames: CapturedFrame[]) => void>>();
const started = new Set<string>();
const queue: Array<() => Promise<void>> = [];
let running = 0;

const pump = () => {
  while (running < MAX_PARALLEL && queue.length) {
    const job = queue.shift()!;
    running += 1;
    job().finally(() => {
      running -= 1;
      pump();
    });
  }
};

const publish = (key: string, frames: CapturedFrame[]) => {
  cache.set(key, frames);
  listeners.get(key)?.forEach((fn) => fn(frames));
};

/** Seek order: ends first, then midpoints, so a usable strip appears after 2–3 seeks. */
const seekOrder = (count: number) => {
  const order: number[] = [0];
  if (count > 1) order.push(count - 1);
  const fill = (lo: number, hi: number) => {
    if (hi - lo < 2) return;
    const mid = Math.floor((lo + hi) / 2);
    order.push(mid);
    fill(lo, mid);
    fill(mid, hi);
  };
  fill(0, count - 1);
  return order;
};

const capture = (key: string, src: string, start: number, end: number, count: number) => async () => {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = src;

  const frames: CapturedFrame[] = [];
  const deadline = Date.now() + TIMEOUT_MS;
  const waitFor = (event: 'loadeddata' | 'seeked') =>
    new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('timeout')), Math.max(0, deadline - Date.now()));
      const done = () => {
        window.clearTimeout(timer);
        video.removeEventListener(event, done);
        video.removeEventListener('error', fail);
        resolve();
      };
      const fail = () => {
        window.clearTimeout(timer);
        video.removeEventListener(event, done);
        reject(new Error('video error'));
      };
      video.addEventListener(event, done, { once: true });
      video.addEventListener('error', fail, { once: true });
    });

  try {
    if (video.readyState < 2) await waitFor('loadeddata');
    const aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
    const span = Math.max(0.001, end - start);
    for (const i of seekOrder(count)) {
      const time = Math.min(Math.max(0, start + ((i + 0.5) / count) * span), Math.max(0, (video.duration || end) - 0.05));
      video.currentTime = time;
      await waitFor('seeked');
      const canvas = document.createElement('canvas');
      canvas.height = FRAME_HEIGHT;
      canvas.width = Math.round(FRAME_HEIGHT * aspect);
      canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push({ time, canvas });
      publish(key, [...frames].sort((a, b) => a.time - b.time));
    }
  } catch {
    // Keep whatever frames we got; the server sprite or poster covers the rest.
  } finally {
    video.removeAttribute('src');
    video.load();
  }
};

/**
 * Frames for [start, end] of `src`, published progressively as each seek completes.
 * Shared across components and cached for the session.
 */
export function useVideoFrameStrip(
  src: string | null | undefined,
  start: number,
  end: number,
  count: number,
  enabled: boolean,
): CapturedFrame[] {
  const key = src ? `${src}|${start.toFixed(2)}|${end.toFixed(2)}|${count}` : '';
  const [frames, setFrames] = useState<CapturedFrame[]>(() => (key && cache.get(key)) || []);

  useEffect(() => {
    if (!enabled || !src || !key || !(end > start) || typeof document === 'undefined') return;
    setFrames(cache.get(key) || []);
    let set = listeners.get(key);
    if (!set) listeners.set(key, (set = new Set()));
    set.add(setFrames);
    if (!started.has(key)) {
      started.add(key);
      queue.push(capture(key, src, start, end, count));
      pump();
    }
    return () => {
      set?.delete(setFrames);
    };
  }, [key, src, start, end, count, enabled]);

  return frames;
}

/** Nearest captured frame to `time` (frames are sorted by time). */
export function nearestFrame(frames: CapturedFrame[], time: number): CapturedFrame | null {
  let best: CapturedFrame | null = null;
  let bestDist = Infinity;
  for (const f of frames) {
    const d = Math.abs(f.time - time);
    if (d < bestDist) {
      best = f;
      bestDist = d;
    }
  }
  return best;
}
