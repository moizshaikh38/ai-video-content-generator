import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { TranscriptSegment } from '../types/index.js';

export interface TranscriptionResult {
  text: string;
  language: string;
  duration: number | null;
  segments: TranscriptSegment[];
}

/**
 * Transcribes audio media using OpenRouter's Speech-to-Text API endpoint:
 * POST https://openrouter.ai/api/v1/audio/transcriptions
 *
 * Model: openai/whisper-large-v3-turbo
 *
 * Requirements:
 * - OPENROUTER_API_KEY must be configured.
 * - Real API call only (no mock fallback).
 * - Proper OpenRouter headers: Authorization, HTTP-Referer, X-Title.
 * - Extracts text, language, duration, and timestamped segments if available.
 */
export async function transcribeAudioWithOpenRouter(
  audioBuffer: Buffer,
  fileName: string = 'audio.mp3',
  mimeType: string = 'audio/mp3'
): Promise<TranscriptionResult> {
  const apiKey = config.openrouterApiKey?.trim();

  if (!apiKey) {
    const errorMsg = 'OPENROUTER_API_KEY is not configured on the server. Please add OPENROUTER_API_KEY to your server environment.';
    logger.error(`[Transcription] ${errorMsg}`);
    throw new Error(errorMsg);
  }

  // OpenRouter / Whisper limit is 25 MB
  const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
  if (audioBuffer.length > MAX_AUDIO_BYTES) {
    const sizeMb = (audioBuffer.length / (1024 * 1024)).toFixed(1);
    throw new Error(
      `Audio size (${sizeMb} MB) exceeds transcription provider limit of 25 MB. Please provide a shorter clip.`
    );
  }

  const model = 'openai/whisper-large-v3-turbo';
  logger.info(
    `[Transcription] Submitting ${fileName} (${(audioBuffer.length / (1024 * 1024)).toFixed(2)} MB) to OpenRouter Speech-to-Text (${model})...`
  );

  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: mimeType });
  formData.append('file', blob, fileName);
  formData.append('model', model);
  formData.append('response_format', 'verbose_json');

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'HTTP-Referer': config.appUrl || 'http://localhost:5173',
    'X-Title': 'Vireo AI Video Content Generator',
  };

  const response = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    logger.error(`[Transcription] OpenRouter API error (${response.status}):`, errText);

    let userMsg = 'Transcription provider failed to process the audio.';
    try {
      const parsed = JSON.parse(errText);
      if (parsed.error?.message) {
        userMsg = parsed.error.message;
      }
    } catch {
      // Use fallback userMsg
    }

    if (response.status === 401) {
      throw new Error('OpenRouter authentication failed: invalid or unauthorized API key.');
    }
    if (response.status === 402) {
      throw new Error(`OpenRouter payment/credit error: ${userMsg}`);
    }
    if (response.status === 429) {
      throw new Error(`OpenRouter rate limit exceeded: ${userMsg}`);
    }

    throw new Error(`OpenRouter transcription error (${response.status}): ${userMsg}`);
  }

  const result = (await response.json()) as any;

  const text = (result.text || '').trim();
  if (!text) {
    throw new Error('Transcription provider returned an empty transcript. Please ensure the video contains audible speech.');
  }

  const rawSegments = Array.isArray(result.segments) ? result.segments : [];
  const segments: TranscriptSegment[] = rawSegments.map((seg: any) => ({
    start: Number(seg.start || 0),
    end: Number(seg.end || 0),
    text: String(seg.text || '').trim(),
  }));

  const duration = typeof result.duration === 'number' ? result.duration : null;
  const language = typeof result.language === 'string' ? result.language : 'en';

  if (segments.length === 0) {
    logger.info('[Transcription] Provider returned transcript text without timestamped segments.');
  } else {
    logger.info(
      `[Transcription] Successfully transcribed audio via OpenRouter: ${segments.length} segments, duration: ${duration}s, language: ${language}`
    );
  }

  return {
    text,
    language,
    duration,
    segments,
  };
}
