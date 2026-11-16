export interface PlaybackSlice {
  timeline_start: number; timeline_end: number;
  source_start: number; source_end: number;
  speed?: { speed?: number };
}
export function playbackSliceAt(slices: PlaybackSlice[], timeline: number): PlaybackSlice | undefined {
  return slices.find(s => timeline >= s.timeline_start && timeline < s.timeline_end) ||
    (timeline >= (slices[slices.length - 1]?.timeline_end ?? Infinity) ? slices[slices.length - 1] : slices[0]);
}
export function timelineToSourceTime(slices: PlaybackSlice[], timeline: number, offset = 0): number {
  const s = playbackSliceAt(slices, timeline);
  if (!s) return Math.max(0, offset + timeline);
  return Math.max(s.source_start, Math.min(s.source_end, s.source_start + (timeline - s.timeline_start) * (s.speed?.speed || 1)));
}
export function sourceToTimelineTime(slices: PlaybackSlice[], source: number, hint: number, offset = 0): number {
  const active = playbackSliceAt(slices, hint);
  if (!active) return Math.max(0, source - offset);
  // Keep the inverse tied to the active timeline slice. Source intervals can
  // overlap after duplication/reordering, and removed pauses have no inverse.
  if (source >= active.source_end - .001) {
    const next = slices[slices.indexOf(active) + 1];
    return next ? next.timeline_start : active.timeline_end;
  }
  return Math.max(active.timeline_start, Math.min(active.timeline_end,
    active.timeline_start + (source - active.source_start) / (active.speed?.speed || 1)));
}
