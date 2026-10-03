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
 * Transcribes audio or video media using the OpenAI Audio Transcriptions API (Whisper).
 * Strict production implementation: If OPENAI_API_KEY is not configured, it throws an error immediately.
 * No mock or simulated transcription fallback is used.
 */
export async function transcribeMedia(
  mediaBuffer: Buffer,
  fileName: string,
  mimeType: string = 'video/mp4'
): Promise<TranscriptionResult> {
  const apiKey = config.openaiApiKey?.trim();

  if (!apiKey) {
    const errorMsg = 'OPENAI_API_KEY is not configured on the server. Please add OPENAI_API_KEY to your server environment.';
    logger.error(`[Transcription] ${errorMsg}`);
    throw new Error(errorMsg);
  }

  // OpenAI Whisper accepts up to 25 MB per file directly.
  const MAX_WHISPER_BYTES = 25 * 1024 * 1024;
  if (mediaBuffer.length > MAX_WHISPER_BYTES) {
    const sizeMb = (mediaBuffer.length / (1024 * 1024)).toFixed(1);
    throw new Error(
      `Media size (${sizeMb} MB) exceeds OpenAI transcription limit of 25 MB. Please provide a shorter clip or compressed file.`
    );
  }

  logger.info(`[Transcription] Submitting ${fileName} (${(mediaBuffer.length / (1024 * 1024)).toFixed(2)} MB) to OpenAI Whisper API...`);

  // Build multipart form data using native standard Web fetch FormData and Blob
  const formData = new FormData();
  const blob = new Blob([mediaBuffer], { type: mimeType });
  formData.append('file', blob, fileName);
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'verbose_json');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    logger.error(`[Transcription] OpenAI API error (${response.status}):`, errText);
    let userMsg = 'Transcription provider failed to process the video.';
    try {
      const parsed = JSON.parse(errText);
      if (parsed.error?.message) {
        userMsg = parsed.error.message;
      }
    } catch {
      // Use fallback userMsg
    }
    throw new Error(`OpenAI transcription error: ${userMsg}`);
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

  logger.info(`[Transcription] Successfully transcribed ${fileName}: ${segments.length} segments, duration: ${duration}s, language: ${language}`);

  return {
    text,
    language,
    duration,
    segments,
  };
}
