import { dataRepository } from '../db/repositories/dataRepository.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../types/index.js';
import { defaultAiProvider } from './aiProviderClient.js';
import { ClipRenderService } from './clipRenderService.js';

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
  ): Promise<{ hook: string; title: string | null }> {
    const clip = await ClipRenderService.getClip(clipId, userId);

    // Tests may override generateJsonCompletion on the instance (mock telemetry
    // pattern); only enforce key availability for the real provider path.
    const mocked =
      defaultAiProvider.generateJsonCompletion !==
      (defaultAiProvider.constructor as any).prototype.generateJsonCompletion;
    if (!mocked &&
        !(defaultAiProvider as any).primaryProvider?.isAvailable?.() &&
        !(defaultAiProvider as any).fallbackProvider?.isAvailable?.()) {
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

    // Opening of the clip window (source seconds -> clip-local): the first
    // ~40s of spoken content is what the hook should preview.
    const clipStart = Number(clip.start_seconds) + Number(clip.trim_start_offset || 0);
    const windowEnd = clipStart + 40;
    let openingText = '';
    if (Array.isArray(transcript.words) && transcript.words.length > 0) {
      openingText = transcript.words
        .filter((w: any) => Number(w.end) > clipStart && Number(w.start) < windowEnd)
        .map((w: any) => w.text ?? w.word ?? '')
        .filter(Boolean)
        .join(' ');
    } else if (Array.isArray(transcript.segments)) {
      openingText = transcript.segments
        .filter((s: any) => Number(s.end) > clipStart && Number(s.start) < windowEnd)
        .map((s: any) => s.text ?? '')
        .filter(Boolean)
        .join(' ');
    }

    if (!openingText.trim()) {
      throw new AppError(
        'The transcript has no spoken words in this clip\'s opening, so a hook cannot be generated.',
        409,
        'HOOK_NO_SPEECH'
      );
    }

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
    return { hook, title };
  }
}
