import fs from 'node:fs';
import path from 'node:path';
import { supabaseAuthClient, isServerSupabaseConfigured } from '../utils/supabase.js';
import { logger } from '../utils/logger.js';
import {
  ClipRecord,
  CaptionStyle,
  CaptionPosition,
  CaptionTimingMode,
  CaptionConfig,
  TimedCaptionCue,
  TimedCaptionToken,
  TranscriptSegment,
  ClipAspectRatio,
} from '../types/index.js';

export interface GenerateCaptionsOptions {
  clip: ClipRecord;
  targetAspectRatio?: ClipAspectRatio;
  outputPath?: string; // Optional path to write .ass file
}

export interface CaptionGenerationResult {
  timingMode: CaptionTimingMode;
  cues: TimedCaptionCue[];
  assContent: string;
  assFilePath?: string;
}

export class CaptionService {
  /**
   * Sanitizes text for safe inclusion inside ASS subtitle dialogues.
   * Strips/escapes curly braces `{}` which denote ASS override tags,
   * normalizes backslashes, and formats line breaks into `\N`.
   */
  public static sanitizeAssText(text: string): string {
    if (!text) return '';
    return text
      .replace(/[\r\n]+/g, ' ')
      .replace(/[{}]/g, '') // Strip ASS override command delimiters
      .replace(/\\/g, '/')  // Normalize backslashes
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Converts a standard hex color `#RRGGBB` into ASS BGR format `&H00BBGGRR&`.
   * Throws or defaults safely if the hex color is invalid.
   */
  public static hexToAssColor(hex: string, defaultHex = '#FFFFFF'): string {
    const clean = (hex || '').trim();
    const hexPattern = /^#?([0-9a-fA-F]{6})$/;
    const match = clean.match(hexPattern);

    if (!match) {
      // Fallback
      return this.hexToAssColor(defaultHex);
    }

    const value = match[1];
    const r = value.substring(0, 2).toUpperCase();
    const g = value.substring(2, 4).toUpperCase();
    const b = value.substring(4, 6).toUpperCase();

    // ASS format: &H[Alpha][Blue][Green][Red]& (Alpha 00 = fully opaque)
    return `&H00${b}${g}${r}&`;
  }

  /**
   * Validates a hex color string
   */
  public static isValidHexColor(hex?: string): boolean {
    if (!hex) return false;
    return /^#?([0-9a-fA-F]{6})$/.test(hex.trim());
  }

  /**
   * Formats seconds into ASS timestamp string: `H:MM:SS.CC` (Centiseconds)
   */
  public static formatAssTime(seconds: number): string {
    const clamped = Math.max(0, seconds);
    const h = Math.floor(clamped / 3600);
    const m = Math.floor((clamped % 3600) / 60);
    const s = Math.floor(clamped % 60);
    const cs = Math.floor((clamped - Math.floor(clamped)) * 100);

    const mStr = String(m).padStart(2, '0');
    const sStr = String(s).padStart(2, '0');
    const csStr = String(cs).padStart(2, '0');

    return `${h}:${mStr}:${sStr}.${csStr}`;
  }

  /**
   * Normalizes video resolution for ASS PlayRes coordinates based on aspect ratio
   */
  public static getPlayRes(aspectRatio: ClipAspectRatio = '9:16'): { x: number; y: number } {
    switch (aspectRatio) {
      case '9:16':
        return { x: 1080, y: 1920 };
      case '1:1':
        return { x: 1080, y: 1080 };
      case '16:9':
        return { x: 1920, y: 1080 };
      default:
        return { x: 1080, y: 1920 };
    }
  }

  /**
   * Resolves ASS Style Alignment code and vertical margin
   * Alignment codes (numpad-style):
   * 1 = bottom left, 2 = bottom center, 3 = bottom right
   * 4 = mid left,    5 = mid center,    6 = mid right
   * 7 = top left,    8 = top center,    9 = top right
   */
  public static getPositionConfig(
    position: CaptionPosition = 'bottom',
    aspectRatio: ClipAspectRatio = '9:16'
  ): { alignment: number; marginV: number } {
    const isPortrait = aspectRatio === '9:16';

    switch (position) {
      case 'top':
        return {
          alignment: 8, // Top Center
          marginV: isPortrait ? 180 : 60,
        };
      case 'center':
        return {
          alignment: 5, // Middle Center
          marginV: 0,
        };
      case 'bottom':
      default:
        return {
          alignment: 2, // Bottom Center
          // Generous bottom margin for 9:16 to avoid TikTok / Reels UI controls and caption bar
          marginV: isPortrait ? 220 : 80,
        };
    }
  }

  /**
   * Groups transcript tokens or segment phrases into human-friendly short caption cues
   * (2–5 words per chunk, breaking on punctuation or pauses).
   */
  public static groupIntoCues(
    tokens: TimedCaptionToken[],
    maxWords = 4,
    maxChars = 34
  ): TimedCaptionCue[] {
    if (tokens.length === 0) return [];

    const cues: TimedCaptionCue[] = [];
    let currentWords: TimedCaptionToken[] = [];

    const flush = () => {
      if (currentWords.length === 0) return;
      const start = currentWords[0].start;
      const end = currentWords[currentWords.length - 1].end;
      const text = currentWords.map((t) => t.text).join(' ');

      if (end > start) {
        cues.push({
          id: `cue-${cues.length + 1}`,
          start: Number(start.toFixed(3)),
          end: Number(end.toFixed(3)),
          text,
          tokens: [...currentWords],
        });
      }
      currentWords = [];
    };

    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      const prevTok = currentWords[currentWords.length - 1];

      // Check timing gap (>0.4s pause = natural break)
      const hasPause = prevTok && (tok.start - prevTok.end > 0.4);

      // Check current length
      const currentText = currentWords.map((t) => t.text).join(' ');
      const wouldExceedChars = (currentText + ' ' + tok.text).length > maxChars;
      const wouldExceedWords = currentWords.length >= maxWords;

      // Punctuation on previous token indicates natural break
      const prevHasPunctuation = prevTok && /[.!?,;:]$/.test(prevTok.text);

      if (currentWords.length > 0 && (hasPause || wouldExceedWords || wouldExceedChars || prevHasPunctuation)) {
        flush();
      }

      currentWords.push(tok);
    }

    flush();
    return cues;
  }

