import {
  TranscriptSegment,
  CreatorProfileData,
  MultimodalTimeline,
  GenreProfileConfig,
  ContentGoal,
} from '../types/index.js';
import { GenreIntelligenceService } from './genreIntelligenceService.js';

export interface ClipPromptContext {
  segments: TranscriptSegment[];
  durationSeconds?: number | null;
  creatorProfile?: Partial<CreatorProfileData> | null;
  customNotes?: string;
  multimodalTimeline?: MultimodalTimeline | null;
  startIndexOffset?: number;
  genreProfile?: GenreProfileConfig;
  contentGoal?: ContentGoal;
  customInstructions?: string;
  topicKeywords?: string[];
}

export class ClipPromptService {
  /**
   * System prompt establishing the persona, strict JSON output requirements,
   * opening guardrails against dangling conjunctions/pronouns, and optional genre rules.
   */
  public static getSystemPrompt(genreProfile?: GenreProfileConfig): string {
    const lines = [
      'You are Vireo\'s elite Short-Form Video Producer and AI Clip Finder.',
      'Your job is to analyze a timestamped, segment-indexed transcript from a long-form video and identify the strongest standalone moments for YouTube Shorts, Instagram Reels, and TikTok.',
      '',
      'CORE RULES:',
      '1. Grounding: You MUST ONLY select moments that actually exist in the transcript.',
      '2. Timestamp Integrity: NEVER invent, hallucinate, or format timestamp numbers. You MUST ONLY specify the starting and ending segment indexes (start_segment_index and end_segment_index).',
      '3. High-Velocity Viral Hook: Prioritize high-velocity openings. The first 3 seconds must immediately grab attention with a contrarian claim, concrete number/dollar figure, provocative tension question, or pattern interrupt.',
      '4. Strict Opening Guardrails: NEVER begin start_segment_index on a dangling conjunction, verbal filler, transition without context, or unresolved pronoun (e.g., avoid starting on "And so...", "Because of that...", "Like I said earlier...", "He did...", "So then..."). The first sentence must make grammatical and logical sense on its own.',
      '5. Conclusive Ending & Completeness: Every clip candidate MUST finish on a punchy takeaway, witty punchline, or fully resolved thought. Ensure end_segment_index does NOT cut off mid-explanation, mid-clause, or on an unfinished sentence.',
      '6. Standalone Value: A viewer scrolling past this clip on TikTok or Reels must instantly grasp and enjoy the content without needing any prior context from the full-length video.',
      '7. Cut the Fluff: Avoid generic channel intros, pleasantries, sponsor reads, subscribe/like pitches, and rambling setups unless immediately tied to an exceptional hook.',
      '8. Cold Open Inversion (Non-Linear Hook): If the most explosive takeaway, shocking number, or decisive punchline occurs at the conclusion of a thought, specify cold_open_segment_index as that segment number. The engine will place that 2-4 second teaser at 0:00 before playing the setup.',
      '9. Output Format: Return ONLY raw, valid JSON matching the exact schema specified in the user prompt. No markdown fencing, no commentary.',
    ];

    if (genreProfile) {
      lines.push(
        '',
        `GENRE RULES (${genreProfile.displayName.toUpperCase()}):`,
        `- Objective: ${genreProfile.selectionObjective}`,
        `- Narrative Arc: ${genreProfile.narrativeArcPrompt}`,
        `- Editorial Safeguard: ${genreProfile.editorialSafeguard}`,
        `- Recommended 9:16 Framing: ${(genreProfile.recommendedLayoutMode || 'track').toUpperCase()}`,
        `- Caption Safe Zone: ${(genreProfile.captionSafePlacement || 'bottom').toUpperCase()}`
      );
    }

    return lines.join('\n');
  }

