/**
 * Server port of src/lib/captionExtendMerge.ts (client). Keep semantics in sync.
 *
 * Append-only merge for beyond-candidate extend: freshly extracted cues honor
 * the clip's current trim offsets; saved editor cues (user edits/deletions) are
 * authoritative through `coveredEnd` and are never mutated or resurrected.
 */

export interface ExtendMergeCue {
  id?: string;
  start: number;
  end: number;
  text?: string;
  words?: Array<{ start: number; end: number; text?: string; word?: string }>;
}

const EPS = 0.001;

export function maxCueEnd(cues: ExtendMergeCue[]): number {
  let m = 0;
  for (const c of cues) {
    if (Number.isFinite(c.end) && c.end > m) m = c.end;
  }
  return Number(m.toFixed(3));
}

function cueSignature(c: ExtendMergeCue): string {
  return `${Number(c.start).toFixed(2)}_${Number(c.end).toFixed(2)}_${(c.text || '').trim().toLowerCase()}`;
}

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
        additions.push({ ...fc, id: fc.id || `cue-ext-${fc.start.toFixed(3)}` });
      }
    } else if (fc.end > boundary + EPS && Array.isArray(fc.words) && fc.words.length > 0) {
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
 * Aggregate coverage boundary (clip-local seconds) across visible caption items
 * of a project: the furthest point the saved cues are authoritative for.
 */
export function editorProjectCoveredEnd(proj: any): number | null {
  if (!proj || !Array.isArray(proj.tracks)) return null;
  let covered: number | null = null;
  for (const t of proj.tracks) {
    if (t?.type !== 'CAPTION' || t.hidden || !Array.isArray(t.items)) continue;
    for (const item of t.items) {
      if (item.hidden || !item.caption || !Array.isArray(item.caption.cues) || item.caption.cues.length === 0) continue;
      const itemStart = typeof item.timeline_start === 'number' ? item.timeline_start : 0;
      const raw = item.caption.cues as ExtendMergeCue[];
      const isRel = itemStart > 0 && raw.length > 0 && raw[0].start < itemStart - 0.05;
      const marker = typeof item.caption.cues_covered_end === 'number'
        ? item.caption.cues_covered_end
        : maxCueEnd(raw);
      const abs = isRel ? itemStart + marker : marker;
      if (covered === null || abs > covered) covered = Number(abs.toFixed(3));
    }
  }
  return covered;
}
