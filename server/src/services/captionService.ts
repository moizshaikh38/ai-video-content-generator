import {manualCaptionTextEdit} from '../shared/manualCaptionTextEdit.js';
import {subtitleWordsMatchCue,subtitleRenderCues} from '../shared/subtitleWordClockReview.js';
import {joinTimedCaptionCompounds} from '../shared/captionCompoundWords.js';
import {assertSpeechWordCoverage} from '../shared/speechWordCoverage.js';
import { reliableOrderedClocks } from '../shared/orderedTranscriptTiming.js';
import {newCaptionDefaults} from '../shared/newCaptionDefaults.js';
import { clampCaptionFontSize } from '../shared/captionPresets.js';
import {assertSelectionSourceCurrent} from './selectionSourceGuardService.js';
import {assertTranscriptUsable} from './transcription/transcriptQuality.js';
import { applySceneCaptionPlacement,finalizeAutomaticFitCaptionGrowth,quickCaptionProject } from '../shared/sceneCaptionPlacement.js';
import { isMongoConfigured } from '../db/mongoClient.js';
import { dataRepository, ownerContext } from '../db/repositories/dataRepository.js';
import { mergeExtendedCues, maxCueEnd, editorProjectCoveredEnd, hasAuthoritativeCaptionCues } from './captionExtendMerge.js';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../utils/logger.js';
import {
  AppError,
  ClipRecord,
  CaptionStyle,
  CaptionPosition,
  CaptionTimingMode,
  CaptionConfig,
  TimedCaptionCue,
  TimedCaptionToken,
  TranscriptSegment,
  ClipAspectRatio,
  SAFE_FONT_FAMILIES,
  SafeFontFamily,
} from '../types/index.js';
import {
  balanceLineSplit as sharedBalanceLineSplit,
  buildPresetAssScript,
  enforceZeroOverlap as sharedEnforceZeroOverlap,
  formatSegmentCueText,
  regroupCuesForPreset,
  groupWordsIntoCues,
  resolveCaptionPreset,
  resolveRenderPresetId,
  ResolvedCaptionStyle,
} from '../shared/captionPresets.js';

export interface GenerateCaptionsOptions {
  clip: ClipRecord;
  targetAspectRatio?: ClipAspectRatio;
  outputPath?: string; // Optional path to write .ass file
  /**
   * Optional vertical anchor (0-1 from the canvas top) for the bottom edge of
   * the caption block. The render pipeline computes this for blur-fit layouts
   * so captions sit on the sharp content band instead of the blurred fill
   * (user-reported defect 15 Nov 2026: captions rendered over a large blurred
   * background looked unclean). Ignored when the clip or editor already sets
   * an explicit vertical position or a non-bottom caption position.
   */
  bandAnchorPositionY?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  sceneLayoutFallback?: string;
  automaticSceneWindows?: import('../shared/sceneCaptionPlacement.js').CaptionLayoutWindow[];
  /**
   * Optional two-speaker split context from the render pipeline (split layout
   * only): reframe keyframes (clip-relative) + the two speaker source-x zones.
   * When present, cues attributed to the top-half speaker are anchored inside
   * the top half of the canvas. Omit = captions render exactly as before.
   */
  speakerSplit?: {
    keyframes: Array<{ time: number; centerX: number }>;
    speaker1X: number;
    speaker2X: number;
  };
  /** Render-bound immutable saved document, including explicit known absence. */
  editorProjectSnapshot?:any|null;
}

export interface CaptionGenerationResult {
  timingMode: CaptionTimingMode;
  cues: TimedCaptionCue[];
  assContent: string;
  assFilePath?: string;
}

export interface OverlapValidationResult {
  valid: boolean;
  overlaps: Array<{
    cue1Id: string;
    cue2Id: string;
    cue1End: number;
    cue2Start: number;
    overlapMs: number;
  }>;
  maxActiveCues: number;
}

export interface KineticCueParams {
  primaryColour: string;
  secondaryColour: string;
  animation?: string;
  activeWordScale?: number;
}

export class CaptionService {
  /**
   * Safe font family validator strictly enforcing allowlist
   */
  public static validateFontFamily(font?: string): SafeFontFamily {
    if (!font || typeof font !== 'string') return 'Arial';
    const clean = font.trim();
    if ((SAFE_FONT_FAMILIES as readonly string[]).includes(clean)) {
      return clean as SafeFontFamily;
    }
    return 'Arial';
  }

