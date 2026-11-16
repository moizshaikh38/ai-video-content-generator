export interface NormalizedTranscriptWord {
  word: string;
  start: number;
  end: number;
  confidence?: number;
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
  provenance?: {provider: string; model: string; requested_language?: string};
  segments: NormalizedTranscriptSegment[];
  words: NormalizedTranscriptWord[];
}

export interface TranscriptionOptions {
  prompt?: string;
  language?: string;
}
