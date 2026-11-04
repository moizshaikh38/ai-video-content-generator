/**
 * VireoClip caption preset system — the single source of truth shared by the
 * editor (preset gallery cards + live preview) and the FFmpeg/ASS export.
 *
 * This file is imported by both the server (NodeNext) and the Vite frontend, so it
 * must stay dependency-free and must not import anything.
 *
 * All sizes are expressed in ASS script units for a frame whose short side is 1080
 * (PlayRes 1080x1920 for 9:16, 1080x1080 for 1:1, 1920x1080 for 16:9). The preview
 * multiplies them by `frameWidthPx / playResX`.
 */

// ── IDs ──────────────────────────────────────────────────────────

/** Gallery preset IDs in display order. `none` disables caption burn-in. */
export const CAPTION_PRESET_IDS = [
  'none',
  'karaoke',
  'deep_diver',
  'youshaei',
  'simple',
  'beasty',
  'mozi',
  'popline',
  'think_media',
  'editorial',
  'bold_highlight',
  'soft_backdrop',
  'compact_creator',
  'two_color_highlight',
  // Vireo Kinetic Presets
  'vireo_oneword',
  'vireo_pill',
  'vireo_lime',
  'vireo_hormozi',
  'vireo_clean',
  'vireo_spring',
  'vireo_neon',
  'vireo_capsule',
  'vireo_editorial',
  'vireo_sweep',
] as const;

export type CaptionPresetId = (typeof CAPTION_PRESET_IDS)[number];
export type RenderableCaptionPresetId = Exclude<CaptionPresetId, 'none'>;

/** Caption styles that existed before the preset gallery. Their export behavior is unchanged. */
export const LEGACY_CAPTION_STYLES = ['clean', 'bold', 'minimal', 'podcast', 'highlight', 'karaoke'] as const;

/** Preset IDs that are new style values (karaoke is shared with the legacy list). */
export const PRESET_ONLY_CAPTION_STYLES = [
  'deep_diver',
  'youshaei',
  'simple',
  'beasty',
  'mozi',
  'popline',
  'think_media',
  'editorial',
  'bold_highlight',
  'soft_backdrop',
  'compact_creator',
  'two_color_highlight',
  'vireo_oneword',
  'vireo_pill',
  'vireo_lime',
  'vireo_hormozi',
  'vireo_clean',
  'vireo_spring',
  'vireo_neon',
  'vireo_capsule',
  'vireo_editorial',
  'vireo_sweep',
] as const;

/** Every value accepted for `caption_style`. */
export const ALL_CAPTION_STYLES = [...LEGACY_CAPTION_STYLES, ...PRESET_ONLY_CAPTION_STYLES] as const;

export const DEFAULT_CAPTION_PRESET_ID: RenderableCaptionPresetId = 'simple';

export function isCaptionPresetId(value: unknown): value is CaptionPresetId {
  return typeof value === 'string' && (CAPTION_PRESET_IDS as readonly string[]).includes(value);
}

export function isRenderablePresetId(value: unknown): value is RenderableCaptionPresetId {
  return isCaptionPresetId(value) && value !== 'none';
}

export function isKnownCaptionStyle(value: unknown): boolean {
  return typeof value === 'string' && (ALL_CAPTION_STYLES as readonly string[]).includes(value);
}

/**
 * Decides whether a clip's caption settings should be rendered by the preset engine.
 *
 * - Preset-only styles (deep_diver, beasty, …) always use the preset engine.
 * - `karaoke` is also a legacy style (ASS `\k` sweep); it only uses the preset engine
 *   when the saved config explicitly carries `presetId: 'karaoke'`, which the editor
 *   gallery always sends. Legacy API callers keep the old behavior.
 * - Anything else (legacy or unknown) returns null → legacy renderer.
 */
export function resolveRenderPresetId(
  style: unknown,
  config?: { presetId?: unknown } | null
): RenderableCaptionPresetId | null {
  if (typeof style !== 'string') return null;
  if ((PRESET_ONLY_CAPTION_STYLES as readonly string[]).includes(style)) {
    return style as RenderableCaptionPresetId;
  }
  if (style === 'karaoke' && config?.presetId === 'karaoke') return 'karaoke';
  return null;
}

// ── Fonts ────────────────────────────────────────────────────────

/** Fonts the export renderer allows (mirrors SAFE_FONT_FAMILIES in server types). */
export const CAPTION_RENDER_FONTS = ['Inter', 'Arial', 'Arial Black', 'DejaVu Sans', 'Liberation Sans'] as const;
export type CaptionRenderFont = (typeof CAPTION_RENDER_FONTS)[number];
export const CAPTION_FALLBACK_FONT: CaptionRenderFont = 'Arial';

/**
 * Fonts offered in the editor for preset captions. Limited to faces verified to render
 * through libass on the export host; the other CAPTION_RENDER_FONTS stay accepted for
 * API compatibility but may be substituted by the system font matcher.
 */
export const PRESET_FONT_CHOICES: readonly CaptionRenderFont[] = ['Arial', 'Arial Black'];

/**
 * libass scales a font so that (ascent + descent) equals the ASS font size, while CSS
 * `font-size` sets the em size. This is em / (ascent + descent) from each font's hhea
 * metrics, verified against libass renders for Arial (0.894) and Arial Black (0.705).
 */
export const FONT_EM_PER_ASS_SIZE: Record<CaptionRenderFont, number> = {
  Arial: 0.894,
  'Liberation Sans': 0.894,
  'Arial Black': 0.705,
  Inter: 0.826,
  'DejaVu Sans': 0.859,
};

/** CSS font stacks used by the preview for each export font. */
export const FONT_CSS_STACK: Record<CaptionRenderFont, string> = {
  Arial: "Arial, 'Liberation Sans', Helvetica, sans-serif",
  'Liberation Sans': "'Liberation Sans', Arial, Helvetica, sans-serif",
  'Arial Black': "'Arial Black', 'Arial Bold', Gadget, sans-serif",
  Inter: "Inter, Arial, Helvetica, sans-serif",
  'DejaVu Sans': "'DejaVu Sans', Verdana, sans-serif",
};

export function normalizeCaptionFont(font: unknown): { font: CaptionRenderFont; fellBack: boolean } {
  if (typeof font === 'string') {
    const clean = font.trim();
    if ((CAPTION_RENDER_FONTS as readonly string[]).includes(clean)) {
      return { font: clean as CaptionRenderFont, fellBack: false };
    }
    if (clean) return { font: CAPTION_FALLBACK_FONT, fellBack: true };
  }
  return { font: CAPTION_FALLBACK_FONT, fellBack: false };
}

// ── Preset definitions ───────────────────────────────────────────

export type CaptionHighlightMode = 'none' | 'active' | 'progressive';
export type CaptionAnchor = 'top' | 'center' | 'bottom';
export type CaptionAspect = '9:16' | '1:1' | '16:9';

export interface CaptionPresetDefinition {
  id: RenderableCaptionPresetId;
  label: string;
  description: string;
  /** Sample phrase used by the gallery card. */
  sampleText: string;
  font: {
    family: CaptionRenderFont;
    bold: boolean;
    /** ASS font size (≈ line height in px on a 1080-wide portrait frame). */
    size: number;
    uppercase: boolean;
    /** ASS Spacing (extra px between letters). */
    letterSpacing: number;
  };
  colors: {
    text: string;
    /** Highlight color: active word text, or the active-word box color when `activeWordBox` is set. */
    active: string;
    /** Active-word text color when an active-word box is drawn behind it. */
    activeText: string;
    outline: string;
    shadow: string;
    /** Shadow opacity 0..1. */
    shadowOpacity: number;
  };
  /** Glyph outline width (ASS \bord). Ignored when `box` is set (it becomes the box padding). */
  outline: number;
  /** Shadow offset depth (ASS \shad); libass shadows are offset, never blurred. */
  shadow: number;
  /** Translucent box behind each line (ASS BorderStyle 3). */
  box: null | { color: string; opacity: number; padding: number };
  /** Rounded highlight behind the active word, drawn as a thick outline in that word's color. */
  activeWordBox: null | { padding: number };
  layout: {
    anchor: CaptionAnchor;
    /** Vertical margin for a 1920-tall frame; scaled for shorter frames. */
    marginV: number;
    marginH: number;
    maxWordsPerCue: number;
    maxLines: 1 | 2;
    maxCharsPerLine: number;
  };
  highlight: CaptionHighlightMode;
  wordAnimation: {
    type: 'none' | 'pop';
    /** Peak scale of the active word (1.0–1.3). */
    scale: number;
    /** Time to reach peak and (unless `hold`) settle back, in ms. */
    durationMs: number;
    /** Keep the active word at peak scale for the whole slice instead of settling back to 100%. */
    hold: boolean;
  };
  entrance: { type: 'none' | 'fade'; durationMs: number };
}

const NO_ANIMATION = { type: 'none', scale: 1, durationMs: 0, hold: false } as const;
const NO_ENTRANCE = { type: 'none', durationMs: 0 } as const;

/**
 * Initial design directions inspired by popular creator caption looks. These are
 * VireoClip's own interpretations using renderer-safe fonts, not reproductions of
 * any third-party preset.
 */
