import {normalizeProviderTiming} from './providerTiming.js';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { TranscriptionProvider } from './transcriptionProvider.js';
import {
  NormalizedTranscriptionResult,
  NormalizedTranscriptSegment,
  NormalizedTranscriptWord,
  TranscriptionOptions,
} from './types.js';
import { normalizeTranscriptionError } from './errorNormalizer.js';

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB OpenRouter limit
const OPENROUTER_TRANSCRIPTION_URL = 'https://openrouter.ai/api/v1/audio/transcriptions';
const OPENROUTER_MODEL = 'openai/whisper-large-v3-turbo';
export const PARAKEET_MODEL = 'nvidia/parakeet-tdt-0.6b-v3';
const MODELS = [OPENROUTER_MODEL,'openai/whisper-large-v3','elevenlabs/scribe-v2',PARAKEET_MODEL];

export class OpenRouterTranscriptionProvider implements TranscriptionProvider {
  readonly name = 'openrouter';
  constructor(private readonly model: string = OPENROUTER_MODEL) {
    if(!MODELS.includes(model)) throw new Error('Unsupported timing-capable transcription model');
  }

  async transcribeAudio(
    audioBuffer: Buffer,
    fileName: string = 'audio.mp3',
    mimeType: string = 'audio/mp3',
    options?: TranscriptionOptions
  ): Promise<NormalizedTranscriptionResult> {
    // Parakeet v3 is opt-in for explicitly English source audio only. Auto or
    // Hindi/Hinglish preferences must not silently route to a European model.
    if (this.model === PARAKEET_MODEL && options?.language?.trim().toLowerCase() !== 'en') {
      throw Object.assign(new Error('Parakeet requires an explicit English source-language choice. No audio was sent.'),{code:'PARAKEET_LANGUAGE_REVIEW_REQUIRED'});
    }

    const apiKey = config.openrouterApiKey?.trim();

    if (!apiKey) {
      const errorMsg = 'OPENROUTER_API_KEY is not configured on the server. Please add OPENROUTER_API_KEY to your server environment.';
      logger.error(`[OpenRouter] ${errorMsg}`);
      throw new Error(errorMsg);
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      throw new Error('Transcription rejected: provided audio buffer is empty.');
    }

    if (audioBuffer.length > MAX_AUDIO_BYTES) {
      const sizeMb = (audioBuffer.length / (1024 * 1024)).toFixed(1);
      throw normalizeTranscriptionError(
        new Error(`Audio size (${sizeMb} MB) exceeds transcription provider limit of 25 MB. Please provide a shorter clip.`),
        { status: 413, provider: 'OpenRouter' }
      );
    }

    logger.info(
      `[OpenRouter] Submitting ${fileName} (${(audioBuffer.length / (1024 * 1024)).toFixed(2)} MB) to OpenRouter Speech-to-Text (${this.model})...`
    );

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
    formData.append('file', blob, fileName);
    formData.append('model', this.model);
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'word');
    formData.append('timestamp_granularities[]', 'segment');
    formData.append('temperature', '0');
    if (options?.diarize) {
      if (this.model !== 'elevenlabs/scribe-v2') throw new Error('Diarization is not supported by this adapter model.');
      formData.append('diarize', 'true');
    }
    if (options?.prompt) {
      formData.append('prompt', options.prompt);
    }
    if (options?.language) {
      formData.append('language', options.language);
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': config.appUrl || 'http://localhost:5173',
      'X-Title': 'Vireo AI Video Content Generator',
    };

