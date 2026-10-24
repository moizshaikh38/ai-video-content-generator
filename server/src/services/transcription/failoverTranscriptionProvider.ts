import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { TranscriptionProvider } from './transcriptionProvider.js';
import { NormalizedTranscriptionResult } from './types.js';
import { GroqTranscriptionProvider } from './groqTranscriptionProvider.js';
import { OpenRouterTranscriptionProvider } from './openRouterTranscriptionProvider.js';

/**
 * Runtime failover between the two Whisper providers (roadmap Phase 6).
 * The factory picked one provider by env; a runtime 5xx/timeout/rate-limit
 * previously failed the whole transcription. This wrapper retries the same
 * request on the secondary provider when one is configured, and throws a
 * classified error only when both providers fail.
 */

/** Provider-independent client problems: failing over cannot help. */
const NON_FAILOVER_MESSAGE_PATTERNS = [
  /exceeds transcription provider limit/i, // 413 file-size class
  /provided audio buffer is empty/i,
];

/** Errors that justify trying the secondary provider. */
export function isFailoverWorthy(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  if (NON_FAILOVER_MESSAGE_PATTERNS.some((p) => p.test(message))) return false;
  // Normalized provider errors carry their HTTP status; everything except
  // explicitly non-failover classes above is worth a retry elsewhere.
  return true;
}

export class FailoverTranscriptionProvider implements TranscriptionProvider {
  readonly name: string;

  constructor(
    private readonly primary: TranscriptionProvider,
    private readonly secondary: TranscriptionProvider | null
  ) {
    this.name = secondary ? `failover(${primary.name}→${secondary.name})` : primary.name;
  }

  async transcribeAudio(
    audioBuffer: Buffer,
    fileName?: string,
    mimeType?: string
  ): Promise<NormalizedTranscriptionResult> {
    try {
      return await this.primary.transcribeAudio(audioBuffer, fileName, mimeType);
    } catch (primaryErr) {
      if (!this.secondary || !isFailoverWorthy(primaryErr)) throw primaryErr;

      const primaryMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      logger.warn(
        `[Transcription] Primary provider '${this.primary.name}' failed (${primaryMsg}). Failing over to '${this.secondary.name}'.`
      );

      try {
        const result = await this.secondary.transcribeAudio(audioBuffer, fileName, mimeType);
        logger.info(`[Transcription] Failover succeeded via '${this.secondary.name}'.`);
        return result;
      } catch (secondaryErr) {
        const secondaryMsg = secondaryErr instanceof Error ? secondaryErr.message : String(secondaryErr);
        const err = new Error(
          `Transcription failed on the primary provider (${primaryMsg}) and the secondary provider (${secondaryMsg}).`
        );
        (err as any).code = 'TRANSCRIPTION_PROVIDERS_UNAVAILABLE';
        throw err;
      }
    }
  }
}

/**
 * Production entrypoint: primary provider per TRANSCRIPTION_PROVIDER env, with
 * automatic failover to the alternate provider when its API key is configured.
 */
export function getTranscriptionProviderWithFailover(): TranscriptionProvider {
  const chosen = (config.transcriptionProvider || 'groq').toLowerCase().trim();
  const groq = new GroqTranscriptionProvider();
  const openrouter = new OpenRouterTranscriptionProvider();

  let primary: TranscriptionProvider;
  let secondary: TranscriptionProvider | null = null;
  if (chosen === 'openrouter') {
    primary = openrouter;
    if (config.groqApiKey) secondary = groq;
  } else {
    primary = groq;
    if (config.openrouterApiKey) secondary = openrouter;
  }

  return new FailoverTranscriptionProvider(primary, secondary);
}