  /**
   * Extracts overlapping transcript tokens/segments and converts them to clip-local coordinates
   */
  public static extractClipCues(
    transcript: { segments?: any[]; words?: any[] },
    clipStart: number,
    clipEnd: number,
    trimStartOffset = 0,
    trimEndOffset = 0
  ): { timingMode: CaptionTimingMode; cues: TimedCaptionCue[] } {
    const effectiveStart = Number((clipStart + trimStartOffset).toFixed(3));
    const effectiveEnd = Number((clipEnd - trimEndOffset).toFixed(3));
    const effectiveDuration = Number((effectiveEnd - effectiveStart).toFixed(3));

    if (effectiveDuration <= 0) {
      return { timingMode: 'segment', cues: [] };
    }

    // 1. Check if word-level timestamps are present
    const rawWords = Array.isArray(transcript.words) && transcript.words.length > 0
      ? transcript.words
      : null;

    if (rawWords) {
      // WORD-LEVEL TIMING MODE
      const candidateTokens: TimedCaptionToken[] = [];

      for (const w of rawWords) {
        const wStart = Number(w.start);
        const wEnd = Number(w.end);
        const wText = String(w.word || w.text || '').trim();

        if (isNaN(wStart) || isNaN(wEnd) || !wText) continue;

        // Check if word overlaps effective clip bounds
        if (wEnd > effectiveStart && wStart < effectiveEnd) {
          const localStart = Math.max(0, Number((wStart - effectiveStart).toFixed(3)));
          const localEnd = Math.min(effectiveDuration, Number((wEnd - effectiveStart).toFixed(3)));

          if (localEnd > localStart) {
            candidateTokens.push({
              text: wText,
              start: localStart,
              end: localEnd,
            });
          }
        }
      }

      if (candidateTokens.length > 0) {
        return {
          timingMode: 'word',
          cues: this.groupIntoCues(candidateTokens),
        };
      }
    }

    // 2. SEGMENT-LEVEL FALLBACK MODE
    const rawSegments = Array.isArray(transcript.segments) ? transcript.segments : [];
    const cues: TimedCaptionCue[] = [];

    for (const seg of rawSegments) {
      const segStart = Number(seg.start);
      const segEnd = Number(seg.end);
      const segText = String(seg.text || '').trim();

      if (isNaN(segStart) || isNaN(segEnd) || !segText) continue;

      // Check overlap
      if (segEnd > effectiveStart && segStart < effectiveEnd) {
        const localStart = Math.max(0, Number((segStart - effectiveStart).toFixed(3)));
        const localEnd = Math.min(effectiveDuration, Number((segEnd - effectiveStart).toFixed(3)));
        const segDuration = localEnd - localStart;

        if (segDuration > 0) {
          // If segment has embedded words array inside segment object
          if (Array.isArray(seg.words) && seg.words.length > 0) {
            const segTokens: TimedCaptionToken[] = [];
            for (const sw of seg.words) {
              const swStart = Number(sw.start);
              const swEnd = Number(sw.end);
              const swText = String(sw.word || sw.text || '').trim();
              if (swEnd > effectiveStart && swStart < effectiveEnd) {
                const sLocalStart = Math.max(0, Number((swStart - effectiveStart).toFixed(3)));
                const sLocalEnd = Math.min(effectiveDuration, Number((swEnd - effectiveStart).toFixed(3)));
                if (sLocalEnd > sLocalStart) {
                  segTokens.push({ text: swText, start: sLocalStart, end: sLocalEnd });
                }
              }
            }
            if (segTokens.length > 0) {
              cues.push(...this.groupIntoCues(segTokens));
              continue;
            }
          }

          // Plain segment fallback: strictly grounded in the REAL segment start and end interval.
          // Never divide segment duration proportionally across words or fabricate timestamps.
          // Format text with clean line breaks if long (>7 words) for optimal subtitle readability.
          const words = segText.split(/\s+/).filter(Boolean);
          let displayText = segText;
          if (words.length > 7) {
            const midpoint = Math.ceil(words.length / 2);
            displayText = `${words.slice(0, midpoint).join(' ')}\\N${words.slice(midpoint).join(' ')}`;
          }

          cues.push({
            id: `cue-${cues.length + 1}`,
            start: localStart,
            end: localEnd,
            text: displayText,
          });
        }
      }
    }

    return {
      timingMode: 'segment',
      cues,
    };
  }