    // Use the exact JSON STT contract qualified for Parakeet. Existing
    // multipart Whisper/Scribe paths remain unchanged.
    let requestBody: BodyInit = formData;
    if (this.model === PARAKEET_MODEL) {
      const formats: Record<string,string> = {'audio/wav':'wav','audio/x-wav':'wav','audio/mp3':'mp3','audio/mpeg':'mp3','audio/flac':'flac','audio/ogg':'ogg','audio/webm':'webm','audio/mp4':'m4a','audio/aac':'aac'};
      const format = formats[mimeType];
      if (!format) throw new Error('Unsupported audio format for Parakeet. No audio was sent.');
      headers['Content-Type'] = 'application/json';
      requestBody = JSON.stringify({model:this.model,input_audio:{data:audioBuffer.toString('base64'),format},
        response_format:'verbose_json',timestamp_granularities:['word','segment'],language:'en',
        ...(options?.prompt ? {prompt:options.prompt} : {})});
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort(new Error(`OpenRouter transcription timed out after ${config.transcriptionTimeoutMs / 1000}s.`));
    }, config.transcriptionTimeoutMs);

    let response: Response;
    try {
      response = await fetch(OPENROUTER_TRANSCRIPTION_URL, {
        method: 'POST',
        redirect: 'error',
        headers,
        body: requestBody,
        signal: controller.signal,
      });
    } catch (fetchErr: any) {
      const isTimeout = fetchErr?.name === 'AbortError' || fetchErr?.message?.toLowerCase().includes('timeout');
      throw normalizeTranscriptionError(fetchErr, {
        status: isTimeout ? 408 : undefined,
        provider: 'OpenRouter',
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errText = await response.text();
      let parsedMsg = '';
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error?.message) {
          parsedMsg = parsed.error.message;
        }
      } catch {
        parsedMsg = errText;
      }

      throw normalizeTranscriptionError(new Error(parsedMsg), {
        status: response.status,
        provider: 'OpenRouter',
        rawError: errText,
      });
    }

    let result: any;
    try {
      result = await response.json();
    } catch (parseErr: any) {
      throw normalizeTranscriptionError(parseErr, {
        provider: 'OpenRouter',
        rawError: 'Failed to parse JSON response',
      });
    }

    const text = (result?.text || '').trim();
    if (!text) {
      throw normalizeTranscriptionError(
        new Error('Transcription returned no speech. Ensure the video has audible speech.'),
        { provider: 'OpenRouter' }
      );
    }

    const {segments,words,timingIssues} = normalizeProviderTiming(result);

    if (this.model === PARAKEET_MODEL && (!words.length || timingIssues.some(issue => issue.kind === 'word'))) {
      throw Object.assign(new Error('Parakeet did not return usable provider word timestamps. No caption timings were invented; review or explicitly choose another model.'),{code:'PARAKEET_WORD_TIMING_REQUIRED'});
    }

    const durationSeconds = typeof result?.duration === 'number' ? result.duration : null;
    // Missing language is unknown evidence, not detected English.
    const language = typeof result?.language === 'string' ? result.language.trim() : '';

    logger.info(
      `[OpenRouter] Successfully transcribed audio: ${segments.length} segments, ${words.length} words, duration: ${durationSeconds}s, language: ${language}`
    );

    return {
      text,
      language,
      durationSeconds,
      provenance: {provider:'openrouter',model:this.model,requested_language:options?.language},
      segments,
      words,
      timingIssues,
      ...(typeof result.usage?.cost === 'number' && Number.isFinite(result.usage.cost) && result.usage.cost >= 0 ? {usage:{costUsd:result.usage.cost,audioSeconds:typeof result.usage.seconds === 'number' && Number.isFinite(result.usage.seconds) ? result.usage.seconds : undefined}} : {}),
    };
  }
}

/** Explicit English-only opt-in. Hindi, Hinglish and auto keep the existing
 * OpenRouter Turbo path. Every result records the model actually used. */
export function createConfiguredOpenRouterProvider(): TranscriptionProvider {
  if (config.transcriptionModel !== PARAKEET_MODEL) return new OpenRouterTranscriptionProvider(config.transcriptionModel);
  const english = new OpenRouterTranscriptionProvider(PARAKEET_MODEL);
  const baseline = new OpenRouterTranscriptionProvider();
  return {name:'openrouter',transcribeAudio(audio,fileName,mimeType,options) {
    return (options?.language?.trim().toLowerCase() === 'en' ? english : baseline)
      .transcribeAudio(audio,fileName,mimeType,options);
  }};
}
