import type {NormalizedTranscriptSegment, NormalizedTranscriptWord} from './types.js';
import {reliableOrderedClocks} from '../../shared/orderedTranscriptTiming.js';

export interface SelectionSegmentDerivation {
  segments: NormalizedTranscriptSegment[];
  /** Index of the unchanged provider segment supplying each selection unit. */
  providerSegmentIndexes: number[];
  changed: boolean;
}
const whitespace = (text: string) => text.trim().replace(/\s+/gu, ' ');
const terminal = /[.!?。！？।]["'”’»)]*$/u;

/** Finer selection units, not semantic sentences or highlights. Apply only to a
 * newly generated transcript before persisting indexes and source binding.
 * Exact punctuation/text coverage and contained, ordered real clocks
 * are required. At most one millisecond of provider segment/word rounding may
 * expand a segment boundary to its real word clock; words never move. Any real
 * overlap or larger discrepancy preserves the entire original segmentation. */
export function deriveSelectionSegments(
  segments: NormalizedTranscriptSegment[],
  words: NormalizedTranscriptWord[],
  options?: { maxBoundarySkewSec?: number }
): SelectionSegmentDerivation {
  const unchanged = (): SelectionSegmentDerivation => ({segments, providerSegmentIndexes: segments.map((_, i) => i), changed: false});
  const skew = options?.maxBoundarySkewSec;
  const maxSkew = typeof skew === 'number' && Number.isFinite(skew) && skew >= 0 ? skew : 0.001000001;
  if (!segments.length || !words.length || !reliableOrderedClocks(segments, 0) || !reliableOrderedClocks(words, 0)) return unchanged();
  if (segments.some(s => typeof s.text !== 'string' || !s.text.trim()) || words.some(w => typeof w.word !== 'string' || !w.word.trim() || (w.kind && w.kind !== 'word'))) return unchanged();
  const output: NormalizedTranscriptSegment[] = [], indexes: number[] = [];
  let cursor = 0, changed = false;
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index], from = cursor;
    while (cursor < words.length && words[cursor].start < segment.end) {
      if (words[cursor].start < segment.start - maxSkew || words[cursor].end > segment.end + maxSkew) return unchanged();
      cursor++;
    }
    const local = words.slice(from, cursor);
    // Do not strip punctuation or case to force agreement. Provider subwords,
    // missing punctuation or word disagreement simply keep the original units.
    if (!local.length || whitespace(local.map(w => w.word).join(' ')) !== whitespace(segment.text)) return unchanged();
    const groups: NormalizedTranscriptWord[][] = []; let pending: NormalizedTranscriptWord[] = [];
    for (const word of local) { pending.push(word); if (terminal.test(word.word)) { groups.push(pending); pending = []; } }
    if (pending.length) groups.push(pending); // Never discard unfinished speech.
    const start=Math.min(segment.start,local[0].start),end=Math.max(segment.end,local[local.length-1].end);
    const reconciled=start!==segment.start||end!==segment.end;
    if (groups.length < 2) { output.push(reconciled?{...segment,start,end}:segment); indexes.push(index); changed ||= reconciled; continue; }
    changed = true;
    groups.forEach((group, part) => {
      const {words: _providerWords, ...original} = segment;
      output.push({...original, start: part === 0 ? start : group[0].start,
        end: part === groups.length - 1 ? end : group[group.length - 1].end,
        text: group.map(w => w.word).join(' ')});
      indexes.push(index);
    });
  }
  if (cursor !== words.length || !changed || !reliableOrderedClocks(output,0)) return unchanged();
  return {segments: output, providerSegmentIndexes: indexes, changed: true};
}

/** Storage fields only for new transcription output. Never call on loaded rows.
 * Raw provider units remain diagnostics; the actual selection units are covered
 * by the existing transcript content binding. */
export function newTranscriptSelectionFields(segments: NormalizedTranscriptSegment[], words: NormalizedTranscriptWord[]) {
  const result = deriveSelectionSegments(segments, words);
  return {segments: result.segments, ...(result.changed ? {provider_segments: segments,
    selection_segmentation: {version: 2, method: 'provider-punctuation-and-word-clocks-1ms-envelope', provider_segment_indexes: result.providerSegmentIndexes}} : {})};
}
