import {freshPresetTypography} from '../../server/src/shared/freshPresetTypography';
/**
 * Frontend entry point for the caption preset system. The definitions live in
 * server/src/shared/captionPresets.ts so the gallery, the editor preview and the
 * FFmpeg/ASS export all read the exact same values.
 */
import {
  CAPTION_PRESETS,
  isRenderablePresetId,
  resolveCaptionPreset,
  type CaptionPresetId,
  type CaptionPresetOverrides,
  type RenderableCaptionPresetId,
  type ResolvedCaptionStyle,
} from '../../server/src/shared/captionPresets';
import type { EditorCaptionItem } from '../types';

export * from '../../server/src/shared/captionPresets';

/** Preset the editor caption item renders with, or null for a legacy style. */
export function getEditorCaptionPresetId(caption?: Pick<EditorCaptionItem, 'style'> | null): RenderableCaptionPresetId | null {
  return caption && isRenderablePresetId(caption.style) ? caption.style : null;
}

/** Maps the editor's caption item adjustments onto preset overrides (what export receives). */
export function editorCaptionToPresetOverrides(
  caption: EditorCaptionItem,
  transform?: { position_x?: number; position_y?: number }
): CaptionPresetOverrides {
  const o: CaptionPresetOverrides = {};
  if (caption.font_family) o.fontFamily = caption.font_family;
  if (caption.font_size !== undefined) o.fontSize = caption.font_size;
  if (caption.font_weight !== undefined) {
    const w = caption.font_weight;
    const presetId = getEditorCaptionPresetId(caption);
    const preset = presetId ? resolveCaptionPreset(presetId) : null;
    // Equivalent numeric weights must preserve a preset's bound static face (600/800).
    o.bold = typeof w === 'number' && preset && w === preset.fontWeight
      ? preset.bold
      : w === 'regular' ? false : w === 'bold' || w === 'black' ? true : Number(w) >= 700;
  }
  if (caption.uppercase !== undefined) o.uppercase = caption.uppercase;
  if (caption.letter_spacing !== undefined) o.letterSpacing = caption.letter_spacing;
  if (caption.primary_color) o.textColor = caption.primary_color;
  if (caption.highlight_color) o.activeColor = caption.highlight_color;
  if (caption.stroke_color) o.outlineColor = caption.stroke_color;
  if (caption.stroke_width !== undefined) o.outlineWidth = caption.stroke_width;
  if (caption.shadow_enabled !== undefined) o.shadowEnabled = caption.shadow_enabled;
  if (caption.shadow_depth !== undefined) o.shadowDepth = caption.shadow_depth;
  if (caption.shadow_color) o.shadowColor = caption.shadow_color;
  if (caption.shadow_opacity !== undefined) o.shadowOpacity = caption.shadow_opacity;
  const mw = (caption as any).max_words_per_cue;
  if (typeof mw === 'number' && mw >= 1 && mw <= 15) o.maxWordsPerCue = Math.round(mw);
  if (caption.box_enabled !== undefined) o.boxEnabled = caption.box_enabled;
  if (caption.box_color) o.boxColor = caption.box_color;
  if (caption.box_opacity !== undefined) o.boxOpacity = caption.box_opacity;
  if (caption.box_padding !== undefined) o.boxPadding = caption.box_padding;
  if (caption.alignment) o.alignment = caption.alignment;
  if (caption.animation) {
    o.wordAnimationType = caption.animation === 'pop' || caption.animation === 'karaoke' || caption.animation === 'bounce' ? 'pop' : 'none';
  }
  if (caption.animation_scale !== undefined) o.wordAnimationScale = caption.animation_scale;
  if (caption.max_lines !== undefined) o.maxLines = caption.max_lines;
  if (caption.position) o.position = caption.position;
  if (caption.position_y !== undefined) {
    o.positionY = caption.position_y;
  } else if (transform?.position_y !== undefined) {
    // Track transforms are pixel offsets from the canvas center (0 = centered) on a 1080x1920 canvas.
    o.positionY = 0.5 + transform.position_y / 1920;
    // Provenance: without an explicit position choice (flag or numeric drag), this
    // value merely mirrors the materialized default transform - mark it derived so
    // export does not treat it as user intent (it must not block the blur band
    // anchor). Unmarked values stay conservatively explicit for API/legacy writers.
    if ((caption as any).position_explicit !== true) {
      o.positionYDerived = true;
    }
  }
  if (caption.position_x !== undefined) {
    o.positionX = caption.position_x;
  } else if (transform?.position_x !== undefined) {
    o.positionX = 0.5 + transform.position_x / 1080;
  }
  return o;
}

