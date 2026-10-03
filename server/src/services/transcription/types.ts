export interface NormalizedTranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface NormalizedTranscriptionResult {
  text: string;
  language: string;
  durationSeconds: number | null;
  segments: NormalizedTranscriptSegment[];
}
