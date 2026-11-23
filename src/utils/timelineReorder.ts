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
 *
 * Caption cues are speech-anchored, so a cue that STRADDLES a scene boundary
 * is never dragged wholesale onto one side: when the scenes under it move by
 * different deltas, the cue is split at the original boundary and each
 * fragment follows its own scene, with word timings partitioned by word
 * center. Words are what actually render, so alignment is preserved exactly;
 * a cue without word timings falls back to the dominant-delta whole shift.
 */

export interface ReorderResult {
  tracks: EditorTrack[];
  fromIndex: number;
  toIndex: number;
  movedCount: number;
}

export interface ReorderBlocked {
  blocked: 'locked-followers' | 'unworded-straddling-captions';
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

  // Per-time scene delta over the ORIGINAL layout: every scene's span maps
  // to its repack delta (0 for scenes that did not move), outside spans 0.
  const sceneSpans = ordered.map((s) => ({
    s: s.timeline_start,
    e: s.timeline_end,
    d: deltaById.get(s.id) ?? 0,
  }));
  const deltaAt = (t: number): number => {
    for (const sp of sceneSpans) {
      if (t >= sp.s && t < sp.e) return sp.d;
    }
    return 0;
  };
  const round3 = (v: number) => Math.max(0, Math.round(v * 1000) / 1000);

  // Normalize legacy item-relative cues using the same convention as export.
  // Scene deltas operate on absolute timeline clocks, not item-local seconds.
  const captionClockTracks=project.tracks.map(t=>t.type!=='CAPTION'?t:{...t,items:t.items.map(it=>{
    const caption=it.caption;
    if(!caption)return it;
    const cues=caption.cues;
    if(!Array.isArray(cues)||!cues.length)return it;
    const start=it.timeline_start;
    const relative=start>0&&cues[0].start>=0&&cues[0].start<start-.05;
    if(!relative)return it;
    const shift=(rows:any)=>Array.isArray(rows)?rows.map((w:any)=>({...w,start:round3(w.start+start),end:round3(w.end+start)})):rows;
    return {...it,caption:{...caption,...(typeof caption.cues_covered_end==='number'?{cues_covered_end:round3(caption.cues_covered_end+start)}:{}),cues:cues.map((c:any)=>({...c,start:round3(c.start+start),end:round3(c.end+start),...(Array.isArray(c.words)?{words:shift(c.words)}:{}),...(Array.isArray(c.tokens)?{tokens:shift(c.tokens)}:{})}))}};
  })});

  // Correctness over convenience: a caption cue WITHOUT word timings that
  // straddles a boundary whose scenes move apart cannot be placed without
  // inventing timing - refuse the reorder rather than silently misalign
  // spoken text. (Word-timed straddlers split safely, see remapCue.)
  const unwordedStraddle = captionClockTracks.some(
    (t) =>
      t.type === 'CAPTION' &&
      t.items.some(
        (it) =>
          it.caption &&
          Array.isArray(it.caption.cues) &&
          it.caption.cues.some((cue: any) => {
            if (Array.isArray(cue.words) && cue.words.length > 0) return false;
            const cs = Number(cue.start) || 0;
            const ce = Number(cue.end) || 0;
            if (ce - cs <= 0.001) return false;
            return sceneSpans.some(
              (sp) =>
                sp.e > cs + 0.001 &&
                sp.e < ce - 0.001 &&
                deltaAt(sp.e - 0.001) !== deltaAt(sp.e + 0.001)
            );
          })
      )
  );
  if (unwordedStraddle) {
    return { blocked: 'unworded-straddling-captions', trackNames: ['Captions'] };
  }

