import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { TranscriptionProvider } from './transcriptionProvider.js';
import { GroqTranscriptionProvider } from './groqTranscriptionProvider.js';
import { createConfiguredOpenRouterProvider } from './openRouterTranscriptionProvider.js';

/**
 * Returns a configured TranscriptionProvider instance according to the TRANSCRIPTION_PROVIDER env var.
 * Supported values: 'groq' | 'openrouter'
 * Default: 'openrouter'. Explicit provider choices are preserved.
 * Missing credentials fail on the selected route; no implicit provider fallback.
 */
export function getTranscriptionProvider(providerName?: string): TranscriptionProvider {
  const chosen = (providerName || config.transcriptionProvider || 'openrouter').toLowerCase().trim();

  switch (chosen) {
    case 'groq':
      return new GroqTranscriptionProvider();
    case 'openrouter':
      return createConfiguredOpenRouterProvider();
    default:
      const errMsg = `Unsupported transcription provider "${chosen}". Supported providers are: "groq", "openrouter".`;
      logger.error(`[Transcription Factory] ${errMsg}`);
      throw new Error(errMsg);
  }
}
