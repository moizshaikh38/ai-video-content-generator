import { EditorProject, EditorTrackItem } from '../types/index.js';

export const DEFAULT_SNAP_TOLERANCE_PX = 12;
export const MIN_CLIP_DURATION = 0.2;

export type SnapTargetType = 'zero' | 'playhead' | 'clip-start' | 'clip-end';

export interface SnapTarget {
  time: number;
  type: SnapTargetType;
  trackId?: string;
  itemId?: string;
  isSameTrack?: boolean;
  label?: string;
}

export interface SnapResolution {
  time: number;
  snapped: boolean;
  target: SnapTarget | null;
  snapPixel: number;
  distancePx: number;
}

export interface ClipMoveSnapResult {
  timeline_start: number;
  timeline_end: number;
  snapped: boolean;
  snapTarget: SnapTarget | null;
  indicatorPixel: number | null;
}

export interface ClipTrimSnapResult {
  timeline_start: number;
  timeline_end: number;
  source_start: number;
  source_end: number;
  snapped: boolean;
  snapTarget: SnapTarget | null;
  indicatorPixel: number | null;
}

/**
 * Collects all magnetic snap candidates across the timeline:
 * - Timeline zero (0.0s)
 * - Current playhead
 * - Start and end edges of all non-hidden track items (excluding the dragged item)
 */
export function collectSnapTargets(
  project: EditorProject,
  playhead: number,
  draggedItemId?: string,
  draggedTrackId?: string
): SnapTarget[] {
  const targets: SnapTarget[] = [];

  // 1. Timeline zero
  targets.push({
    time: 0,
    type: 'zero',
    label: '0:00.00',
  });

  // 2. Playhead
  if (playhead >= 0) {
    targets.push({
      time: playhead,
      type: 'playhead',
      label: 'Playhead',
    });
  }

  // 3. Track item boundaries
  for (const track of project.tracks) {
    if (track.hidden) continue;

    const isSameTrack = track.id === draggedTrackId;

    for (const item of track.items) {
      if (item.id === draggedItemId) continue;

      targets.push({
        time: item.timeline_start,
        type: 'clip-start',
        trackId: track.id,
        itemId: item.id,
        isSameTrack,
        label: `${track.name || 'Track'} In`,
      });

      targets.push({
        time: item.timeline_end,
        type: 'clip-end',
        trackId: track.id,
        itemId: item.id,
        isSameTrack,
        label: `${track.name || 'Track'} Out`,
      });
    }
  }

  return targets;
}

/**
 * Resolves snapping for a single time value against candidate targets.
 * Tolerance is defined in screen pixels and dynamically converted to seconds based on zoom level.
 * When multiple candidates fall within tolerance, tie-breaking is deterministic:
 * 1. Smallest pixel distance to target
 * 2. Higher priority target type (Playhead > Same Track Edge > Cross Track Edge > Zero)
 */
