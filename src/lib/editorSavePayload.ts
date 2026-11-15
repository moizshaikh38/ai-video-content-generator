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

  return {
    aspectRatio: project.canvas.aspect_ratio || '9:16',
    trimStartOffset: Math.max(0, Number(trimStart.toFixed(3))),
    trimEndOffset: Math.max(0, Number(trimEnd.toFixed(3))),
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
