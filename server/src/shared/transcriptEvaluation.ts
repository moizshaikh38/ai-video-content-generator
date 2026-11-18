/** Offline transcript comparison. Metrics describe supplied references, not
 * proof that either transcript matches source audio. No provider calls. */
export interface EvaluationWord {
  text: string;
  start?: number;
  end?: number;
  tags?: Array<'name' | 'number'>;
}
export interface TranscriptEvaluationCase {
  caseId: string;
  sourceSha256: string;
  language: string;
  noiseBucket: string;
  reference: {
    provenance: 'independently-reviewed' | 'single-reviewer' | 'synthetic';
    words: EvaluationWord[];
  };
  hypothesis: {
    provider: string;
    model: string;
    execution: 'actual-provider' | 'mock' | 'manual';
    manuallyCorrected: boolean;
    words: EvaluationWord[];
  };
}
export interface WordAlignment {
  operation: 'equal' | 'substitution' | 'deletion' | 'insertion';
  referenceIndex?: number;
  hypothesisIndex?: number;
}
// Versioned normalization is deliberately narrow. Do not translate, remove
// diacritics, convert number words, rewrite names, or silently split tokens.
export function normalizeEvaluationWord(text: string): string {
  const token = text.normalize('NFC').toLocaleLowerCase('und').trim();
  // Numeric punctuation/signs/currency may change meaning (.5, -1, $50).
  // Leave numeric tokens exact apart from case/NFC/outer whitespace.
  if (/\p{N}/u.test(token)) return token;
  return token.replace(/^[\p{P}\s]+|[\p{P}\s]+$/gu, '');
}
function checkWords(words: EvaluationWord[], label: string): void {
  if (!Array.isArray(words) || words.some(word => !word || typeof word.text !== 'string' || !normalizeEvaluationWord(word.text))) {
    throw new Error(`${label} must contain explicit nonempty spoken-word tokens, not punctuation-only entries.`);
  }
  if (words.length > 3000) throw new Error('Bound comparisons to at most3000tokens per transcript.');
  if (words.some(word => word.tags && (!Array.isArray(word.tags) || word.tags.some(tag => tag !== 'name' && tag !== 'number')))) {
    throw new Error('Unknown reference word tag.');
  }
}
function hasClock(word: EvaluationWord): boolean {
  return typeof word.start === 'number' && Number.isFinite(word.start) && word.start >= 0 &&
    typeof word.end === 'number' && Number.isFinite(word.end) && word.end > word.start;
}
export function alignEvaluationWords(reference: EvaluationWord[], hypothesis: EvaluationWord[]): WordAlignment[] {
  checkWords(reference, 'Reference');
  checkWords(hypothesis, 'Hypothesis');
  const a = reference.map(word => normalizeEvaluationWord(word.text));
  const b = hypothesis.map(word => normalizeEvaluationWord(word.text));
  const costs = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = 0; i <= a.length; i++) costs[i][0] = i;
  for (let j = 0; j <= b.length; j++) costs[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    costs[i][j] = Math.min(costs[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1), costs[i - 1][j] + 1, costs[i][j - 1] + 1);
  }
  const aligned: WordAlignment[] = [];
  let i = a.length, j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && costs[i][j] === costs[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) {
      aligned.push({ operation: a[i - 1] === b[j - 1] ? 'equal' : 'substitution', referenceIndex: --i, hypothesisIndex: --j });
    } else if (i > 0 && costs[i][j] === costs[i - 1][j] + 1) {
      aligned.push({ operation: 'deletion', referenceIndex: --i });
    } else {
      aligned.push({ operation: 'insertion', hypothesisIndex: --j });
    }
  }
  return aligned.reverse();
}
export function evaluateTranscript(input: TranscriptEvaluationCase) {
  if (!input || typeof input.caseId !== 'string' || !input.caseId.trim() || !/^[a-f0-9]{64}$/i.test(input.sourceSha256) ||
      !input.language?.trim() || !input.noiseBucket?.trim() || !input.reference || !input.hypothesis ||
      !['independently-reviewed', 'single-reviewer', 'synthetic'].includes(input.reference.provenance) ||
      !['actual-provider', 'mock', 'manual'].includes(input.hypothesis.execution) ||
      !input.hypothesis.provider?.trim() || !input.hypothesis.model?.trim() || typeof input.hypothesis.manuallyCorrected !== 'boolean') {
    throw new Error('Explicit case/source/language/noise/reference/provider provenance is required.');
  }
  const alignment = alignEvaluationWords(input.reference.words, input.hypothesis.words);
  const counts = { equal: 0, substitution: 0, deletion: 0, insertion: 0 };
  const tagged = { name: { reference: 0, errors: 0 }, number: { reference: 0, errors: 0 } };
  const timing: Array<{ referenceIndex: number; hypothesisIndex: number; startErrorMs: number; endErrorMs: number }> = [];
  for (const row of alignment) {
    counts[row.operation]++;
    if (row.referenceIndex !== undefined) {
      const ref = input.reference.words[row.referenceIndex];
      for (const tag of new Set(ref.tags || [])) {
        tagged[tag].reference++;
        if (row.operation !== 'equal') tagged[tag].errors++;
      }
      if (row.operation === 'equal' && row.hypothesisIndex !== undefined) {
        const hyp = input.hypothesis.words[row.hypothesisIndex];
        if (hasClock(ref) && hasClock(hyp)) timing.push({ referenceIndex: row.referenceIndex, hypothesisIndex: row.hypothesisIndex,
          startErrorMs: Math.abs(hyp.start! - ref.start!) * 1000, endErrorMs: Math.abs(hyp.end! - ref.end!) * 1000 });
      }
    }
  }
  const errors = counts.substitution + counts.deletion + counts.insertion;
  const absolute = timing.flatMap(row => [row.startErrorMs, row.endErrorMs]).sort((a, b) => a - b);
  const recordEligible = input.reference.provenance === 'independently-reviewed' && input.hypothesis.execution === 'actual-provider' && !input.hypothesis.manuallyCorrected;
  return {
    version: 1,
    normalization: 'NFC+Unicode-lowercase+non-numeric-edge-punctuation-and-space-trim-v3',
    identity: { caseId: input.caseId, sourceSha256: input.sourceSha256, language: input.language, noiseBucket: input.noiseBucket },
    provenance: { reference: input.reference.provenance, provider: input.hypothesis.provider, model: input.hypothesis.model,
      execution: input.hypothesis.execution, manuallyCorrected: input.hypothesis.manuallyCorrected },
    // Eligibility reflects supplied declarations only. It does not authenticate
    // reference review or provider execution; attach source records separately.
    recordedNoRescueEligibility: recordEligible,
    referenceWords: input.reference.words.length,
    hypothesisWords: input.hypothesis.words.length,
    counts,
    wordErrorRate: input.reference.words.length ? errors / input.reference.words.length : null,
    taggedReferenceErrors: tagged,
    timing: { matchedTimedWords: timing.length, exactLexicalMatches: counts.equal,
      meanAbsoluteBoundaryErrorMs: absolute.length ? absolute.reduce((a, b) => a + b, 0) / absolute.length : null,
      p95AbsoluteBoundaryErrorMs: absolute.length ? absolute[Math.ceil(absolute.length * .95) - 1] : null, samples: timing },
    alignment,
    caveat: 'Metrics compare supplied word tokens. References, tags and provenance require independent evidence. Timing excludes lexical errors and unavailable/invalid clocks; no automatic accuracy/pass threshold is inferred.',
  };
}
