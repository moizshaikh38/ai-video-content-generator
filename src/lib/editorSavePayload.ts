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

  return {
    aspectRatio: project.canvas.aspect_ratio || '9:16',
    trimStartOffset: Math.max(0, Number(trimStart.toFixed(3))),
    trimEndOffset: Math.max(0, Number(trimEnd.toFixed(3))),
    cropConfig,
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
