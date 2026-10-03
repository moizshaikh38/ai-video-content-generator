import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { TranscriptionProvider } from './transcriptionProvider.js';
import { GroqTranscriptionProvider } from './groqTranscriptionProvider.js';
import { OpenRouterTranscriptionProvider } from './openRouterTranscriptionProvider.js';

/**
 * Returns a configured TranscriptionProvider instance according to the TRANSCRIPTION_PROVIDER env var.
 * Supported values: 'groq' | 'openrouter'
 * Default: 'groq'
 * Automatically falls back if primary provider key is unset but secondary key is available.
 */
export function getTranscriptionProvider(providerName?: string): TranscriptionProvider {
  const chosen = (providerName || config.transcriptionProvider || 'groq').toLowerCase().trim();

  switch (chosen) {
    case 'groq':
      if (!config.groqApiKey && config.openrouterApiKey) {
        logger.warn('[Transcription Factory] GROQ_API_KEY is not configured, falling back to OpenRouter');
        return new OpenRouterTranscriptionProvider();
      }
      return new GroqTranscriptionProvider();
    case 'openrouter':
      if (!config.openrouterApiKey && config.groqApiKey) {
        logger.warn('[Transcription Factory] OPENROUTER_API_KEY is not configured, falling back to Groq');
        return new GroqTranscriptionProvider();
      }
      return new OpenRouterTranscriptionProvider();
    default:
      const errMsg = `Unsupported transcription provider "${chosen}". Supported providers are: "groq", "openrouter".`;
      logger.error(`[Transcription Factory] ${errMsg}`);
      throw new Error(errMsg);
  }
}
