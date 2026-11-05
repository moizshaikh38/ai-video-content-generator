import { NormalizedTranscriptionResult, TranscriptionOptions } from './types.js';

export interface TranscriptionProvider {
  readonly name: string;

  transcribeAudio(
    audioBuffer: Buffer,
    fileName?: string,
    mimeType?: string,
    options?: TranscriptionOptions
  ): Promise<NormalizedTranscriptionResult>;
}
