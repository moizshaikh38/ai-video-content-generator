export interface NormalizedTranscriptWord {
  word: string;
  start: number;
  end: number;
  confidence?: number;
  speakerId?: string;
  kind?: 'word' | 'audio_event' | 'redaction';
}

export interface NormalizedTranscriptSegment {
  start: number;
  end: number;
  text: string;
  words?: NormalizedTranscriptWord[];
  avg_logprob?: number;
  no_speech_prob?: number;
  compression_ratio?: number;
}

export interface NormalizedTranscriptionResult {
  text: string;
  language: string;
  durationSeconds: number | null;
  /** Actual provider-reported billing only; absent is unknown, not free. */
  usage?: {costUsd: number; audioSeconds?: number};
  timingIssues?: Array<{kind: 'word' | 'segment'; index: number; reason: 'invalid-or-missing-provider-clock' | 'unordered-or-overlapping-provider-clock'; sourceOffset?: number}>;
  provenance?: {provider: string; model: string; requested_language?: string; source_language_preference?: string; routing_policy?: string; plan_at_selection?: string};
  segments: NormalizedTranscriptSegment[];
  words: NormalizedTranscriptWord[];
}

export interface TranscriptionOptions {
  /** Explicit opt-in only; service may bill extra. Anonymous labels do not identify people. */
  diarize?: boolean;
  prompt?: string;
  language?: string;
}
