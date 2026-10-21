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
    o.bold = w === 'regular' ? false : w === 'bold' || w === 'black' ? true : Number(w) >= 700;
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
  } else if (transform?.position_y !== undefined && transform.position_y > 0) {
    o.positionY = transform.position_y > 1 ? transform.position_y / 1080 : transform.position_y;
  }
  if (caption.position_x !== undefined) {
    o.positionX = caption.position_x;
  } else if (transform?.position_x !== undefined) {
    o.positionX =
      transform.position_x >= 0 && transform.position_x <= 1
        ? transform.position_x
        : (transform.position_x / 1920) + 0.5;
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
  return {
    cues: prev?.cues || [],
    position: prev?.position || 'bottom',
    emphasis_words: prev?.emphasis_words,
    style: presetId,
    primary_color: p.colors.text,
    highlight_color: p.colors.active,
    animation: prev?.animation,
  };
}

export type { CaptionPresetId, ResolvedCaptionStyle };
