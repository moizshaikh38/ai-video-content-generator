/**
 * One-click output templates (Platform: Yizerge-style "pick a look, get a
 * coherent output"). ONE template object owns the full output recipe:
 * canvas aspect, framing layout, caption preset + placement, opening hook
 * (text template), and scene transitions - so a creator gets a coherent
 * result in one click instead of setting five independent controls.
 *
 * Pure + shared: the editor applies a template client-side through the same
 * data-model channels the individual panels write (item.crop for fill modes,
 * item.layout_mode for framing, caption item preset fields, TEXT items from
 * textTemplates, item.transition_in for scene joins), so preview and export
 * behave exactly as if the user had picked each piece by hand.
 */

import { CaptionPosition, CaptionStyle, EditorProject, EditorTrackItem, EditorTransitionType } from '../types/index.js';
import { CAPTION_PRESETS } from './captionPresets.js';
import type { RenderableCaptionPresetId } from './captionPresets.js';
import { TEXT_TEMPLATES, createTrackItemFromTemplate } from './textTemplates.js';

export interface OutputTemplate {
  id: string;
  name: string;
  description: string;
  /** One-line "use it for" shown in the picker. */
  bestFor: string;
  aspectRatio: '9:16' | '1:1' | '16:9';
  framing: {
    /** 'track' follows the smart-reframe analysis; 'split' is the two-speaker stack. */
    layoutMode: 'track' | 'split';
    /** Background fill mode (item.crop), same routing as the preview toolbar. */
    cropMode: 'fill' | 'fit' | 'blur';
  };
  captions: {
    presetId: RenderableCaptionPresetId;
    position: CaptionPosition;
  };
  /** Opening hook text from the text-template registry; omit for no hook. */
  hook?: { textTemplateId: string; durationSec: number };
  /** Scene join applied to every video item after the first. */
  transition?: { type: EditorTransitionType; duration: number };
}

export const OUTPUT_TEMPLATES: readonly OutputTemplate[] = [
  {
    id: 'podcast_split',
    name: 'Podcast Split',
    description: 'Two speakers stacked top/bottom with clean captions',
    bestFor: 'Two-person conversations and interviews',
    aspectRatio: '9:16',
    framing: { layoutMode: 'split', cropMode: 'fill' },
    captions: { presetId: 'compact_creator', position: 'bottom' },
    transition: { type: 'cut', duration: 0 },
  },
  {
    id: 'creator_vertical',
    name: 'Creator Vertical',
    description: 'Smart-tracked subject, simple captions, opening hook',
    bestFor: 'Talking-head shorts and reels',
    aspectRatio: '9:16',
    framing: { layoutMode: 'track', cropMode: 'fill' },
    captions: { presetId: 'simple', position: 'bottom' },
    hook: { textTemplateId: 'headline_impact', durationSec: 3 },
    transition: { type: 'cross_dissolve', duration: 0.5 },
  },
  {
    id: 'bold_shorts',
    name: 'Bold Shorts',
    description: 'High-energy word-by-word captions and punchy hook',
    bestFor: 'Fast-paced viral clips',
    aspectRatio: '9:16',
    framing: { layoutMode: 'track', cropMode: 'fill' },
    captions: { presetId: 'vireo_hormozi', position: 'center' },
    hook: { textTemplateId: 'headline_impact', durationSec: 3 },
    transition: { type: 'zoom_lite', duration: 0.4 },
  },
  {
    id: 'clean_landscape',
    name: 'Clean Landscape',
    description: 'Letterboxed widescreen with minimal captions',
    bestFor: 'YouTube and webinar excerpts',
    aspectRatio: '16:9',
    framing: { layoutMode: 'track', cropMode: 'fit' },
    captions: { presetId: 'vireo_clean', position: 'bottom' },
    transition: { type: 'fade', duration: 0.5 },
  },
  {
    id: 'square_social',
    name: 'Square Social',
    description: '1:1 crop with pill captions for feed posts',
    bestFor: 'Instagram and LinkedIn feeds',
    aspectRatio: '1:1',
    framing: { layoutMode: 'track', cropMode: 'blur' },
    captions: { presetId: 'vireo_pill', position: 'bottom' },
    transition: { type: 'cross_dissolve', duration: 0.5 },
  },
] as const;

