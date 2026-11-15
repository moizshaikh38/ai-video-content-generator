import { EditorProject, EditorTrack, EditorTrackItem } from '../types';

/**
 * Scene reorder ("drag to rearrange sections", Opus parity).
 *
 * Semantics: on drop, the dragged scene's target slot on its track is derived
 * from the drop time vs the other scenes' ORIGINAL centers. When the slot
 * changes, the track is repacked gapless from its original start - every scene
 * keeps its own duration, so unequal scene lengths stay intact and no gaps or
 * overlaps appear.
 *
 * Cross-track alignment: an item on another unlocked track follows the moved
 * scene that DOMINATES it (largest overlap with the item's original span),
 * but only when that scene covers more than half the item - so a scene's
 * captions / b-roll / audio move with it, while track-spanning items like a
 * music bed (no dominant scene) correctly stay put. Nothing is silently left
 * misaligned: if a LOCKED track holds any item intersecting a moved scene's
 * span, the reorder is refused instead of leaving locked content behind.
 */

export interface ReorderResult {
  tracks: EditorTrack[];
  fromIndex: number;
  toIndex: number;
  movedCount: number;
}

export interface ReorderBlocked {
  blocked: 'locked-followers';
  trackNames: string[];
}

const itemDuration = (i: EditorTrackItem) => i.timeline_end - i.timeline_start;
const overlap = (aS: number, aE: number, bS: number, bE: number) =>
  Math.max(0, Math.min(aE, bE) - Math.max(aS, bS));

export function computeSceneReorder(
  project: EditorProject,
  trackId: string,
  itemId: string,
  dropTime: number
): ReorderResult | ReorderBlocked | null {
  const track = project.tracks.find((t) => t.id === trackId);
  if (!track || track.locked) return null;
  // Reorder is a scene-level operation on sequential content tracks only.
  if (track.type !== 'VIDEO') return null;

  const ordered = [...track.items].sort((a, b) => a.timeline_start - b.timeline_start);
  if (ordered.length < 2) return null;
  const fromIndex = ordered.findIndex((i) => i.id === itemId);
  if (fromIndex === -1) return null;

  // Target slot: number of OTHER scenes whose original center is left of the drop.
  const others = ordered.filter((i) => i.id !== itemId);
  let toIndex = 0;
  for (const o of others) {
    const center = (o.timeline_start + o.timeline_end) / 2;
    if (dropTime > center) toIndex++;
  }
  if (toIndex === fromIndex) return null;

  const reordered = [...others.slice(0, toIndex), ordered[fromIndex], ...others.slice(toIndex)];

  // Repack gapless from the track's original first start.
  const trackStart = ordered[0].timeline_start;
  let cursor = trackStart;
  const deltaById = new Map<string, number>();
  const spanById = new Map<string, { s: number; e: number }>();
  const newTrackItems = reordered.map((scene) => {
    const dur = itemDuration(scene);
    const newStart = Math.round(cursor * 1000) / 1000;
    const newEnd = Math.round((cursor + dur) * 1000) / 1000;
    deltaById.set(scene.id, newStart - scene.timeline_start);
    spanById.set(scene.id, { s: scene.timeline_start, e: scene.timeline_end });
    cursor = newEnd;
    return { ...scene, timeline_start: newStart, timeline_end: newEnd };
  });

  // Safety: a locked track holding anything that intersects a moved scene's
  // original span cannot follow it - refuse the reorder rather than leave
  // locked captions/audio behind misaligned.
  const blockedTracks: string[] = [];
  for (const t of project.tracks) {
    if (t.id === trackId || !t.locked) continue;
    const hit = t.items.some((it) =>
      ordered.some((scene) => {
        const d = deltaById.get(scene.id);
        if (!d) return false;
        const span = spanById.get(scene.id)!;
        return overlap(it.timeline_start, it.timeline_end, span.s, span.e) > 0;
      })
    );
    if (hit) blockedTracks.push(t.name || t.type);
  }
  if (blockedTracks.length > 0) {
    return { blocked: 'locked-followers', trackNames: blockedTracks };
  }

  // Dominant moved scene for a span: the moved scene covering more than half
  // of it (largest overlap wins), else no shift.
  const dominantDelta = (s0: number, e0: number): number => {
    const dur = Math.max(0.001, e0 - s0);
    let bestDelta = 0;
    let bestOverlap = 0;
    for (const scene of ordered) {
      const d = deltaById.get(scene.id);
      if (!d) continue;
      const span = spanById.get(scene.id)!;
      const ov = overlap(s0, e0, span.s, span.e);
      if (ov > bestOverlap) {
        bestOverlap = ov;
        bestDelta = d;
      }
    }
    return bestOverlap > dur / 2 ? bestDelta : 0;
  };

  // Followers on unlocked tracks. CAPTION items never move as a whole - their
  // cues (and word timings) are timeline-addressed content, so each cue
  // follows its own dominant scene; that keeps burned text on the speech it
  // belongs to when scenes swap. Other items (audio, b-roll, text, overlays)
  // shift by their dominant scene; track-spanning items like a music bed have
  // no dominant scene and correctly stay put.
  let movedCount = 0;
  const newTracks = project.tracks.map((t) => {
    if (t.id === trackId) return { ...t, items: newTrackItems };
    const items = t.items.map((it) => {
      if (t.type === 'CAPTION' && it.caption && Array.isArray(it.caption.cues)) {
        let cueMoved = false;
        const cues = it.caption.cues.map((cue: any) => {
          const d = dominantDelta(Number(cue.start) || 0, Number(cue.end) || 0);
          if (d === 0) return cue;
          cueMoved = true;
          const shift = (v: any) =>
            typeof v === 'number' ? Math.max(0, Math.round((v + d) * 1000) / 1000) : v;
          return {
            ...cue,
            start: shift(cue.start),
            end: shift(cue.end),
            words: Array.isArray(cue.words)
              ? cue.words.map((w: any) => ({ ...w, start: shift(w.start), end: shift(w.end) }))
              : cue.words,
          };
        });
        if (cueMoved) {
          movedCount++;
          return { ...it, caption: { ...it.caption, cues } };
        }
        return it;
      }
      const d = dominantDelta(it.timeline_start, it.timeline_end);
      if (d !== 0) {
        movedCount++;
        return {
          ...it,
          timeline_start: Math.round((it.timeline_start + d) * 1000) / 1000,
          timeline_end: Math.round((it.timeline_end + d) * 1000) / 1000,
        };
      }
      return it;
    });
    return { ...t, items };
  });

  return { tracks: newTracks, fromIndex, toIndex, movedCount };
}

export function isReorderBlocked(r: ReorderResult | ReorderBlocked | null): r is ReorderBlocked {
  return !!r && (r as ReorderBlocked).blocked === 'locked-followers';
}