export const CAPTION_PRESETS: Record<RenderableCaptionPresetId, CaptionPresetDefinition> = {
  karaoke: {
    id: 'karaoke',
    label: 'Karaoke',
    description: 'Words fill with color in sync with speech.',
    sampleText: 'Say it word by word',
    font: { family: 'Arial Black', bold: false, size: 84, uppercase: true, letterSpacing: 0 },
    colors: { text: '#FFFFFF', active: '#FFD60A', activeText: '#FFD60A', outline: '#000000', shadow: '#000000', shadowOpacity: 0.6 },
    outline: 6,
    shadow: 2,
    box: null,
    activeWordBox: null,
    layout: { anchor: 'bottom', marginV: 320, marginH: 70, maxWordsPerCue: 4, maxLines: 2, maxCharsPerLine: 16 },
    highlight: 'progressive',
    wordAnimation: NO_ANIMATION,
    entrance: NO_ENTRANCE,
  },
  deep_diver: {
    id: 'deep_diver',
    label: 'Deep Diver',
    description: 'Compact phrase in a dark card, active word lit up.',
    sampleText: 'Go one level deeper',
    font: { family: 'Arial', bold: true, size: 62, uppercase: false, letterSpacing: 0 },
    colors: { text: '#C9CED6', active: '#5EEAD4', activeText: '#5EEAD4', outline: '#000000', shadow: '#000000', shadowOpacity: 0 },
    outline: 0,
    shadow: 0,
    box: { color: '#0B0D12', opacity: 0.82, padding: 16 },
    activeWordBox: null,
    layout: { anchor: 'bottom', marginV: 360, marginH: 90, maxWordsPerCue: 3, maxLines: 1, maxCharsPerLine: 22 },
    highlight: 'active',
    wordAnimation: NO_ANIMATION,
    entrance: { type: 'fade', durationMs: 120 },
  },
  youshaei: {
    id: 'youshaei',
    label: 'Youshaei',
    description: 'Heavy high-contrast caps with a green active word.',
    sampleText: 'This changes everything',
    font: { family: 'Arial Black', bold: false, size: 80, uppercase: true, letterSpacing: 0 },
    colors: { text: '#FFFFFF', active: '#22C55E', activeText: '#22C55E', outline: '#000000', shadow: '#000000', shadowOpacity: 0 },
    outline: 8,
    shadow: 0,
    box: null,
    activeWordBox: null,
    layout: { anchor: 'bottom', marginV: 420, marginH: 70, maxWordsPerCue: 3, maxLines: 2, maxCharsPerLine: 15 },
    highlight: 'active',
    wordAnimation: { type: 'pop', scale: 1.1, durationMs: 140, hold: false },
    entrance: NO_ENTRANCE,
  },
  simple: {
    id: 'simple',
    label: 'Simple',
    description: 'Clean, readable sentence-case subtitles.',
    sampleText: 'Clear and easy to read',
    font: { family: 'Arial', bold: true, size: 62, uppercase: false, letterSpacing: 0 },
    colors: { text: '#FFFFFF', active: '#FFFFFF', activeText: '#FFFFFF', outline: '#000000', shadow: '#000000', shadowOpacity: 0.5 },
    outline: 4,
    shadow: 2,
    box: null,
    activeWordBox: null,
    layout: { anchor: 'bottom', marginV: 260, marginH: 80, maxWordsPerCue: 6, maxLines: 2, maxCharsPerLine: 28 },
    highlight: 'none',
    wordAnimation: NO_ANIMATION,
    entrance: NO_ENTRANCE,
  },
  beasty: {
    id: 'beasty',
    label: 'Beasty',
    description: 'Oversized two-word bursts with a big yellow pop.',
    sampleText: 'Last one wins',
    font: { family: 'Arial Black', bold: false, size: 104, uppercase: true, letterSpacing: 0 },
    colors: { text: '#FFFFFF', active: '#FFE600', activeText: '#FFE600', outline: '#000000', shadow: '#000000', shadowOpacity: 0.85 },
    outline: 9,
    shadow: 5,
    box: null,
    activeWordBox: null,
    layout: { anchor: 'bottom', marginV: 560, marginH: 60, maxWordsPerCue: 2, maxLines: 2, maxCharsPerLine: 11 },
    highlight: 'active',
    wordAnimation: { type: 'pop', scale: 1.2, durationMs: 160, hold: true },
    entrance: NO_ENTRANCE,
  },
  mozi: {
    id: 'mozi',
    label: 'Mozi',
    description: 'Bold caps with a bright neon active word.',
    sampleText: 'Make more money',
    font: { family: 'Arial Black', bold: false, size: 86, uppercase: true, letterSpacing: 0 },
    colors: { text: '#FFFFFF', active: '#39FF14', activeText: '#39FF14', outline: '#000000', shadow: '#000000', shadowOpacity: 0.7 },
    outline: 7,
    shadow: 3,
    box: null,
    activeWordBox: null,
    layout: { anchor: 'bottom', marginV: 460, marginH: 70, maxWordsPerCue: 3, maxLines: 2, maxCharsPerLine: 13 },
    highlight: 'active',
    wordAnimation: { type: 'pop', scale: 1.12, durationMs: 150, hold: true },
    entrance: NO_ENTRANCE,
  },
  popline: {
    id: 'popline',
    label: 'Popline',
    description: 'Single punchy line, active word on a pink pill.',
    sampleText: 'Watch this part',
    font: { family: 'Arial', bold: true, size: 76, uppercase: true, letterSpacing: 1 },
    colors: { text: '#FFFFFF', active: '#EC4899', activeText: '#FFFFFF', outline: '#000000', shadow: '#000000', shadowOpacity: 0 },
    outline: 5,
    shadow: 0,
    box: null,
    activeWordBox: { padding: 14 },
    layout: { anchor: 'bottom', marginV: 400, marginH: 70, maxWordsPerCue: 3, maxLines: 1, maxCharsPerLine: 18 },
    highlight: 'active',
    wordAnimation: { type: 'pop', scale: 1.06, durationMs: 120, hold: false },
    entrance: { type: 'fade', durationMs: 80 },
  },
  think_media: {
    id: 'think_media',
    label: 'Think Media',
    description: 'Professional lower-third captions for teaching.',
    sampleText: 'Here are three steps',
    font: { family: 'Arial', bold: true, size: 58, uppercase: false, letterSpacing: 0 },
    colors: { text: '#FFFFFF', active: '#93C5FD', activeText: '#93C5FD', outline: '#000000', shadow: '#000000', shadowOpacity: 0 },
    outline: 0,
    shadow: 0,
    box: { color: '#111827', opacity: 0.85, padding: 18 },
    activeWordBox: null,
    layout: { anchor: 'bottom', marginV: 240, marginH: 80, maxWordsPerCue: 5, maxLines: 2, maxCharsPerLine: 28 },
    highlight: 'active',
    wordAnimation: NO_ANIMATION,
    entrance: { type: 'fade', durationMs: 100 },
  },
  editorial: {
    id: 'editorial',
    label: 'Editorial Classic',
    description: 'Refined editorial subtitles with golden active word.',
    sampleText: 'Words crafted with intention',
    font: { family: 'Arial', bold: true, size: 66, uppercase: false, letterSpacing: 1 },
    colors: { text: '#F8FAFC', active: '#F59E0B', activeText: '#F59E0B', outline: '#000000', shadow: '#000000', shadowOpacity: 0.6 },
    outline: 3,
    shadow: 2,
    box: null,
    activeWordBox: null,
    layout: { anchor: 'bottom', marginV: 300, marginH: 80, maxWordsPerCue: 4, maxLines: 2, maxCharsPerLine: 24 },
    highlight: 'active',
    wordAnimation: NO_ANIMATION,
    entrance: { type: 'fade', durationMs: 120 },
  },
  bold_highlight: {
    id: 'bold_highlight',
    label: 'Bold Highlight',
    description: 'High-energy caps with an electric-orange active pop.',
    sampleText: 'Double your attention now',
    font: { family: 'Arial Black', bold: false, size: 84, uppercase: true, letterSpacing: 0 },
    colors: { text: '#FFFFFF', active: '#F97316', activeText: '#F97316', outline: '#000000', shadow: '#000000', shadowOpacity: 0.75 },
    outline: 7,
    shadow: 3,
    box: null,
    activeWordBox: null,
    layout: { anchor: 'bottom', marginV: 480, marginH: 60, maxWordsPerCue: 3, maxLines: 2, maxCharsPerLine: 14 },
    highlight: 'active',
    wordAnimation: { type: 'pop', scale: 1.14, durationMs: 150, hold: false },
    entrance: NO_ENTRANCE,
  },
  soft_backdrop: {
    id: 'soft_backdrop',
    label: 'Soft Backdrop',
    description: 'Crisp white subtitles with soft slate pill background.',
    sampleText: 'Conversations that truly matter',
    font: { family: 'Arial', bold: true, size: 60, uppercase: false, letterSpacing: 0 },
    colors: { text: '#FFFFFF', active: '#C4B5FD', activeText: '#C4B5FD', outline: '#000000', shadow: '#000000', shadowOpacity: 0 },
    outline: 0,
    shadow: 0,
    box: { color: '#1E1B4B', opacity: 0.78, padding: 16 },
    activeWordBox: null,
    layout: { anchor: 'bottom', marginV: 340, marginH: 80, maxWordsPerCue: 4, maxLines: 2, maxCharsPerLine: 26 },
    highlight: 'active',
    wordAnimation: NO_ANIMATION,
    entrance: { type: 'fade', durationMs: 100 },
  },
  compact_creator: {
    id: 'compact_creator',
    label: 'Compact Creator',
    description: 'Punchy 2-word bursts with cyan pop for fast-paced reels.',
    sampleText: 'Stop scrolling',
    font: { family: 'Arial Black', bold: false, size: 92, uppercase: true, letterSpacing: 0 },
    colors: { text: '#FFFFFF', active: '#38BDF8', activeText: '#38BDF8', outline: '#000000', shadow: '#000000', shadowOpacity: 0.8 },
    outline: 8,
    shadow: 4,
    box: null,
    activeWordBox: null,
    layout: { anchor: 'bottom', marginV: 520, marginH: 60, maxWordsPerCue: 2, maxLines: 1, maxCharsPerLine: 14 },
    highlight: 'active',
    wordAnimation: { type: 'pop', scale: 1.18, durationMs: 130, hold: true },
    entrance: NO_ENTRANCE,
  },
  two_color_highlight: {
    id: 'two_color_highlight',
    label: 'Dynamic Duo',
    description: 'Striking two-tone contrast with electric neon-lime active text.',
    sampleText: 'Unlock the secret code',
    font: { family: 'Arial Black', bold: false, size: 82, uppercase: true, letterSpacing: 0 },
    colors: { text: '#F1F5F9', active: '#CCFF00', activeText: '#CCFF00', outline: '#0F172A', shadow: '#000000', shadowOpacity: 0.8 },
    outline: 7,
    shadow: 4,
    box: null,
    activeWordBox: null,
    layout: { anchor: 'bottom', marginV: 440, marginH: 70, maxWordsPerCue: 3, maxLines: 2, maxCharsPerLine: 16 },
    highlight: 'active',
    wordAnimation: { type: 'pop', scale: 1.1, durationMs: 140, hold: false },
    entrance: NO_ENTRANCE,
  },
  vireo_oneword: {
    id: 'vireo_oneword',
    label: 'Vireo OneWord',
    description: 'Single high-impact word at a time for maximum viewer retention.',
    sampleText: 'FOCUS NOW',
    font: { family: 'Arial Black', bold: true, size: 98, uppercase: true, letterSpacing: 2 },
    colors: { text: '#FFFFFF', active: '#FFE600', activeText: '#FFE600', outline: '#000000', shadow: '#000000', shadowOpacity: 0.85 },
    outline: 8,
    shadow: 4,
    box: null,
    activeWordBox: null,
    layout: { anchor: 'bottom', marginV: 480, marginH: 60, maxWordsPerCue: 1, maxLines: 1, maxCharsPerLine: 8 },
    highlight: 'active',
    wordAnimation: { type: 'pop', scale: 1.15, durationMs: 120, hold: true },
    entrance: NO_ENTRANCE,
  },
  vireo_pill: {
    id: 'vireo_pill',
    label: 'Vireo Violet Pill',
    description: 'Vibrant purple bounding pill behind the active spoken word.',
    sampleText: 'Make it happen',
    font: { family: 'Arial Black', bold: true, size: 84, uppercase: true, letterSpacing: 0 },
    colors: { text: '#FFFFFF', active: '#7C3AED', activeText: '#FFFFFF', outline: '#000000', shadow: '#000000', shadowOpacity: 0.8 },
    outline: 4,
    shadow: 2,
    box: null,
    activeWordBox: { padding: 16 },
    layout: { anchor: 'bottom', marginV: 440, marginH: 60, maxWordsPerCue: 3, maxLines: 2, maxCharsPerLine: 14 },
    highlight: 'active',
    wordAnimation: { type: 'pop', scale: 1.08, durationMs: 140, hold: false },
    entrance: NO_ENTRANCE,
  },
  vireo_lime: {
    id: 'vireo_lime',
    label: 'Vireo Lime Punch',
    description: 'Electric neon lime active word highlight box with bold black outline.',
    sampleText: 'Level up fast',
    font: { family: 'Arial Black', bold: true, size: 84, uppercase: true, letterSpacing: 1 },
    colors: { text: '#FFFFFF', active: '#A3FF12', activeText: '#000000', outline: '#000000', shadow: '#000000', shadowOpacity: 0.85 },
    outline: 6,
    shadow: 3,
    box: null,
    activeWordBox: { padding: 14 },
    layout: { anchor: 'bottom', marginV: 440, marginH: 60, maxWordsPerCue: 3, maxLines: 2, maxCharsPerLine: 14 },
    highlight: 'active',
    wordAnimation: { type: 'pop', scale: 1.12, durationMs: 130, hold: true },
    entrance: NO_ENTRANCE,
  },
  vireo_hormozi: {
    id: 'vireo_hormozi',
    label: 'Vireo Hormozi Reveal',
    description: 'Word-by-word cumulative reveal with bright yellow active highlight.',
    sampleText: 'Never give up',
    font: { family: 'Arial Black', bold: true, size: 86, uppercase: true, letterSpacing: 0 },
    colors: { text: '#FFFFFF', active: '#FFE500', activeText: '#FFE500', outline: '#000000', shadow: '#000000', shadowOpacity: 0.85 },
    outline: 8,
    shadow: 4,
    box: null,
    activeWordBox: null,
    layout: { anchor: 'bottom', marginV: 460, marginH: 60, maxWordsPerCue: 3, maxLines: 2, maxCharsPerLine: 12 },
    highlight: 'active',
    wordAnimation: { type: 'pop', scale: 1.16, durationMs: 140, hold: true },
    entrance: NO_ENTRANCE,
  },
  vireo_clean: {
    id: 'vireo_clean',
    label: 'Vireo Clean Minimal',
    description: 'Clean sentence-case typography without heavy borders and soft shadow.',
    sampleText: 'Simple and elegant design',
    font: { family: 'Arial', bold: true, size: 68, uppercase: false, letterSpacing: 0 },
    colors: { text: '#FFFFFF', active: '#FFFFFF', activeText: '#FFFFFF', outline: '#000000', shadow: '#000000', shadowOpacity: 0.6 },
    outline: 0,
    shadow: 3,
    box: null,
    activeWordBox: null,
    layout: { anchor: 'bottom', marginV: 360, marginH: 80, maxWordsPerCue: 5, maxLines: 2, maxCharsPerLine: 26 },
    highlight: 'none',
    wordAnimation: NO_ANIMATION,
    entrance: NO_ENTRANCE,
  },
  vireo_spring: {
    id: 'vireo_spring',
    label: 'Vireo Spring Bounce',
    description: 'Dynamic elastic spring overshoot pop with vibrant active highlights.',
    sampleText: 'Explosive viral growth',
    font: { family: 'Arial Black', bold: true, size: 88, uppercase: true, letterSpacing: 1 },
    colors: { text: '#FFFFFF', active: '#FFDF00', activeText: '#FFDF00', outline: '#000000', shadow: '#000000', shadowOpacity: 0.8 },
    outline: 7,
    shadow: 4,
    box: null,
    activeWordBox: null,
    layout: { anchor: 'bottom', marginV: 480, marginH: 60, maxWordsPerCue: 3, maxLines: 2, maxCharsPerLine: 14 },
    highlight: 'active',
    wordAnimation: { type: 'pop', scale: 1.25, durationMs: 170, hold: true },
    entrance: NO_ENTRANCE,
  },
  vireo_neon: {
    id: 'vireo_neon',
    label: 'Vireo Gradient Neon',
    description: 'Vibrant magenta glow with dark purple outline.',
    sampleText: 'Future of content',
    font: { family: 'Arial Black', bold: true, size: 86, uppercase: true, letterSpacing: 1 },
    colors: { text: '#FFFFFF', active: '#FF007A', activeText: '#FF007A', outline: '#18002E', shadow: '#7928CA', shadowOpacity: 0.85 },
    outline: 6,
    shadow: 4,
    box: null,
    activeWordBox: null,
    layout: { anchor: 'bottom', marginV: 460, marginH: 60, maxWordsPerCue: 3, maxLines: 2, maxCharsPerLine: 16 },
    highlight: 'active',
    wordAnimation: { type: 'pop', scale: 1.18, durationMs: 150, hold: true },
    entrance: NO_ENTRANCE,
  },
  vireo_capsule: {
    id: 'vireo_capsule',
    label: 'Vireo Joined Capsule',
    description: 'Sleek rounded dark capsule with electric cyan highlights.',
    sampleText: 'Streamline your workflow',
    font: { family: 'Arial', bold: true, size: 74, uppercase: true, letterSpacing: 0 },
    colors: { text: '#F8FAFC', active: '#00F0FF', activeText: '#00F0FF', outline: '#020617', shadow: '#000000', shadowOpacity: 0.5 },
    outline: 3,
    shadow: 0,
    box: { color: '#020617', opacity: 0.9, padding: 18 },
    activeWordBox: null,
    layout: { anchor: 'bottom', marginV: 400, marginH: 70, maxWordsPerCue: 4, maxLines: 2, maxCharsPerLine: 20 },
    highlight: 'active',
    wordAnimation: { type: 'pop', scale: 1.08, durationMs: 140, hold: false },
    entrance: NO_ENTRANCE,
  },
  vireo_editorial: {
    id: 'vireo_editorial',
    label: 'Vireo Editorial Track',
    description: 'Cinematic editorial typography with wide letter-tracking and amber highlights.',
    sampleText: 'Master the craft',
    font: { family: 'Arial', bold: true, size: 70, uppercase: true, letterSpacing: 3 },
    colors: { text: '#FFFFFF', active: '#F59E0B', activeText: '#F59E0B', outline: '#18181B', shadow: '#000000', shadowOpacity: 0.6 },
    outline: 2,
    shadow: 2,
    box: { color: '#18181B', opacity: 0.9, padding: 16 },
    activeWordBox: null,
    layout: { anchor: 'bottom', marginV: 380, marginH: 80, maxWordsPerCue: 4, maxLines: 2, maxCharsPerLine: 22 },
    highlight: 'active',
    wordAnimation: { type: 'pop', scale: 1.05, durationMs: 150, hold: false },
    entrance: NO_ENTRANCE,
  },
  vireo_sweep: {
    id: 'vireo_sweep',
    label: 'Vireo Subtle Sweep',
    description: 'Smooth sky-blue karaoke sweep with muted inactive syllables.',
    sampleText: 'Calm and steady progress',
    font: { family: 'Arial', bold: true, size: 72, uppercase: false, letterSpacing: 0 },
    colors: { text: '#F1F5F9', active: '#38BDF8', activeText: '#38BDF8', outline: '#0F172A', shadow: '#000000', shadowOpacity: 0.4 },
    outline: 4,
    shadow: 2,
    box: null,
    activeWordBox: null,
    layout: { anchor: 'bottom', marginV: 380, marginH: 70, maxWordsPerCue: 5, maxLines: 2, maxCharsPerLine: 28 },
    highlight: 'active',
    wordAnimation: NO_ANIMATION,
    entrance: NO_ENTRANCE,
  },
};