  /**
   * Builds compact segment-indexed transcript for the LLM prompt.
   * If multimodalTimeline is provided, enriches each line with inline signals for scene cuts,
   * high visual activity spikes ([HIGH_VISUAL]), and on-screen OCR text ([OCR: "..."]).
   * Supports startIndexOffset for global index preservation across chunked windows.
   * Format: [index] (start - end) [SIGNALS] text
   */
  public static formatIndexedTranscript(
    segments: TranscriptSegment[],
    multimodalTimeline?: MultimodalTimeline | null,
    startIndexOffset = 0
  ): string {
    return segments
      .map((seg, idx) => {
        const displayIdx = idx + (startIndexOffset || 0);
        let signalPrefix = '';
        if (multimodalTimeline) {
          const signals: string[] = [];

          // Scene cut detection within segment window
          const hasSceneCut =
            Array.isArray(multimodalTimeline.scene_cuts) &&
            multimodalTimeline.scene_cuts.some(
              (sc) => sc.timestamp >= seg.start && sc.timestamp <= seg.end
            );
          if (hasSceneCut) {
            signals.push('[SCENE_CUT]');
          }

          // High visual activity spike (score >= 70) within segment window
          const hasHighActivity =
            Array.isArray(multimodalTimeline.keyframes) &&
            multimodalTimeline.keyframes.some(
              (k) =>
                k.timestamp >= seg.start &&
                k.timestamp <= seg.end &&
                typeof k.visual_activity_score === 'number' &&
                k.visual_activity_score >= 70
            );
          if (hasHighActivity) {
            signals.push('[HIGH_ACTIVITY]');
            signals.push('[HIGH_VISUAL]');
          }

          // On-screen OCR graphics/text
          if (Array.isArray(multimodalTimeline.keyframes)) {
            const ocrKf = multimodalTimeline.keyframes.find(
              (k) =>
                k.timestamp >= seg.start &&
                k.timestamp <= seg.end &&
                typeof k.ocr_text === 'string' &&
                k.ocr_text.trim().length > 0
            );
            if (ocrKf?.ocr_text) {
              const cleanOcr = ocrKf.ocr_text.replace(/["\r\n]/g, ' ').trim().slice(0, 35);
              if (cleanOcr) {
                signals.push(`[OCR: "${cleanOcr}"]`);
              }
            }
          }

          if (signals.length > 0) {
            signalPrefix = `${signals.join(' ')} `;
          }
        }

        return `[${displayIdx}] (${seg.start.toFixed(1)}s - ${seg.end.toFixed(1)}s) ${signalPrefix}${seg.text.trim()}`;
      })
      .join('\n');
  }

  /**
   * Assembles the complete prompt with indexed transcript, creator context, genre intelligence, and goal modifiers.
   */
  public static buildClipAnalysisPrompt(context: ClipPromptContext): string {
    const {
      segments,
      durationSeconds,
      creatorProfile,
      customNotes,
      multimodalTimeline,
      startIndexOffset,
      genreProfile: incomingGenreProfile,
      contentGoal = 'shareable_moments',
      customInstructions,
      topicKeywords,
    } = context;

    const genreProfile = incomingGenreProfile || GenreIntelligenceService.getGenreProfile('general');
    const indexedTranscript = this.formatIndexedTranscript(segments, multimodalTimeline, startIndexOffset || 0);

    let genreContext = [
      `GENRE INTELLIGENCE (${genreProfile.displayName}):`,
      `- Selection Objective: ${genreProfile.selectionObjective}`,
      `- Narrative Arc: ${genreProfile.narrativeArcPrompt}`,
      `- Strict Editorial Safeguard: ${genreProfile.editorialSafeguard}`,
      `- Recommended 9:16 Framing: ${(genreProfile.recommendedLayoutMode || 'track').toUpperCase()}`,
      `- Caption Placement: ${(genreProfile.captionSafePlacement || 'bottom').toUpperCase()}`,
      `- Target Duration Sweet Spot: ${genreProfile.targetDuration.optimal}s (Bounds: ${genreProfile.targetDuration.min}s–${genreProfile.targetDuration.max}s)`,
      '',
    ].join('\n');

    const goalContext = [
      'CONTENT GOAL DIRECTIVE:',
      GenreIntelligenceService.getContentGoalPromptModifier(contentGoal),
      '',
    ].join('\n');

    let instructionsContext = '';
    const instructionParts: string[] = [];
    const nlRaw = customInstructions || customNotes || '';
    const nlParsed = GenreIntelligenceService.parseNaturalLanguageSearchIntent(nlRaw);

    if (nlParsed.editorialDirective) {
      instructionParts.push(`- Natural Language Discovery: ${nlParsed.editorialDirective}`);
    }
    if (customInstructions?.trim() && !instructionParts.some((p) => p.includes(customInstructions.trim()))) {
      instructionParts.push(`- Creator Custom Instructions: ${customInstructions.trim()}`);
    }
    if (customNotes?.trim() && customNotes.trim() !== customInstructions?.trim() && !instructionParts.some((p) => p.includes(customNotes.trim()))) {
      instructionParts.push(`- Project Notes: ${customNotes.trim()}`);
    }
    const mergedKeywords = Array.from(new Set([...(topicKeywords || []), ...(nlParsed.focusKeywords || [])]));
    if (mergedKeywords.length > 0) {
      instructionParts.push(`- Priority Topic Keywords: ${mergedKeywords.join(', ')}`);
    }
    if (instructionParts.length > 0) {
      instructionsContext = [
        'CREATOR PRIORITIES & CUSTOM TOPICS:',
        ...instructionParts,
        'Prioritize clips addressing these specific instructions or topics whenever present in the transcript.',
        '',
      ].join('\n');
    }

    let personaContext = '';
    if (creatorProfile) {
      const parts: string[] = [];
      if (creatorProfile.niche) parts.push(`- Creator Niche: ${creatorProfile.niche}`);
      if (creatorProfile.target_audience) parts.push(`- Target Audience: ${creatorProfile.target_audience}`);
      if (creatorProfile.tone) {
        const toneStr =
          creatorProfile.tone === 'custom' && creatorProfile.custom_tone
            ? creatorProfile.custom_tone
            : creatorProfile.tone;
        parts.push(`- Desired Tone: ${toneStr}`);
      }
      if (creatorProfile.preferred_hook_style) parts.push(`- Preferred Hook Style: ${creatorProfile.preferred_hook_style}`);
      if (creatorProfile.brand_rules) parts.push(`- Brand Guidelines: ${creatorProfile.brand_rules}`);
      if (creatorProfile.forbidden_phrases) parts.push(`- Forbidden Phrases to Avoid: ${creatorProfile.forbidden_phrases}`);

      if (parts.length > 0) {
        personaContext = [
          'CREATOR PERSONA & AUDIENCE GUIDANCE:',
          ...parts,
          'Use this guidance to prioritize moments that resonate with this specific audience, but never invent content outside the transcript.',
          '',
        ].join('\n');
      }
    }

    let multimodalContext = '';
    if (multimodalTimeline) {
      const parts: string[] = [];
      parts.push(`- Total Scene Cuts Detected: ${multimodalTimeline.scene_cuts.length}`);
      parts.push(`- Average Visual Activity: ${multimodalTimeline.summary_metadata.average_visual_activity}/100`);
      if (multimodalTimeline.summary_metadata.ocr_status === 'detected') {
        const ocrTexts = multimodalTimeline.keyframes
          .map((k) => k.ocr_text)
          .filter((t): t is string => Boolean(t && t.length > 0));
        if (ocrTexts.length > 0) {
          parts.push(`- On-Screen Graphics/Titles Detected: ${ocrTexts.slice(0, 5).join('; ')}`);
        }
      }
      if (parts.length > 0) {
        multimodalContext = [
          'MULTIMODAL SIGNALS & PACING:',
          ...parts,
          'Prioritize segments that align with high visual pacing [HIGH_ACTIVITY], topic changes [SCENE_CUT], and on-screen context [OCR].',
          '',
        ].join('\n');
      }
    }

    const minDur = durationSeconds && durationSeconds < 15 ? 2 : Math.max(15, genreProfile.targetDuration.min);
    const maxDur = durationSeconds && durationSeconds < 15 ? Math.round(durationSeconds) : Math.min(90, genreProfile.targetDuration.max);

    return [
      genreContext,
      goalContext,
      instructionsContext,
      personaContext,
      multimodalContext,
      `TRANSCRIPT SEGMENTS (${segments.length} segments, total duration ~${durationSeconds ? Math.round(durationSeconds) : 'N/A'}s):`,
      '---',
      indexedTranscript,
      '---',
      '',
      'TASK:',
      `Analyze the transcript segments above and identify 5 to 10 of the strongest standalone short-form clip opportunities for ${genreProfile.displayName}.`,
      '',
      'DURATION CONSTRAINTS:',
      durationSeconds && durationSeconds < 15
        ? `- This video is short (~${Math.round(durationSeconds)}s). Clips may span between ${minDur} seconds and ${maxDur} seconds.`
        : `- Each clip MUST span between ${minDur} seconds and ${maxDur} seconds in duration (optimal sweet spot: ~${genreProfile.targetDuration.optimal}s).`,
      '- Calculate duration mentally by looking at the start timestamp of start_segment_index and the end timestamp of end_segment_index.',
      `- Do not return clips under ${minDur} seconds or over ${maxDur} seconds.`,
      '',
      'CATEGORIES:',
      'Assign each clip one of these categories:',
      '- "educational": Teaches a clear concept or workflow',
      '- "story": A personal anecdote, journey, or real-world example',
      '- "controversial": Challenges conventional wisdom or common mistakes',
      '- "insight": A high-impact mental model or realization',
      '- "emotional": High conviction, vulnerability, or inspiring energy',
      '- "entertaining": Humor, witty observation, or relatable situation',
      '- "tutorial": Actionable tactical step-by-step guidance',
      '- "general": High-value clip that fits broadly',
      '',
      'COMPONENT EVALUATION SCORES (Each integer 0 to 100):',
      '- hook_score: How compelling the first 3 seconds of the clip are (0–100)',
      '- standalone_score: How self-contained and clear the thought is without context (0–100)',
      '- insight_score: The depth of value or takeaway delivered (0–100)',
      '- emotion_score: Emotional resonance, tension, conviction, or humor (0–100)',
      '- platform_score: How naturally this fits short-form feeds (Shorts/Reels/TikTok) (0–100)',
      '',
      'RESPONSE FORMAT:',
      'Respond ONLY with a JSON object matching this schema:',
      '{',
      '  "clips": [',
      '    {',
      '      "start_segment_index": 12,',
      '      "end_segment_index": 21,',
      '      "cold_open_segment_index": 20,',
      '      "title": "A concise, engaging clip title (under 60 chars)",',
      '      "hook": "The captivating opening line or angle of the clip",',
      '      "reason": "Brief explanation of why this moment will succeed on short-form feeds",',
      '      "category": "insight",',
      '      "hook_score": 92,',
      '      "standalone_score": 88,',
      '      "insight_score": 95,',
      '      "emotion_score": 80,',
      '      "platform_score": 90',
      '    }',
      '  ]',
      '}',
    ].join('\n');
  }
}