export type OutputTemplateId = (typeof OUTPUT_TEMPLATES)[number]['id'];

const BY_ID = new Map(OUTPUT_TEMPLATES.map((t) => [t.id, t]));

export function getOutputTemplate(id: string): OutputTemplate | undefined {
  return BY_ID.get(id as OutputTemplateId);
}

const CANVAS_DIMS: Record<OutputTemplate['aspectRatio'], { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '16:9': { width: 1920, height: 1080 },
};

/**
 * Apply a template to an editor project, returning a NEW project object.
 * Writes only the channels the template owns; user content (cue text, caption
 * cues, existing text items) is preserved. A template hook is inserted only
 * when no TEXT item already starts inside the hook window (re-applying a
 * template is idempotent - it never stacks duplicate hooks).
 */
export function applyOutputTemplateToProject(
  project: EditorProject,
  template: OutputTemplate,
): EditorProject {
  const dims = CANVAS_DIMS[template.aspectRatio];
  const hookTpl = template.hook
    ? TEXT_TEMPLATES.find((t) => t.id === template.hook!.textTemplateId)
    : undefined;
  const captionPreset = CAPTION_PRESETS[template.captions.presetId];

  let textTrackId: string | null = null;
  let hookAlreadyPresent = false;

  const tracks = project.tracks.map((track) => {
    if (track.type === 'TEXT') {
      textTrackId = track.id;
      if (
        template.hook &&
        track.items.some((i) => i.timeline_start < (template.hook!.durationSec))
      ) {
        hookAlreadyPresent = true;
      }
      return track;
    }

    if (track.type === 'CAPTION') {
      return {
        ...track,
        hidden: false,
        items: track.items.map((i) => ({
          ...i,
          caption: {
            cues: (i.caption as any)?.cues || [],
            emphasis_words: (i.caption as any)?.emphasis_words,
            animation: (i.caption as any)?.animation,
            position: template.captions.position,
            // RenderableCaptionPresetId excludes 'none', so it is a valid CaptionStyle.
            style: template.captions.presetId as CaptionStyle,
            primary_color: captionPreset.colors.text,
            highlight_color: captionPreset.colors.active,
          },
        })),
      };
    }

    if (track.type === 'VIDEO') {
      return {
        ...track,
        items: track.items.map((i, idx) => {
          const item: EditorTrackItem = {
            ...i,
            layout_mode: template.framing.layoutMode,
            crop_mode: template.framing.cropMode === 'blur' ? 'fit' : template.framing.cropMode,
            crop: {
              mode: template.framing.cropMode,
              focusX: i.crop?.focusX ?? 0.5,
              focusY: i.crop?.focusY ?? 0.5,
              scale: i.crop?.scale ?? 1,
            },
          } as EditorTrackItem;
          if (template.transition) {
            (item as any).transition_in =
              idx === 0
                ? undefined
                : { type: template.transition.type, duration: template.transition.duration };
          }
          return item;
        }),
      };
    }

    return track;
  });

  // Hook insertion: reuse the text-panel's own item factory so the inserted
  // hook is indistinguishable from a hand-inserted template text.
  if (hookTpl && !hookAlreadyPresent) {
    const trackId = textTrackId ?? crypto.randomUUID();
    const hookItem = createTrackItemFromTemplate(hookTpl, trackId, 0, project.canvas.duration);
    hookItem.timeline_end = Math.min(
      project.canvas.duration,
      hookItem.timeline_start + template.hook!.durationSec,
    );
    if (textTrackId) {
      const idx = tracks.findIndex((t) => t.id === textTrackId);
      tracks[idx] = { ...tracks[idx], hidden: false, items: [...tracks[idx].items, hookItem] };
    } else {
      tracks.push({
        id: trackId,
        type: 'TEXT',
        name: 'Text',
        locked: false,
        muted: false,
        hidden: false,
        items: [hookItem],
      } as any);
    }
  }

  return {
    ...project,
    canvas: {
      ...project.canvas,
      aspect_ratio: template.aspectRatio,
      width: dims.width,
      height: dims.height,
    },
    tracks,
  };
}
