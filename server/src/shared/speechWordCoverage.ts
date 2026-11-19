/** Text agreement is separate from clock validity. Never infer which rendition
 * matches the audio, drop unmatched words, deduplicate repeats or invent clocks.
 * Ignore only case, Unicode canonical form, punctuation and spacing so provider
 * subword/email segmentation is not itself a mismatch. Preserve letters, marks,
 * numbers and symbols, including every occurrence of legitimate repeated speech. */
export function speechCoverageKey(text: string): string {
  return text.normalize('NFC').toLowerCase().replace(/[\p{P}\p{Z}\s]/gu, '');
}
export interface SpeechCoverageInput {
  text?: unknown;
  transcript_text?: unknown;
  words?: Array<{word?: unknown;text?: unknown;kind?: unknown}>;
  segments?: Array<{text?: unknown}>;
}
export function speechWordCoverage(input: SpeechCoverageInput): 'consistent' | 'mismatch' | 'unavailable' {
  if (!Array.isArray(input.words) || !input.words.length) return 'unavailable';
  const declared = typeof input.text === 'string' && input.text.trim() ? input.text :
    typeof input.transcript_text === 'string' && input.transcript_text.trim() ? input.transcript_text :
    (Array.isArray(input.segments) ? input.segments : []).map(s => typeof s?.text === 'string' ? s.text : '').join(' ');
  if (!declared.trim()) return 'unavailable';
  const spoken = input.words.map(w => typeof w?.word === 'string' ? w.word : typeof w?.text === 'string' ? w.text : '').join(' ');
  return speechCoverageKey(declared) === speechCoverageKey(spoken) ? 'consistent' : 'mismatch';
}
export function assertSpeechWordCoverage(input: SpeechCoverageInput): void {
  if (speechWordCoverage(input) !== 'mismatch') return;
  throw Object.assign(new Error('Transcript text and caption words disagree. Review the original audio before export; no text, repeated speech or provider timestamps were changed.'), {code:'TRANSCRIPT_WORD_TEXT_REVIEW_REQUIRED',statusCode:409});
}
