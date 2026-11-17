/** Source-file seconds only. A hook may preview only speech that survives
 * this clip's trim and opening window. This selects evidence, not claim truth. */
export interface HookSpeechSpan {
  start: number;
  end: number;
  text: string;
}
export interface HookOpeningEvidence {
  sourceStart: number;
  sourceEnd: number;
  granularity: 'word' | 'segment';
  spans: HookSpeechSpan[];
  text: string;
}
export function collectHookOpeningEvidence(
  clip: {
    start_seconds: number;
    end_seconds: number;
    trim_start_offset?: number | null;
    trim_end_offset?: number | null;
  },
  transcript: { words?: any[]; segments?: any[] }
): HookOpeningEvidence | null {
  const trimStart = clip.trim_start_offset ?? 0;
  const trimEnd = clip.trim_end_offset ?? 0;
  const validClock = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);
  if (![clip.start_seconds, clip.end_seconds, trimStart, trimEnd].every(validClock)) return null;
  const start = clip.start_seconds + trimStart;
  const end = clip.end_seconds - trimEnd;
  if (start < 0 || end <= start || trimStart < 0 || trimEnd < 0) return null;

  const sourceEnd = Math.min(end, start + 40);
  const wordMode = Array.isArray(transcript.words) && transcript.words.length > 0;
  const entries = wordMode ? transcript.words : transcript.segments;
  if (!Array.isArray(entries)) return null;
  const spans: HookSpeechSpan[] = entries
    .filter(value => value && typeof value === 'object' && validClock(value.start) && validClock(value.end))
    .map(value => ({
      start: value.start,
      end: value.end,
      text: typeof (value.text ?? value.word) === 'string' ? (value.text ?? value.word).trim() : '',
    }))
    .filter(value => value.end > value.start && value.start >= start && value.end <= sourceEnd && value.text.length > 0)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  // Ambiguous overlapping histories are not silently deduplicated.
  if (!spans.length || spans.some((value, i) => i > 0 && value.start < spans[i - 1].end - .001)) return null;
  return {
    sourceStart: start,
    sourceEnd,
    granularity: wordMode ? 'word' : 'segment',
    spans,
    text: spans.map(value => value.text).join(' '),
  };
}
