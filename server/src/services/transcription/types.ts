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
  timingIssues?: Array<{kind: 'word' | 'segment'; index: number; reason: 'invalid-or-missing-provider-clock' | 'unordered-or-overlapping-provider-clock'; sourceOffset?: number}>;
  provenance?: {provider: string; model: string; requested_language?: string};
  segments: NormalizedTranscriptSegment[];
  words: NormalizedTranscriptWord[];
}

export interface TranscriptionOptions {
  prompt?: string;
  language?: string;
}
