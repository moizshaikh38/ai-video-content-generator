/**
 * Caption coverage merge for beyond-candidate extend.
 *
 * When a clip's tail is extended past the span its caption cues were generated
 * for, freshly extracted cues (which honor the current trim offsets) cover the
 * new span while the EditorProject's saved cues do not. This module appends only
 * the newly exposed span so user edits and intentional deletions inside the
 * previously covered region are never regenerated or resurrected.
 *
 * Coverage is tracked with a `cues_covered_end` marker stored on the caption
 * item: the highest clip-local second the saved cues are authoritative for.
 * Only fresh cues starting at or after that marker are appended. Deleting an
 * appended cue later does not resurrect it, because the marker has already
 * advanced past it.
 */

export interface ExtendMergeCue {
  id?: string;
  start: number;
  end: number;
  text?: string;
  words?: Array<{ start: number; end: number; text?: string; word?: string }>;
}

const EPS = 0.001;

function maxCueEnd(cues: ExtendMergeCue[]): number {
  let m = 0;
  for (const c of cues) {
    if (Number.isFinite(c.end) && c.end > m) m = c.end;
  }
  return Number(m.toFixed(3));
}

function cueSignature(c: ExtendMergeCue): string {
  return `${Number(c.start).toFixed(2)}_${Number(c.end).toFixed(2)}_${(c.text || '').trim().toLowerCase()}`;
}

/**
 * Initialize the coverage marker for a project saved before this feature
 * existed: the saved cues are assumed authoritative through their own max end.
 * No cues are appended on initialization.
 */
export function initCoveredEnd(savedCues: ExtendMergeCue[]): number {
  return maxCueEnd(savedCues);
}

/**
 * Append fresh cues that start at or after `coveredEnd`. Returns the merged
 * list (saved cues first, order preserved) and the new coverage marker.
 * Fresh cues straddling the boundary contribute only their words that start
 * inside the newly exposed span, regrouped into a synthetic cue, so no spoken
 * word inside the extension is dropped and no existing cue is mutated.
 */
export function mergeExtendedCues(
  savedCues: ExtendMergeCue[],
  freshCues: ExtendMergeCue[],
  coveredEnd: number
): { cues: ExtendMergeCue[]; coveredEnd: number; appended: number } {
  const boundary = Number(coveredEnd.toFixed(3));
  const existing = new Set(savedCues.map(cueSignature));
  const additions: ExtendMergeCue[] = [];

  for (const fc of freshCues) {
    if (!Number.isFinite(fc.start) || !Number.isFinite(fc.end)) continue;
    if (fc.start >= boundary - EPS) {
      const sig = cueSignature(fc);
      if (!existing.has(sig)) {
        existing.add(sig);
        additions.push({
          ...fc,
          id: fc.id || `cue-ext-${fc.start.toFixed(3)}`,
        });
      }
    } else if (fc.end > boundary + EPS && Array.isArray(fc.words) && fc.words.length > 0) {
      // Straddling cue: keep only words inside the newly exposed span.
      const tailWords = fc.words.filter((w) => Number.isFinite(w.start) && w.start >= boundary - EPS);
      if (tailWords.length > 0) {
        const start = Math.min(...tailWords.map((w) => w.start));
        const end = Math.max(...tailWords.map((w) => w.end));
        const text = tailWords.map((w) => w.text ?? w.word ?? '').filter(Boolean).join(' ');
        const sig = cueSignature({ start, end, text });
        if (text && !existing.has(sig)) {
          existing.add(sig);
          additions.push({
            id: `cue-ext-${start.toFixed(3)}`,
            start: Number(start.toFixed(3)),
            end: Number(end.toFixed(3)),
            text,
            words: tailWords,
          });
        }
      }
    }
  }

  if (additions.length === 0) {
    return { cues: savedCues, coveredEnd: boundary, appended: 0 };
  }
  const merged = [...savedCues, ...additions].sort((a, b) => a.start - b.start);
  const newCovered = Math.max(boundary, maxCueEnd(additions));
  return { cues: merged, coveredEnd: Number(newCovered.toFixed(3)), appended: additions.length };
}

/**
 * Whether an item's cues are stored relative to the item's timeline_start
 * (same rule as the studio's load aggregation): relative only when the item
 * starts after 0 and its first cue begins before its timeline offset.
 */
export function itemCueOffset(item: { timeline_start?: number; caption?: { cues?: ExtendMergeCue[] } }): number {
  const startOff = Number(item.timeline_start || 0);
  const cues = item.caption?.cues;
  if (startOff > 0 && Array.isArray(cues) && cues.length > 0 && cues[0].start < startOff - 0.05) {
    return startOff;
  }
  return 0;
}

/**
 * Heal every visible caption item on every visible CAPTION track: initialize
 * the coverage marker where absent, then append the newly exposed span.
 * Fresh cues are clip-local absolute; items whose cues are relative to their
 * timeline_start are converted both ways. Hidden tracks/items are the user's
 * explicit "captions off" state and are left untouched. Returns the healed
 * tracks plus how many cues were appended and whether any marker changed.
 */
export function healCaptionTracks<T = any>(
  tracks: T[],
  freshCues: ExtendMergeCue[],
  canvasDuration?: number
): { tracks: T[]; appended: number; markersChanged: boolean } {
  let appendedTotal = 0;
  let markersChanged = false;
  const next = (tracks as any[]).map((t) => {
    if (t?.type !== 'CAPTION' || t.hidden || !Array.isArray(t.items)) return t;
    const items = t.items.map((itm: any) => {
      if (itm.hidden || !itm.caption || !Array.isArray(itm.caption.cues)) return itm;
      // An explicit coverage marker preserves a deliberately empty saved edit,
      // while allowing only newly extended speech to be appended.
      if (itm.caption.cues.length === 0 && !(typeof itm.caption.cues_covered_end === 'number' && Number.isFinite(itm.caption.cues_covered_end) && itm.caption.cues_covered_end >= 0)) return itm;
      const offset = itemCueOffset(itm);
      const marker = itm.caption.cues_covered_end;
      if (marker == null) {
        markersChanged = true;
        return { ...itm, caption: { ...itm.caption, cues_covered_end: initCoveredEnd(itm.caption.cues) } };
      }
      const relFresh = freshCues.map((c) => ({
        ...c,
        start: Number((c.start - offset).toFixed(3)),
        end: Number((c.end - offset).toFixed(3)),
        words: Array.isArray(c.words)
          ? c.words.map((w) => ({ ...w, start: Number((w.start - offset).toFixed(3)), end: Number((w.end - offset).toFixed(3)) }))
          : c.words,
      }));
      const { cues: merged, coveredEnd, appended } = mergeExtendedCues(itm.caption.cues, relFresh, Number(marker));
      if (appended === 0) return itm;
      appendedTotal += appended;
      markersChanged = true;
      const updated: any = { ...itm, caption: { ...itm.caption, cues: merged, cues_covered_end: coveredEnd } };
      if (canvasDuration && Number(itm.timeline_end || 0) < canvasDuration) {
        updated.timeline_end = canvasDuration;
        updated.source_end = canvasDuration;
      }
      return updated;
    });
    return { ...t, items };
  });
  return { tracks: next as T[], appended: appendedTotal, markersChanged };
}