export const CAPTION_PRESET_LABELS: Record<CaptionPresetId, string> = {
  none: 'No Caption',
  karaoke: CAPTION_PRESETS.karaoke.label,
  deep_diver: CAPTION_PRESETS.deep_diver.label,
  youshaei: CAPTION_PRESETS.youshaei.label,
  simple: CAPTION_PRESETS.simple.label,
  beasty: CAPTION_PRESETS.beasty.label,
  mozi: CAPTION_PRESETS.mozi.label,
  popline: CAPTION_PRESETS.popline.label,
  think_media: CAPTION_PRESETS.think_media.label,
  editorial: CAPTION_PRESETS.editorial.label,
  bold_highlight: CAPTION_PRESETS.bold_highlight.label,
  soft_backdrop: CAPTION_PRESETS.soft_backdrop.label,
  compact_creator: CAPTION_PRESETS.compact_creator.label,
  two_color_highlight: CAPTION_PRESETS.two_color_highlight.label,
  vireo_oneword: CAPTION_PRESETS.vireo_oneword.label,
  vireo_pill: CAPTION_PRESETS.vireo_pill.label,
  vireo_lime: CAPTION_PRESETS.vireo_lime.label,
  vireo_hormozi: CAPTION_PRESETS.vireo_hormozi.label,
  vireo_clean: CAPTION_PRESETS.vireo_clean.label,
  vireo_spring: CAPTION_PRESETS.vireo_spring.label,
  vireo_neon: CAPTION_PRESETS.vireo_neon.label,
  vireo_capsule: CAPTION_PRESETS.vireo_capsule.label,
  vireo_editorial: CAPTION_PRESETS.vireo_editorial.label,
  vireo_sweep: CAPTION_PRESETS.vireo_sweep.label,
};