export function resolveSnapPoint(
  targetTime: number,
  targets: SnapTarget[],
  pixelsPerSec: number,
  snapTolerancePx: number = DEFAULT_SNAP_TOLERANCE_PX,
  bypassSnap: boolean = false
): SnapResolution {
  const boundedTime = Number.isFinite(targetTime) ? Math.max(0, targetTime) : 0;
  const defaultUnsnapped: SnapResolution = {
    time: boundedTime,
    snapped: false,
    target: null,
    snapPixel: Number.isFinite(pixelsPerSec) && pixelsPerSec > 0 ? boundedTime * pixelsPerSec : 0,
    distancePx: Infinity,
  };

  if (bypassSnap || !Number.isFinite(pixelsPerSec) || pixelsPerSec <= 0 || targets.length === 0) {
    return defaultUnsnapped;
  }

  const effectiveTolerancePx =
    Number.isFinite(snapTolerancePx) && snapTolerancePx > 0
      ? snapTolerancePx
      : DEFAULT_SNAP_TOLERANCE_PX;

  const toleranceSec = effectiveTolerancePx / pixelsPerSec;

  const inRangeCandidates: { target: SnapTarget; distanceSec: number; distancePx: number; priority: number }[] = [];

  for (const t of targets) {
    const distSec = Math.abs(t.time - targetTime);
    if (distSec <= toleranceSec) {
      let priority = 1;
      if (t.type === 'playhead') priority = 4;
      else if (t.isSameTrack) priority = 3;
      else if (t.type === 'clip-start' || t.type === 'clip-end') priority = 2;

      inRangeCandidates.push({
        target: t,
        distanceSec: distSec,
        distancePx: distSec * pixelsPerSec,
        priority,
      });
    }
  }

  if (inRangeCandidates.length === 0) {
    return defaultUnsnapped;
  }

  // Sort: closest distance first, then highest priority first, then smallest target time
  inRangeCandidates.sort((a, b) => {
    const diff = a.distancePx - b.distancePx;
    if (Math.abs(diff) > 0.5) return diff;
    if (a.priority !== b.priority) return b.priority - a.priority;
    return a.target.time - b.target.time;
  });

  const best = inRangeCandidates[0];
  return {
    time: best.target.time,
    snapped: true,
    target: best.target,
    snapPixel: best.target.time * pixelsPerSec,
    distancePx: best.distancePx,
  };
}

/**
 * Calculates snapped placement for a moving clip.
 * Evaluates both the leading edge (start) and trailing edge (end).
 * Guaranteed to preserve the clip's exact duration without alteration.
 */
export function snapClipMove(
  proposedStart: number,
  duration: number,
  targets: SnapTarget[],
  pixelsPerSec: number,
  snapTolerancePx: number = DEFAULT_SNAP_TOLERANCE_PX,
  bypassSnap: boolean = false
): ClipMoveSnapResult {
  const boundedProposedStart = Math.max(0, proposedStart);
  const proposedEnd = boundedProposedStart + duration;

  if (bypassSnap) {
    return {
      timeline_start: boundedProposedStart,
      timeline_end: proposedEnd,
      snapped: false,
      snapTarget: null,
      indicatorPixel: null,
    };
  }

  const snapStart = resolveSnapPoint(boundedProposedStart, targets, pixelsPerSec, snapTolerancePx, false);
  const snapEnd = resolveSnapPoint(proposedEnd, targets, pixelsPerSec, snapTolerancePx, false);

  if (snapStart.snapped && snapEnd.snapped) {
    // Both edges are within snap tolerance: pick the one closer to its snap point
    if (snapStart.distancePx <= snapEnd.distancePx) {
      const s = Math.max(0, snapStart.time);
      return {
        timeline_start: s,
        timeline_end: s + duration,
        snapped: true,
        snapTarget: snapStart.target,
        indicatorPixel: s * pixelsPerSec,
      };
    } else {
      const e = snapEnd.time;
      const s = Math.max(0, e - duration);
      return {
        timeline_start: s,
        timeline_end: s + duration,
        snapped: true,
        snapTarget: snapEnd.target,
        indicatorPixel: e * pixelsPerSec,
      };
    }
  }

  if (snapStart.snapped) {
    const s = Math.max(0, snapStart.time);
    return {
      timeline_start: s,
      timeline_end: s + duration,
      snapped: true,
      snapTarget: snapStart.target,
      indicatorPixel: s * pixelsPerSec,
    };
  }

  if (snapEnd.snapped) {
    const e = snapEnd.time;
    const s = Math.max(0, e - duration);
    return {
      timeline_start: s,
      timeline_end: s + duration,
      snapped: true,
      snapTarget: snapEnd.target,
      indicatorPixel: e * pixelsPerSec,
    };
  }

  return {
    timeline_start: boundedProposedStart,
    timeline_end: proposedEnd,
    snapped: false,
    snapTarget: null,
    indicatorPixel: null,
  };
}

/**
 * Calculates snapped placement for trimming a clip's left (in-point) edge.
 * Enforces:
 * - Minimum duration protection (cannot trim past `timeline_end - MIN_CLIP_DURATION`).
 * - Source bounds protection (cannot trim to `source_start < 0`).
 */
