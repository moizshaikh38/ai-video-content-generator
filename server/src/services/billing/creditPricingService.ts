import { CreditEstimate } from '../../types/index.js';

/**
 * Provisional Credit Pricing Configuration
 *
 * NOTE: These rates are provisional operational defaults for testing and architecture
 * verification, NOT finalized commercial pricing or approved plan limits.
 * All rates can be dynamically configured via environment variables or central config.
 */
export const PROVISIONAL_CREDIT_CONFIG = {
  // Rate for core source video processing (extract audio + transcription + AI analysis combined)
  // Expressed as credits per 60 seconds (1 minute) of source video.
  // Example: 4 credits / min = 1 credit per 15 seconds.
  creditsPerSourceMinute: Number(process.env.CREDITS_PER_SOURCE_MINUTE || 4),

  // Minimum credits for core processing (ensures short videos have a baseline floor)
  minCreditsCoreProcessing: Number(process.env.MIN_CREDITS_CORE_PROCESSING || 1),

  // Standalone transcription (when done in Subtitle Studio without existing transcript)
  creditsPerTranscriptionMinute: Number(process.env.CREDITS_PER_TRANSCRIPTION_MINUTE || 2),

  // Operations that are strictly FREE
  freeOperations: [
    'transcript_reuse',
    'subtitle_edit',
    'subtitle_export_srt',
    'subtitle_export_vtt',
    'clip_preview',
    'clip_download',
    'clip_reexport_unaltered',
  ],
};

export class CreditPricingService {
  /**
   * Calculates the authoritative credit cost for core video processing.
   * Derived strictly from server-measured duration in seconds.
   * Any client-provided estimate is ignored.
   */
  public static calculateCoreProcessingCost(durationSeconds: number): {
    credits: number;
    units: number;
    rateDescription: string;
  } {
    const safeDuration = Math.max(0, Number(durationSeconds) || 0);
    const intervalSeconds = Number(process.env.CREDIT_INTERVAL_SECONDS || 15);
    const creditsPerMinute = Number(process.env.CREDITS_PER_SOURCE_MINUTE || PROVISIONAL_CREDIT_CONFIG.creditsPerSourceMinute);
    const minCredits = Number(process.env.MIN_CREDITS_CORE_PROCESSING || PROVISIONAL_CREDIT_CONFIG.minCreditsCoreProcessing);

    // Number of 15-second intervals, minimum 1 interval
    const intervals = Math.max(1, Math.ceil(safeDuration / intervalSeconds));
    const creditsPerInterval = creditsPerMinute / (60 / intervalSeconds);
    const calculated = Math.ceil(intervals * creditsPerInterval);
    const credits = Math.max(minCredits, calculated);
    const billedMinutes = intervals * (intervalSeconds / 60);

    return {
      credits,
      units: billedMinutes,
      rateDescription: `${creditsPerMinute} credits/min (1 credit per ${intervalSeconds}s, min ${minCredits} credit)`,
    };
  }

  /**
   * Calculates standalone transcription cost for Subtitle Studio when a new transcript is needed.
   */
  public static calculateTranscriptionCost(durationSeconds: number): {
    credits: number;
    units: number;
    rateDescription: string;
  } {
    const safeDuration = Math.max(0, Number(durationSeconds) || 0);
    const billedMinutes = Math.max(0.5, Math.ceil(safeDuration / 30) * 0.5);
    const credits = Math.max(1, Math.ceil(billedMinutes * PROVISIONAL_CREDIT_CONFIG.creditsPerTranscriptionMinute));

    return {
      credits,
      units: billedMinutes,
      rateDescription: `${PROVISIONAL_CREDIT_CONFIG.creditsPerTranscriptionMinute} credits/min (standalone transcription)`,
    };
  }

  /**
   * Resolves credit cost for any operation.
   * Free operations return 0 credits.
   */
  public static calculateOperationCost(
    operationId: string,
    params: { durationSeconds?: number; isReusedTranscript?: boolean } = {}
  ): { credits: number; units: number; rateDescription: string } {
    if (PROVISIONAL_CREDIT_CONFIG.freeOperations.includes(operationId) || params.isReusedTranscript) {
      return {
        credits: 0,
        units: 0,
        rateDescription: 'Free (0 credits)',
      };
    }

    switch (operationId) {
      case 'core_video_processing':
        return this.calculateCoreProcessingCost(params.durationSeconds || 0);

      case 'transcription_standalone':
        return this.calculateTranscriptionCost(params.durationSeconds || 0);

      default:
        // Default unpriced operation
        return {
          credits: 0,
          units: 0,
          rateDescription: 'Standard (0 credits)',
        };
    }
  }

  /**
   * Generates a complete credit estimate object before starting a billable operation.
   */
  public static estimateOperation(
    operationId: string,
    params: { durationSeconds?: number; isReusedTranscript?: boolean } = {},
    availableCredits: number
  ): CreditEstimate {
    const { credits, units, rateDescription } = this.calculateOperationCost(operationId, params);
    const hasSufficient = availableCredits >= credits;

    return {
      operation_id: operationId,
      estimated_units: units,
      estimated_credits: credits,
      available_credits: availableCredits,
      has_sufficient_credits: hasSufficient,
      rate_description: rateDescription,
      min_charge: credits > 0 ? PROVISIONAL_CREDIT_CONFIG.minCreditsCoreProcessing : 0,
      details: {
        duration_seconds: params.durationSeconds || 0,
        is_reused_transcript: Boolean(params.isReusedTranscript),
      },
    };
  }
}

