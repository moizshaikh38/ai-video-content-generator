import { logger } from '../utils/logger.js';
import { TranscriptWord, CaptionStyle } from '../types/index.js';
import { generateWordId } from '../utils/wordIdentityUtils.js';

export interface ViralHookVariant {
  hook_type: 'contrarian' | 'question' | 'shocking_stat' | 'story' | 'curiosity_gap';
  hook_text: string;
  rationale: string;
  suggested_caption_burst: string[];
}

export interface DecompiledViralRecipe {
  reference_title?: string;
  hook_duration_sec: number;
  speech_rate_wpm: number;
  average_burst_word_count: number;
  caption_style_recommended: CaptionStyle;
  pacing: 'rapid_fire' | 'conversational' | 'dramatic_slow';
  visual_interrupt_interval_sec: number;
  hook_formula: string;
  variants: ViralHookVariant[];
}

export interface WordAnchoredEffect {
  id: string;
  word_id: string;
  word_text: string;
  effect_type: 'zoom_punch_in' | 'broll_overlay' | 'sfx_whoosh' | 'sfx_ding' | 'kinetic_pop';
  asset_url?: string;
  relative_offset_ms?: number;
}

export class ViralCloneService {
  /**
   * Generates 5 distinct high-converting viral hook variants from existing clip text (from Hypit batch variant engine).
   */
  public static generateHookVariants(coreTopicOrFirstSentence: string): ViralHookVariant[] {
    const cleanTopic = String(coreTopicOrFirstSentence || '').trim().replace(/^["']|["']$/g, '');

    return [
      {
        hook_type: 'contrarian',
        hook_text: `Stop doing ${cleanTopic.slice(0, 45)} the old way. Here is why it is costing you.`,
        rationale: 'Pattern interrupt triggering immediate loss-aversion and skepticism.',
        suggested_caption_burst: ['Stop doing this.', 'Here is why.', 'Listen closely.'],
      },
      {
        hook_type: 'question',
        hook_text: `Did you know this one change about ${cleanTopic.slice(0, 40)} fixes everything?`,
        rationale: 'High-curiosity gap hook driving watch-time to the first 5 seconds.',
        suggested_caption_burst: ['Did you know this?', 'One simple shift.', 'Look at this.'],
      },
      {
        hook_type: 'shocking_stat',
        hook_text: `99% of people get ${cleanTopic.slice(0, 35)} completely wrong.`,
        rationale: 'Social proof exclusion hook making the viewer want to belong to the top 1%.',
        suggested_caption_burst: ['99% get this wrong.', 'Are you one of them?', 'Watch.'],
      },
      {
        hook_type: 'story',
        hook_text: `The exact moment I figured out ${cleanTopic.slice(0, 40)}, everything changed.`,
        rationale: 'Narrative anchor establishing immediate emotional investment.',
        suggested_caption_burst: ['This changed everything.', 'Pay attention.'],
      },
      {
        hook_type: 'curiosity_gap',
        hook_text: `Nobody talks about this secret when it comes to ${cleanTopic.slice(0, 35)}...`,
        rationale: 'Taboo / insider revelation trigger driving comments and shares.',
        suggested_caption_burst: ['Nobody talks about this.', 'Until now.'],
      },
    ];
  }

  /**
   * Decompiles a reference video's transcript and timing into a reusable Viral Recipe (SVML style).
   */
  public static decompileReferenceStructure(words: TranscriptWord[], durationSeconds = 30): DecompiledViralRecipe {
    const wordCount = words.length;
    const durationMinutes = Math.max(0.1, durationSeconds / 60);
    const wpm = Math.round(wordCount / durationMinutes);

    // Calculate hook speed (words spoken in first 3.5 seconds)
    const hookWords = words.filter((w) => w.start <= 3.5);
    const hookWpm = Math.round((hookWords.length / (3.5 / 60)));

    let pacing: 'rapid_fire' | 'conversational' | 'dramatic_slow' = 'conversational';
    let captionStyle: CaptionStyle = 'highlight';

    if (wpm >= 170) {
      pacing = 'rapid_fire';
      captionStyle = 'beasty'; // fast word-pop
    } else if (wpm <= 125) {
      pacing = 'dramatic_slow';
      captionStyle = 'minimal';
    } else {
      pacing = 'conversational';
      captionStyle = 'podcast';
    }

    const firstSentence = words.slice(0, 8).map((w) => w.word).join(' ');

    return {
      hook_duration_sec: 3.5,
      speech_rate_wpm: wpm,
      average_burst_word_count: pacing === 'rapid_fire' ? 2 : 4,
      caption_style_recommended: captionStyle,
      pacing,
      visual_interrupt_interval_sec: pacing === 'rapid_fire' ? 2.5 : 4.0,
      hook_formula: hookWords.length > 0 ? `Fast Opener (${hookWords.length} words in 3.5s)` : 'Standard Opening',
      variants: this.generateHookVariants(firstSentence || 'this video topic'),
    };
  }

  /**
   * Binds visual effects to specific word IDs instead of rigid timestamps (from Hypit SVML architecture).
   * Ensures effects stay perfectly aligned when clips are trimmed or re-edited.
   */
  public static anchorEffectToWord(
    effectType: WordAnchoredEffect['effect_type'],
    targetWord: TranscriptWord,
    wordIndex: number,
    assetUrl?: string
  ): WordAnchoredEffect {
    const wordId = targetWord.id || generateWordId(targetWord.word, targetWord.start, targetWord.end, wordIndex);
    return {
      id: `eff_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      word_id: wordId,
      word_text: targetWord.word,
      effect_type: effectType,
      asset_url: assetUrl,
      relative_offset_ms: 0,
    };
  }
}
