import { dataRepository } from '../db/repositories/dataRepository.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../types/index.js';
import { defaultAiProvider } from './aiProviderClient.js';
import { ClipRenderService } from './clipRenderService.js';
import { collectHookOpeningEvidence,type HookOpeningEvidence } from '../shared/hookSourceSpan.js';

/**
 * Regenerates the opening hook (and title) text for one clip from its own
 * transcript span. Uses the same provider stack as clip analysis
 * (defaultAiProvider); when no provider key is configured this fails closed
 * with HOOK_PROVIDER_UNAVAILABLE - the caller must surface that, never a
 * fabricated hook.
 */
export class HookRegenerationService {
  static async regenerateClipHook(
    userId: string,
    clipId: string
  ): Promise<{ hook: string; title: string | null; sourceEvidence: HookOpeningEvidence }> {
    const clip = await ClipRenderService.getClip(clipId, userId);

    // Tests may override generateJsonCompletion on the instance (mock telemetry
    // pattern); only enforce key availability for the real provider path.
    const mocked =
      defaultAiProvider.generateJsonCompletion !==
      (defaultAiProvider.constructor as any).prototype.generateJsonCompletion;
    const avail = (p: any) => (p?.isConfigured?.() ?? p?.isAvailable?.() ?? false);
    if (!mocked && !avail((defaultAiProvider as any).primaryProvider) && !avail((defaultAiProvider as any).fallbackProvider)) {
      throw new AppError(
        'Hook generation is not available: no AI provider key is configured on this server.',
        503,
        'HOOK_PROVIDER_UNAVAILABLE'
      );
    }

    const { data: transcript } = await dataRepository
      .from('transcripts')
      .select('*')
      .eq('project_id', clip.project_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!transcript || (!Array.isArray(transcript.words) && !Array.isArray(transcript.segments))) {
      throw new AppError('No transcript is available for this clip yet.', 409, 'HOOK_NO_TRANSCRIPT');
    }

    // A transcript already flagged for review must not become trusted hook input
    // through a different endpoint. Missing/legacy diagnostics stay unverified.
    if (transcript.quality_assessment?.status === 'needs_review') {
      throw new AppError(
        'Transcript needs audio review before generating a hook. Check the flagged spans and source language.',
        409,
        'TRANSCRIPT_REVIEW_REQUIRED'
      );
    }

    const sourceEvidence=collectHookOpeningEvidence(clip,transcript);
    if (!sourceEvidence) {
      throw new AppError(
        'No complete, unambiguous transcript span is available in the trimmed clip opening.',
        409,
        'HOOK_NO_SPEECH'
      );
    }
    const openingText=sourceEvidence.text;

    const result = await defaultAiProvider.generateJsonCompletion<{ title?: string; hook?: string }>({
      systemPrompt:
        'You write short-form video hooks. Given the opening transcript of a clip, ' +
        'write one attention-grabbing hook (max 10 words, spoken-content accurate, no clickbait claims) ' +
        'and one short title (max 8 words). Respond with strict JSON: {"hook": string, "title": string}.',
      userPrompt: `Clip opening transcript:\n"""${openingText.trim().slice(0, 1500)}"""`,
      responseFormat: 'json_object',
      maxTokens: 120,
      temperature: 0.8,
    });

    const hook = typeof result?.hook === 'string' ? result.hook.trim() : '';
    const title = typeof result?.title === 'string' && result.title.trim() ? result.title.trim() : null;
    if (!hook) {
      logger.warn(`Hook regeneration returned no hook for clip ${clipId}.`);
      throw new AppError('Hook generation returned no usable hook.', 502, 'HOOK_GENERATION_EMPTY');
    }
    return { hook, title, sourceEvidence };
  }
}