  /**
   * Builds the complete ASS script content for FFmpeg burning
   */
  public static buildAssScript(
    cues: TimedCaptionCue[],
    options: {
      style?: CaptionStyle;
      position?: CaptionPosition;
      aspectRatio?: ClipAspectRatio;
      customConfig?: CaptionConfig;
      timingMode?: CaptionTimingMode;
    }
  ): string {
    const {
      style = 'clean',
      position = 'bottom',
      aspectRatio = '9:16',
      customConfig = {},
      timingMode = 'segment',
    } = options;

    const playRes = this.getPlayRes(aspectRatio);
    const posConfig = this.getPositionConfig(position, aspectRatio);

    // Style Presets Configuration
    let fontName = 'Arial';
    let fontSize = customConfig.fontSize || 64;
    let primaryColour = '&H00FFFFFF&'; // Default white
    let secondaryColour = '&H0000FFFF&'; // Yellow for karaoke
    let outlineColour = '&H00000000&'; // Default black outline
    let backColour = '&H80000000&'; // Translucent shadow
    let bold = 1;
    let outline = customConfig.outlineWidth ?? 3.5;
    let shadow = customConfig.shadow ?? 1.5;

    // Apply custom colors if specified and valid
    if (customConfig.primaryColor && this.isValidHexColor(customConfig.primaryColor)) {
      primaryColour = this.hexToAssColor(customConfig.primaryColor);
    }
    if (customConfig.outlineColor && this.isValidHexColor(customConfig.outlineColor)) {
      outlineColour = this.hexToAssColor(customConfig.outlineColor);
    }
    if (customConfig.highlightColor && this.isValidHexColor(customConfig.highlightColor)) {
      secondaryColour = this.hexToAssColor(customConfig.highlightColor);
    }

    switch (style) {
      case 'bold':
        fontName = 'Arial Black';
        fontSize = customConfig.fontSize || 74;
        outline = customConfig.outlineWidth ?? 5.0;
        shadow = customConfig.shadow ?? 2.0;
        break;

      case 'minimal':
        fontName = 'Arial';
        fontSize = customConfig.fontSize || 50;
        outline = customConfig.outlineWidth ?? 1.8;
        shadow = customConfig.shadow ?? 0.5;
        bold = 0;
        break;

      case 'podcast':
        fontName = 'Arial';
        fontSize = customConfig.fontSize || 68;
        primaryColour = customConfig.primaryColor
          ? this.hexToAssColor(customConfig.primaryColor)
          : '&H0024E0FF&'; // Warm golden yellow
        outline = customConfig.outlineWidth ?? 4.0;
        shadow = customConfig.shadow ?? 2.0;
        break;

      case 'highlight':
        fontName = 'Arial Black';
        fontSize = customConfig.fontSize || 70;
        secondaryColour = '&H0000FF55&'; // Vibrant neon green
        outline = customConfig.outlineWidth ?? 4.5;
        shadow = customConfig.shadow ?? 2.0;
        break;

      case 'karaoke':
        fontName = 'Arial Black';
        fontSize = customConfig.fontSize || 72;
        outline = customConfig.outlineWidth ?? 4.5;
        shadow = customConfig.shadow ?? 2.0;
        // Karaoke uses secondaryColour as unread / highlight color
        break;

      case 'clean':
      default:
        fontName = 'Arial';
        fontSize = customConfig.fontSize || 64;
        outline = customConfig.outlineWidth ?? 3.5;
        shadow = customConfig.shadow ?? 1.5;
        break;
    }

    // Format Dialogue Events
    const events: string[] = [];

    for (const cue of cues) {
      const startStr = this.formatAssTime(cue.start);
      const endStr = this.formatAssTime(cue.end);
      let dialogueText = '';

      if (style === 'karaoke' && timingMode === 'word' && Array.isArray(cue.tokens) && cue.tokens.length > 0) {
        // Sequential word timing using ASS {\k<centiseconds>}
        const parts: string[] = [];
        for (const tok of cue.tokens) {
          const durationCs = Math.max(1, Math.round((tok.end - tok.start) * 100));
          const safeWord = this.sanitizeAssText(tok.text);
          parts.push(`{\\k${durationCs}}${safeWord}`);
        }
        dialogueText = parts.join(' ');
      } else if (style === 'highlight') {
        // Highlight first or most prominent word with highlight color
        const words = cue.text.split(' ');
        if (words.length > 1) {
          const highlightWord = this.sanitizeAssText(words[0]);
          const rest = this.sanitizeAssText(words.slice(1).join(' '));
          dialogueText = `{\\c${secondaryColour}}${highlightWord}{\\r} ${rest}`;
        } else {
          dialogueText = this.sanitizeAssText(cue.text);
        }
      } else {
        dialogueText = this.sanitizeAssText(cue.text);
      }

      if (dialogueText) {
        events.push(`Dialogue: 0,${startStr},${endStr},Default,,0,0,0,,${dialogueText}`);
      }
    }

    const script = [
      '[Script Info]',
      'Title: Vireo Auto Captions',
      'ScriptType: v4.00+',
      `PlayResX: ${playRes.x}`,
      `PlayResY: ${playRes.y}`,
      'ScaledBorderAndShadow: yes',
      'WrapStyle: 0',
      '',
      '[V4+ Styles]',
      'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
      `Style: Default,${fontName},${fontSize},${primaryColour},${secondaryColour},${outlineColour},${backColour},${bold},0,0,0,100,100,0,0,1,${outline},${shadow},${posConfig.alignment},60,60,${posConfig.marginV},1`,
      '',
      '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      ...events,
      '',
    ].join('\n');

    return script;
  }