export function snapClipTrimLeft(
  proposedStart: number,
  item: EditorTrackItem,
  initialStart: number,
  initialSourceStart: number,
  targets: SnapTarget[],
  pixelsPerSec: number,
  snapTolerancePx: number = DEFAULT_SNAP_TOLERANCE_PX,
  bypassSnap: boolean = false
): ClipTrimSnapResult {
  const maxLeftExpand = Math.max(0, initialSourceStart);
  const minAllowedStart = Math.max(0, initialStart - maxLeftExpand);
  const maxAllowedStart = item.timeline_end - MIN_CLIP_DURATION;

  let candidateStart = Math.max(minAllowedStart, Math.min(maxAllowedStart, proposedStart));
  let isSnapped = false;
  let activeTarget: SnapTarget | null = null;
  let indicatorPx: number | null = null;

  if (!bypassSnap) {
    const snapRes = resolveSnapPoint(candidateStart, targets, pixelsPerSec, snapTolerancePx, false);
    if (snapRes.snapped && snapRes.time >= minAllowedStart && snapRes.time <= maxAllowedStart) {
      candidateStart = snapRes.time;
      isSnapped = true;
      activeTarget = snapRes.target;
      indicatorPx = candidateStart * pixelsPerSec;
    }
  }

  const deltaTimeline = candidateStart - initialStart;
  const newSourceStart = Math.max(0, initialSourceStart + deltaTimeline);

  return {
    timeline_start: Math.round(candidateStart * 1000) / 1000,
    timeline_end: item.timeline_end,
    source_start: Math.round(newSourceStart * 1000) / 1000,
    source_end: item.source_end,
    snapped: isSnapped,
    snapTarget: activeTarget,
    indicatorPixel: indicatorPx,
  };
}

/**
 * Calculates snapped placement for trimming a clip's right (out-point) edge.
 * Enforces:
 * - Minimum duration protection (cannot trim earlier than `timeline_start + MIN_CLIP_DURATION`).
 * - Source bounds protection (cannot trim past source media duration if known).
 */
export function snapClipTrimRight(
  proposedEnd: number,
  item: EditorTrackItem,
  initialEnd: number,
  initialSourceEnd: number,
  targets: SnapTarget[],
  pixelsPerSec: number,
  snapTolerancePx: number = DEFAULT_SNAP_TOLERANCE_PX,
  bypassSnap: boolean = false,
  maxSourceDuration?: number
): ClipTrimSnapResult {
  const minAllowedEnd = item.timeline_start + MIN_CLIP_DURATION;
  const maxRightExpand =
    typeof maxSourceDuration === 'number' && maxSourceDuration > 0
      ? Math.max(0, maxSourceDuration - initialSourceEnd)
      : Infinity;
  const maxAllowedEnd = Number.isFinite(maxRightExpand)
    ? initialEnd + maxRightExpand
    : Infinity;

  let candidateEnd = Math.max(minAllowedEnd, Math.min(maxAllowedEnd, proposedEnd));
  let isSnapped = false;
  let activeTarget: SnapTarget | null = null;
  let indicatorPx: number | null = null;

  if (!bypassSnap) {
    const snapRes = resolveSnapPoint(candidateEnd, targets, pixelsPerSec, snapTolerancePx, false);
    if (snapRes.snapped && snapRes.time >= minAllowedEnd && snapRes.time <= maxAllowedEnd) {
      candidateEnd = snapRes.time;
      isSnapped = true;
      activeTarget = snapRes.target;
      indicatorPx = candidateEnd * pixelsPerSec;
    }
  }

  const deltaTimeline = candidateEnd - initialEnd;
  const newSourceEnd = Math.max(item.source_start + MIN_CLIP_DURATION, initialSourceEnd + deltaTimeline);

  return {
    timeline_start: item.timeline_start,
    timeline_end: Math.round(candidateEnd * 1000) / 1000,
    source_start: item.source_start,
    source_end: Number(newSourceEnd.toFixed(3)),
    snapped: isSnapped,
    snapTarget: activeTarget,
    indicatorPixel: indicatorPx,
  };
}
