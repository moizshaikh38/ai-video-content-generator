/**
 * Pure helpers for inserting an intro (prepend at t=0, ripple everything right) or an
 * outro (append at the end) clip into an EditorProject. Kept pure so the ripple/positioning
 * math is unit-testable and shared between the handler and tests.
 */
import type { EditorProject, EditorTrackItem } from '../types';

export type IntroOutroPosition = 'intro' | 'outro';

export const DEFAULT_TITLE_CARD_DURATION = 3;

/** Builds a title-card track item (full-frame colored card with centered text). */
export function createTitleCardItem(
  trackId: string,
  position: IntroOutroPosition,
  startSec: number,
  duration = DEFAULT_TITLE_CARD_DURATION
): EditorTrackItem {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `titlecard-${Math.random().toString(36).slice(2)}`;
  return {
    id,
    track_id: trackId,
    type: 'IMAGE',
    name: position === 'intro' ? 'Intro' : 'Outro',
    source_path: null,
    is_title_card: true,
    title_card_text: position === 'intro' ? 'Intro' : 'Outro',
    background_color: '#0B0D12',
    timeline_start: Number(startSec.toFixed(3)),
    timeline_end: Number((startSec + duration).toFixed(3)),
    source_start: 0,
    source_end: duration,
    transform: { position_x: 0, position_y: 0, scale: 1.0, rotation: 0, opacity: 1.0 },
    speed: { speed: 1.0, pitch_preserved: true },
    effects: [],
    keyframes: [],
    locked: false,
    muted: false,
    hidden: false,
    z_index: 5,
  } as EditorTrackItem;
}

/** Shifts every item on every track right by `delta` seconds (ripple for an intro). */
function shiftAllItems(project: EditorProject, delta: number): EditorProject {
  return {
    ...project,
    tracks: project.tracks.map((t) => ({
      ...t,
      items: t.items.map((i) => ({
        ...i,
        timeline_start: Number((i.timeline_start + delta).toFixed(3)),
        timeline_end: Number((i.timeline_end + delta).toFixed(3)),
      })),
    })),
  };
}

/**
 * Inserts `item` as an intro or outro on `trackId`, rippling the timeline and extending the
 * canvas duration. Intro: all existing items shift right by the item's duration and the item
 * is placed at 0. Outro: the item is appended at the current canvas end. Returns a new project
 * (pure) plus the placed item (its timing is normalized for the chosen position).
 */
export function insertIntroOutro(
  project: EditorProject,
  position: IntroOutroPosition,
  trackId: string,
  item: EditorTrackItem
): { project: EditorProject; item: EditorTrackItem } {
  const duration = Math.max(0.1, item.source_end - item.source_start);
  const canvasDuration = project.canvas.duration || 0;

  if (position === 'intro') {
    const shifted = shiftAllItems(project, duration);
    const placed: EditorTrackItem = {
      ...item,
      track_id: trackId,
      timeline_start: 0,
      timeline_end: Number(duration.toFixed(3)),
    };
    const next: EditorProject = {
      ...shifted,
      canvas: { ...shifted.canvas, duration: Number((canvasDuration + duration).toFixed(3)) },
      tracks: shifted.tracks.map((t) => (t.id === trackId ? { ...t, items: [placed, ...t.items] } : t)),
    };
    return { project: next, item: placed };
  }

  // Outro: append at the end of the current timeline.
  const placed: EditorTrackItem = {
    ...item,
    track_id: trackId,
    timeline_start: Number(canvasDuration.toFixed(3)),
    timeline_end: Number((canvasDuration + duration).toFixed(3)),
  };
  const next: EditorProject = {
    ...project,
    canvas: { ...project.canvas, duration: Number((canvasDuration + duration).toFixed(3)) },
    tracks: project.tracks.map((t) => (t.id === trackId ? { ...t, items: [...t.items, placed] } : t)),
  };
  return { project: next, item: placed };
}