// ── Overrides & resolution ───────────────────────────────────────

/** User adjustments layered on top of a preset (all optional, all sanitized). */
export interface CaptionPresetOverrides {
  fontFamily?: string;
  fontSize?: number;
  bold?: boolean;
  uppercase?: boolean;
  letterSpacing?: number;
  textColor?: string;
  activeColor?: string;
  outlineColor?: string;
  outlineWidth?: number;
  shadowEnabled?: boolean;
  shadowDepth?: number;
  shadowColor?: string;
  shadowOpacity?: number;
  boxEnabled?: boolean;
  boxColor?: string;
  boxOpacity?: number;
  boxPadding?: number;
  alignment?: 'left' | 'center' | 'right';
  wordAnimationType?: 'none' | 'pop';
  wordAnimationScale?: number;
  wordAnimationHold?: boolean;
  maxLines?: number;
  position?: CaptionAnchor;
  /** Auto-emoji captions (Opus `emojiSwitch` / Vizard parity). */
  emoji?: boolean;
  /** Topic keywords to statically highlight (Opus `highlightSwitch` parity). */
  highlightKeywords?: string[];
  highlightKeywordColor?: string;
  /** Normalized 0..1 bottom edge of the caption block (legacy `positionY` semantics). */
  positionY?: number;
  /** Normalized 0..1 horizontal center of the caption block (0.5 = center). */
  positionX?: number;
}

export interface ResolvedCaptionStyle {
  presetId: RenderableCaptionPresetId;
  playResX: number;
  playResY: number;
  fontFamily: CaptionRenderFont;
  /** Set when the requested font is not available to the renderer and was replaced. */
  requestedFontFamily?: string;
  fontFallback: boolean;
  bold: boolean;
  fontSize: number;
  uppercase: boolean;
  letterSpacing: number;
  textColor: string;
  activeColor: string;
  activeTextColor: string;
  outlineColor: string;
  outlineWidth: number;
  shadowColor: string;
  shadowOpacity: number;
  shadowDepth: number;
  box: null | { color: string; opacity: number; padding: number };
  activeWordBox: null | { padding: number };
  /** ASS numpad alignment: 1..9 (2 = bottom-center, 5 = middle-center, 8 = top-center). */
  alignment: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  marginV: number;
  marginL: number;
  marginR: number;
  maxWordsPerCue: number;
  maxLines: 1 | 2;
  maxCharsPerLine: number;
  highlight: CaptionHighlightMode;
  /** Opus/Vizard-parity: auto-append a contextual emoji to matching words. */
  emoji: boolean;
  /** Opus/Vizard-parity: statically colour these keywords even when inactive. */
  highlightKeywords: string[];
  highlightKeywordColor: string;
  wordAnimation: CaptionPresetDefinition['wordAnimation'];
  entrance: CaptionPresetDefinition['entrance'];
}

/**
 * Auto-emoji lexicon (Opus `emojiSwitch` parity): keyword → emoji appended to
 * the rendered word. Keys match case-insensitively on the whole word.
 */
export const CAPTION_EMOJI_LEXICON: Readonly<Record<string, string>> = {
  time: '⏰', timer: '⏰', clock: '⏰', hour: '⏰', hours: '⏰', minute: '⌛', minutes: '⌛',
  money: '💰', dollar: '💵', dollars: '💵', cash: '💸', revenue: '📈', profit: '📈',
  fire: '🔥', hot: '🔥', growth: '📈', grow: '🌱', stock: '📉', stocks: '📈',
  love: '❤️', heart: '❤️', laugh: '😂', funny: '😂', joke: '😂',
  idea: '💡', ideas: '💡', think: '🧠', brain: '🧠', learn: '📚', book: '📚',
  win: '🏆', won: '🏆', winner: '🏆', lose: '💀', lost: '💀', fail: '💀',
  work: '💼', fast: '⚡', slow: '🐢', best: '🥇', worst: '🥴', secret: '🤫',
  warning: '⚠️', stop: '🛑', go: '🚀', launch: '🚀', world: '🌍', magic: '✨',
};

export function lookupCaptionEmoji(word: string): string | null {
  const clean = word.toLowerCase().replace(/[^a-z0-9]/g, '');
  return CAPTION_EMOJI_LEXICON[clean] ?? null;
}

export function isHighlightKeyword(word: string, keywords: string[]): boolean {
  if (!keywords.length) return false;
  const clean = word.toLowerCase().replace(/[^a-z0-9\s-]/g, '');
  return keywords.some(
    (k) => k.trim().length > 0 && clean === k.trim().toLowerCase()
  );
}

const HEX_RE = /^#?([0-9a-fA-F]{6})$/;

export function sanitizeHexColor(value: unknown, fallback: string): string {
  if (typeof value === 'string') {
    const m = value.trim().match(HEX_RE);
    if (m) return `#${m[1].toUpperCase()}`;
  }
  return fallback.toUpperCase();
}

