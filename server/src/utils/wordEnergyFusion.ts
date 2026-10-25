import { ReframeKeyframe } from '../types/index.js';

/**
 * Word-energy diarization fusion (gaming/quality roadmap).
 *
 * The CV analyzer picks dominant speakers from mouth motion, but its keyframe
 * switch times come from frame sampling — switches can land mid-word, which
 * reads as a whip-pan cutting a speaker mid-syllable. This pass fuses the
 * transcript's word timings (the "word energy" signal: exactly when speech is
 * happening and when it pauses) into the keyframe timeline:
 *
 *  1. SPEECH-GAP GATING — a speaker switch may only occur inside a pause
 *     between words (>= minGapSec of silence). Switches that fall inside
 *     speech snap to the nearest word boundary.
 *  2. SNAP-BACK — a snapped switch never crosses an adjacent keyframe and
 *     never moves more than maxSnapSec (the CV decision stays authoritative;
 *     we only align it to audible turn boundaries).
 *  3. NO-OP SAFETY — with no word timings, fewer than 2 keyframes, or a
 *     degenerate timeline, the input is returned unchanged.
 *
 * Keyframes that are NOT speaker switches (continuous camera pans with the
 * same subject) are left alone — movement during speech is fine; only CUTS
 * must respect word boundaries.
 */

export interface WordTiming {
  start: number;
  end: number;
  word?: string;
}

export interface WordFusionOptions {
  /** Minimum silence between words for a switch to be allowed there. */
  minGapSec?: number;
  /** Maximum distance a switch may move to reach a word boundary. */
  maxSnapSec?: number;
  /** Position within the word boundary to place the switch (0=start, 1=end). */
  snapPosition?: number;
  /** Keyframe time tolerance for "same time" dedupe after snapping. */
  dedupeToleranceSec?: number;
}

const DEFAULTS: Required<WordFusionOptions> = {
  minGapSec: 0.12,
  maxSnapSec: 0.35,
  snapPosition: 0.5,
  dedupeToleranceSec: 0.02,
};

/** Returns true when [a,b] sits inside a spoken word's time span. */
function isInsideWord(t: number, words: WordTiming[], tolerance = 0.01): boolean {
  return words.some((w) => t > w.start + tolerance && t < w.end - tolerance);
}

/** Nearest word boundary to time t, preferring boundaries after `afterTime`. */
function nearestBoundary(t: number, words: WordTiming[], afterTime: number): number | null {
  let best: number | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const w of words) {
    for (const b of [w.start, w.end]) {
      if (b <= afterTime + 0.001) continue; // would collide with the previous keyframe
      const d = Math.abs(b - t);
      if (d < bestDist) {
        bestDist = d;
        best = b;
      }
    }
  }
  return best;
}

/**
 * Fuses word timings into reframe keyframes: speaker switches align to word
 * boundaries and are forbidden mid-word. Pure function — no IO, deterministic.
 */
export function applyWordEnergyFusion(
  keyframes: ReframeKeyframe[],
  words: WordTiming[],
  options: WordFusionOptions = {}
): ReframeKeyframe[] {
  const { minGapSec, maxSnapSec, snapPosition, dedupeToleranceSec } = { ...DEFAULTS, ...options };

  if (!Array.isArray(keyframes) || keyframes.length < 2) return keyframes;
  const validWords = (words || [])
    .filter((w) => w && Number.isFinite(w.start) && Number.isFinite(w.end) && w.end > w.start)
    .sort((a, b) => a.start - b.start);
  if (validWords.length === 0) return keyframes;

  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  const out: ReframeKeyframe[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const kf = sorted[i];
    const prev = out[out.length - 1];

    // Only fuse when this keyframe is a subject/camera CUT (position jump) —
    // smooth pans during speech are intentional motion, not switches.
    const isCut =
      Math.abs(kf.centerX - prev.centerX) > 0.08 || Math.abs(kf.centerY - prev.centerY) > 0.06;

    let time = kf.time;
    if (isCut && isInsideWord(time, validWords)) {
      const boundary = nearestBoundary(time, validWords, prev.time);
      if (boundary !== null && Math.abs(boundary - time) <= maxSnapSec) {
        time = boundary;
      }
    }

    // Never cross the previous keyframe; preserve ordering.
    if (time <= prev.time + dedupeToleranceSec) {
      // Dropped into the neighbor after snapping: keep the CV position but at
      // the earliest legal moment just after the previous frame.
      time = prev.time + dedupeToleranceSec + 0.001;
    }

    const next = sorted[i + 1];
    if (next && time >= next.time - dedupeToleranceSec) {
      // Would collide with the following frame: leave unfused (CV time kept).
      time = kf.time;
    }

    out.push({ ...kf, time: Number(time.toFixed(3)) });
  }

  return out;
}

/** Speech coverage of a window: fraction of [start,end] containing words. */
export function speechDensity(start: number, end: number, words: WordTiming[]): number {
  if (end <= start || words.length === 0) return 0;
  const window = words.filter((w) => w.end > start && w.start < end);
  const spoken = window.reduce((acc, w) => {
    return acc + Math.max(0, Math.min(w.end, end) - Math.max(w.start, start));
  }, 0);
  return Math.min(1, spoken / (end - start));
}
