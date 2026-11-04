/**
 * VireoClip Multilingual Dubbing Adapter
 *
 * Implements Phase 10: Abstract Multilingual Dubbing Provider Interface.
 * Allows seamless multi-language translation and speech synthesis while
 * maintaining audio timing boundaries and speaker voice characteristics.
 */

export type SupportedDubLanguage =
  | 'es' // Spanish
  | 'fr' // French
  | 'de' // German
  | 'pt' // Portuguese
  | 'hi' // Hindi
  | 'ja' // Japanese
  | 'it' // Italian
  | 'ko'; // Korean

export interface DubbingJobRequest {
  clipId: string;
  sourceLanguage?: string;
  targetLanguage: SupportedDubLanguage;
  voiceStyle?: 'clone_speaker' | 'studio_narrator' | 'conversational';
  audioUrl?: string;
  transcriptText?: string;
}

export interface DubbingJobResult {
  jobId: string;
  clipId: string;
  status: 'completed' | 'processing' | 'failed';
  sourceLanguage: string;
  targetLanguage: SupportedDubLanguage;
  dubbedAudioUrl?: string;
  durationSec?: number;
  wordAlignmentOffsetSec?: number;
  translatedText?: string;
  error?: string;
}

export interface DubbingProvider {
  name: string;
  getSupportedLanguages(): SupportedDubLanguage[];
  dubClip(request: DubbingJobRequest): Promise<DubbingJobResult>;
}

export class MockDubbingProvider implements DubbingProvider {
  public readonly name = 'mock_dubbing_provider';

  public static readonly SUPPORTED_LANGUAGES: SupportedDubLanguage[] = [
    'es',
    'fr',
    'de',
    'pt',
    'hi',
    'ja',
    'it',
    'ko',
  ];

  public getSupportedLanguages(): SupportedDubLanguage[] {
    return MockDubbingProvider.SUPPORTED_LANGUAGES;
  }

  public async dubClip(request: DubbingJobRequest): Promise<DubbingJobResult> {
    if (!MockDubbingProvider.SUPPORTED_LANGUAGES.includes(request.targetLanguage)) {
      return {
        jobId: `dub_err_${Date.now()}`,
        clipId: request.clipId,
        status: 'failed',
        sourceLanguage: request.sourceLanguage || 'en',
        targetLanguage: request.targetLanguage,
        error: `Language "${request.targetLanguage}" is not supported for dubbing.`,
      };
    }

    const jobId = `dub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return {
      jobId,
      clipId: request.clipId,
      status: 'completed',
      sourceLanguage: request.sourceLanguage || 'en',
      targetLanguage: request.targetLanguage,
      dubbedAudioUrl: `https://vireoclip-storage.internal/audio/dubbed_${jobId}.mp3`,
      durationSec: 15.0,
      wordAlignmentOffsetSec: 0.05,
      translatedText: `[Dubbed: ${request.targetLanguage.toUpperCase()}] ${request.transcriptText || ''}`,
    };
  }
}