function clampNum(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function getCaptionPlayRes(aspect: string | undefined): { x: number; y: number } {
  switch (aspect) {
    case '1:1':
      return { x: 1080, y: 1080 };
    case '16:9':
      return { x: 1920, y: 1080 };
    case '9:16':
    default:
      return { x: 1080, y: 1920 };
  }
}

/** Sanitizes untrusted override input (API payloads, stored configs) into a clean object. */
export function sanitizePresetOverrides(input: unknown): CaptionPresetOverrides {
  const out: CaptionPresetOverrides = {};
  if (!input || typeof input !== 'object') return out;
  const o = input as Record<string, unknown>;

  if (typeof o.fontFamily === 'string' && o.fontFamily.trim()) out.fontFamily = o.fontFamily.trim().slice(0, 64);
  if (typeof o.bold === 'boolean') out.bold = o.bold;
  if (typeof o.uppercase === 'boolean') out.uppercase = o.uppercase;
  if (o.letterSpacing !== undefined) {
    const n = clampNum(o.letterSpacing, 0, 16, NaN);
    if (Number.isFinite(n)) out.letterSpacing = Number(n.toFixed(1));
  }
  for (const key of ['textColor', 'activeColor', 'outlineColor'] as const) {
    const v = o[key];
    if (typeof v === 'string' && HEX_RE.test(v.trim())) out[key] = sanitizeHexColor(v, '#FFFFFF');
  }
  if (o.outlineWidth !== undefined) {
    const n = clampNum(o.outlineWidth, 0, 12, NaN);
    if (Number.isFinite(n)) out.outlineWidth = Number(n.toFixed(1));
  }
  if (typeof o.shadowEnabled === 'boolean') out.shadowEnabled = o.shadowEnabled;
  if (o.shadowDepth !== undefined) {
    const n = clampNum(o.shadowDepth, 0, 16, NaN);
    if (Number.isFinite(n)) out.shadowDepth = Number(n.toFixed(1));
  }
  if (typeof o.shadowColor === 'string' && HEX_RE.test(o.shadowColor.trim())) {
    out.shadowColor = sanitizeHexColor(o.shadowColor, '#000000');
  }
  if (o.shadowOpacity !== undefined) {
    const n = clampNum(o.shadowOpacity, 0, 1, NaN);
    if (Number.isFinite(n)) out.shadowOpacity = Number(n.toFixed(2));
  }
  if (typeof o.boxEnabled === 'boolean') out.boxEnabled = o.boxEnabled;
  if (typeof o.boxColor === 'string' && HEX_RE.test(o.boxColor.trim())) {
    out.boxColor = sanitizeHexColor(o.boxColor, '#0B0D12');
  }
  if (o.boxOpacity !== undefined) {
    const n = clampNum(o.boxOpacity, 0, 1, NaN);
    if (Number.isFinite(n)) out.boxOpacity = Number(n.toFixed(2));
  }
  if (o.boxPadding !== undefined) {
    const n = clampNum(o.boxPadding, 2, 48, NaN);
    if (Number.isFinite(n)) out.boxPadding = Number(n.toFixed(1));
  }
  if (o.alignment === 'left' || o.alignment === 'center' || o.alignment === 'right') {
    out.alignment = o.alignment;
  }
  if (o.wordAnimationType === 'none' || o.wordAnimationType === 'pop') {
    out.wordAnimationType = o.wordAnimationType;
  }
  if (o.wordAnimationScale !== undefined) {
    const n = clampNum(o.wordAnimationScale, 1.0, 1.4, NaN);
    if (Number.isFinite(n)) out.wordAnimationScale = Number(n.toFixed(2));
  }
  if (typeof o.wordAnimationHold === 'boolean') out.wordAnimationHold = o.wordAnimationHold;
  if (o.maxLines !== undefined) {
    const n = Math.round(clampNum(o.maxLines, 1, 2, NaN));
    if (n === 1 || n === 2) out.maxLines = n;
  }
  if (typeof o.emoji === 'boolean') out.emoji = o.emoji;
  if (Array.isArray(o.highlightKeywords)) {
    out.highlightKeywords = o.highlightKeywords
      .filter((k): k is string => typeof k === 'string' && k.trim().length > 0 && k.length <= 40)
      .slice(0, 40);
  }
  if (typeof o.highlightKeywordColor === 'string' && HEX_RE.test(o.highlightKeywordColor.trim())) {
    out.highlightKeywordColor = sanitizeHexColor(o.highlightKeywordColor, '#FFE500');
  }
  if (o.fontSize !== undefined) {
    const n = clampNum(o.fontSize, 32, 110, NaN);
    if (Number.isFinite(n)) out.fontSize = Math.round(n);
  }
  if (o.position === 'top' || o.position === 'center' || o.position === 'bottom') out.position = o.position;
  if (o.positionY !== undefined) {
    const n = clampNum(o.positionY, 0.08, 0.92, NaN);
    if (Number.isFinite(n)) out.positionY = Number(n.toFixed(3));
  }
  if (o.positionX !== undefined) {
    const n = clampNum(o.positionX, 0.05, 0.95, NaN);
    if (Number.isFinite(n)) out.positionX = Number(n.toFixed(3));
  }
  return out;
}

/**
 * Resolves a preset + overrides into concrete renderer values. Unknown preset IDs fall
 * back to DEFAULT_CAPTION_PRESET_ID; invalid override values are ignored.
 */
export function resolveCaptionPreset(
  presetId: unknown,
  rawOverrides?: unknown,
  aspect?: string
): ResolvedCaptionStyle {
  const id: RenderableCaptionPresetId = isRenderablePresetId(presetId) ? presetId : DEFAULT_CAPTION_PRESET_ID;
  const p = CAPTION_PRESETS[id];
  const o = sanitizePresetOverrides(rawOverrides);
  const playRes = getCaptionPlayRes(aspect);
  const vScale = playRes.y / 1920;

  const fontNorm = o.fontFamily !== undefined ? normalizeCaptionFont(o.fontFamily) : { font: p.font.family, fellBack: false };

  let box = p.box ? { ...p.box } : null;
  if (o.boxEnabled === false) {
    box = null;
  } else if (o.boxEnabled === true || (o.boxEnabled === undefined && p.box)) {
    const baseBox = p.box || { color: '#0B0D12', opacity: 0.85, padding: 16 };
    box = {
      color: o.boxColor ?? baseBox.color,
      opacity: o.boxOpacity ?? baseBox.opacity,
      padding: o.boxPadding ?? baseBox.padding,
    };
  }

  const outlineWidth = box ? box.padding : (o.outlineWidth ?? p.outline);
  const shadowDepth = box
    ? 0
    : o.shadowEnabled === false
    ? 0
    : o.shadowDepth ?? (o.shadowEnabled === true && p.shadow === 0 ? 2 : p.shadow);
  const shadowColor = o.shadowColor ?? p.colors.shadow;
  const shadowOpacity = box
    ? 0
    : o.shadowEnabled === false
    ? 0
    : o.shadowOpacity ?? (o.shadowEnabled === true && p.colors.shadowOpacity === 0 ? 0.6 : p.colors.shadowOpacity);

  const anchor = o.position ?? p.layout.anchor;
  let alignment: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 =
    anchor === 'top' ? 8 : anchor === 'center' ? 5 : 2;
  if (o.alignment === 'left') {
    alignment = anchor === 'top' ? 7 : anchor === 'center' ? 4 : 1;
  } else if (o.alignment === 'right') {
    alignment = anchor === 'top' ? 9 : anchor === 'center' ? 6 : 3;
  } else if (o.alignment === 'center') {
    alignment = anchor === 'top' ? 8 : anchor === 'center' ? 5 : 2;
  } else if (o.position && o.position !== p.layout.anchor) {
    alignment = anchor === 'top' ? 8 : anchor === 'center' ? 5 : 2;
  }

  let marginV = Math.round(p.layout.marginV * vScale);
  if (o.position && o.position !== p.layout.anchor) {
    marginV = anchor === 'center' ? 0 : Math.round((anchor === 'top' ? 220 : p.layout.marginV) * vScale);
  }
  if (o.positionY !== undefined) {
    alignment = o.alignment === 'left' ? 1 : o.alignment === 'right' ? 3 : 2;
    marginV = Math.round(playRes.y * (1 - o.positionY));
  }

  let marginL = p.layout.marginH;
  let marginR = p.layout.marginH;
  if (o.positionX !== undefined) {
    const centerShift = Math.round((o.positionX - 0.5) * playRes.x);
    marginL = Math.max(0, p.layout.marginH + centerShift);
    marginR = Math.max(0, p.layout.marginH - centerShift);
  }

  const activeColor = o.activeColor ?? p.colors.active;
  const activeTextColor = p.activeWordBox ? p.colors.activeText : o.activeColor ?? p.colors.activeText;

  const fontSize = o.fontSize !== undefined ? Math.min(110, Math.max(32, Math.round(o.fontSize))) : p.font.size;
  const letterSpacing = o.letterSpacing !== undefined ? o.letterSpacing : p.font.letterSpacing;

  const wordAnimation = {
    type: o.wordAnimationType ?? p.wordAnimation.type,
    scale: o.wordAnimationScale ?? p.wordAnimation.scale,
    durationMs: p.wordAnimation.durationMs,
    hold: o.wordAnimationHold ?? p.wordAnimation.hold,
  };

  return {
    presetId: id,
    playResX: playRes.x,
    playResY: playRes.y,
    fontFamily: fontNorm.font,
    requestedFontFamily: fontNorm.fellBack ? o.fontFamily : undefined,
    fontFallback: fontNorm.fellBack,
    bold: o.bold ?? p.font.bold,
    fontSize,
    uppercase: o.uppercase ?? p.font.uppercase,
    letterSpacing,
    textColor: o.textColor ?? p.colors.text,
    activeColor,
    activeTextColor,
    outlineColor: o.outlineColor ?? p.colors.outline,
    outlineWidth,
    shadowColor,
    shadowOpacity,
    shadowDepth,
    box,
    activeWordBox: p.activeWordBox ? { ...p.activeWordBox } : null,
    alignment,
    marginV,
    marginL,
    marginR,
    maxWordsPerCue: p.layout.maxWordsPerCue,
    maxLines: o.maxLines === 1 || o.maxLines === 2 ? o.maxLines : p.layout.maxLines,
    maxCharsPerLine: p.layout.maxCharsPerLine,
    highlight: p.highlight,
    emoji: o.emoji === true,
    highlightKeywords: (o.highlightKeywords ?? []).map((k) => String(k).trim()).filter(Boolean).slice(0, 40),
    highlightKeywordColor: o.highlightKeywordColor ?? p.colors.active,
    wordAnimation,
    entrance: { ...p.entrance },
  };
}

// ── Cue grouping & line breaking (shared with legacy captions) ────

export interface WordCustomStyle {
  color?: string;              // Custom text color for this single word (e.g. '#FFE500')
  highlightColor?: string;     // Active highlight color when spoken
  fontSizeMultiplier?: number; // e.g. 1.25 for 1.25x emphasis
  effect?: 'none' | 'pop' | 'glow' | 'pill' | 'shake';
  pillColor?: string;          // Individual pill background color (e.g. '#ED3A7C')
  uppercase?: boolean;         // Force uppercase for this word
}

export interface PresetTimedWord {
  text: string;
  start: number;
  end: number;
  word?: string;
  confidence?: number;
  customStyle?: WordCustomStyle;
}

export interface PresetTimedCue {
  id: string;
  start: number;
  end: number;
  text: string;
  words?: PresetTimedWord[];
  tokens?: PresetTimedWord[];
  position_x?: number;
  position_y?: number;
  presetOverride?: CaptionPresetId;
  styleOverrides?: CaptionPresetOverrides;
}

/**
 * Character-balanced two-line split: picks the split minimizing |line1 - line2| while
 * preferring splits where both lines fit maxCharsPerLine. Returns text joined with `\N`.
 */
export function balanceLineSplit(words: string[], maxCharsPerLine = 28): string {
  if (!words || words.length === 0) return '';
  if (words.length === 1) return words[0];

  const fullText = words.join(' ');
  if (fullText.length <= maxCharsPerLine) return fullText;

  let bestIndex = 1;
  let minDiff = Infinity;
  let bestFitsBoth = false;

  for (let i = 1; i < words.length; i++) {
    const line1 = words.slice(0, i).join(' ');
    const line2 = words.slice(i).join(' ');
    const diff = Math.abs(line1.length - line2.length);
    const fitsBoth = line1.length <= maxCharsPerLine && line2.length <= maxCharsPerLine;

    if (fitsBoth && !bestFitsBoth) {
      bestFitsBoth = true;
      minDiff = diff;
      bestIndex = i;
    } else if (fitsBoth === bestFitsBoth) {
      if (diff < minDiff) {
        minDiff = diff;
        bestIndex = i;
      }
    }
  }

  return `${words.slice(0, bestIndex).join(' ')}\\N${words.slice(bestIndex).join(' ')}`;
}

/** Strictly non-overlapping cue timing: clamps each cue's end (and its words) to the next start without dropping words. */
export function enforceZeroOverlap<T extends PresetTimedCue>(cues: T[]): T[] {
  if (!cues || cues.length <= 1) return cues || [];
  const sorted = [...cues].sort((a, b) => a.start - b.start);

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    if (current.end > next.start) {
      const clampedEnd = Math.max(current.start + 0.05, Number(next.start.toFixed(3)));
      current.end = clampedEnd;

      if (Array.isArray(current.words) && current.words.length > 0) {
        const words = current.words;
        const needsRedistribution = words.some(
          (w) => w.start >= clampedEnd || Math.min(clampedEnd, w.end) - w.start < 0.02
        );

        if (needsRedistribution) {
          const totalChars = words.reduce(
            (sum: number, w: any) => sum + Math.max(1, (w.text || w.word || '').length),
            0
          );
          const cueDuration = Math.max(0.05, clampedEnd - current.start);
          let curStart = current.start;

          const redistributed = words.map((w: any, wIdx: number) => {
            const isLast = wIdx === words.length - 1;
            const wText = String(w.text || w.word || '');
            const weight = Math.max(1, wText.length) / totalChars;
            const dur = isLast
              ? Math.max(0.02, clampedEnd - curStart)
              : Math.max(0.02, Number((cueDuration * weight).toFixed(3)));
            const wEnd = isLast
              ? clampedEnd
              : Number(Math.min(clampedEnd, curStart + dur).toFixed(3));
            const token = {
              ...w,
              text: wText,
              start: Number(curStart.toFixed(3)),
              end: Number(wEnd.toFixed(3)),
            };
            curStart = wEnd;
            return token;
          });

          current.words = redistributed;
          current.tokens = redistributed;
        } else {
          current.words = words.map((w: any) => ({
            ...w,
            end: Number(Math.min(clampedEnd, w.end).toFixed(3)),
          }));
          current.tokens = current.words;
        }
      }
    }
  }
  return sorted;
}

/**
 * Groups timed words into short caption cues. Breaks on: max words, pauses > pauseBreak,
 * trailing punctuation, character budget, or cue duration > 3.2s.
 */
