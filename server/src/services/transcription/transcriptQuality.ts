import {assertSpeechWordCoverage,speechWordCoverage,type SpeechCoverageInput} from '../../shared/speechWordCoverage.js';
import {reliableOrderedClocks} from '../../shared/orderedTranscriptTiming.js';
import type { NormalizedTranscriptionResult } from './types.js';

export interface TranscriptQualityIssue {
  code: 'language_mismatch' | 'low_confidence_repetition' | 'possible_silence_hallucination' | 'invalid_timing' | 'unreliable_word_timing' | 'non_speech_annotation' | 'text_word_mismatch';
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
  if (speechWordCoverage(result) === 'mismatch') issues.push({code:'text_word_mismatch',detail:'Transcript text and caption-word coverage disagree. Review source audio; no words or clocks were rewritten.'});
  for (const issue of result.timingIssues || []) {
    issues.push({code:issue.kind==='word'&&issue.reason==='unordered-or-overlapping-provider-clock'?'unreliable_word_timing':'invalid_timing',detail:`Provider ${issue.kind} ${issue.index} has ${issue.reason==='unordered-or-overlapping-provider-clock'?'unordered or overlapping':'missing or invalid'} timing${issue.sourceOffset !== undefined ? ` in source chunk at ${issue.sourceOffset}s` : ''}. No replacement timestamp was invented.`});
  }
  for (const word of result.words || []) {
    if (word.kind === 'audio_event' || word.kind === 'redaction') issues.push({code:'non_speech_annotation',start:word.start,end:word.end,detail:'Provider returned an audio event or redacted speech token. Review before treating it as a spoken-word caption.'});
    if (![word.start,word.end].every(Number.isFinite) || word.start < 0 || word.end <= word.start) {
      issues.push({code:'invalid_timing',...(Number.isFinite(word.start)?{start:word.start}:{}),...(Number.isFinite(word.end)?{end:word.end}:{}),detail:'Speech word has an invalid time window. Review the original audio at this span; no replacement timestamp was invented.'});
    }
  }
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

/** Missing legacy metadata alone is not a failure or proof of accuracy.
 * Recheck observed clocks too: an absent/stale quality flag cannot overrule
 * a recorded invalid/disordered time window. Use the same clock/order check
 * as provider normalization and captions. No clock is invented. */
export function assertTranscriptUsable(record: SpeechCoverageInput & {quality_assessment?: TranscriptQualityAssessment}): void {
  assertSpeechWordCoverage(record);
  const segments=Array.isArray(record.segments)?record.segments:[];
  const rootWords=Array.isArray(record.words)?record.words:[];
  const nestedWords=segments.flatMap(s=>Array.isArray((s as any)?.words)?(s as any).words:[]);
  const clockGroups:unknown[][]=[rootWords,segments,nestedWords];
  // Missing legacy arrays remain unknown. Supplied rows must satisfy the same
  // complete/ordered-clock contract already used by providers and captions.
  const invalidRecordedClock=clockGroups.some(group=>group.length>0&&
    !reliableOrderedClocks(group as Array<{start?:unknown;end?:unknown}>));
  if (record.quality_assessment?.status !== 'needs_review' && !invalidRecordedClock) {
    // Match caption extraction's root-first selection, preserving existing
    // clock/review error precedence before checking valid nested word text.
    if (!rootWords.length) assertSpeechWordCoverage({...record,words:nestedWords});
    return;
  }
  const error = new Error('Transcript needs audio review before automatic captions can be exported. Check the flagged speech spans and source language; no words were silently replaced.');
  (error as any).code = 'TRANSCRIPT_REVIEW_REQUIRED';
  (error as any).statusCode = 409;
  throw error;
}

export function readSegmentDiagnostics(raw: any): Pick<import('./types.js').NormalizedTranscriptSegment,'avg_logprob'|'no_speech_prob'|'compression_ratio'> {
  const out: any = {};
  for (const key of ['avg_logprob','no_speech_prob','compression_ratio']) {
    if (typeof raw?.[key] === 'number' && Number.isFinite(raw[key])) out[key] = raw[key];
  }
  return out;
}

/** Explicit source-language preference only; auto leaves provider detection alone. */
export function normalizeSourceLanguage(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const code=value.trim().toLowerCase();
  return /^[a-z]{2,3}$/.test(code) && code !== 'auto' ? code : undefined;
}
