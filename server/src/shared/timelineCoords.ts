/**
 * Pure timeline coordinate + snapping math shared by the timeline UI and tests. Keeping
 * these out of the React component makes the zoom/scroll ↔ time mapping and the snapping
 * behavior directly unit-testable. Dependency-free (structurally typed) so it imports into
 * both the Vite bundle and the backend test runner.
 */

/** Minimal shape the snapping functions need from a timeline item. */
export interface TimelineItemLike {
  id: string;
  timeline_start: number;
  timeline_end: number;
}
export interface TimelineTrackLike {
  items: TimelineItemLike[];
}

/** Pixels → seconds at a given zoom. `px` is already in content space (scroll applied). */
export function pxToTime(px: number, pxPerSec: number): number {
  if (!Number.isFinite(pxPerSec) || pxPerSec <= 0) return 0;
  return px / pxPerSec;
}

/** Seconds → pixels at a given zoom. */
export function timeToPx(time: number, pxPerSec: number): number {
  if (!Number.isFinite(pxPerSec) || pxPerSec <= 0) return 0;
  return time * pxPerSec;
}

export function clampTime(time: number, min: number, max: number): number {
  if (!Number.isFinite(time)) return min;
  return Math.min(max, Math.max(min, time));
}

/** Rounds a time to whole milliseconds, the timeline's stored precision. */
export function roundToMs(time: number): number {
  return Math.round(time * 1000) / 1000;
}

/**
 * Maps a click/scrub x (content-space px, with horizontal scroll already applied) to a
 * clamped timeline time. Centralizes the exact conversion the ruler uses so it can't drift
 * (and so the scroll-offset double-count bug can't reappear): callers pass
 * `clientX - rulerRect.left`, never adding scrollLeft on top of a rect that already moved.
 */
export function rulerXToTime(contentX: number, pxPerSec: number, duration: number): number {
  return clampTime(pxToTime(contentX, pxPerSec), 0, duration);
}

/** Distinct snap candidates (0, playhead, every other item's edges), ascending. */
export function collectSnapPoints(
  tracks: TimelineTrackLike[],
  playhead: number,
  excludeItemId?: string
): number[] {
  const points = [0, playhead];
  for (const track of tracks) {
    for (const item of track.items) {
      if (item.id !== excludeItemId) {
        points.push(item.timeline_start);
        points.push(item.timeline_end);
      }
    }
  }
  return Array.from(new Set(points)).sort((a, b) => a - b);
}

export interface SnapResult {
  time: number;
  snapped: boolean;
}

/**
 * Snaps `target` to the nearest point within `tolerance` seconds, preferring the closest
 * candidate (not merely the first within tolerance). Returns the original time unchanged
 * when nothing is close enough or snapping is disabled.
 */
export function snapToPoints(
  target: number,
  points: number[],
  tolerance: number,
  enabled = true
): SnapResult {
  if (!enabled || tolerance <= 0 || points.length === 0) {
    return { time: target, snapped: false };
  }
  let best: number | null = null;
  let bestDist = Infinity;
  for (const pt of points) {
    const dist = Math.abs(pt - target);
    if (dist <= tolerance && dist < bestDist) {
      bestDist = dist;
      best = pt;
    }
  }
  return best === null ? { time: target, snapped: false } : { time: best, snapped: true };
}
