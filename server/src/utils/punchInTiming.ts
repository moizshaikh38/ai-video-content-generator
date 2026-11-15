/**
 * Speech-emphasis punch-in timing (OpenShorts #1): adapt a plan's punch-in
 * window to the transcript's word timings, with suppression of zooms that
 * would look wrong.
 *
 * Grounded rules (no word timings -> graceful passthrough, never invented):
 *  - The zoom must START on a word boundary: snap to the nearest word start
 *    within tolerance; if there is none, suppress (a zoom landing mid-word
 *    reads as random camera shake).
 *  - The zoom must not REVERT mid-word: extend the end to the end of the
 *    word spanning the natural end (or the nearest word end in a short gap).
 *  - Suppress zooms too subtle to perceive or too short to read.
 */

export interface PunchInWindowInput {
  startSec: number;     // clip-relative
  durationSec: number;
  scale: number;
}

export interface WordTimingLite {
  start: number;
  end: number;
}

export type PunchInAdaptation =
  | { suppressed: false; startSec: number; durationSec: number; scale: number; reason: string }
  | { suppressed: true; reason: string };

export const PUNCH_SNAP_TOLERANCE_SEC = 0.4;
export const PUNCH_END_TOLERANCE_SEC = 0.5;
export const PUNCH_MIN_WINDOW_SEC = 0.5;
export const PUNCH_MAX_WINDOW_SEC = 4.0;
export const PUNCH_MIN_SCALE = 1.03;

export function adaptPunchInToWordTimings(
  input: PunchInWindowInput,
  words: WordTimingLite[] | undefined,
  opts: { snapToleranceSec?: number; endToleranceSec?: number; minWindowSec?: number; maxWindowSec?: number; minScale?: number } = {}
): PunchInAdaptation {
  const snapTol = opts.snapToleranceSec ?? PUNCH_SNAP_TOLERANCE_SEC;
  const endTol = opts.endToleranceSec ?? PUNCH_END_TOLERANCE_SEC;
  const minWin = opts.minWindowSec ?? PUNCH_MIN_WINDOW_SEC;
  const maxWin = opts.maxWindowSec ?? PUNCH_MAX_WINDOW_SEC;
  const minScale = opts.minScale ?? PUNCH_MIN_SCALE;

  const scale = Number(input.scale);
  if (!Number.isFinite(scale) || scale < minScale) {
    return { suppressed: true, reason: 'subtle_scale' };
  }
  if (!Number.isFinite(input.startSec) || !Number.isFinite(input.durationSec) || input.durationSec <= 0) {
    return { suppressed: true, reason: 'degenerate_window' };
  }
  const usable = (words || [])
    .filter((w) => Number.isFinite(w?.start) && Number.isFinite(w?.end) && w.end > w.start)
    .sort((a, b) => a.start - b.start);
  if (usable.length === 0) {
    // No word timings: keep the plan's window (curve still applies downstream).
    return {
      suppressed: false,
      startSec: input.startSec,
      durationSec: Math.min(maxWin, Math.max(minWin, input.durationSec)),
      scale,
      reason: 'no_word_timings',
    };
  }

  // Snap start to the nearest word start.
  let startWord: WordTimingLite | null = null;
  let startDist = Number.POSITIVE_INFINITY;
  for (const w of usable) {
    const d = Math.abs(w.start - input.startSec);
    if (d <= snapTol && d < startDist) {
      startWord = w;
      startDist = d;
    }
  }
  if (!startWord) {
    return { suppressed: true, reason: 'no_word_boundary' };
  }
  const startSec = startWord.start;

  // Extend the end to a word boundary so the revert never lands mid-word.
  const naturalEnd = startSec + Math.max(input.durationSec, startWord.end - startSec);
  let endSec = naturalEnd;
  const spanning = usable.find((w) => w.start <= naturalEnd && w.end >= naturalEnd);
  if (spanning) {
    endSec = spanning.end;
  } else {
    // In a gap: use the nearest word end within tolerance, else keep natural.
    let bestEnd: number | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const w of usable) {
      const d = Math.abs(w.end - naturalEnd);
      if (d <= endTol && d < bestDist) {
        bestEnd = w.end;
        bestDist = d;
      }
    }
    if (bestEnd !== null && bestEnd > startSec) endSec = bestEnd;
  }

  let durationSec = endSec - startSec;
  if (durationSec > maxWin) durationSec = maxWin;
  if (durationSec < minWin) {
    return { suppressed: true, reason: 'window_too_short' };
  }
  return { suppressed: false, startSec, durationSec, scale, reason: 'word_adapted' };
}

/**
 * Builds the eased zoompan filter for a punch-in: linear ramp-in, hold,
 * linear ramp-out (the previous implementation was an instant step at both
 * edges). Ramps clamp to half the window each for very short punches.
 */
export function buildPunchInZoompan(opts: {
  startSec: number;
  durationSec: number;
  scale: number;
  targetW: number;
  targetH: number;
  fps?: number;
  rampInSec?: number;
  rampOutSec?: number;
}): string {
  const fps = opts.fps ?? 30;
  const dur = Math.max(0.2, opts.durationSec);
  const rampIn = Math.min(opts.rampInSec ?? 0.25, dur / 2);
  const rampOut = Math.min(opts.rampOutSec ?? 0.35, dur / 2);
  const S = Math.max(1.02, Math.min(1.25, opts.scale));
  const on0 = Math.round(opts.startSec * fps);
  const on1 = Math.round((opts.startSec + rampIn) * fps);
  const on3 = Math.round((opts.startSec + dur) * fps);
  const on2 = Math.max(on1, Math.round((opts.startSec + dur - rampOut) * fps));
  const z =
    `if(lt(on,${on0}),1,` +
    `if(lt(on,${on1}),1+${(S - 1).toFixed(4)}*(on-${on0})/${Math.max(1, on1 - on0)},` +
    `if(lt(on,${on2}),${S.toFixed(4)},` +
    `if(lt(on,${on3}),1+${(S - 1).toFixed(4)}*(${on3}-on)/${Math.max(1, on3 - on2)},1))))`;
  return `zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${opts.targetW}x${opts.targetH}:fps=${fps}`;
}
