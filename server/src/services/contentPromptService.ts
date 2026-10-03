import {
  OutputPlatform,
  CreatorProfileData,
  TranscriptSegment,
} from '../types/index.js';

export interface PromptContext {
  transcript: string;
  language?: string;
  duration?: number | null;
  segments?: TranscriptSegment[];
  creatorProfile?: CreatorProfileData;
  notes?: string;
}

export class ContentPromptService {
  /**
   * Formats the creator tone, audience, and niche context block.
   */
  private static formatCreatorContext(ctx: PromptContext): string {
    const parts: string[] = [];
    if (ctx.creatorProfile?.niche?.trim()) {
      parts.push(`- Creator Niche: ${ctx.creatorProfile.niche.trim()}`);
    }
    if (ctx.creatorProfile?.target_audience?.trim()) {
      parts.push(`- Target Audience: ${ctx.creatorProfile.target_audience.trim()}`);
    }
    if (ctx.creatorProfile?.tone?.trim()) {
      parts.push(`- Desired Tone: ${ctx.creatorProfile.tone.trim()}`);
    }
    if (ctx.creatorProfile?.language?.trim()) {
      parts.push(`- Target Language: ${ctx.creatorProfile.language.trim()}`);
    } else if (ctx.language) {
      parts.push(`- Content Language: ${ctx.language}`);
    }
    if (ctx.notes?.trim()) {
      parts.push(`- Additional Creator Notes: ${ctx.notes.trim()}`);
    }

    if (parts.length === 0) {
      return 'No specific creator persona provided. Use a natural, authentic, engaging tone.';
    }

    return parts.join('\n');
  }

  /**
   * Formats transcript segments into a timestamped timeline for chapters and clip cut-points.
   */
  private static formatSegments(segments?: TranscriptSegment[]): string {
    if (!segments || segments.length === 0) {
      return 'No timestamped segments available.';
    }

    // Include up to 60 segments to keep prompt context clean and focused
    return segments
      .slice(0, 60)
      .map((s) => {
        const mins = Math.floor(s.start / 60);
        const secs = Math.floor(s.start % 60);
        const stamp = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        return `[${stamp}] ${s.text}`;
      })
      .join('\n');
  }

  /**
   * System instruction shared across all platform generators to ensure factual accuracy and JSON adherence.
   */
  public static getSystemPrompt(): string {
    return `You are an expert AI social media and video content repurposing engine.
Your task is to analyze real video transcripts and produce high-impact, platform-optimized content.

CRITICAL RULES:
1. Grounding: Rely strictly on facts, ideas, and details provided in the transcript. NEVER hallucinate facts, statistics, or claims not mentioned in the transcript.
2. JSON Strictness: Respond ONLY with valid, raw, parseable JSON matching the exact schema specified.
3. No Markdown Fences: Do not wrap your response in markdown code blocks like \`\`\`json. Output raw JSON only.
4. Voice: Avoid generic AI fluff ("In today's fast-paced world", "buckle up", "game-changer"). Sound authentic, sharp, and tailored to the platform.`;
  }

  /**
   * Prompt for YouTube package (Titles, Description, Chapters, Keywords).
   */
  public static buildYouTubePrompt(ctx: PromptContext): string {
    const creatorContext = this.formatCreatorContext(ctx);
    const segmentsFormatted = this.formatSegments(ctx.segments);
    const hasTimestamps = Boolean(ctx.segments && ctx.segments.length > 0);

    return `Create a complete YouTube optimization package based on the following video transcript.

CREATOR & AUDIENCE CONTEXT:
${creatorContext}

TRANSCRIPT:
"""
${ctx.transcript}
"""

TIMESTAMPS / SEGMENTS:
"""
${segmentsFormatted}
"""

REQUIRED OUTPUT FORMAT (JSON ONLY):
{
  "titles": [
    "Angle 1 (Curiosity/Problem)",
    "Angle 2 (Direct Value/How-To)",
    "Angle 3 (Contrarian/Bold)",
    "Angle 4 (Actionable/Story)",
    "Angle 5 (High CTR/Benefit-driven)"
  ],
  "description": "Engaging 2-3 paragraph YouTube description summarizing core insights, with call-to-actions, based purely on transcript contents.",
  "chapters": [
    {
      "timestamp": "00:00",
      "title": "Introduction"
    }
  ],
  "keywords": [
    "keyword 1",
    "keyword 2",
    "keyword 3",
    "keyword 4",
    "keyword 5",
    "keyword 6",
    "keyword 7",
    "keyword 8"
  ]
}

SPECIFIC RULES:
- "titles": Exactly 5 distinct title angles (under 70 characters each). Do not write minor variations of one sentence.
- "description": Grounded in the transcript. Do not fabricate external links or sponsors.
- "chapters": ${
      hasTimestamps
        ? 'Generate 4-8 logical chapters using real timestamps from the segments provided above. Always start with 00:00.'
        : 'Timestamps are NOT available in this transcript. Return an empty array [] for chapters.'
    }
- "keywords": 8-12 high-intent search tags and keywords directly relevant to the topics discussed.`;
  }

