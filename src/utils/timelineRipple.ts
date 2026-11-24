import { EditorProject, EditorTrackItem } from '../types';

/**
 * Timeline ripple: shift everything at/after `point` by `delta` seconds on
 * every unlocked track, keeping caption cues and word timings aligned with
 * the speech they belong to:
 * - cues starting at/after the point shift wholly;
 * - a cue straddling the point stretches over the gap and only its
 *   post-point words move;
 * - the canvas grows/shrinks with the ripple so the tail never falls off
 *   preview or export.
 * Returns null when a LOCKED track holds content past the point: shifting
 * everything else would silently misalign it, so the caller refuses the op.
 */
export function applyTimelineRipple(
  prev: EditorProject,
  point: number,
  delta: number
): EditorProject | null {
  if (Math.abs(delta) < 0.001) return prev;
  const lockedHit = prev.tracks.some(
    (t) => t.locked && t.items.some((it) => it.timeline_end > point)
  );
  if (lockedHit) return null;

  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  const shiftCue = (c: any): any => {
    if (c.start >= point) {
      return {
        ...c,
        start: r3(c.start + delta),
        end: r3(c.end + delta),
        words: Array.isArray(c.words)
          ? c.words.map((w: any) => ({ ...w, start: r3(w.start + delta), end: r3(w.end + delta) }))
          : c.words,
      };
    }
    if (c.end > point) {
      return {
        ...c,
        end: r3(c.end + delta),
        words: Array.isArray(c.words)
          ? c.words.map((w: any) =>
              w.start >= point ? { ...w, start: r3(w.start + delta), end: r3(w.end + delta) } : w
            )
          : c.words,
      };
    }
    return c;
  };

  return {
    ...prev,
    canvas: { ...prev.canvas, duration: r3(Math.max(0.1, prev.canvas.duration + delta)) },
    tracks: prev.tracks.map((tr) => {
      if (tr.locked) return tr;
      const items = tr.items.map((it) => {
        if (it.timeline_start >= point) {
          const shifted: EditorTrackItem = {
            ...it,
            timeline_start: r3(it.timeline_start + delta),
            timeline_end: r3(it.timeline_end + delta),
          };
          if (tr.type === 'CAPTION' && it.caption && Array.isArray(it.caption.cues)) {
            shifted.caption = { ...it.caption, cues: it.caption.cues.map(shiftCue) };
          }
          return shifted;
        }
        if (tr.type === 'CAPTION' && it.caption && Array.isArray(it.caption.cues) && it.timeline_end > point) {
          // Caption item spans the ripple point: stretch over the gap.
          return {
            ...it,
            timeline_end: r3(it.timeline_end + delta),
            caption: { ...it.caption, cues: it.caption.cues.map(shiftCue) },
          };
        }
        return it;
      });
      return { ...tr, items };
    }),
  };
}

/**
 * Retime a video/audio item to a new playback speed: the item's timeline
 * span becomes sourceWindow/speed and everything after its old end ripples
 * by the difference, so gapless scenes, captions and audio stay aligned.
 * Returns null when the ripple is refused (locked followers) or the item is
 * not found.
 */
export function retimeItemSpeed(
  prev: EditorProject,
  trackId: string,
  itemId: string,
  speed: number
): EditorProject | null {
  const track = prev.tracks.find((t) => t.id === trackId);
  const item = track?.items.find((i) => i.id === itemId);
  if (!track || !item || track.locked || item.locked || !Number.isFinite(speed) || speed <= 0) return null;
  const oldSpeed = item.speed?.speed ?? 1;
  if (!Number.isFinite(oldSpeed) || oldSpeed <= 0 || item.speed?.speed_ramp) return null;
  if (Math.abs(speed - oldSpeed) < 1e-9) return prev;
  const sourceWindow = item.source_end - item.source_start;
  if (sourceWindow <= 0.05) return null;
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  const newEnd = r3(item.timeline_start + sourceWindow / speed);
  const delta = newEnd - item.timeline_end;

  const oldEnd = item.timeline_end;
  const start = item.timeline_start;
  // Refuse early (before any item mutation) when locked content crosses or
  // extends past the retime point: the ripple would silently misalign it.
  const lockedHit = prev.tracks.some(
    (t) => t.items.some((it) => (t.locked || it.locked) && it.timeline_end > start)
  );
  if (lockedHit) return null;

  // Piecewise caption mapping: before the item unchanged, inside the item
  // compressed/stretched with the speed, after its old end shifted by delta.
  // Monotone, so word and cue boundaries never invert; straddlers map
  // naturally without splitting.
  const mapT = (v: number): number => {
    if (v <= start) return v;
    if (v < oldEnd) return r3(start + (v - start) * oldSpeed / speed);
    return r3(v + delta);
  };

  const withRetime: EditorProject = {
    ...prev,
    canvas: { ...prev.canvas, duration: r3(Math.max(0.1, prev.canvas.duration + delta)) },
    tracks: prev.tracks.map((t) => {
      if (t.locked) return t;
      const items = t.items.map((i) => {
        if (t.id === trackId && i.id === itemId) {
          return {
            ...i,
            timeline_end: newEnd,
            speed: { speed, pitch_preserved: i.speed?.pitch_preserved ?? true },
          };
        }
        if (t.type === 'CAPTION' && i.caption && Array.isArray(i.caption.cues)) {
          // Match the legacy item-relative convention used by export, then
          // persist absolute clocks so later speed changes cannot rebase twice.
          const cues = i.caption.cues;
          const relative = i.timeline_start > 0 && cues.length > 0 && cues[0].start >= 0 && cues[0].start < i.timeline_start - .05;
          const origin = relative ? i.timeline_start : 0;
          const cueTime = (t: number) => mapT(t + origin);
          const mapWords = (words: any[]) => words.map(w => ({...w, start: cueTime(w.start), end: cueTime(w.end)}));
          return {
            ...i,
            timeline_start: mapT(i.timeline_start),
            timeline_end: mapT(i.timeline_end),
            caption: {
              ...i.caption,
              ...(typeof i.caption.cues_covered_end === 'number' ? {cues_covered_end: cueTime(i.caption.cues_covered_end)} : {}),
              cues: cues.map((c: any) => ({
                ...c,
                start: cueTime(c.start),
                end: cueTime(c.end),
                words: Array.isArray(c.words)
                  ? mapWords(c.words)
                  : c.words,
                ...(Array.isArray((c as any).tokens) ? {tokens: mapWords((c as any).tokens)} : {}),
              })),
            },
          };
        }
        if (i.timeline_start >= oldEnd) {
          return { ...i, timeline_start: r3(i.timeline_start + delta), timeline_end: r3(i.timeline_end + delta) };
        }
        if (i.timeline_end > oldEnd) {
          // Straddling non-caption item stretches over the region change.
          return { ...i, timeline_end: r3(i.timeline_end + delta) };
        }
        return i;
      });
      return { ...t, items };
    }),
  };
  return withRetime;
}
