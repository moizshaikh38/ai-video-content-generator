import { NormalizedTranscriptionResult, TranscriptionOptions } from './types.js';

export interface TranscriptionProvider {
  readonly name: string;
  /** False prevents a second full-file paid request after chunk failure. */
  readonly allowWholeFileFallback?: boolean;

  transcribeAudio(
    audioBuffer: Buffer,
    fileName?: string,
    mimeType?: string,
    options?: TranscriptionOptions
  ): Promise<NormalizedTranscriptionResult>;
}