  /**
   * Prompt for Instagram package (Hooks, Caption, Hashtags).
   */
  public static buildInstagramPrompt(ctx: PromptContext): string {
    const creatorContext = this.formatCreatorContext(ctx);

    return `Create an Instagram Reel / Post package based on the following video transcript.

CREATOR & AUDIENCE CONTEXT:
${creatorContext}

TRANSCRIPT:
"""
${ctx.transcript}
"""

REQUIRED OUTPUT FORMAT (JSON ONLY):
{
  "hooks": [
    "Hook 1 (Visual/Relatable hook)",
    "Hook 2 (Mistake/Warning hook)",
    "Hook 3 (Question hook)",
    "Hook 4 (Proof/Outcome hook)",
    "Hook 5 (Short punchy one-liner)"
  ],
  "caption": "Compelling feed caption with line breaks for readability, key takeaways, and a comment-inducing CTA.",
  "hashtags": [
    "#relevanttag1",
    "#relevanttag2",
    "#relevanttag3",
    "#relevanttag4",
    "#relevanttag5"
  ]
}

SPECIFIC RULES:
- "hooks": Exactly 5 punchy opening text overlays / voiceover hooks for Reels or Carousels.
- "caption": Engaging, easy to scan with emojis and spacing, reflecting the actual video topic.
- "hashtags": 5-10 curated, relevant hashtags. Avoid generic spam tags (#viral, #fyp).`;
  }

  /**
   * Prompt for Shorts / Reels highlight moments with timestamps or narrative boundaries.
   */
  public static buildShortsPrompt(ctx: PromptContext): string {
    const creatorContext = this.formatCreatorContext(ctx);
    const segmentsFormatted = this.formatSegments(ctx.segments);
    const hasTimestamps = Boolean(ctx.segments && ctx.segments.length > 0);

    return `Identify the best viral short-form clip moments (30-60 seconds each) from this video transcript.

CREATOR & AUDIENCE CONTEXT:
${creatorContext}

TRANSCRIPT:
"""
${ctx.transcript}
"""

TIMESTAMPS / SEGMENTS:
"""
${segmentsFormatted}
"""

REQUIRED OUTPUT FORMAT (JSON ONLY):
{
  "moments": [
    {
      "start": "${hasTimestamps ? '00:15' : 'N/A'}",
      "end": "${hasTimestamps ? '01:05' : 'N/A'}",
      "hook": "Opening hook for this clip",
      "description": "Why this moment works as a standalone short and summary of the clip content.",
      "timestamps_available": ${hasTimestamps}
    }
  ]
}

SPECIFIC RULES:
- Identify 2 to 4 high-retention moments (surprising insight, strong opinion, emotional point, or key step).
- ${
      hasTimestamps
        ? 'Accurate "start" and "end" timestamps formatted as MM:SS based on the provided segments.'
        : 'Timestamps are NOT available in this transcript. Set "start": "N/A", "end": "N/A", and "timestamps_available": false. Describe the moment conceptually using quotes or topic markers from the transcript.'
    }
- Do NOT fabricate timestamps if they cannot be verified from the segments list.`;
  }

  /**
   * Prompt for LinkedIn Post.
   */
  public static buildLinkedInPrompt(ctx: PromptContext): string {
    const creatorContext = this.formatCreatorContext(ctx);

    return `Draft a polished, high-engagement LinkedIn post based on the insights in this video transcript.

CREATOR & AUDIENCE CONTEXT:
${creatorContext}

TRANSCRIPT:
"""
${ctx.transcript}
"""

REQUIRED OUTPUT FORMAT (JSON ONLY):
{
  "post": "Full formatted LinkedIn post with hook headline, short scannable paragraphs, bullet points if relevant, and an engaging question at the end."
}

SPECIFIC RULES:
- High signal-to-noise ratio. Professional, thoughtful, but conversational.
- No corporate jargon, no generic motivational clichés.
- Grounded entirely in the transcript's real ideas.
- Optimized for read-time and discussion in comments.`;
  }

  /**
   * Prompt for X (Twitter) Post & Thread.
   */
  public static buildTwitterPrompt(ctx: PromptContext): string {
    const creatorContext = this.formatCreatorContext(ctx);

    return `Draft an impactful X (Twitter) standalone post and a companion value-packed thread based on this transcript.

CREATOR & AUDIENCE CONTEXT:
${creatorContext}

TRANSCRIPT:
"""
${ctx.transcript}
"""

REQUIRED OUTPUT FORMAT (JSON ONLY):
{
  "post": "Single punchy standalone tweet under 280 characters that delivers a sharp insight or teaser.",
  "thread": [
    "Tweet 1 (Hook introducing the thread)",
    "Tweet 2 (Core insight or context)",
    "Tweet 3 (Key takeaway or breakdown)",
    "Tweet 4 (Conclusion and call-to-action)"
  ]
}

SPECIFIC RULES:
- Standalone post must be under 280 characters.
- Thread should be 3-6 tweets maximum, cleanly broken down.
- Each thread item should be standalone valuable and under 280 characters.
- No hashtag stuffing. Pure insights.`;
  }

  /**
   * Dispatches to the appropriate builder based on platform.
   */
  public static buildPromptForPlatform(platform: OutputPlatform, ctx: PromptContext): string {
    switch (platform) {
      case 'youtube':
        return this.buildYouTubePrompt(ctx);
      case 'instagram':
        return this.buildInstagramPrompt(ctx);
      case 'shorts':
        return this.buildShortsPrompt(ctx);
      case 'linkedin':
        return this.buildLinkedInPrompt(ctx);
      case 'x':
        return this.buildTwitterPrompt(ctx);
      default:
        throw new Error(`Unsupported platform prompt: ${platform}`);
    }
  }
}