export function groupWordsIntoCues(
  tokens: PresetTimedWord[],
  maxWords = 4,
  maxLines = 2,
  maxCharsPerLine = 28,
  pauseBreak = 0.45
): PresetTimedCue[] {
  if (!tokens || tokens.length === 0) return [];

  const sortedTokens = [...tokens].sort((a, b) => a.start - b.start || a.end - b.end);
  const cues: PresetTimedCue[] = [];
  let currentWords: PresetTimedWord[] = [];
  const safeMaxWords = Math.min(6, Math.max(2, maxWords));
  const totalMaxChars = maxCharsPerLine * maxLines;

  const flush = () => {
    if (currentWords.length === 0) return;
    const start = currentWords[0].start;
    const end = Math.max(start + 0.05, currentWords[currentWords.length - 1].end);
    const rawText = currentWords.map((t) => t.text).join(' ');

    let formattedText = rawText;
    if (maxLines > 1 && rawText.length > maxCharsPerLine && currentWords.length >= 2) {
      formattedText = balanceLineSplit(currentWords.map((t) => t.text), maxCharsPerLine);
    }

    if (end > start) {
      const wordsCopy = currentWords.map((w) => ({ ...w }));
      cues.push({
        id: `cue-${cues.length + 1}`,
        start: Number(start.toFixed(3)),
        end: Number(end.toFixed(3)),
        text: formattedText,
        words: wordsCopy,
        tokens: wordsCopy,
      });
    }
    currentWords = [];
  };

  for (const tok of sortedTokens) {
    const prevTok = currentWords[currentWords.length - 1];
    const hasPause = prevTok && tok.start - prevTok.end > pauseBreak;
    const prevHasPunctuation = prevTok && /[.!?,;:]$/.test(prevTok.text);
    const wouldExceedWords = currentWords.length >= safeMaxWords;
    const currentText = currentWords.map((t) => t.text).join(' ');
    const wouldExceedChars = (currentText + ' ' + tok.text).length > totalMaxChars;
    const wouldExceedDuration = currentWords.length > 0 && tok.end - currentWords[0].start > 3.2;

    if (
      currentWords.length > 0 &&
      (hasPause || prevHasPunctuation || wouldExceedWords || wouldExceedChars || wouldExceedDuration)
    ) {
      flush();
    }
    currentWords.push(tok);
  }

  flush();
  return enforceZeroOverlap(cues);
}

/**
 * Formats a segment-level (no word timing) cue's text for a preset: optional uppercase,
 * and a balanced two-line split when the text exceeds one line.
 */
export function formatSegmentCueText(text: string, style: Pick<ResolvedCaptionStyle, 'uppercase' | 'maxLines' | 'maxCharsPerLine'>): string {
  const plain = String(text || '').replace(/\\N/g, ' ').replace(/\s+/g, ' ').trim();
  const cased = style.uppercase ? plain.toUpperCase() : plain;
  const words = cased.split(' ').filter(Boolean);
  if (style.maxLines > 1 && cased.length > style.maxCharsPerLine && words.length >= 2) {
    return balanceLineSplit(words, style.maxCharsPerLine);
  }
  return cased;
}

/**
 * Regroups cues for a preset from their word timestamps — the same operation the export
 * performs on the transcript — so preview cue boundaries and line breaks match export.
 * Cues without words (segment timing) are kept as-is with preset text formatting.
 */
export function regroupCuesForPreset(cues: PresetTimedCue[], style: ResolvedCaptionStyle): {
  timingMode: 'word' | 'segment';
  cues: PresetTimedCue[];
} {
  const words: PresetTimedWord[] = [];
  for (const c of cues || []) {
    for (const w of c.words || []) {
      const text = String(w.text ?? w.word ?? '').trim();
      if (!text || !Number.isFinite(w.start) || !Number.isFinite(w.end) || w.end <= w.start) continue;
      words.push({ text: style.uppercase ? text.toUpperCase() : text, start: w.start, end: w.end, customStyle: w.customStyle });
    }
  }
  if (words.length > 0) {
    words.sort((a, b) => a.start - b.start);
    return {
      timingMode: 'word',
      cues: groupWordsIntoCues(words, style.maxWordsPerCue, style.maxLines, style.maxCharsPerLine),
    };
  }
  return {
    timingMode: 'segment',
    cues: enforceZeroOverlap(
      (cues || []).map((c) => ({ id: c.id, start: c.start, end: c.end, text: formatSegmentCueText(c.text, style) }))
    ),
  };
}

// ── Word timing slices ───────────────────────────────────────────

export interface CueWordSlice {
  start: number;
  end: number;
  /** Index of the word being spoken, or -1 for a pause. */
  activeIdx: number;
  /** Highest word index that has started by this slice (for progressive highlight). */
  progressIdx: number;
}