  /**
   * Main service function: fetches transcript, computes clip cues, writes ASS file if path provided
   */
  public static async generateCaptionsForClip(
    options: GenerateCaptionsOptions
  ): Promise<CaptionGenerationResult> {
    const { clip, targetAspectRatio = clip.aspect_ratio || '9:16', outputPath } = options;

    if (!isServerSupabaseConfigured) {
      return { timingMode: 'segment', cues: [], assContent: '' };
    }

    // Load transcript for this project
    const { data: transcript, error: transErr } = await supabaseAuthClient
      .from('transcripts')
      .select('*')
      .eq('project_id', clip.project_id)
      .eq('user_id', clip.user_id)
      .maybeSingle();

    if (transErr || !transcript) {
      logger.warn(`No transcript found for clip ${clip.id}, rendering without burned captions.`);
      return { timingMode: 'segment', cues: [], assContent: '' };
    }

    const trimStart = Number(clip.trim_start_offset || 0);
    const trimEnd = Number(clip.trim_end_offset || 0);

    const { timingMode, cues } = this.extractClipCues(
      transcript,
      clip.start_seconds,
      clip.end_seconds,
      trimStart,
      trimEnd
    );

    const assContent = this.buildAssScript(cues, {
      style: (clip.caption_style as CaptionStyle) || 'clean',
      position: (clip.caption_position as CaptionPosition) || 'bottom',
      aspectRatio: targetAspectRatio,
      customConfig: clip.caption_config || {},
      timingMode,
    });

    let assFilePath: string | undefined;
    if (outputPath) {
      fs.writeFileSync(outputPath, assContent, 'utf8');
      assFilePath = outputPath;
    }

    return {
      timingMode,
      cues,
      assContent,
      assFilePath,
    };
  }
}