export function resolveEditorCaptionStyle(
  caption: EditorCaptionItem | undefined | null,
  aspect: string | undefined,
  transform?: { position_x?: number; position_y?: number }
): ResolvedCaptionStyle | null {
  const presetId = getEditorCaptionPresetId(caption);
  if (!presetId || !caption) return null;
  return resolveCaptionPreset(presetId, editorCaptionToPresetOverrides(caption, transform), aspect);
}

/**
 * Caption item for a freshly selected preset: preset colors become the item's colors
 * and earlier typography adjustments are cleared; cues and position are preserved.
 */
export function applyPresetToEditorCaption(
  prev: EditorCaptionItem | undefined,
  presetId: RenderableCaptionPresetId
): EditorCaptionItem {
  const p = CAPTION_PRESETS[presetId];
  const freshFont=freshPresetTypography(presetId);
  return {
    cues: prev?.cues || [],
    // Saved-cue coverage is project data, not preset style; losing it would let
    // a deliberate empty edit or an extend boundary be re-derived on next load.
    ...(typeof prev?.cues_covered_end === 'number' && Number.isFinite(prev.cues_covered_end) && prev.cues_covered_end >= 0 ? { cues_covered_end: prev.cues_covered_end } : {}),
    position: prev?.position || 'bottom',
    position_x:prev?.position_x,
    position_y:prev?.position_y,
    ...(prev && 'position_explicit' in prev ? {position_explicit:(prev as any).position_explicit} : {}),
    emphasis_words: prev?.emphasis_words,
    style: presetId,
    ...(freshFont?{font_family:freshFont.fontFamily,font_weight:freshFont.bold?'bold' as const:'regular' as const}:{}),
    primary_color: p.colors.text,
    highlight_color: p.colors.active,
    // A different preset starts its own motion defaults, just as font/size reset.
    // Reapplying the same preset preserves a deliberate animation edit. Loading
    // a saved project never calls this explicit-selection helper.
    animation: p.cueMotion ? 'none' : prev?.style === presetId ? prev.animation : undefined,
  };
}

export type { CaptionPresetId, ResolvedCaptionStyle };

/** Materializing legacy edit defaults must not overwrite a preset's own colors. */
export function captionLegacyColorDefaults(caption: EditorCaptionItem | undefined, highlight = '#FFE600'): Pick<EditorCaptionItem, 'primary_color' | 'highlight_color'> {
  const id = getEditorCaptionPresetId(caption);
  const resolved = id ? resolveCaptionPreset(id) : null;
  return {
    primary_color: caption?.primary_color || resolved?.textColor || '#FFFFFF',
    highlight_color: caption?.highlight_color || resolved?.activeColor || highlight,
  };
}

/** Display the actual resolved face, not the two-state faux-bold flag. Read-only. */
export function captionWeightDisplay(caption?: Pick<EditorCaptionItem, 'font_weight'>, style?: ResolvedCaptionStyle | null) {
  const raw = caption?.font_weight;
  const weight = style
    ? style.fontWeight ?? (style.fontFamily === 'Arial Black' ? 900 : style.bold ? 700 : 400)
    : typeof raw === 'number' ? raw : raw === 'regular' ? 400 : raw === 'black' ? 900 : 700;
  const names: Record<number, string> = {100:'Thin',200:'ExtraLight',300:'Light',400:'Regular',500:'Medium',600:'SemiBold',700:'Bold',800:'ExtraBold',900:'Black'};
  return {weight, label: `${names[weight] || 'Weight'} ${weight}`, toggle: weight === 400 ? 'regular' : weight === 700 ? 'bold' : null};
}
