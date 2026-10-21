import { useState, useEffect, useRef, useCallback } from 'react';
import { EditorProject, RenderedClip } from '../types';
import { proEditorService } from '../services/proEditorService';
import { clipRenderService } from '../services/clipRenderService';
import { editorCaptionToPresetOverrides, getEditorCaptionPresetId } from '../lib/captionPresets';

export type SaveStatus = 'saved' | 'saving' | 'dirty' | 'error';

export interface UseEditorAutosaveOptions {
  debounceMs?: number;
  onSaved?: (project: EditorProject, clip?: RenderedClip) => void;
  onError?: (err: Error) => void;
}

export interface UseEditorAutosaveReturn {
  saveStatus: SaveStatus;
  lastSavedAt: Date | null;
  saveError: string | null;
  saveNow: () => Promise<boolean>;
  markDirty: () => void;
}

export function useEditorAutosave(
  project: EditorProject | null,
  clip: RenderedClip | null,
  options: UseEditorAutosaveOptions = {}
): UseEditorAutosaveReturn {
  const { debounceMs = 1200, onSaved, onError } = options;

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const pendingProjectRef = useRef<EditorProject | null>(null);
  const isSavingRef = useRef<boolean>(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedVersionRef = useRef<number>(project?.version || 1);

  // Keep ref of latest project
  useEffect(() => {
    if (project) {
      pendingProjectRef.current = project;
    }
  }, [project]);

  const executeSave = useCallback(async (): Promise<boolean> => {
    const current = pendingProjectRef.current;
    if (!current || !clip || isSavingRef.current) return false;

    isSavingRef.current = true;
    setSaveStatus('saving');
    setSaveError(null);

    try {
      // 1. Save canonical EditorProject to backend
      const updatedProject = await proEditorService.updateEditorProject(current.id, {
        title: current.title,
        canvas: current.canvas,
        tracks: current.tracks,
        playhead: current.playhead,
        settings: current.settings,
        version: current.version,
      });

      // 2. Also persist synced clip fields (trim, aspect ratio, volume, captions)
      const primaryVideo = current.tracks
        .find((t) => t.type === 'VIDEO')
        ?.items.find((i) => !i.hidden);

      const captionTrack = current.tracks.find((t) => t.type === 'CAPTION');
      const captionItem = captionTrack?.items[0];
      const presetId = getEditorCaptionPresetId(captionItem?.caption);

      const trimStart = primaryVideo ? primaryVideo.source_start - clip.start_seconds : 0;
      const trimEnd = primaryVideo ? clip.end_seconds - primaryVideo.source_end : 0;

      const updatedClip = await clipRenderService.updateClipEditor(clip.id, {
        aspectRatio: current.canvas.aspect_ratio || '9:16',
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
      });

      lastSavedVersionRef.current = updatedProject.version;
      setSaveStatus('saved');
      setLastSavedAt(new Date());

      if (onSaved) {
        onSaved(updatedProject, updatedClip);
      }
      return true;
    } catch (err: any) {
      const msg = err.message || 'Failed to save changes.';
      setSaveError(msg);
      setSaveStatus('error');
      if (onError) {
        onError(err);
      }
      return false;
    } finally {
      isSavingRef.current = false;
    }
  }, [clip, onSaved, onError]);

  const markDirty = useCallback(() => {
    setSaveStatus('dirty');
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      executeSave();
    }, debounceMs);
  }, [debounceMs, executeSave]);

  const saveNow = useCallback(async (): Promise<boolean> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    return executeSave();
  }, [executeSave]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return {
    saveStatus,
    lastSavedAt,
    saveError,
    saveNow,
    markDirty,
  };
}