/** Valid, sorted words of a cue (finite, positive duration, non-empty text). */
export function getValidCueWords(cue: PresetTimedCue): PresetTimedWord[] {
  const raw = Array.isArray(cue.words) ? cue.words : [];
  return raw
    .filter(
      (w) =>
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
        text: String(w.text ?? (w as any).word).trim(),
        start,
        end,
        customStyle: w.customStyle,
      };
    })
    .filter((w) => w.text.length > 0 && w.end > w.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

/**
 * Splits a cue into strictly sequential slices, one per active word plus pauses.
 * Small gaps (≤ 0.25s) keep the previous word highlighted to avoid flicker.
 */
export function computeCueWordSlices(cue: PresetTimedCue, validWords = getValidCueWords(cue)): CueWordSlice[] {
  if (validWords.length === 0) return [];
  const cueStart = Math.max(0, cue.start);
  const cueEnd = Math.max(cueStart + 0.05, cue.end);
  const slices: Array<{ start: number; end: number; activeIdx: number }> = [];

  const firstWordStart = Math.max(cueStart, validWords[0].start);
  if (firstWordStart > cueStart + 0.04) {
    slices.push({ start: cueStart, end: firstWordStart, activeIdx: -1 });
  }

  for (let i = 0; i < validWords.length; i++) {
    const cur = validWords[i];
    const next = validWords[i + 1];

    let wStart = Math.max(cueStart, cur.start);
    if (slices.length > 0) wStart = Math.max(slices[slices.length - 1].end, wStart);

    let wEnd = Math.min(cueEnd, cur.end);
    if (next) {
      const nextStart = Math.max(cueStart, next.start);
      const gap = nextStart - wEnd;
      if (gap > 0 && gap <= 0.25) {
        wEnd = nextStart;
      } else if (gap > 0.25) {
        wEnd = Math.min(nextStart - 0.05, wEnd);
      } else if (nextStart < wEnd) {
        wEnd = Math.max(wStart + 0.02, nextStart);
      }
    } else if (cueEnd - wEnd <= 0.25) {
      wEnd = cueEnd;
    }

    if (wEnd <= wStart + 0.02) {
      wEnd = Number((wStart + 0.03).toFixed(3));
    }
    slices.push({ start: wStart, end: wEnd, activeIdx: i });
    if (next && next.start > wEnd + 0.04) {
      slices.push({ start: wEnd, end: Math.min(cueEnd, next.start), activeIdx: -1 });
    }
  }

  const lastSlice = slices[slices.length - 1];
  if (lastSlice && lastSlice.end < cueEnd - 0.04) {
    slices.push({ start: lastSlice.end, end: cueEnd, activeIdx: -1 });
  }

  let progress = -1;
  return slices.map((s) => {
    if (s.activeIdx > progress) progress = s.activeIdx;
    return { ...s, progressIdx: progress };
  });
}

/** Index of the word after which the cue text breaks to a second line, or -1. */
export function getCueLineBreakIndex(cue: PresetTimedCue, wordCount: number): number {
  if (!cue.text || !cue.text.includes('\\N')) return -1;
  const line1Words = cue.text.split('\\N')[0].trim().split(/\s+/).filter(Boolean);
  if (line1Words.length > 0 && line1Words.length < wordCount) return line1Words.length - 1;
  return -1;
}

export interface WordVisualState {
  /** Drawn in the highlight color. */
  highlighted: boolean;
  /** The word currently being spoken (receives the pop / active box). */
  active: boolean;
}

export function getWordVisualStates(
  slice: CueWordSlice | null,
  wordCount: number,
  mode: CaptionHighlightMode
): WordVisualState[] {
  const states: WordVisualState[] = [];
  for (let i = 0; i < wordCount; i++) {
    const active = mode !== 'none' && !!slice && slice.activeIdx === i;
    const highlighted =
      mode === 'none' || !slice ? false : mode === 'progressive' ? i <= slice.progressIdx : slice.activeIdx === i;
    states.push({ highlighted, active });
  }
  return states;
}

// ── Animation timing (exactly what the ASS \t / \fad tags do) ─────

export interface PopTiming {
  peakScale: number;
  /** ms from slice start until peak. */
  upMs: number;
  /** ms from slice start until settled (equals upMs when holding). */
  downMs: number;
  hold: boolean;
}

export function getPopTiming(anim: ResolvedCaptionStyle['wordAnimation'], sliceDurationMs: number): PopTiming | null {
  if (anim.type !== 'pop' || anim.scale <= 1) return null;
  const peakScale = Math.min(1.3, Math.max(1.01, anim.scale));
  const total = Math.max(20, Math.min(anim.durationMs, Math.round(sliceDurationMs * 0.8)));
  const upMs = anim.hold ? total : Math.max(20, Math.round(total * 0.45));
  return { peakScale, upMs, downMs: anim.hold ? upMs : Math.max(upMs + 20, total), hold: anim.hold };
}

/**
 * Active-word scale at `elapsedMs` into its slice. Mirrors libass `\t(t1,t2,accel,…)`:
 * progress = ((t - t1) / (t2 - t1)) ^ accel, with accel 0.5 going up and 1.5 settling.
 */
export function getActiveWordScaleAt(timing: PopTiming | null, elapsedMs: number): number {
  if (!timing) return 1;
  const { peakScale, upMs, downMs, hold } = timing;
  if (elapsedMs <= 0) return 1;
  if (elapsedMs < upMs) return 1 + (peakScale - 1) * Math.pow(elapsedMs / upMs, 0.5);
  if (hold || elapsedMs >= downMs) return hold ? peakScale : 1;
  return peakScale + (1 - peakScale) * Math.pow((elapsedMs - upMs) / (downMs - upMs), 1.5);
}

/** Opacity of a cue's first event under `\fad(in,0)` (libass fades linearly). */
export function getEntranceOpacityAt(entrance: ResolvedCaptionStyle['entrance'], elapsedSinceCueStartMs: number): number {
  if (entrance.type !== 'fade' || entrance.durationMs <= 0) return 1;
  if (elapsedSinceCueStartMs <= 0) return 0;
  return Math.min(1, elapsedSinceCueStartMs / entrance.durationMs);
}

// ── Preview frame state (consumed by the React renderer) ─────────

export interface PreviewWord {
  text: string;
  highlighted: boolean;
  active: boolean;
  scale: number;
  /** Line break after this word. */
  breakAfter: boolean;
  customStyle?: WordCustomStyle;
}

export interface PreviewFrame {
  cueId: string;
  words: PreviewWord[];
  opacity: number;
  /** Word timing unavailable → static text, no highlight. */
  wordTiming: boolean;
  positionX?: number;
  positionY?: number;
}

/** Computes exactly what the exported ASS shows for `cue` at `time` (seconds, clip-local). */
export function getPreviewFrame(cue: PresetTimedCue, time: number, style: ResolvedCaptionStyle): PreviewFrame {
  const validWords = getValidCueWords(cue);
  const entranceOpacity = getEntranceOpacityAt(style.entrance, (time - cue.start) * 1000);

  if (validWords.length === 0) {
    const lines = String(cue.text || '').split('\\N');
    const words: PreviewWord[] = [];
    lines.forEach((line, li) => {
      const parts = line.trim().split(/\s+/).filter(Boolean);
      parts.forEach((p, pi) =>
        words.push({ text: p, highlighted: false, active: false, scale: 1, breakAfter: pi === parts.length - 1 && li < lines.length - 1 })
      );
    });
    return {
      cueId: cue.id,
      words,
      opacity: entranceOpacity,
      wordTiming: false,
      positionX: cue.position_x,
      positionY: cue.position_y,
    };
  }

  const slices = computeCueWordSlices(cue, validWords);
  const slice = slices.find((s) => time >= s.start && time < s.end) || (time >= cue.end ? slices[slices.length - 1] : null) || null;
  const states = getWordVisualStates(slice, validWords.length, style.highlight);
  const breakIdx = getCueLineBreakIndex(cue, validWords.length);
  const timing = slice ? getPopTiming(style.wordAnimation, (slice.end - slice.start) * 1000) : null;
  const elapsed = slice ? (time - slice.start) * 1000 : 0;
  // \fad lives on the cue's first event only.
  const isFirstSlice = !!slice && slices[0] === slice;

  return {
    cueId: cue.id,
    words: validWords.map((w, i) => ({
      text: w.text,
      highlighted: states[i].highlighted,
      active: states[i].active,
      scale: states[i].active ? getActiveWordScaleAt(timing, elapsed) : 1,
      breakAfter: i === breakIdx,
      customStyle: w.customStyle,
    })),
    opacity: isFirstSlice ? entranceOpacity : 1,
    wordTiming: true,
    positionX: cue.position_x,
    positionY: cue.position_y,
  };
}

// ── Preview CSS mapping (ASS units → CSS px) ─────────────────────

function hexToRgba(hex: string, opacity: number): string {
  const clean = sanitizeHexColor(hex, '#000000').slice(1);
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, opacity))})`;
}

export type PreviewCss = Record<string, string | number>;

export interface PreviewCssBundle {
  /** Absolutely positioned block inside the frame (margins + anchor). */
  container: PreviewCss;
  /** Each rendered line (block). */
  line: PreviewCss;
  /** Inline wrapper around a line's words; carries the BorderStyle 3 box when present. */
  lineBox: PreviewCss;
  word: (w: PreviewWord) => PreviewCss;
}

/**
 * Maps a resolved style to CSS for a frame rendered at `scale` px per ASS unit.
 * - font-size = ASS size × em ratio (libass sizes by ascent+descent)
 * - line-height = ASS size (libass line advance)
 * - \bord N → text-stroke 2N painted under the fill (paint-order: stroke fill)
 * - \shad N → hard text-shadow offset N,N (libass shadows are not blurred)
 * - BorderStyle 3 → per-line background with padding = outline
 */
export function getPreviewCss(style: ResolvedCaptionStyle, scale: number): PreviewCssBundle {
  const px = (v: number) => `${Number((v * scale).toFixed(3))}px`;
  const fontSize = style.fontSize * FONT_EM_PER_ASS_SIZE[style.fontFamily];

  const container: PreviewCss = {
    position: 'absolute',
    left: px(style.marginL),
    right: px(style.marginR),
    textAlign:
      style.alignment === 1 || style.alignment === 4 || style.alignment === 7
        ? 'left'
        : style.alignment === 3 || style.alignment === 6 || style.alignment === 9
        ? 'right'
        : 'center',
    pointerEvents: 'none',
  };
  if (style.alignment === 1 || style.alignment === 2 || style.alignment === 3) {
    container.bottom = px(style.marginV);
  } else if (style.alignment === 7 || style.alignment === 8 || style.alignment === 9) {
    container.top = px(style.marginV);
  } else {
    container.top = '50%';
    container.transform = 'translateY(-50%)';
  }

  const shadow =
    style.shadowDepth > 0 && style.shadowOpacity > 0
      ? `${px(style.shadowDepth)} ${px(style.shadowDepth)} 0 ${hexToRgba(style.shadowColor, style.shadowOpacity)}`
      : 'none';

  const line: PreviewCss = {
    display: 'block',
    fontFamily: FONT_CSS_STACK[style.fontFamily],
    // Arial Black is a single heavy face; libass gets Bold=0 for it so no faux-bold is synthesized.
    fontWeight: style.fontFamily === 'Arial Black' ? 900 : style.bold ? 700 : 400,
    fontSize: px(fontSize),
    lineHeight: px(style.fontSize),
    letterSpacing: style.letterSpacing ? px(style.letterSpacing) : 'normal',
    whiteSpace: 'pre-wrap',
    color: style.textColor,
  };

  const strokeFor = (color: string, width: number) =>
    width > 0 ? { WebkitTextStroke: `${px(width * 2)} ${color}`, paintOrder: 'stroke fill' } : {};

  const word = (w: PreviewWord): PreviewCss => {
    const cs = w.customStyle;
    const baseColor = cs?.color || (w.highlighted ? (style.activeWordBox ? style.textColor : style.activeColor) : style.textColor);
    const css: PreviewCss = {
      color: baseColor,
      textShadow: shadow,
    };
    if (!style.box) Object.assign(css, strokeFor(style.outlineColor, style.outlineWidth));
    if (w.active && style.activeWordBox) {
      css.color = cs?.highlightColor || style.activeTextColor;
      Object.assign(css, strokeFor(cs?.highlightColor || style.activeColor, style.activeWordBox.padding));
    }
    const fontMultiplier = typeof cs?.fontSizeMultiplier === 'number' && cs.fontSizeMultiplier > 0 ? cs.fontSizeMultiplier : 1;
    const effectiveScale = w.scale * fontMultiplier;
    css.display = 'inline-block';
    css.transform = `scale(${effectiveScale.toFixed(3)})`;
    css.transformOrigin = 'center bottom';
    css.transition = 'transform 0.08s ease-out, color 0.1s ease';
    if (cs?.uppercase) {
      css.textTransform = 'uppercase';
    }
    if (cs?.effect === 'pill') {
      css.backgroundColor = cs.pillColor || '#ED3A7C';
      css.borderRadius = '9999px';
      css.padding = `${px(2)} ${px(8)}`;
      css.display = 'inline-block';
      css.boxDecorationBreak = 'clone';
      css.WebkitBoxDecorationBreak = 'clone';
    } else if (cs?.effect === 'glow') {
      const glowColor = cs.color || cs.highlightColor || '#A855F7';
      css.textShadow = `0 0 ${px(8)} ${glowColor}, 0 0 ${px(16)} ${glowColor}`;
    }
    return css;
  };

  const lineBox: PreviewCss = style.box
    ? {
        backgroundColor: hexToRgba(style.box.color, style.box.opacity),
        padding: px(style.box.padding),
        boxDecorationBreak: 'clone',
        WebkitBoxDecorationBreak: 'clone',
      }
    : {};

  return { container, line, lineBox, word };
}

// ── ASS helpers ──────────────────────────────────────────────────

/** `#RRGGBB` → ASS `&HAABBGGRR&` (alpha 0 = opaque, 255 = transparent). */
export function hexToAssColor(hex: string, alpha = 0): string {
  const value = sanitizeHexColor(hex, '#FFFFFF').slice(1);
  const a = Math.min(255, Math.max(0, Math.round(alpha))).toString(16).padStart(2, '0').toUpperCase();
  return `&H${a}${value.slice(4, 6)}${value.slice(2, 4)}${value.slice(0, 2)}&`;
}