  // Remap one caption cue. Cues are speech-anchored: if a cue straddles scene
  // boundaries whose sides move by different deltas, split it at the original
  // boundaries and shift each fragment with its own scene, partitioning word
  // timings by word center so burned text stays on the speech it belongs to.
  // Without word timings a split would garble the text, so fall back to the
  // dominant-delta whole shift.
  const remapCue = (cue: any): any[] => {
    const cs = Number(cue.start) || 0;
    const ce = Number(cue.end) || 0;
    if (ce - cs <= 0.001) return [cue];
    const boundaries = sceneSpans
      .map((sp) => sp.e)
      .filter((b) => b > cs + 0.001 && b < ce - 0.001)
      .sort((a, b) => a - b);
    const words = Array.isArray(cue.words) ? cue.words : null;
    const deltasDiffer = boundaries.some((b) => deltaAt(b - 0.001) !== deltaAt(b + 0.001));
    if (boundaries.length === 0 || !deltasDiffer) {
      const d = boundaries.length === 0 ? deltaAt((cs + ce) / 2) : deltaAt(cs + 0.001);
      if (d === 0) return [cue];
      return [
        {
          ...cue,
          start: round3(cs + d),
          end: round3(ce + d),
          words: words
            ? words.map((w: any) => ({ ...w, start: round3(w.start + d), end: round3(w.end + d) }))
            : cue.words,
          ...(Array.isArray(cue.tokens)?{tokens:cue.tokens.map((w:any)=>({...w,start:round3(w.start+d),end:round3(w.end+d)}))}:{}),
        },
      ];
    }
    if (!words || words.length === 0) {
      // Unreachable in practice: computeSceneReorder refuses the reorder up
      // front when an unworded cue straddles a diverging boundary. Defensive
      // fallback: keep the cue whole on its dominant side.
      const d = dominantDelta(cs, ce);
      if (d === 0) return [cue];
      return [{ ...cue, start: round3(cs + d), end: round3(ce + d) }];
    }
    const points = [cs, ...boundaries, ce];
    const fragments: any[] = [];
    for (let k = 0; k < points.length - 1; k++) {
      const fs = points[k];
      const fe = points[k + 1];
      const d = deltaAt((fs + fe) / 2);
      const fragWords = words.filter((w: any) => {
        const c = (Number(w.start) + Number(w.end)) / 2;
        return c >= fs - 0.001 && c < fe - 0.001 + (k === points.length - 2 ? 0.002 : 0);
      });
      const fragStart = round3(fs + d);
      const fragEnd = round3(fe + d);
      fragments.push({
        ...cue,
        id: k === 0 ? cue.id : `${cue.id}-x${k}`,
        start: fragStart,
        end: fragEnd,
        text: fragWords.map((w: any) => w.text ?? w.word ?? '').join(' ').trim() || cue.text,
        ...(Array.isArray(cue.tokens)?{tokens:cue.tokens.filter((w:any)=>{const center=(Number(w.start)+Number(w.end))/2;return center>=fs-.001&&center<fe-.001+(k===points.length-2?.002:0)}).map((w:any)=>({...w,start:Math.max(fragStart,round3(w.start+d)),end:Math.min(fragEnd,Math.max(fragStart,round3(w.end+d)))}))}:{}),
        // A word straddling the split boundary keeps its duration but clamps
        // into its fragment's shifted span rather than drifting outside it.
        words: fragWords.map((w: any) => ({
          ...w,
          start: Math.max(fragStart, round3(w.start + d)),
          end: Math.min(fragEnd, Math.max(fragStart, round3(w.end + d))),
        })),
      });
    }
    // A fragment whose span holds no words has no speech from this cue -
    // keeping it would duplicate the full original text with no timings.
    return fragments.filter((f) => f.words.length > 0);
  };

  // Followers on unlocked tracks. CAPTION items never move as a whole - their
  // cues (and word timings) are timeline-addressed content, remapped per cue
  // (and split at scene boundaries when needed, see remapCue). Other items
  // (audio, b-roll, text, overlays) shift by their dominant scene;
  // track-spanning items like a music bed have no dominant scene and
  // correctly stay put.
  let movedCount = 0;
  const newTracks = captionClockTracks.map((t) => {
    if (t.id === trackId) return { ...t, items: newTrackItems };
    const items = t.items.map((it) => {
      if (t.type === 'CAPTION' && it.caption && Array.isArray(it.caption.cues)) {
        const origCues: any[] = it.caption.cues;
        const cues = origCues.flatMap((cue: any) => remapCue(cue));
        const changed =
          cues.length !== origCues.length ||
          cues.some((c: any, i: number) => {
            const o = origCues[i];
            return !o || o.id !== c.id || o.start !== c.start || o.end !== c.end;
          });
        if (changed) {
          movedCount++;
          return { ...it, timeline_start:0,timeline_end:Math.max(it.timeline_end,...cues.map((c:any)=>c.end)),caption: { ...it.caption, cues } };
        }
        // Clock normalization is temporary planning data. Unaffected captions
        // retain their exact saved item, including locks and legacy convention.
        return project.tracks.find(original=>original.id===t.id)?.items.find(original=>original.id===it.id) || it;
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
  return !!r && typeof (r as ReorderBlocked).blocked === 'string';
}
