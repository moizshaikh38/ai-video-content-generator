import {reliableOrderedClocks} from '../../shared/orderedTranscriptTiming.js';
import type {NormalizedTranscriptSegment,NormalizedTranscriptWord} from './types.js';
import {readSegmentDiagnostics} from './transcriptQuality.js';
export interface TranscriptionTimingIssue {
  kind: 'word' | 'segment';
  index: number;
  reason: 'invalid-or-missing-provider-clock' | 'unordered-or-overlapping-provider-clock';
}
/** Keep actual provider clocks only. Invalid entries are accounted for as review
 * issues, not silently repaired into50msword timings or zero-based segments. */
export function normalizeProviderTiming(result: any): {
  segments: NormalizedTranscriptSegment[];
  words: NormalizedTranscriptWord[];
  timingIssues: TranscriptionTimingIssue[];
} {
  const rawSegments = Array.isArray(result?.segments) ? result.segments : [];
  const rawWords = Array.isArray(result?.words) ? result.words :
    rawSegments.flatMap((segment: any) => Array.isArray(segment?.words) ? segment.words : []);
  const timingIssues: TranscriptionTimingIssue[] = [];
  const clock = (value: any) => typeof value?.start === 'number' && Number.isFinite(value.start) && value.start >= 0 &&
    typeof value?.end === 'number' && Number.isFinite(value.end) && value.end > value.start;
  const segments: NormalizedTranscriptSegment[] = [];
  const words: NormalizedTranscriptWord[] = [];
  rawSegments.forEach((segment: any, index: number) => {
    if (!clock(segment)) {
      timingIssues.push({kind: 'segment', index, reason: 'invalid-or-missing-provider-clock'});
      return;
    }
    const text = typeof segment.text === 'string' ? segment.text.trim() : '';
    if (text) segments.push({start: segment.start, end: segment.end, text, ...readSegmentDiagnostics(segment)});
  });
  rawWords.forEach((word: any, index: number) => {
    if (!clock(word)) {
      timingIssues.push({kind: 'word', index, reason: 'invalid-or-missing-provider-clock'});
      return;
    }
    const text = typeof (word.word ?? word.text) === 'string' ? (word.word ?? word.text).trim() : '';
    if (text) words.push({word: text, start: word.start, end: word.end,
      ...(typeof word.probability === 'number' && Number.isFinite(word.probability) && word.probability >= 0 && word.probability <= 1 ? {confidence: word.probability} : {})});
  });
  // Keep clocks and text unchanged, but do not label cross-word overlap/order as reliable.
  if (words.length && !reliableOrderedClocks(words)) timingIssues.push({kind:'word',index:0,reason:'unordered-or-overlapping-provider-clock'});
  if (segments.length && !reliableOrderedClocks(segments)) timingIssues.push({kind:'segment',index:0,reason:'unordered-or-overlapping-provider-clock'});
  return {segments, words, timingIssues};
}
