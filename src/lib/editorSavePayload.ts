// Builds the PATCH /clips/:id/editor body for the studio editor save path.
// Extracted from useEditorAutosave so the exact payload construction can be
// exercised without auth/transport (dev harness, tests).
import { EditorProject, RenderedClip } from '../types';
import { editorCaptionToPresetOverrides, getEditorCaptionPresetId } from './captionPresets';

export function buildClipEditorUpdatePayload(
  project: EditorProject,
  clip: RenderedClip
): Record<string, any> {
  const primaryVideo = project.tracks
    .find((t) => t.type === 'VIDEO')
    ?.items.find((i) => !i.hidden);

  const captionTrack = project.tracks.find((t) => t.type === 'CAPTION');
  const captionItem = captionTrack?.items[0];
  const presetId = getEditorCaptionPresetId(captionItem?.caption);

  const trimStart = primaryVideo ? primaryVideo.source_start - clip.start_seconds : 0;
  const trimEnd = primaryVideo ? clip.end_seconds - primaryVideo.source_end : 0;

  // Framing parity: the studio Framing panel writes crop_mode on the video
  // track item, but the render path reads clip.crop_config - so the save
  // payload must carry it, or the export ignores the studio's framing choice.
  const itemCropMode = (primaryVideo as any)?.crop_mode;
  const itemCropConfig = (primaryVideo as any)?.crop_config;
  const cropConfig = {
    mode: itemCropMode || (clip as any).crop_config?.mode || 'center',
    focusX: itemCropConfig?.focusX ?? (clip as any).crop_config?.focusX ?? 0.5,
    focusY: itemCropConfig?.focusY ?? (clip as any).crop_config?.focusY ?? 0.5,
    ...(itemCropConfig?.smart ? { smart: itemCropConfig.smart } : {}),
  };

  // Auto-headline parity mapping: proEditorService mirrors clip.title as a text item
  // when overlay_config is unset, and any text item makes the render take the pro path
  // (hasCustomProEdits), so present items - untouched or edited - burn directly and need
  // no overlay_config change. Only when every text item was deleted would the legacy
  // auto-headline resurface; persist enabled:false to keep it suppressed.
  let overlayConfigUpdate: Record<string, any> | undefined;
  const clipOverlay = (clip as any).overlay_config;
  const titleText = String((clip as any).title || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (clipOverlay?.enabled === undefined && !clipOverlay?.text && titleText) {
    const textTrack = project.tracks.find((t: any) => t.type === 'TEXT');
    const textItems = (textTrack?.items || []).filter((i: any) => !i.hidden && i.text?.text);
    if (textItems.length === 0) {
      overlayConfigUpdate = { enabled: false, text: '' };
    }
  }

  return {
    aspectRatio: project.canvas.aspect_ratio || '9:16',
    trimStartOffset: Math.max(0, Number(trimStart.toFixed(3))),
    // Negative trimEnd = beyond-candidate extension of the tail (bounded server-side
    // by the source media duration); do not clamp to 0 here or the extension is lost.
    trimEndOffset: Number(trimEnd.toFixed(3)),
    cropConfig,
    ...(overlayConfigUpdate ? { overlayConfig: overlayConfigUpdate } : {}),
    captionEnabled: !captionTrack?.hidden,
    captionStyle: captionItem?.caption?.style || 'clean',
    captionPosition: captionItem?.caption?.position || 'bottom',
    // Caption settings & overrides: sync preset adjustments and edited cue overrides
    ...(captionItem?.caption
      ? {
          captionConfig: {
            ...(presetId
              ? {
                  presetId,
                  presetOverrides: editorCaptionToPresetOverrides(captionItem.caption, captionItem.transform),
                }
              : {}),
            caption_overrides: Array.isArray(captionItem.caption.cues)
              ? captionItem.caption.cues.map((c) => ({
                  id: c.id,
                  cueId: c.id,
                  text: c.text,
                  start: c.start,
                  end: c.end,
                }))
              : undefined,
          },
        }
      : {}),
  };
}
