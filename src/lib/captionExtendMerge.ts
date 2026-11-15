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