/** Escapes caption text for an ASS Dialogue: strips override braces, neutralizes backslashes, collapses newlines. */
export function escapeAssText(text: string): string {
  if (!text) return '';
  return String(text)
    .replace(/[{}]/g, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\\/g, '/')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export function formatAssTimestamp(seconds: number): string {
  const totalCs = Math.round(Math.max(0, seconds) * 100);
  const h = Math.floor(totalCs / 360000);
  const m = Math.floor((totalCs % 360000) / 6000);
  const s = Math.floor((totalCs % 6000) / 100);
  const cs = totalCs % 100;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/** ASS [V4+ Styles] style definition line for a resolved preset. */
export function buildPresetAssStyleLine(style: ResolvedCaptionStyle, styleName = 'Default'): string {
  const primary = hexToAssColor(style.textColor);
  const secondary = hexToAssColor(style.activeColor);
  const borderStyle = style.box ? 3 : 1;
  // BorderStyle 3: libass fills the box with OutlineColour; BackColour is the shadow.
  const outlineColour = style.box
    ? hexToAssColor(style.box.color, Math.round((1 - style.box.opacity) * 255))
    : hexToAssColor(style.outlineColor);
  const backColour = hexToAssColor(style.shadowColor, Math.round((1 - style.shadowOpacity) * 255));
  const bold = style.bold && style.fontFamily !== 'Arial Black' ? 1 : 0;
  return [
    `Style: ${styleName}`,
    style.fontFamily,
    style.fontSize,
    primary,
    secondary,
    outlineColour,
    backColour,
    bold,
    0,
    0,
    0,
    100,
    100,
    style.letterSpacing,
    0,
    borderStyle,
    style.outlineWidth,
    style.shadowDepth,
    style.alignment,
    style.marginL,
    style.marginR,
    style.marginV,
    1,
  ].join(',');
}

/** Builds the Dialogue lines for one cue under a preset (supporting cue-level preset overrides and token custom styles). */
export function buildPresetCueEvents(cue: PresetTimedCue, baseStyle: ResolvedCaptionStyle, fallbackStyleName = 'Default'): string[] {
  const hasCuePreset = Boolean(cue.presetOverride && isRenderablePresetId(cue.presetOverride));
  const aspect = baseStyle.playResX === baseStyle.playResY ? '1:1' : baseStyle.playResX > baseStyle.playResY ? '16:9' : '9:16';
  const style = hasCuePreset
    ? resolveCaptionPreset(cue.presetOverride as RenderableCaptionPresetId, cue.styleOverrides, aspect)
    : baseStyle;
  const styleName = hasCuePreset ? `Style_${cue.presetOverride}` : fallbackStyleName;

  const validWords = getValidCueWords(cue)
    .map((w) => ({ ...w, text: escapeAssText(w.text) }))
    .filter((w) => w.text.length > 0);

  const textColour = hexToAssColor(style.textColor);
  const highlightColour = hexToAssColor(style.activeColor);
  const fade = style.entrance.type === 'fade' && style.entrance.durationMs > 0 ? `{\\fad(${style.entrance.durationMs},0)}` : '';
  const dialogue = (start: number, end: number, text: string) =>
    `Dialogue: 0,${formatAssTimestamp(start)},${formatAssTimestamp(end)},${styleName},,0,0,0,,${text}`;

  let posTag = '';
  if (cue.position_x !== undefined || cue.position_y !== undefined) {
    const effX = Math.max(0.08, Math.min(0.92, cue.position_x ?? 0.5));
    const defaultY =
      style.alignment === 8
        ? style.marginV / style.playResY
        : style.alignment === 5
        ? 0.5
        : 1 - style.marginV / style.playResY;
    const effY = Math.max(0.08, Math.min(0.92, cue.position_y ?? defaultY));
    const px = Math.round(effX * style.playResX);
    const py = Math.round(effY * style.playResY);
    posTag = `{\\pos(${px},${py})}`;
  }

  // Segment timing / no usable words: static text with preset typography, no fake highlight.
  if (validWords.length === 0) {
    const text = String(cue.text || '')
      .split('\\N')
      .map((l) => escapeAssText(l))
      .filter(Boolean)
      .join('\\N');
    if (!text || cue.end <= cue.start) return [];
    return [dialogue(cue.start, cue.end, `${posTag}${fade}${text}`)];
  }

  const slices = computeCueWordSlices(cue, validWords);
  const breakIdx = getCueLineBreakIndex(cue, validWords.length);
  const events: string[] = [];

  slices.forEach((slice, sIdx) => {
    if (formatAssTimestamp(slice.start) === formatAssTimestamp(slice.end)) return;
    const states = getWordVisualStates(slice, validWords.length, style.highlight);
    const timing = getPopTiming(style.wordAnimation, Math.round((slice.end - slice.start) * 1000));

    let out = sIdx === 0 ? `${posTag}${fade}` : posTag;
    validWords.forEach((w, i) => {
      const st = states[i];
      const cs = w.customStyle;
      // Opus/Vizard parity: append a contextual emoji to matching words and/or
      // statically colour topic keywords — both flag-gated on the resolved style.
      const emoji = style.emoji && !cs ? lookupCaptionEmoji(w.text) : null;
      const renderedText = emoji ? `${w.text} ${emoji}` : w.text;
      const wordText = cs?.uppercase ? renderedText.toUpperCase() : renderedText;
      const keywordHit =
        !cs && st.active !== true && isHighlightKeyword(w.text, style.highlightKeywords);
      const keywordColour = hexToAssColor(style.highlightKeywordColor);
      const tokenTextColour = cs?.color ? hexToAssColor(cs.color) : textColour;
      const tokenHighlightColour = cs?.highlightColor ? hexToAssColor(cs.highlightColor) : highlightColour;
      const fontMult = typeof cs?.fontSizeMultiplier === 'number' && cs.fontSizeMultiplier > 0 ? cs.fontSizeMultiplier : 1;

      let piece = wordText;
      if (st.active) {
        const tags: string[] = [];
        if (style.activeWordBox) {
          tags.push(`\\c${hexToAssColor(style.activeTextColor)}`, `\\3c${tokenHighlightColour}`, `\\bord${style.activeWordBox.padding}`);
        } else if (cs?.effect === 'pill') {
          tags.push(`\\c${hexToAssColor(cs.color || '#FFFFFF')}`, `\\3c${cs.pillColor ? hexToAssColor(cs.pillColor) : tokenHighlightColour}`, `\\bord10`);
        } else if (cs?.effect === 'glow') {
          tags.push(`\\c${tokenHighlightColour}`, `\\blur8\\3c${tokenHighlightColour}`);
        } else {
          tags.push(`\\c${tokenHighlightColour}`);
        }
        if (timing) {
          const s = Math.round(timing.peakScale * 100 * fontMult);
          tags.push(`\\t(0,${timing.upMs},0.5,\\fscx${s}\\fscy${s})`);
          if (!timing.hold) {
            const baseS = Math.round(100 * fontMult);
            tags.push(`\\t(${timing.upMs},${timing.downMs},1.5,\\fscx${baseS}\\fscy${baseS})`);
          }
        } else if (fontMult !== 1) {
          tags.push(`\\fscx${Math.round(100 * fontMult)}\\fscy${Math.round(100 * fontMult)}`);
        }
        const reset = style.activeWordBox
          ? `{\\c${tokenTextColour}\\3c${hexToAssColor(style.outlineColor)}\\bord${style.outlineWidth}\\fscx100\\fscy100\\blur0}`
          : `{\\c${tokenTextColour}\\3c${hexToAssColor(style.outlineColor)}\\bord${style.outlineWidth}\\fscx100\\fscy100\\blur0}`;
        piece = `{${tags.join('')}}${wordText}${reset}`;
      } else if (keywordHit) {
        // Static keyword highlight keeps its colour until the word becomes active.
        piece = `{\\c${keywordColour}\\b1}${wordText}{\\c${tokenTextColour}\\b0}`;
      } else if (st.highlighted) {
        if (cs?.color || fontMult !== 1 || cs?.effect) {
          const preTags: string[] = [`\\c${tokenHighlightColour}`];
          if (fontMult !== 1) preTags.push(`\\fscx${Math.round(100 * fontMult)}\\fscy${Math.round(100 * fontMult)}`);
          if (cs?.effect === 'glow') preTags.push(`\\blur6\\3c${tokenHighlightColour}`);
          piece = `{${preTags.join('')}}${wordText}{\\c${tokenTextColour}\\fscx100\\fscy100\\blur0}`;
        } else {
          piece = `{\\c${tokenHighlightColour}}${wordText}{\\c${tokenTextColour}}`;
        }
      } else {
        // Normal word with custom styling
        if (cs?.color || fontMult !== 1 || cs?.effect) {
          const preTags: string[] = [];
          if (cs?.color) preTags.push(`\\c${tokenTextColour}`);
          if (fontMult !== 1) preTags.push(`\\fscx${Math.round(100 * fontMult)}\\fscy${Math.round(100 * fontMult)}`);
          if (cs?.effect === 'pill') preTags.push(`\\3c${hexToAssColor(cs.pillColor || '#ED3A7C')}\\bord8`);
          if (cs?.effect === 'glow') preTags.push(`\\blur6\\3c${tokenTextColour}`);
          piece = `{${preTags.join('')}}${wordText}{\\c${textColour}\\3c${hexToAssColor(style.outlineColor)}\\bord${style.outlineWidth}\\fscx100\\fscy100\\blur0}`;
        }
      }
      if (i > 0) out += i - 1 === breakIdx ? '\\N' : ' ';
      out += piece;
    });
    events.push(dialogue(slice.start, slice.end, out));
  });

  return events;
}

/**
 * Readability audit (E2, warn-first): dense cues and undersized effective fonts
 * are reported, never silently emitted. Thresholds are advisory for short-form:
 * 28 chars/sec and 42px effective size on a 1080-wide portrait frame.
 */
export const CAPTION_READABILITY = {
  maxCharsPerSecond: 28,
  minEffectiveFontSizePx: 42,
} as const;

export interface CaptionReadabilityReport {
  maxCps: number;
  minFontSize: number;
  warnings: string[];
}

export function auditCaptionReadability(cues: PresetTimedCue[], style: ResolvedCaptionStyle): CaptionReadabilityReport {
  const warnings: string[] = [];
  let maxCps = 0;
  for (const cue of cues) {
    const duration = cue.end - cue.start;
    if (duration <= 0.05) continue;
    const cps = cue.text.replace(/\s+/g, ' ').trim().length / duration;
    maxCps = Math.max(maxCps, cps);
    if (cps > CAPTION_READABILITY.maxCharsPerSecond) {
      warnings.push(
        `cue@${cue.start.toFixed(1)}s ${cps.toFixed(0)} cps exceeds ${CAPTION_READABILITY.maxCharsPerSecond} cps`
      );
    }
  }
  const effectiveFont = style.fontSize;
  if (effectiveFont < CAPTION_READABILITY.minEffectiveFontSizePx) {
    warnings.push(`effective font ${effectiveFont}px below ${CAPTION_READABILITY.minEffectiveFontSizePx}px minimum`);
  }
  return { maxCps, minFontSize: effectiveFont, warnings };
}

/** Full ASS script for preset-rendered captions (supporting multi-preset styles and token-level overrides). */
export function buildPresetAssScript(cues: PresetTimedCue[], style: ResolvedCaptionStyle): string {
  const zeroOverlapCues = enforceZeroOverlap(cues.map((c) => ({ ...c })));
  const readability = auditCaptionReadability(zeroOverlapCues, style);

  // 1. Collect all distinct styles used across the project (track default + cue overrides)
  const styleLinesMap = new Map<string, string>();
  styleLinesMap.set('Default', buildPresetAssStyleLine(style, 'Default'));

  const aspect = style.playResX === style.playResY ? '1:1' : style.playResX > style.playResY ? '16:9' : '9:16';
  for (const cue of zeroOverlapCues) {
    if (cue.presetOverride && isRenderablePresetId(cue.presetOverride)) {
      const styleName = `Style_${cue.presetOverride}`;
      if (!styleLinesMap.has(styleName)) {
        const cueStyle = resolveCaptionPreset(cue.presetOverride, cue.styleOverrides, aspect);
        styleLinesMap.set(styleName, buildPresetAssStyleLine(cueStyle, styleName));
      }
    }
  }

  // 2. Build Dialogue events with appropriate Style names
  const events: string[] = [];
  for (const cue of zeroOverlapCues) {
    events.push(...buildPresetCueEvents(cue, style));
  }

  return [
    '[Script Info]',
    'Title: Vireo Auto Captions',
    'ScriptType: v4.00+',
    `PlayResX: ${style.playResX}`,
    `PlayResY: ${style.playResY}`,
    'ScaledBorderAndShadow: yes',
    'WrapStyle: 0',
    `; VireoPreset: ${style.presetId}`,
    ...readability.warnings.map((w) => `; VireoWarning: ${w}`),
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    ...Array.from(styleLinesMap.values()),
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...events,
    '',
  ].join('\n');
}
