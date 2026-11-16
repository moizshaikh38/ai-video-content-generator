import type { NormalizedTranscriptionResult } from './types.js';

export interface TranscriptQualityIssue {
  code: 'language_mismatch' | 'low_confidence_repetition' | 'possible_silence_hallucination' | 'invalid_timing';
  start?: number;
  end?: number;
  detail: string;
}
export interface TranscriptQualityAssessment {
  version: 1;
  /** No automatic result is proof that its words match the audio. */
  status: 'unverified' | 'needs_review';
  diagnostics: 'present' | 'unavailable';
  issues: TranscriptQualityIssue[];
  provider?: string;
  model?: string;
  requested_language?: string;
  detected_language: string;
}

const languageCode = (v: string) => ({english:'en',spanish:'es',hindi:'hi'}[v.toLowerCase()] || v.toLowerCase().split('-')[0]);

/** Conservative product review rules, not a word-accuracy score. Missing provider
 * diagnostics stays unavailable, never fabricated confidence or an automatic pass.
 * No dictionary rewrite, translation, language guess or extra provider call. */
export function assessTranscriptQuality(result: NormalizedTranscriptionResult, expectedLanguage?: string): TranscriptQualityAssessment {
  const issues: TranscriptQualityIssue[] = [];
  const requested = expectedLanguage || result.provenance?.requested_language;
  if (requested && requested !== 'auto' && result.language && languageCode(requested) !== languageCode(result.language)) {
    issues.push({code:'language_mismatch',detail:`Requested ${requested}, provider reported ${result.language}. Confirm the source language before using automatic captions.`});
  }
  let diagnostics = false;
  for (const s of result.segments || []) {
    if (![s.start,s.end].every(Number.isFinite) || s.start < 0 || s.end <= s.start) {
      issues.push({code:'invalid_timing',start:s.start,end:s.end,detail:'Speech segment has an invalid time window.'});
    }
    const lp = s.avg_logprob, silence = s.no_speech_prob, repetition = s.compression_ratio;
    if ([lp,silence,repetition].some(v => v !== undefined)) diagnostics = true;
    // One low score alone is not a reason to reject accented or noisy speech.
    if (lp !== undefined && lp < -1 && repetition !== undefined && repetition > 2.4) {
      issues.push({code:'low_confidence_repetition',start:s.start,end:s.end,detail:'Provider reported both weak recognition and unusually repetitive text. Compare this span with the audio.'});
    }
    if (s.text.trim() && lp !== undefined && lp < -1 && silence !== undefined && silence > 0.6) {
      issues.push({code:'possible_silence_hallucination',start:s.start,end:s.end,detail:'Provider reported likely silence and weak recognition for a nonempty speech segment. Compare this span with the audio.'});
    }
  }
  return {version:1,status:issues.length?'needs_review':'unverified',diagnostics:diagnostics?'present':'unavailable',issues,
    provider:result.provenance?.provider,model:result.provenance?.model,requested_language:requested,detected_language:result.language};
}

/** Only affirmative review flags stop automatic use. Legacy/missing evidence is
 * not a failure, and must never be displayed as verified accuracy either. */
export function assertTranscriptUsable(record: {quality_assessment?: TranscriptQualityAssessment}): void {
  if (record.quality_assessment?.status !== 'needs_review') return;
  const error = new Error('Transcript needs audio review before automatic captions can be exported. Check the flagged speech spans and source language; no words were silently replaced.');
  (error as any).code = 'TRANSCRIPT_REVIEW_REQUIRED';
  throw error;
}

export function readSegmentDiagnostics(raw: any): Pick<import('./types.js').NormalizedTranscriptSegment,'avg_logprob'|'no_speech_prob'|'compression_ratio'> {
  const out: any = {};
  for (const key of ['avg_logprob','no_speech_prob','compression_ratio']) {
    if (typeof raw?.[key] === 'number' && Number.isFinite(raw[key])) out[key] = raw[key];
  }
  return out;
}