  /**
   * Sanitizes text for safe inclusion inside ASS subtitle dialogues.
   * Strips/escapes curly braces `{}` which denote ASS override tags,
   * normalizes stray backslashes while strictly preserving valid ASS line breaks (`\N` and `\n`).
   */
  public static sanitizeAssText(text: string): string {
    if (!text) return '';
    return text
      .replace(/[{}]/g, '') // Strip ASS override command delimiters
      .replace(/[\r\n]+/g, ' ') // Collapse raw unescaped newlines
      .replace(/\\(?![Nn])/g, '/') // Preserve ASS line breaks (\N or \n), normalize stray backslashes
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  /**
   * Smart character-balanced line splitting choosing the split index
   * that minimizes Math.abs(line1Length - line2Length) while respecting maxCharsPerLine.
   */
  public static balanceLineSplit(words: string[], maxCharsPerLine = 28): string {
    return sharedBalanceLineSplit(words, maxCharsPerLine);
  }

  public static readonly COMMON_STOPWORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'nor', 'at', 'by', 'for', 'from',
    'in', 'into', 'of', 'off', 'on', 'onto', 'out', 'over', 'to', 'up', 'with',
    'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him',
    'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their', 'this', 'that',
    'these', 'those', 'what', 'which', 'who', 'whom', 'so', 'just', 'like', 'then',
  ]);

  /**
   * Identifies the most impactful word index in a cue for highlight/podcast styles.
   * Priority:
   * 1. Tokens containing numbers, currency, or percentages (e.g., "$100", "50%", "2026")
   * 2. Longest non-stopword token
   * 3. Falls back to index 0
   */
  public static findImpactfulWordIndex(words: string[]): number {
    if (!words || words.length === 0) return 0;

    // 1. Priority: digits, currency, percent
    for (let i = 0; i < words.length; i++) {
      if (/[\d$%€£¥#]/.test(words[i])) {
        return i;
      }
    }

    // 2. Priority: longest non-stopword token with length >= 4
    let bestIndex = -1;
    let maxLen = 0;
    for (let i = 0; i < words.length; i++) {
      const clean = words[i].replace(/[^\w]/g, '').toLowerCase();
      if (clean.length >= 4 && !CaptionService.COMMON_STOPWORDS.has(clean)) {
        if (clean.length > maxLen) {
          maxLen = clean.length;
          bestIndex = i;
        }
      }
    }

    if (bestIndex >= 0) return bestIndex;

    // Fallback for non-stopwords with length > 2
    for (let i = 0; i < words.length; i++) {
      const clean = words[i].replace(/[^\w]/g, '').toLowerCase();
      if (clean.length > 2 && !CaptionService.COMMON_STOPWORDS.has(clean)) {
        if (clean.length > maxLen) {
          maxLen = clean.length;
          bestIndex = i;
        }
      }
    }

    return bestIndex >= 0 ? bestIndex : 0;
  }

  /**
   * Converts a standard hex color `#RRGGBB` into ASS BGR format `&H[Alpha]BBGGRR&`.
   * Alpha: 0 (00 = fully opaque) to 255 (FF = fully transparent).
   */
  public static hexToAssColor(hex?: string, defaultHex = '#FFFFFF', alpha = 0): string {
    const clean = (hex || '').trim();
    const hexPattern = /^#?([0-9a-fA-F]{6})$/;
    const match = clean.match(hexPattern);

    const safeAlpha = Math.min(255, Math.max(0, Math.round(alpha)));
    const alphaHex = safeAlpha.toString(16).padStart(2, '0').toUpperCase();

    if (!match) {
      return this.hexToAssColor(defaultHex, '#FFFFFF', alpha);
    }

    const value = match[1];
    const r = value.substring(0, 2).toUpperCase();
    const g = value.substring(2, 4).toUpperCase();
    const b = value.substring(4, 6).toUpperCase();

    // ASS format: &H[Alpha][Blue][Green][Red]&
    return `&H${alphaHex}${b}${g}${r}&`;
  }

  /**
   * Validates a hex color string
   */
  public static isValidHexColor(hex?: string): boolean {
    if (!hex || typeof hex !== 'string') return false;
    return /^#?([0-9a-fA-F]{6})$/.test(hex.trim());
  }

  /**
   * Formats seconds into ASS timestamp string: `H:MM:SS.CC` (Centiseconds)
   */
  public static formatAssTime(seconds: number): string {
    const clamped = Math.max(0, seconds);
    const totalCs = Math.round(clamped * 100);
    const h = Math.floor(totalCs / 360000);
    const m = Math.floor((totalCs % 360000) / 6000);
    const s = Math.floor((totalCs % 6000) / 100);
    const cs = totalCs % 100;

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
   */
  /**
   * Vertical anchor for bottom-positioned captions on a blur-fit canvas.
   * The blur layout letterboxes the source inside the canvas; captions anchored
   * to the canvas bottom land on the blurred fill. This returns the positionY
   * (fraction from the canvas top) where the caption block's bottom edge should
   * sit: just inside the fitted content band. Returns undefined when the source
   * fills the canvas vertically (no band to anchor to).
   */
  public static computeBlurFitBandAnchor(
    aspectRatio: ClipAspectRatio = '9:16',
    sourceWidth?: number,
    sourceHeight?: number
  ): number | undefined {
    if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || (sourceWidth as number) <= 0 || (sourceHeight as number) <= 0) {
      return undefined;
    }
    const playRes = this.getPlayRes(aspectRatio);
    const scale = Math.min(playRes.x / (sourceWidth as number), playRes.y / (sourceHeight as number));
    const fitH = (sourceHeight as number) * scale;
    if (fitH >= playRes.y - 1) return undefined; // source fills the canvas vertically: no band
    const bandBottom = (playRes.y + fitH) / 2; // band is vertically centered
    const targetY = bandBottom - Math.max(24, fitH * 0.08);
    return Math.min(0.92, Math.max(0.08, targetY / playRes.y));
  }

  /**
   * Default caption presentation for clips with no explicit caption style.
   * The house comic preset is used only without an explicit saved style/config.
   */
  public static resolveDefaultCaptionStyle(clip: Pick<ClipRecord, 'caption_style' | 'caption_config'>): { captionStyle: ClipRecord['caption_style']; captionConfig: CaptionConfig } {
    if (clip.caption_style) {
      return { captionStyle: clip.caption_style, captionConfig: { ...(clip.caption_config || {}) } };
    }
    const defaults=newCaptionDefaults(clip.caption_style,clip.caption_config);
    return{captionStyle:defaults.captionStyle as ClipRecord['caption_style'],captionConfig:defaults.captionConfig};
  }

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
          marginV: isPortrait ? 220 : 80,
        };
    }
  }

  /**
   * Enforces strict monotonic non-overlapping timing on consecutive caption cues.
   * At any timestamp, normally only ONE caption cue will be active.
   */
  public static enforceZeroOverlap(cues: TimedCaptionCue[]): TimedCaptionCue[] {
    return sharedEnforceZeroOverlap(cues);
  }

  /**
   * Validates that no two unrelated cues overlap in time.
   */
  public static validateNoOverlappingCues(
    cues: TimedCaptionCue[],
    toleranceMs = 50
  ): OverlapValidationResult {
    const overlaps: OverlapValidationResult['overlaps'] = [];
    if (!cues || cues.length <= 1) {
      return { valid: true, overlaps: [], maxActiveCues: cues?.length ? 1 : 0 };
    }

    const sorted = [...cues].sort((a, b) => a.start - b.start);
    let maxSimultaneous = 1;

    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];

      const diffSec = current.end - next.start;
      const overlapMs = Math.round(diffSec * 1000);

      if (overlapMs > toleranceMs) {
        overlaps.push({
          cue1Id: current.id,
          cue2Id: next.id,
          cue1End: current.end,
          cue2Start: next.start,
          overlapMs,
        });
      }
    }

    // Check peak active cues across time sample points
    const checkPoints = new Set<number>();
    for (const c of sorted) {
      checkPoints.add(c.start);
      checkPoints.add(c.start + 0.02);
      checkPoints.add(c.end - 0.02);
      checkPoints.add(c.end);
    }

    for (const t of checkPoints) {
      const activeCount = sorted.filter((c) => t >= c.start && t < c.end).length;
      if (activeCount > maxSimultaneous) {
        maxSimultaneous = activeCount;
      }
    }

    return {
      valid: overlaps.length === 0 && maxSimultaneous <= 1,
      overlaps,
      maxActiveCues: maxSimultaneous,
    };
  }

  /**
   * Validates that an array of ASS dialogue event lines do not have overlapping timestamps.
   */
  public static validateNoOverlappingDialogueLines(
    lines: string[],
    toleranceMs = 20
  ): { valid: boolean; overlaps: string[] } {
    const overlaps: string[] = [];
    const parsed: Array<{ startCs: number; endCs: number; raw: string }> = [];

    for (const line of lines) {
      if (!line.startsWith('Dialogue:')) continue;
      const parts = line.split(',');
      if (parts.length < 3) continue;
      const startStr = parts[1].trim();
      const endStr = parts[2].trim();

      const parseCs = (tStr: string): number => {
        const [h, m, sWithCs] = tStr.split(':');
        const [s, cs] = (sWithCs || '0.0').split('.');
        return (
          Number(h || 0) * 360000 +
          Number(m || 0) * 6000 +
          Number(s || 0) * 100 +
          Number(cs || 0)
        );
      };

      const startCs = parseCs(startStr);
      const endCs = parseCs(endStr);
      parsed.push({ startCs, endCs, raw: line });
    }

    const toleranceCs = Math.round(toleranceMs / 10);
    for (let i = 0; i < parsed.length - 1; i++) {
      const cur = parsed[i];
      const next = parsed[i + 1];
      if (cur.endCs - next.startCs > toleranceCs) {
        overlaps.push(
          `Overlap of ${(cur.endCs - next.startCs) * 10}ms between:\n  "${cur.raw}"\n  "${next.raw}"`
        );
      }
    }

    return {
      valid: overlaps.length === 0,
      overlaps,
    };
  }

  /**
   * Groups timed words into short, human-friendly caption cues (default 3–5 words).
   * Natural break triggers:
   * - Max words per cue reached (default 4)
   * - Meaningful speech pause (>0.45s gap)
   * - Punctuation on previous token (comma, period, question mark, etc.)
   * - Max line width / max lines reached
   * - Cue duration limit (max ~3.2s)
   */
  public static groupIntoCues(
    tokens: TimedCaptionToken[],
    maxWords = 4,
    maxLines = 2,
    maxCharsPerLine = 28,
    pauseBreak = 0.45
  ): TimedCaptionCue[] {
    return groupWordsIntoCues(tokens, maxWords, maxLines, maxCharsPerLine, pauseBreak);
  }

  /**
   * Extracts transcript tokens/segments and converts them to clip-local coordinates.
   * Backward compatible:
   * - If real word timestamps exist: uses real word timing & grouping.
   * - If only segments exist: uses segment-level captions without fabricating fake word timestamps.
   */
  public static extractClipCues(
    transcript: { text?: unknown; transcript_text?: unknown; segments?: any[]; words?: any[] },
    clipStart: number,
    clipEnd: number,
    trimStartOffset = 0,
    trimEndOffset = 0,
    captionConfig?: CaptionConfig,
    options: { joinTimedHyphenCompounds?: boolean } = {}
  ): { timingMode: CaptionTimingMode; cues: TimedCaptionCue[] } {
    const effectiveStart = Number((clipStart + trimStartOffset).toFixed(3));
    const effectiveEnd = Number((clipEnd - trimEndOffset).toFixed(3));
    const effectiveDuration = Number((effectiveEnd - effectiveStart).toFixed(3));

    if (effectiveDuration <= 0) {
      return { timingMode: 'segment', cues: [] };
    }

    const maxWords = captionConfig?.maxWordsPerCue || 4;
    const maxLines = captionConfig?.maxLines || 2;
    const maxCharsPerLine = captionConfig?.maxCharsPerLine || 28;
    const isUppercase = Boolean(captionConfig?.uppercase);

    // 1. Check if word-level timestamps are present
    const rawWords =
      Array.isArray(transcript.words) && transcript.words.length > 0
        ? transcript.words
        : Array.isArray(transcript.segments)
        ? transcript.segments.flatMap((s) => (Array.isArray(s?.words) ? s.words : []))
        : [];

    const wordClocksReliable = reliableOrderedClocks(rawWords);
    if (rawWords.length > 0 && wordClocksReliable) {
      assertSpeechWordCoverage({...transcript,words:rawWords});
      // WORD-LEVEL TIMING MODE. Original provider text order is authoritative.
      const candidateTokens: TimedCaptionToken[] = [];

      for (const w of rawWords) {
        const wStart = Number(w.start);
        const wEnd = Number(w.end);
        let wText = String(w.word || w.text || '').trim();

        if (isNaN(wStart) || isNaN(wEnd) || !wText) continue;

        // Check if word overlaps effective clip bounds
        if (wEnd > effectiveStart && wStart < effectiveEnd) {
          const localStart = Math.max(0, Number((wStart - effectiveStart).toFixed(3)));
          const localEnd = Math.min(effectiveDuration, Number((wEnd - effectiveStart).toFixed(3)));

          if (localEnd > localStart) {
            if (isUppercase) {
              wText = wText.toUpperCase();
            }
            candidateTokens.push({
              text: wText,
              start: localStart,
              end: localEnd,
            });
          }
        }
      }

      if (candidateTokens.length > 0) {
        // Review-only and fresh extraction only. Saved editor cues never pass
        // through this join. Keep existing cue-ID manual corrections authoritative.
        const overrides=captionConfig?.caption_overrides;
        const hasOverrides=Array.isArray(overrides)?overrides.length>0:!!overrides&&Object.keys(overrides).length>0;
        const displayTokens=options.joinTimedHyphenCompounds&&!hasOverrides
          ?joinTimedCaptionCompounds(candidateTokens,String(transcript.text??transcript.transcript_text??''))
          :candidateTokens;
        let cues = this.groupIntoCues(displayTokens, maxWords, maxLines, maxCharsPerLine);

        // Apply manual text overrides if any
        cues = this.applyOverrides(cues, captionConfig?.caption_overrides);

        return {
          timingMode: 'word',
          cues,
        };
      }
    }

    // Reliable word clocks remain authoritative even when this slice contains
    // no words. Falling through would caption an entire overlapping segment,
    // including speech outside the selected interval.
    if (rawWords.length > 0 && wordClocksReliable) {
      return {timingMode:'word',cues:[]};
    }

    // 2. SEGMENT-LEVEL FALLBACK MODE (Never manufacture fake word timestamps)
    const rawSegments = Array.isArray(transcript.segments) ? transcript.segments : [];
    if (rawWords.length > 0 && !wordClocksReliable) {
      throw Object.assign(new Error('Caption timing needs audio alignment: unreliable word clocks cannot be replaced by unverified segment clocks.'), { code: 'CAPTION_TIMING_REVIEW_REQUIRED' });
    }
    const cues: TimedCaptionCue[] = [];

    for (const seg of rawSegments) {
      const segStart = Number(seg.start);
      const segEnd = Number(seg.end);
      let segText = String(seg.text || '').trim();

      if (isNaN(segStart) || isNaN(segEnd) || !segText) continue;

      // Check overlap
      if (segEnd > effectiveStart && segStart < effectiveEnd) {
        const localStart = Math.max(0, Number((segStart - effectiveStart).toFixed(3)));
        const localEnd = Math.min(effectiveDuration, Number((segEnd - effectiveStart).toFixed(3)));
        const segDuration = localEnd - localStart;

        if (segDuration > 0) {
          if (isUppercase) {
            segText = segText.toUpperCase();
          }

          // Format clean 2-line break if long using balanced line splitting
          const words = segText.split(/\s+/).filter(Boolean);
          let displayText = segText;
          if (words.length > 7 && maxLines > 1) {
            displayText = this.balanceLineSplit(words, maxCharsPerLine);
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

    // Guarantee non-overlapping consecutive segment cues
    let processedCues = this.enforceZeroOverlap(cues);

    // Apply manual text overrides if any
    processedCues = this.applyOverrides(processedCues, captionConfig?.caption_overrides);

    return {
      timingMode: 'segment',
      cues: processedCues,
    };
  }

  /**
   * Applies manual text corrections without mutating canonical transcript.
   * Synchronizes cue.words and cue.tokens with the overridden text, preserving timestamps
   * when word counts match. Count changes use full-cue segment text without word clocks.
   * No timestamps are manufactured.
   */
  public static applyOverrides(
    cues: any[],
    overrides?: Array<{ cueId: string; text: string }> | Record<string, string>
  ): any[] {
    if (!overrides) return cues;

    const overrideMap = new Map<string, string>();
    if (Array.isArray(overrides)) {
      for (const o of overrides) {
        const id = o.cueId || (o as any).id;
        if (o && id && typeof o.text === 'string') {
          overrideMap.set(String(id), o.text.trim());
        }
      }
    } else if (typeof overrides === 'object') {
      for (const [key, val] of Object.entries(overrides)) {
        if (typeof val === 'string') {
          overrideMap.set(String(key), val.trim());
        }
      }
    }

    if (overrideMap.size === 0) return cues;

    return cues.map((cue, idx) => {
      const matchKey =
        cue.id && overrideMap.has(cue.id)
          ? cue.id
          : overrideMap.has(String(idx))
          ? String(idx)
          : null;

      if (matchKey) {
        const newText = overrideMap.get(matchKey)!;
        return manualCaptionTextEdit(cue, newText);
      }
      return cue;
    });
  }

  /**
   * Resolves the gallery preset for a clip's caption settings, or null for legacy styles.
   * Unknown/invalid preset data falls back safely inside resolveCaptionPreset.
   */
  public static resolveClipPreset(
    style: unknown,
    config: CaptionConfig | undefined | null,
    aspectRatio: ClipAspectRatio = '9:16'
  ): ResolvedCaptionStyle | null {
    const presetId = resolveRenderPresetId(style, config);
    if (!presetId) return null;
    return resolveCaptionPreset(presetId, config?.presetOverrides, aspectRatio);
  }

  /**
   * Extracts clip-local cues using the clip's caption settings. For preset styles the
   * grouping, casing and line-breaking rules come from the preset, exactly as the editor
   * preview regroups them (regroupCuesForPreset).
   */
  public static extractCuesForClipSettings(
    transcript: { text?: unknown; transcript_text?: unknown; segments?: any[]; words?: any[] },
    clip: Pick<ClipRecord, 'start_seconds' | 'end_seconds' | 'trim_start_offset' | 'trim_end_offset' | 'caption_style' | 'caption_config' | 'aspect_ratio'> & { caption_overrides?: any },
    aspectRatio: ClipAspectRatio = (clip.aspect_ratio as ClipAspectRatio) || '9:16',
    options: { preserveCase?: boolean; joinTimedHyphenCompounds?: boolean } = {}
  ): { timingMode: CaptionTimingMode; cues: TimedCaptionCue[]; preset: ResolvedCaptionStyle | null } {
    const baseConfig: CaptionConfig = {
      ...(clip.caption_config || {}),
      caption_overrides: clip.caption_config?.caption_overrides || clip.caption_overrides || [],
    };
    const preset = this.resolveClipPreset(clip.caption_style, baseConfig, aspectRatio);
    const effectiveConfig: CaptionConfig = preset
      ? {
          ...baseConfig,
          maxWordsPerCue: preset.maxWordsPerCue,
          maxLines: preset.maxLines,
          maxCharsPerLine: preset.maxCharsPerLine,
          // Editor preview re-applies casing itself when regrouping (regroupCuesForPreset)
          uppercase: options.preserveCase ? false : preset.uppercase,
        }
      : baseConfig;

    const { timingMode, cues } = this.extractClipCues(
      transcript,
      clip.start_seconds,
      clip.end_seconds,
      Number(clip.trim_start_offset || 0),
      Number(clip.trim_end_offset || 0),
      effectiveConfig,
      {joinTimedHyphenCompounds:options.joinTimedHyphenCompounds??process.env.VIREO_CAPTION_COMPOUND_REVIEW==='1'}
    );

    if (preset && timingMode === 'segment' && !options.preserveCase) {
      return { timingMode, cues: cues.map((c) => ({ ...c, text: formatSegmentCueText(c.text, preset) })), preset };
    }
    return { timingMode, cues, preset };
  }

  /**
   * Generates sequential, strictly non-overlapping ASS dialogue events for a single cue
   * in kinetic word-pop mode.
   *
   * Highlights the active word with secondaryColour (and subtle pop scale)
   * while rendering remaining words in primaryColour at 100% scale.
   * Preserves line-breaks (\N) from cue.text.
   */
  public static buildKineticCueEvents(
    cue: TimedCaptionCue,
    options: KineticCueParams
  ): string[] {
    const {
      primaryColour,
      secondaryColour,
      animation = 'word_pop',
      activeWordScale = 1.12,
    } = options;

    const rawWords = Array.isArray(cue.words) ? cue.words : [];

    // Filter, sanitize, and validate words
    const validWords = rawWords
      .filter(
        (w): w is TimedCaptionToken =>
          Boolean(w) &&
          typeof (w.text ?? (w as any).word) === 'string' &&
          String(w.text ?? (w as any).word).trim().length > 0 &&
          typeof w.start === 'number' &&
          typeof w.end === 'number' &&
          Number.isFinite(w.start) &&
          Number.isFinite(w.end) &&
          w.end >= w.start
      )
      .map((w) => {
        const start = Number(w.start.toFixed(3));
        const rawEnd = Number(w.end.toFixed(3));
        const end = rawEnd > start ? rawEnd : Number((start + 0.05).toFixed(3));
        return {
          text: this.sanitizeAssText(String(w.text ?? (w as any).word)),
          start,
          end,
        };
      })
      .filter((w) => w.text.length > 0 && w.end > w.start)
      .sort((a, b) => a.start - b.start || a.end - b.end);

    if (validWords.length === 0) {
      return [];
    }

    // Determine line break position if cue.text had \N
    let lineBreakIndex = -1;
    if (cue.text && cue.text.includes('\\N')) {
      const parts = cue.text.split('\\N');
      const line1Words = parts[0].trim().split(/\s+/).filter(Boolean);
      if (line1Words.length > 0 && line1Words.length < validWords.length) {
        lineBreakIndex = line1Words.length - 1;
      }
    }

    const popScale = Math.min(125, Math.max(105, Math.round(activeWordScale * 100)));

    const formatCueText = (activeIdx: number, durationMs: number): string => {
      const tUp = Math.min(70, Math.max(20, Math.round(durationMs * 0.35)));
      const tDown = Math.min(140, Math.max(tUp + 20, Math.round(durationMs * 0.7)));

      const popTag =
        animation === 'none'
          ? `{\\c${secondaryColour}}`
          : `{\\t(0,${tUp},0.5,\\fscx${popScale}\\fscy${popScale})\\t(${tUp},${tDown},1.5,\\fscx100\\fscy100)\\c${secondaryColour}}`;
      const resetTag = `{\\c${primaryColour}\\fscx100\\fscy100}`;

      const formattedWords: string[] = [];
      for (let i = 0; i < validWords.length; i++) {
        const wText = validWords[i].text;
        if (i === activeIdx) {
          formattedWords.push(`${popTag}${wText}${resetTag}`);
        } else {
          formattedWords.push(wText);
        }
        if (i === lineBreakIndex) {
          formattedWords.push('\\N');
        }
      }

      let res = '';
      for (let i = 0; i < formattedWords.length; i++) {
        const part = formattedWords[i];
        if (part === '\\N') {
          res += '\\N';
        } else if (res.endsWith('\\N') || res.length === 0) {
          res += part;
        } else {
          res += ' ' + part;
        }
      }
      return res;
    };

    const cueStart = Math.max(0, cue.start);
    const cueEnd = Math.max(cueStart + 0.05, cue.end);

    const slices: Array<{ start: number; end: number; activeIdx: number }> = [];

    // 1. Initial silence before first word
    const firstWordStart = Math.max(cueStart, validWords[0].start);
    if (firstWordStart > cueStart + 0.04) {
      slices.push({
        start: cueStart,
        end: firstWordStart,
        activeIdx: -1,
      });
    }

    // 2. Active word slices
    for (let i = 0; i < validWords.length; i++) {
      const cur = validWords[i];
      const next = validWords[i + 1];

      let wStart = Math.max(cueStart, cur.start);
      if (slices.length > 0) {
        wStart = Math.max(slices[slices.length - 1].end, wStart);
      }

      let wEnd = Math.min(cueEnd, cur.end);
      if (next) {
        const nextStart = Math.max(cueStart, next.start);
        const gap = nextStart - wEnd;
        if (gap > 0 && gap <= 0.25) {
          // Small gap: extend active highlight until next word starts to avoid flicker
          wEnd = nextStart;
        } else if (gap > 0.25) {
          // Large gap: keep word end, and later add inactive slice
          wEnd = Math.min(nextStart - 0.05, wEnd);
        } else if (nextStart < wEnd) {
          // Words overlap: clamp current word end to next start
          wEnd = Math.max(wStart + 0.02, nextStart);
        }
      } else {
        // Last word: if close to cueEnd (within 0.25s), extend to cueEnd
        if (cueEnd - wEnd <= 0.25) {
          wEnd = cueEnd;
        }
      }

      if (wEnd > wStart + 0.02) {
        slices.push({
          start: wStart,
          end: wEnd,
          activeIdx: i,
        });

        // If there was a large gap before next word, add inactive slice
        if (next && next.start > wEnd + 0.04) {
          slices.push({
            start: wEnd,
            end: Math.min(cueEnd, next.start),
            activeIdx: -1,
          });
        }
      }
    }

    // 3. Trailing silence after last slice
    const lastSlice = slices[slices.length - 1];
    if (lastSlice && lastSlice.end < cueEnd - 0.04) {
      slices.push({
        start: lastSlice.end,
        end: cueEnd,
        activeIdx: -1,
      });
    }

    const events: string[] = [];
    for (const s of slices) {
      const startStr = this.formatAssTime(s.start);
      const endStr = this.formatAssTime(s.end);
      if (startStr === endStr) continue;

      const durMs = Math.round((s.end - s.start) * 1000);
      const lineText = formatCueText(s.activeIdx, durMs);
      if (lineText.trim()) {
        events.push(`Dialogue: 0,${startStr},${endStr},Default,,0,0,0,,${lineText}`);
      }
    }

    return events;
  }

  /**
   * Builds the complete ASS script content for FFmpeg burning.
   * Guarantees that at any timestamp normally exactly ONE caption event is visible.
   */
  public static buildAssScript(
    cues: TimedCaptionCue[],
    options: {
      style?: CaptionStyle;
      position?: CaptionPosition;
      aspectRatio?: ClipAspectRatio;
      customConfig?: CaptionConfig;
      timingMode?: CaptionTimingMode;
      kinetic?: boolean;
    }
  ): string {
    const {
      style = 'clean',
      position = 'bottom',
      aspectRatio = '9:16',
      customConfig = {},
      timingMode = 'segment',
      kinetic = false,
    } = options;

    const preset = this.resolveClipPreset(style, customConfig, aspectRatio);
    if (preset) {
      return buildPresetAssScript(cues, preset);
    }

    const isKinetic = Boolean(
      kinetic ||
      customConfig.kinetic ||
      customConfig.animation === 'word_pop' ||
      (style as string) === 'active_word_pop'
    );

    const playRes = this.getPlayRes(aspectRatio);
    const posConfig = this.getPositionConfig(position, aspectRatio);

    // 1. Typography & Font validation
    const rawFont = customConfig.fontFamily;
    const validatedFont = this.validateFontFamily(rawFont);
    // Match the existing preset emitter's committed Figtree face alias.
    const fontName = validatedFont === 'Figtree' ? 'Figtree SemiBold' : validatedFont;

    // Bounds are exact bundled-family metrics, unknown families retain historical caps.
    let defaultFontSize = 64;
    switch (style) {
      case 'bold':
        defaultFontSize = 76;
        break;
      case 'minimal':
        defaultFontSize = 48;
        break;
      case 'podcast':
        defaultFontSize = 66;
        break;
      case 'highlight':
        defaultFontSize = 72;
        break;
      case 'karaoke':
        defaultFontSize = 70;
        break;
      case 'clean':
      default:
        defaultFontSize = 64;
        break;
    }

    const rawSize = customConfig.fontSize || defaultFontSize;
    const fontSize = clampCaptionFontSize(Number(rawSize), rawFont, defaultFontSize);

    // Font weight (400 - 900)
    const fontWeight = customConfig.fontWeight ?? (style === 'bold' || style === 'highlight' || style === 'karaoke' ? 800 : 700);
    const bold = fontWeight >= 700 ? 1 : 0;

    // 2. Colors & Stroke
    const textColorHex = customConfig.textColor || customConfig.primaryColor || '#FFFFFF';
    const activeColorHex =
      customConfig.activeWordColor ||
      customConfig.highlightColor ||
      (style === 'highlight' ? '#10B981' : style === 'podcast' ? '#F59E0B' : '#FF6B35');
    const strokeColorHex = customConfig.strokeColor || customConfig.outlineColor || '#000000';

    let primaryColour = this.hexToAssColor(textColorHex, '#FFFFFF', 0);
    let secondaryColour = this.hexToAssColor(activeColorHex, '#FF6B35', 0);
    let outlineColour = this.hexToAssColor(strokeColorHex, '#000000', 0);

    // Stroke width (0 to 8)
    const rawStroke =
      customConfig.strokeWidth ??
      customConfig.outlineWidth ??
      (style === 'bold' ? 5.5 : style === 'minimal' ? 1.5 : 4.0);
    const outline = Math.min(8, Math.max(0, Number(rawStroke.toFixed(1))));

    // Shadow (0 to 5)
    const isShadowEnabled = customConfig.shadowEnabled !== false;
    let shadow = 0;
    if (isShadowEnabled) {
      const rawShadow = customConfig.shadow ?? (style === 'minimal' ? 0 : 1.8);
      shadow = Math.min(5, Math.max(0, Number(rawShadow.toFixed(1))));
    }

    // Background box vs Outline
    let borderStyle = 1; // 1 = Outline + Drop Shadow
    let backColour = '&H80000000&'; // Default semi-transparent shadow

    if (customConfig.backgroundEnabled) {
      borderStyle = 3; // 3 = Opaque/Translucent Bounding Box
      const bgOpacity = Math.min(1, Math.max(0, customConfig.backgroundOpacity ?? 0.55));
      const bgAlpha = Math.round((1 - bgOpacity) * 255);
      // libass BorderStyle 3 fills the line box with OutlineColour.
      // Preserve the existing shadow channel while fixing the box paint.
      backColour = this.hexToAssColor(customConfig.backgroundColor || '#000000', '#000000', bgAlpha);
      outlineColour = backColour;
    } else {
      const shadowOpacity = Math.min(1, Math.max(0, customConfig.shadowOpacity ?? 0.45));
      const shadowAlpha = Math.round((1 - shadowOpacity) * 255);
      backColour = this.hexToAssColor('#000000', '#000000', shadowAlpha);
    }

    // 3. Placement & Alignment
    let alignment = posConfig.alignment;
    if (customConfig.textAlign === 'left') {
      alignment = alignment === 8 ? 7 : alignment === 5 ? 4 : 1;
    } else if (customConfig.textAlign === 'right') {
      alignment = alignment === 8 ? 9 : alignment === 5 ? 6 : 3;
    }

    // Fine vertical and horizontal position (positionY, positionX: 0.0 to 1.0)
    let marginV = posConfig.marginV;
    if (customConfig.positionY !== undefined) {
      const posY = Math.min(0.92, Math.max(0.08, Number(customConfig.positionY)));
      marginV = Math.round(playRes.y * (1 - posY));
    }
    let marginL = 60;
    let marginR = 60;
    if (customConfig.positionX !== undefined) {
      const posX = Math.min(0.92, Math.max(0.08, Number(customConfig.positionX)));
      const centerShift = Math.round((posX - 0.5) * playRes.x);
      marginL = Math.max(0, 60 + centerShift);
      marginR = Math.max(0, 60 - centerShift);
    }

    // 4. Animation tags
    const animation = customConfig.animation || 'none';
    let animationTag = '';
    if (animation === 'fade') {
      animationTag = '{\\fad(90,90)}';
    } else if (animation === 'pop') {
      animationTag = '{\\t(0,70,\\fscx110\\fscy110)\\t(70,140,\\fscx100\\fscy100)}';
    }

    // Enforce strict zero overlap across cues
    const cleanCues = this.enforceZeroOverlap(cues);

    // 5. Format Dialogue Events
    const events: string[] = [];

    for (const cue of cleanCues) {
      const startStr = this.formatAssTime(cue.start);
      const endStr = this.formatAssTime(cue.end);
      let dialogueText = '';

      let cuePosTag = '';
      const hasPositionX = typeof cue.position_x === 'number' && Number.isFinite(cue.position_x);
      const hasPositionY = typeof cue.position_y === 'number' && Number.isFinite(cue.position_y);
      if (hasPositionX || hasPositionY) {
        const effX = Math.max(0.08, Math.min(0.92, hasPositionX ? cue.position_x! : 0.5));
        const defaultY =
          posConfig.alignment === 8
            ? posConfig.marginV / playRes.y
            : posConfig.alignment === 5
            ? 0.5
            : 1 - marginV / playRes.y;
        const effY = Math.max(0.08, Math.min(0.92, hasPositionY ? cue.position_y! : defaultY));
        const px = Math.round(effX * playRes.x);
        const py = Math.round(effY * playRes.y);
        cuePosTag = `{${cue.position_anchor === 'center' ? '\\an5' : cue.position_anchor === 'bottom' ? '\\an2' : ''}\\pos(${px},${py})}`;
      }

      if (isKinetic && timingMode === 'word' && Array.isArray(cue.words) && cue.words.length > 0) {
        const kineticEvents = this.buildKineticCueEvents(cue, {
          primaryColour,
          secondaryColour,
          animation: customConfig.animation,
          activeWordScale: customConfig.activeWordScale,
        });

        if (kineticEvents.length > 0) {
          if (cuePosTag) {
            events.push(
              ...kineticEvents.map((ev) => {
                const parts = ev.split(',,');
                if (parts.length >= 2) {
                  const header = parts.slice(0, -1).join(',,');
                  const body = parts[parts.length - 1];
                  return `${header},,${cuePosTag}${body}`;
                }
                return ev;
              })
            );
          } else {
            events.push(...kineticEvents);
          }
          continue;
        }
      }

      if (style === 'karaoke' && timingMode === 'word' && Array.isArray(cue.words) && cue.words.length > 0) {
        // True Karaoke: use real word durations with ASS {\k<duration_cs>}
        const parts: string[] = [];
        const cueStartCs=Math.round(Math.max(0,cue.start)*100);
        let plannedCs=0;
        const useWordOffsets=cue.start>=0 && subtitleWordsMatchCue(cue) && cue.words.every(tok=>{
          const offsetCs=Math.round(tok.start*100)-cueStartCs;
          if(offsetCs<plannedCs)return false;
          plannedCs=offsetCs+Math.max(1,Math.round((tok.end-tok.start)*100));
          return plannedCs<=Math.round(cue.end*100)-cueStartCs;
        });
        // Only exact validated display words may supply explicit hard breaks.
        // Other whitespace and soft breaks retain the legacy single space.
        let textCursor=0;
        const displayTokens=Array.from(cue.text.replace(/\\[Nn]/g,'  ').matchAll(/\S+/g));
        const separators=subtitleWordsMatchCue(cue)?displayTokens.map((token,index)=>{
          const start=token.index!;
          const between=cue.text.slice(textCursor,start);
          textCursor=start+token[0].length;
          return between.match(/\\N/g)?.join('')||(index===0?'':' ');
        }):cue.words.map((_,index)=>index===0?'':' ');
        const trailingBreaks=subtitleWordsMatchCue(cue)?(cue.text.slice(textCursor).match(/\\N/g)?.join('')||''):'';
        let elapsedCs=0;
        for (const [index,tok] of cue.words.entries()) {
          const offsetCs=useWordOffsets?Math.round(tok.start*100)-cueStartCs:elapsedCs;
          const delayCs=Math.max(0,offsetCs-elapsedCs);
          const delayTag=delayCs>0?`{\\k${delayCs}}`:'';
          elapsedCs+=delayCs;
          const durationCs = Math.max(1, Math.round((tok.end - tok.start) * 100));
          const safeWord = this.sanitizeAssText(tok.text);
          parts.push(`${separators[index]}${delayTag}{\\k${durationCs}}${safeWord}`);
          elapsedCs+=durationCs;
        }
        dialogueText = `${animationTag}${parts.join('')}${trailingBreaks}`;
      } else if (style === 'highlight' || style === 'podcast') {
        // Tokenize text preserving \N placement
        const rawTokens = cue.text.split(/\s+/).filter(Boolean);
        const tokens: string[] = [];
        for (const tok of rawTokens) {
          if (tok.includes('\\N')) {
            const parts = tok.split('\\N');
            for (let p = 0; p < parts.length; p++) {
              if (parts[p]) tokens.push(parts[p]);
              if (p < parts.length - 1) tokens.push('\\N');
            }
          } else {
            tokens.push(tok);
          }
        }

        // Identify word indices (excluding \N)
        const wordIndices: number[] = [];
        for (let idx = 0; idx < tokens.length; idx++) {
          if (tokens[idx] !== '\\N') {
            wordIndices.push(idx);
          }
        }

        if (wordIndices.length > 0) {
          const wordTokens = wordIndices.map((i) => tokens[i]);
          const chosenRelativeIndex = CaptionService.findImpactfulWordIndex(wordTokens);
          const chosenTokenIndex = wordIndices[chosenRelativeIndex];

          const formattedParts: string[] = [];
          for (let i = 0; i < tokens.length; i++) {
            const t = tokens[i];
            if (t === '\\N') {
              formattedParts.push('\\N');
            } else if (i === chosenTokenIndex) {
              const safeWord = this.sanitizeAssText(t);
              formattedParts.push(`{\\c${secondaryColour}}${safeWord}{\\c${primaryColour}}`);
            } else {
              formattedParts.push(this.sanitizeAssText(t));
            }
          }

          let res = '';
          for (const p of formattedParts) {
            if (p === '\\N') {
              res += '\\N';
            } else if (res.endsWith('\\N') || res.length === 0) {
              res += p;
            } else {
              res += ' ' + p;
            }
          }
          dialogueText = `${animationTag}${res}`;
        } else {
          dialogueText = `${animationTag}${this.sanitizeAssText(cue.text)}`;
        }
      } else {
        dialogueText = `${animationTag}${this.sanitizeAssText(cue.text)}`;
      }

      if (dialogueText.trim()) {
        events.push(`Dialogue: 0,${startStr},${endStr},Default,,0,0,0,,${cuePosTag}${dialogueText}`);
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
      `Style: Default,${fontName},${fontSize},${primaryColour},${secondaryColour},${outlineColour},${backColour},${bold},0,0,0,100,100,0,0,${borderStyle},${outline},${shadow},${alignment},${marginL},${marginR},${marginV},1`,
      '',
      '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      ...events,
      '',
    ].join('\n');

    return script;
  }

  /**
   * Extracts, aggregates, and chronologically orders all active caption cues from an EditorProject.
   * Handles:
   * - Single caption item (100% backward compatible)
   * - Multiple caption items across splits or non-zero timeline offsets
   * - Translation of segment-relative cue timestamps when an item has timeline_start > 0
   * - De-duplication where adjacent items share boundaries or copy-pasted cues
   * - Respects cue styling, presets, and word tokens
   */
  public static extractEditorCuesFromProject(proj: any): {
    cues: TimedCaptionCue[];
    style?: string;
    position?: string;
    /** True when the user explicitly chose/dragged the caption position in the
     * editor (flag set by the position write funnels). */
    positionExplicit?: boolean;
    /** Numeric drag offset (only present after a drag); also implies explicit. */
    positionY?: number;
  } | null {
    if (!proj || !Array.isArray(proj.tracks)) return null;

    const captionTrack = proj.tracks.find((t: any) => t.type === 'CAPTION' && !t.hidden);
    if (!captionTrack || !Array.isArray(captionTrack.items)) return null;

    const validItems = captionTrack.items.filter(
      (item: any) =>
        !item.hidden &&
        item.caption &&
        hasAuthoritativeCaptionCues(item.caption)
    );

    if (validItems.length === 0) return null;

    // Persisted item drag coordinates are authoritative even without the clip's
    // mirrored preset config. Per-cue edits stay more specific than the item.
    const placedCue = (cue: TimedCaptionCue, item: any): TimedCaptionCue => ({
      ...cue,
      ...(cue.position_x === undefined && Number.isFinite(item.caption.position_x)
        ? {position_x:item.caption.position_x} : {}),
      ...(cue.position_y === undefined && Number.isFinite(item.caption.position_y)
        ? {position_y:item.caption.position_y,position_anchor:cue.position_anchor ?? 'bottom'} : {}),
    });

    // Single item fast-path for maximum backward compatibility
    if (validItems.length === 1) {
      const item = validItems[0];
      const itemStart = typeof item.timeline_start === 'number' ? item.timeline_start : 0;
      const rawCues = item.caption.cues as TimedCaptionCue[];

      // Detect segment-relative timing: if item starts after 0, but cues start near 0
      const isSegmentRelative =
        itemStart > 0 &&
        rawCues.length > 0 &&
        rawCues[0].start < itemStart - 0.05 &&
        rawCues[0].start >= 0;

      const finalCues = isSegmentRelative
        ? rawCues.map((c: any) => ({
            ...c,
            start: Number((c.start + itemStart).toFixed(3)),
            end: Number((c.end + itemStart).toFixed(3)),
            words: Array.isArray(c.words)
              ? c.words.map((w: any) => ({
                  ...w,
                  start: Number((w.start + itemStart).toFixed(3)),
                  end: Number((w.end + itemStart).toFixed(3)),
                }))
              : c.words,
          }))
        : rawCues;

      return {
        cues: finalCues.map(c => placedCue(c,item)),
        style: item.caption.style,
        position: item.caption.position,
        positionExplicit: item.caption.position_explicit === true,
        positionY: typeof item.caption.position_y === 'number' ? item.caption.position_y : undefined,
      };
    }

    // Multiple caption items: sort chronologically by timeline_start
    validItems.sort((a: any, b: any) => (a.timeline_start || 0) - (b.timeline_start || 0));

    const aggregatedCues: TimedCaptionCue[] = [];
    const seenCueIds = new Set<string>();
    const seenSignatures = new Set<string>();

    for (const item of validItems) {
      const itemStart = typeof item.timeline_start === 'number' ? item.timeline_start : 0;
      const itemEnd = typeof item.timeline_end === 'number' ? item.timeline_end : Infinity;
      const itemCues = item.caption.cues as TimedCaptionCue[];

      // Determine timestamp convention for this item
      const isSegmentRelative =
        itemStart > 0 &&
        itemCues.length > 0 &&
        itemCues[0].start < itemStart - 0.05 &&
        itemCues[0].start >= 0;

      for (const rawCue of itemCues) {
        const cueStart = isSegmentRelative
          ? Number((rawCue.start + itemStart).toFixed(3))
          : rawCue.start;
        const cueEnd = isSegmentRelative
          ? Number((rawCue.end + itemStart).toFixed(3))
          : rawCue.end;

        // Skip cues completely outside this item's assigned timeline window
        if (cueEnd <= itemStart - 0.05 || cueStart >= itemEnd + 0.05) {
          continue;
        }

        // De-duplication check: avoid duplicate cues where adjacent items share boundaries.
        // Only cue IDs that actually exist participate — cues without IDs must not
        // collapse into the first one via an `undefined` Set key.
        const signature = `${cueStart.toFixed(2)}_${cueEnd.toFixed(2)}_${(rawCue.text || '').trim().toLowerCase()}`;
        if ((rawCue.id != null && seenCueIds.has(rawCue.id)) || seenSignatures.has(signature)) {
          continue;
        }
        if (rawCue.id != null) seenCueIds.add(rawCue.id);
        seenSignatures.add(signature);

        const translatedWords = Array.isArray(rawCue.words)
          ? rawCue.words.map((w: any) => ({
              ...w,
              start: isSegmentRelative ? Number((w.start + itemStart).toFixed(3)) : w.start,
              end: isSegmentRelative ? Number((w.end + itemStart).toFixed(3)) : w.end,
            }))
          : rawCue.words;

        aggregatedCues.push({
          ...placedCue(rawCue,item),
          start: cueStart,
          end: cueEnd,
          words: translatedWords,
        });
      }
    }

    aggregatedCues.sort((a, b) => a.start - b.start);

    return {
      cues: aggregatedCues,
      style: validItems[0]?.caption?.style,
      position: validItems[0]?.caption?.position,
      positionExplicit: validItems.some((it: any) => it?.caption?.position_explicit === true),
      positionY: (validItems.find((it: any) => typeof it?.caption?.position_y === 'number') as any)
        ?.caption?.position_y,
    };
  }

  /**
   * Main service function: fetches transcript, computes clip cues, writes ASS file if path provided
   */
  public static async generateCaptionsForClip(
    options: GenerateCaptionsOptions
  ): Promise<CaptionGenerationResult> {
    const { clip, targetAspectRatio = clip.aspect_ratio || '9:16', outputPath } = options;

    if (!isMongoConfigured) {
      throw new AppError('Database is not configured for requested captions.',503,'DATABASE_UNAVAILABLE');
    }

    const runGeneration = async (): Promise<CaptionGenerationResult> => {
      // 1. Check if an EditorProject exists with custom edited/sliced caption cues
    let editorCues: TimedCaptionCue[] | null = null;
    let editorStyle: string | null = null;
    let editorPosition: string | null = null;
    let editorPositionExplicit = false;
    let editorPositionYNumeric: number | null = null;
    let editorCoveredEnd: number | null = null;
    let editorProject: any = null;

    {
      let proj:any;
      if(Object.prototype.hasOwnProperty.call(options,'editorProjectSnapshot'))proj=options.editorProjectSnapshot;
      else{
        const {data,error}=await dataRepository.from('editor_projects').select('*').eq('clip_id',clip.id).eq('user_id',clip.user_id).maybeSingle();
        if(error)throw new AppError('Saved caption edits could not be read. Retry before exporting.',503,'CAPTION_SOURCE_UNAVAILABLE');
        proj=data;
      }
      if(proj&&(proj.clip_id!==clip.id||proj.user_id!==clip.user_id))throw new AppError('Saved caption edits do not belong to this clip and owner.',409,'CAPTION_SOURCE_MISMATCH');
      if(proj&&!Array.isArray(proj.tracks))throw new AppError('Saved caption tracks are invalid. Review before exporting.',409,'CAPTION_SOURCE_REQUIRED');
      if(proj&&Array.isArray(proj.tracks)){
        editorProject=proj;
        const extracted=CaptionService.extractEditorCuesFromProject(proj);
        if(extracted){editorCues=subtitleRenderCues(extracted.cues);editorStyle=extracted.style||null;editorPosition=extracted.position||null;editorPositionExplicit=extracted.positionExplicit===true;editorPositionYNumeric=typeof extracted.positionY==='number'?extracted.positionY:null;editorCoveredEnd=editorProjectCoveredEnd(proj);}
      }
    }

    // 2. Load transcript for this project if needed
    const { data: transcript, error: transErr } = await dataRepository
      .from('transcripts')
      .select('*')
      .eq('project_id', clip.project_id)
      .eq('user_id', clip.user_id)
      .maybeSingle();

    if(transErr)throw new AppError('Caption transcript could not be read. Retry before exporting.',503,'CAPTION_SOURCE_UNAVAILABLE');

    if (transcript) {
      assertTranscriptUsable(transcript);
      await assertSelectionSourceCurrent(clip.user_id,clip.project_id,(clip as any).selection_source_receipt,clip.source_storage_path);
    }

    if(editorCues===null&&!transcript){
      throw new AppError('Captions are enabled but no verified transcript or saved caption edit is available.',409,'CAPTION_SOURCE_REQUIRED');
    }

    const requestedCaptionDuration=Number(clip.end_seconds)-Number(clip.start_seconds)-Number(clip.trim_start_offset||0)-Number(clip.trim_end_offset||0);
    if(editorCues!==null&&!transcript&&(editorCoveredEnd===null||requestedCaptionDuration>editorCoveredEnd+0.05))throw new AppError('The saved caption edit does not cover the extended interval and no transcript is available.',409,'CAPTION_SOURCE_REQUIRED');

    // Blur-fit band anchor: computed by the render pipeline for layouts whose
    // source does not fill the canvas vertically. Only applied when nobody set
    // an explicit vertical position.
    // A persisted editor position of 'bottom' is the default, not an explicit
    // choice - every editor project materializes it. Explicit means any of:
    //  (a) the provenance flag (position_explicit) set by the editor's
    //      position write funnels - covers a deliberate 'bottom' choice too;
    //  (b) a non-bottom editor position (legacy, pre-flag);
    //  (c) a numeric editor position_y from a drag (legacy, pre-flag).
    // A numeric positionY in caption_config / presetOverrides is explicit
    // UNLESS the editor marked it derived: the editor save path mirrors the
    // materialized default caption transform (position_y 500 -> 0.7604) into
    // presetOverrides on every save and stamps it positionYDerived: true, so
    // after any autosave a default-state blur project no longer carries a
    // fake explicit position that silently disabled this anchor (verified on
    // render v96: default blur project exported captions at 0.75 instead of
    // the anchor). Unmarked config-only values (legacy saves, external API
    // writers) keep their meaning and stay explicit - no retroactive item
    // flag is required of them.
    const hasExplicitEditorPosition =
      editorPositionExplicit ||
      editorPositionYNumeric !== null ||
      (Boolean(editorPosition) && editorPosition !== 'bottom');
    const mergedConfigPre: CaptionConfig = clip.caption_config || {};
    const prePo = (mergedConfigPre.presetOverrides || {}) as any;
    // Config-level explicit position: a top-level positionY, or a
    // presetOverrides.positionY that the editor did not mark as derived from
    // the materialized default transform.
    const hasExplicitConfigPosition =
      mergedConfigPre.positionY !== undefined ||
      (prePo.positionY !== undefined && prePo.positionYDerived !== true);
    const bandY =
      !editorProject && options.bandAnchorPositionY !== undefined &&
      !hasExplicitEditorPosition &&
      !hasExplicitConfigPosition &&
      (clip.caption_position ?? 'bottom') === 'bottom'
        ? Math.min(0.92, Math.max(0.08, options.bandAnchorPositionY))
        : undefined;

    const mergedConfig: CaptionConfig = {
      ...(clip.caption_config || {}),
      caption_overrides: clip.caption_config?.caption_overrides || (clip as any).caption_overrides || [],
    };
    if (bandY !== undefined) {
      mergedConfig.positionY = bandY;
      mergedConfig.presetOverrides = { ...(mergedConfig.presetOverrides || {}), positionY: bandY } as any;
    }

    // Mirror the editor preview's caption->override mapping
    // (editorCaptionToPresetOverrides): the declared position always applies to
    // preset resolution (top/center change anchor+alignment; 'bottom' matches
    // every preset's default anchor), and a dragged numeric offset wins when
    // no config-level positionY is set. Without this, preset styles silently
    // dropped the editor's position choice in export (preview/export mismatch).
    {
      const po = { ...(mergedConfig.presetOverrides || {}) } as any;
      if (editorPosition && po.position === undefined) po.position = editorPosition;
      if (
        editorPositionYNumeric !== null &&
        mergedConfig.positionY === undefined &&
        po.positionY === undefined
      ) {
        po.positionY = editorPositionYNumeric;
      }
      mergedConfig.presetOverrides = po;
    }

    let timingMode: CaptionTimingMode = 'segment';
    let cues: TimedCaptionCue[] = [];
    let preset: ResolvedCaptionStyle | null = null;

    if (editorCues !== null) {
      const effectiveStyle = editorStyle || clip.caption_style;
      preset = this.resolveClipPreset(effectiveStyle, mergedConfig, targetAspectRatio);
      const hasWords = editorCues.some((c) => Array.isArray(c.words) && c.words.length > 0);
      timingMode = hasWords ? 'word' : 'segment';
      cues = editorCues;

      // Beyond-candidate extend: if the clip's current trim window runs past
      // the saved cues' coverage, append the newly exposed span from the
      // transcript. Append-only: user edits and deletions inside the covered
      // region are never regenerated or resurrected.
      if (transcript) {
        try {
          const coveredEnd = editorCoveredEnd ?? maxCueEnd(editorCues);
          const effectiveDuration = Number((
            clip.end_seconds - clip.start_seconds -
            Number(clip.trim_start_offset || 0) - Number(clip.trim_end_offset || 0)
          ).toFixed(3));
          // A materialized Producer cut has a non-linear source clock. Raw
          // transcript append would resurrect removed or duplicate tail words.
          const cutTimeline=editorProject?.settings?.producer_range_cut_v1;
          const hasSourceCuts=cutTimeline&&Array.isArray(cutTimeline.cuts)&&cutTimeline.cuts.length>0;
          if(hasSourceCuts&&(Math.abs(clip.start_seconds+Number(clip.trim_start_offset||0)-cutTimeline.source_start)>.001||Math.abs(clip.end_seconds-Number(clip.trim_end_offset||0)-cutTimeline.source_end)>.001))throw new AppError('This cut timeline needs caption review after source trim or extension. Saved captions were not regenerated.',409,'PRODUCER_CUT_REVIEW_REQUIRED');
          if (!hasSourceCuts && effectiveDuration > coveredEnd + 0.05) {
            const fresh = this.extractCuesForClipSettings(transcript, clip, targetAspectRatio);
            const merged = mergeExtendedCues(editorCues, fresh.cues as any, coveredEnd);
            if (merged.appended > 0) {
              cues = merged.cues as TimedCaptionCue[];
              if (merged.cues.some((c) => Array.isArray(c.words) && c.words.length > 0)) {
                timingMode = 'word';
              }
            }
          }
        } catch (extendErr: any) {
          throw extendErr;
        }
      }
      if (preset && timingMode === 'segment') {
        cues = cues.map((c) => ({ ...c, text: formatSegmentCueText(c.text, preset!) }));
      }
    } else if (transcript) {
      // Clips with no explicit caption style get the house default (karaoke
      // preset); explicit styles (including the editor reset's 'clean') pass
      // through unchanged. The band anchor rides along via caption_config.
      const defaults = this.resolveDefaultCaptionStyle(clip);
      const effectiveConfig: CaptionConfig = { ...defaults.captionConfig };
      if (bandY !== undefined) {
        effectiveConfig.positionY = bandY;
        effectiveConfig.presetOverrides = { ...(effectiveConfig.presetOverrides || {}), positionY: bandY } as any;
      }
      const effectiveClip = { ...clip, caption_style: defaults.captionStyle, caption_config: effectiveConfig };
      const extracted = this.extractCuesForClipSettings(transcript, effectiveClip, targetAspectRatio);
      timingMode = extracted.timingMode;
      cues = extracted.cues;
      preset = extracted.preset;
    }

    if (editorProject || options.automaticSceneWindows?.length) {
      cues = applySceneCaptionPlacement(cues, {
        project: editorProject || quickCaptionProject(Number(clip.duration_seconds)||Number(clip.end_seconds)-Number(clip.start_seconds)), sourceWidth: options.sourceWidth, sourceHeight: options.sourceHeight,
        fallbackLayout: options.sceneLayoutFallback, automaticWindows:options.automaticSceneWindows,
        fontSize: preset?.fontSize, maxLines: preset?.maxLines, maxCharsPerLine: preset?.maxCharsPerLine,
        explicitConfigPosition: hasExplicitConfigPosition || (clip.caption_position ?? 'bottom') !== 'bottom',
      });
    } else if (options.speakerSplit && !hasExplicitEditorPosition && !hasExplicitConfigPosition) {
      cues = cues.map(c => c.position_x !== undefined || c.position_y !== undefined ? c : ({...c, position_y:0.5, position_anchor:'center'}));
    }

    // Actual editor exports must use the same per-cue preset bounds as preview.
    // Placement has already split scene/position boundaries. Keep explicit other
    // preset overrides untouched and never manufacture or rewrite word timings.
    if (preset) {
      cues = cues.flatMap(cue => cue.presetOverride && cue.presetOverride !== preset!.presetId
        ? [cue]
        : regroupCuesForPreset([cue], preset!).cues as TimedCaptionCue[]);
      cues = finalizeAutomaticFitCaptionGrowth(cues,preset);
    }

    const isKinetic = Boolean(
      mergedConfig.kinetic ||
      mergedConfig.animation === 'word_pop' ||
      clip.caption_style === ('active_word_pop' as any)
    );

    const assContent = preset
      ? buildPresetAssScript(cues, preset)
      : this.buildAssScript(cues, {
          style: (editorStyle as CaptionStyle) || (clip.caption_style as CaptionStyle) || 'clean',
          position: (editorPosition as CaptionPosition) || (clip.caption_position as CaptionPosition) || 'bottom',
          aspectRatio: targetAspectRatio,
          customConfig: mergedConfig,
          timingMode,
          kinetic: isKinetic,
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
  };

  if (clip.user_id && !ownerContext.getStore()) {
    return ownerContext.run(clip.user_id, runGeneration);
  }
  return runGeneration();
}
}
