import { useState, useEffect, useCallback } from 'react';
import {
  EditorProject,
  EditorTrackItem,
  EditorCanvasConfig,
  EditorSettings,
  RenderedClip,
  TimedCaptionCue,
} from '../types';
import { clipRenderService } from '../services/clipRenderService';
import { proEditorService } from '../services/proEditorService';
import { useEditorHistory } from './useEditorHistory';
import { useEditorAutosave } from './useEditorAutosave';
import {
  applyRippleCutToProject,
  applyBatchRippleCuts,
  sliceAndShiftCues,
  applyBatchRippleCutsToCues,
  partitionCaptionCues,
  TimeRange,
} from '../utils/editorRippleCut';

export interface UpdateProjectOptions {
  recordHistory?: boolean;
  markAsDirty?: boolean;
}

export interface UseEditorProjectReturn {
  loading: boolean;
  error: string | null;
  clip: RenderedClip | null;
  project: EditorProject | null;
  cleanSourceUrl: string | null;
  renderedPreviewUrl: string | null;
  previewUrl: string | null;
  cues: TimedCaptionCue[];
  timingMode: string;
  canUndo: boolean;
  canRedo: boolean;
  saveStatus: 'saved' | 'saving' | 'dirty' | 'error';
  lastSavedAt: Date | null;
  saveError: string | null;
  saveNow: () => Promise<boolean>;
  undo: () => void;
  redo: () => void;
  updateProject: (
    updater: (prev: EditorProject) => EditorProject,
    options?: UpdateProjectOptions
  ) => void;
  commitProject: (preOperationProject: EditorProject) => void;
  updateTrackItem: (
    trackId: string,
    itemId: string,
    updates: Partial<EditorTrackItem>,
    options?: UpdateProjectOptions
  ) => void;
  updateCanvas: (canvasUpdates: Partial<EditorCanvasConfig>) => void;
  updateSettings: (settingsUpdates: Partial<EditorSettings>) => void;
  updateCueText: (cueId: string, newText: string) => void;
  deleteCue: (cueId: string, cutMedia?: boolean) => void;
  deleteTimeRange: (startSec: number, endSec: number) => void;
  deleteTimeRanges: (ranges: TimeRange[]) => void;
  replaceWordGlobally: (targetWord: string, replacementWord: string) => void;
  updateWordTiming: (cueId: string, wordIndex: number, newStart: number, newEnd: number) => void;
  splitTrackItem: (trackId: string, itemId: string, splitTime: number) => void;
  deleteTrackItem: (trackId: string, itemId: string) => void;
  rippleDeleteTrackItem: (trackId: string, itemId: string) => void;
  duplicateTrackItem: (trackId: string, itemId: string) => void;
  reloadProject: (options?: { silent?: boolean }) => Promise<void>;
}

export function useEditorProject(clipId: string | undefined): UseEditorProjectReturn {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [clip, setClip] = useState<RenderedClip | null>(null);
  const [project, setProject] = useState<EditorProject | null>(null);
  const [cleanSourceUrl, setCleanSourceUrl] = useState<string | null>(null);
  const [renderedPreviewUrl, setRenderedPreviewUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cues, setCues] = useState<TimedCaptionCue[]>([]);
  const [timingMode, setTimingMode] = useState<string>('segment');

  const { canUndo, canRedo, pushHistory, undo: historyUndo, redo: historyRedo, resetHistory } =
    useEditorHistory(project);

  const { saveStatus, lastSavedAt, saveError, saveNow, markDirty } = useEditorAutosave(
    project,
    clip
  );

  const loadData = useCallback(async (options?: { silent?: boolean }) => {
    if (!clipId) return;
    const isSilent = Boolean(options?.silent);
    if (!isSilent) {
      setLoading(true);
    }
    setError(null);

    try {
      const [editorData, captionData] = await Promise.all([
        clipRenderService.getClipEditorData(clipId),
        clipRenderService.getClipCaptions(clipId).catch(() => ({ timingMode: 'segment', cues: [] })),
      ]);

      const c = editorData.clip;
      setClip(c);

      const cleanSrc = editorData.cleanSourceUrl || null;
      const renderedSrc = editorData.renderedPreviewUrl || null;
      setCleanSourceUrl(cleanSrc);
      setRenderedPreviewUrl(renderedSrc);
      // Prioritize clean source for editing canvas, fall back to previewUrl
      setPreviewUrl(cleanSrc || editorData.previewUrl || renderedSrc || null);

      let proj = editorData.editorProject;
      if (!proj) {
        // Fallback: request from proEditorService
        proj = await proEditorService.getOrCreateEditorProject(clipId);
      }

      // Prioritize canonical cues saved in EditorProject across all active caption items
      const capTrack = proj?.tracks?.find((t: any) => t.type === 'CAPTION' && !t.hidden);
      let projCaptionCues: TimedCaptionCue[] | null = null;
      if (capTrack && Array.isArray(capTrack.items)) {
        const validItems = capTrack.items.filter(
          (i: any) => !i.hidden && i.caption && Array.isArray(i.caption.cues) && i.caption.cues.length > 0
        );
        if (validItems.length > 0) {
          validItems.sort((a: any, b: any) => (a.timeline_start || 0) - (b.timeline_start || 0));
          const aggregated: TimedCaptionCue[] = [];
          const seenIds = new Set<string>();
          const seenSignatures = new Set<string>();

          for (const itm of validItems) {
            const startOff = itm.timeline_start || 0;
            const itmCues = itm.caption.cues as TimedCaptionCue[];
            const isSegRel = startOff > 0 && itmCues.length > 0 && itmCues[0].start < startOff - 0.05;

            for (const c of itmCues) {
              const absStart = isSegRel ? Number((c.start + startOff).toFixed(3)) : c.start;
              const absEnd = isSegRel ? Number((c.end + startOff).toFixed(3)) : c.end;
              const sig = `${absStart.toFixed(2)}_${absEnd.toFixed(2)}_${(c.text || '').trim().toLowerCase()}`;

              if (!seenIds.has(c.id) && !seenSignatures.has(sig)) {
                seenIds.add(c.id);
                seenSignatures.add(sig);
                aggregated.push({
                  ...c,
                  start: absStart,
                  end: absEnd,
                  words: Array.isArray(c.words)
                    ? c.words.map((w) => ({
                        ...w,
                        start: isSegRel ? Number((w.start + startOff).toFixed(3)) : w.start,
                        end: isSegRel ? Number((w.end + startOff).toFixed(3)) : w.end,
                      }))
                    : c.words,
                });
              }
            }
          }
          aggregated.sort((a, b) => a.start - b.start);
          projCaptionCues = aggregated;
        }
      }
      const initialCues = (Array.isArray(projCaptionCues) && projCaptionCues.length > 0)
        ? projCaptionCues
        : (captionData.cues || []);

      setCues(initialCues);
      setTimingMode(
        initialCues.some((c: any) => Array.isArray(c.words) && c.words.length > 0)
          ? 'word'
          : (captionData.timingMode || editorData.timingMode || 'segment')
      );

      if (proj) {
        // Guarantee that the CAPTION track has cues populated if empty
        if (initialCues.length > 0 && Array.isArray(proj.tracks)) {
          const capTrack = proj.tracks.find((t: any) => t.type === 'CAPTION');
          if (capTrack && capTrack.items.length > 0) {
            const capItem = capTrack.items[0];
            if (!capItem.caption) {
              capItem.caption = { cues: initialCues, style: 'clean' };
            } else if (!Array.isArray(capItem.caption.cues) || capItem.caption.cues.length === 0) {
              capItem.caption.cues = initialCues;
            }
          }
        }
        setProject(proj);
        resetHistory(proj);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load clip editor data.');
    } finally {
      if (!isSilent) {
        setLoading(false);
      }
    }
  }, [clipId, resetHistory]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Mutate project with optional history and autosave trigger
  const updateProject = useCallback(
    (
      updater: (prev: EditorProject) => EditorProject,
      options?: UpdateProjectOptions
    ) => {
      const recordHistory = options?.recordHistory ?? true;
      const shouldMarkDirty = options?.markAsDirty ?? true;

      setProject((prev) => {
        if (!prev) return prev;
        if (recordHistory) {
          pushHistory(prev);
        }
        const next = updater(prev);
        if (shouldMarkDirty) {
          markDirty();
        }
        return next;
      });
    },
    [pushHistory, markDirty]
  );

  // Commit a completed user interaction (like dragging or trimming) with its pre-operation snapshot
  const commitProject = useCallback(
    (preOperationProject: EditorProject) => {
      pushHistory(preOperationProject);
      markDirty();
    },
    [pushHistory, markDirty]
  );

  // Undo
  const undo = useCallback(() => {
    if (!project) return;
    const prev = historyUndo(project);
    if (prev) {
      setProject(prev);
      markDirty();
    }
  }, [project, historyUndo, markDirty]);

  // Redo
  const redo = useCallback(() => {
    if (!project) return;
    const next = historyRedo(project);
    if (next) {
      setProject(next);
      markDirty();
    }
  }, [project, historyRedo, markDirty]);

  // Update a single track item
  const updateTrackItem = useCallback(
    (
      trackId: string,
      itemId: string,
      updates: Partial<EditorTrackItem>,
      options?: UpdateProjectOptions
    ) => {
      updateProject(
        (prev) => ({
          ...prev,
          tracks: prev.tracks.map((t) => {
            if (t.id !== trackId) return t;
            return {
              ...t,
              items: t.items.map((i) => (i.id === itemId ? { ...i, ...updates } : i)),
            };
          }),
        }),
        options
      );
    },
    [updateProject]
  );

  // Update canvas config
  const updateCanvas = useCallback(
    (canvasUpdates: Partial<EditorCanvasConfig>) => {
      updateProject((prev) => ({
        ...prev,
        canvas: { ...prev.canvas, ...canvasUpdates },
      }));
    },
    [updateProject]
  );

  // Update editor settings
  const updateSettings = useCallback(
    (settingsUpdates: Partial<EditorSettings>) => {
      updateProject((prev) => ({
        ...prev,
        settings: { ...prev.settings, ...settingsUpdates },
      }));
    },
    [updateProject]
  );

  // Update cue text (invalidates stale tokens safely)
  const updateCueText = useCallback(
    (cueId: string, newText: string) => {
      let updatedWordsForCue: any[] = [];
      setCues((prev) =>
        prev.map((c) => {
          if (c.id !== cueId) return c;
          // Re-tokenize words to prevent stale word highlights
          const words = newText.trim().split(/\s+/).filter(Boolean);
          const duration = Math.max(0.1, c.end - c.start);
          const wordDuration = duration / Math.max(1, words.length);

          const updatedWords = words.map((w, idx) => ({
            text: w,
            word: w,
            start: Number((c.start + idx * wordDuration).toFixed(3)),
            end: Number((c.start + (idx + 1) * wordDuration).toFixed(3)),
            confidence: 1.0,
          }));
          updatedWordsForCue = updatedWords;

          return {
            ...c,
            text: newText,
            words: updatedWords,
          };
        })
      );

      // Also sync into Caption track in EditorProject
      updateProject((prev) => ({
        ...prev,
        tracks: prev.tracks.map((t) => {
          if (t.type !== 'CAPTION') return t;
          return {
            ...t,
            items: t.items.map((item) => {
              if (!item.caption) return item;
              const sourceCues = Array.isArray(item.caption.cues) && item.caption.cues.length > 0
                ? item.caption.cues
                : cues;
              return {
                ...item,
                caption: {
                  ...item.caption,
                  cues: sourceCues.map((c) =>
                    c.id === cueId
                      ? {
                          ...c,
                          text: newText,
                          words: updatedWordsForCue.length > 0 ? updatedWordsForCue : c.words,
                        }
                      : c
                  ),
                },
              };
            }),
          };
        }),
      }));
    },
    [cues, updateProject]
  );

  // Single time range ripple cut (slices media and shifts subsequent cues/items)
  const deleteTimeRange = useCallback(
    (startSec: number, endSec: number) => {
      const cutStart = Math.min(startSec, endSec);
      const cutEnd = Math.max(startSec, endSec);
      const cutDuration = Number((cutEnd - cutStart).toFixed(3));
      if (cutDuration <= 0) return;

      setCues((prev) => sliceAndShiftCues(prev, cutStart, cutEnd, cutDuration));
      updateProject((prev) => applyRippleCutToProject(prev, cutStart, cutEnd));
    },
    [updateProject]
  );

  // Batch ripple cut for multiple pause ranges in single undo step
  const deleteTimeRanges = useCallback(
    (ranges: TimeRange[]) => {
      if (!ranges || ranges.length === 0) return;

      setCues((prev) => applyBatchRippleCutsToCues(prev, ranges));
      updateProject((prev) => applyBatchRippleCuts(prev, ranges));
    },
    [updateProject]
  );

  // Delete cue (if cutMedia is true, ripple cuts out footage and shifts timeline!)
  const deleteCue = useCallback(
    (cueId: string, cutMedia = false) => {
      const targetCue = cues.find((c) => c.id === cueId);
      if (!targetCue) return;

      if (cutMedia) {
        deleteTimeRange(targetCue.start, targetCue.end);
      } else {
        setCues((prev) => prev.filter((c) => c.id !== cueId));
        updateProject((prev) => ({
          ...prev,
          tracks: prev.tracks.map((t) => {
            if (t.type !== 'CAPTION') return t;
            return {
              ...t,
              items: t.items.map((item) => {
                if (!item.caption || !Array.isArray(item.caption.cues)) return item;
                return {
                  ...item,
                  caption: {
                    ...item.caption,
                    cues: item.caption.cues.filter((c) => c.id !== cueId),
                  },
                };
              }),
            };
          }),
        }));
      }
    },
    [cues, deleteTimeRange, updateProject]
  );

  // Global word replacement across all cues in project
  const replaceWordGlobally = useCallback(
    (targetWord: string, replacementWord: string) => {
      const cleanTarget = targetWord.trim().toLowerCase();
      if (!cleanTarget) return;

      const regex = new RegExp(`\\b${cleanTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');

      setCues((prev) =>
        prev.map((c) => {
          let hasChange = false;
          const updatedWords = Array.isArray(c.words)
            ? c.words.map((w) => {
                const wText = (w.text || (w as any).word || '').toLowerCase();
                if (wText === cleanTarget) {
                  hasChange = true;
                  return { ...w, text: replacementWord, word: replacementWord };
                }
                return w;
              })
            : c.words;

          const updatedText = c.text.replace(regex, replacementWord);
          if (updatedText !== c.text || hasChange) {
            return {
              ...c,
              text: updatedText,
              words: updatedWords,
            };
          }
          return c;
        })
      );

      updateProject((prev) => ({
        ...prev,
        tracks: prev.tracks.map((t) => {
          if (t.type !== 'CAPTION') return t;
          return {
            ...t,
            items: t.items.map((item) => {
              if (!item.caption) return item;
              const sourceCues = Array.isArray(item.caption.cues) && item.caption.cues.length > 0
                ? item.caption.cues
                : cues;
              return {
                ...item,
                caption: {
                  ...item.caption,
                  cues: sourceCues.map((c) => {
                    const updatedWords = Array.isArray(c.words)
                      ? c.words.map((w) => {
                          const wText = (w.text || (w as any).word || '').toLowerCase();
                          return wText === cleanTarget
                            ? { ...w, text: replacementWord, word: replacementWord }
                            : w;
                        })
                      : c.words;
                    return {
                      ...c,
                      text: c.text.replace(regex, replacementWord),
                      words: updatedWords,
                    };
                  }),
                },
              };
            }),
          };
        }),
      }));
    },
    [updateProject]
  );

  // Precision word timing adjuster
  const updateWordTiming = useCallback(
    (cueId: string, wordIndex: number, newStart: number, newEnd: number) => {
      const validStart = Math.max(0, Number(newStart.toFixed(3)));
      const validEnd = Math.max(validStart + 0.05, Number(newEnd.toFixed(3)));

      setCues((prev) =>
        prev.map((c) => {
          if (c.id !== cueId || !Array.isArray(c.words) || !c.words[wordIndex]) return c;
          const nextWords = [...c.words];
          nextWords[wordIndex] = {
            ...nextWords[wordIndex],
            start: validStart,
            end: validEnd,
          };
          const cueStart = Math.min(...nextWords.map((w) => w.start));
          const cueEnd = Math.max(...nextWords.map((w) => w.end));
          return {
            ...c,
            start: cueStart,
            end: cueEnd,
            words: nextWords,
          };
        })
      );

      updateProject((prev) => ({
        ...prev,
        tracks: prev.tracks.map((t) => {
          if (t.type !== 'CAPTION') return t;
          return {
            ...t,
            items: t.items.map((item) => {
              if (!item.caption || !Array.isArray(item.caption.cues)) return item;
              return {
                ...item,
                caption: {
                  ...item.caption,
                  cues: item.caption.cues.map((c) => {
                    if (c.id !== cueId || !Array.isArray(c.words) || !c.words[wordIndex]) return c;
                    const nextWords = [...c.words];
                    nextWords[wordIndex] = {
                      ...nextWords[wordIndex],
                      start: validStart,
                      end: validEnd,
                    };
                    return {
                      ...c,
                      start: Math.min(...nextWords.map((w) => w.start)),
                      end: Math.max(...nextWords.map((w) => w.end)),
                      words: nextWords,
                    };
                  }),
                },
              };
            }),
          };
        }),
      }));
    },
    [updateProject]
  );

  // Split track item
  const splitTrackItem = useCallback(
    (trackId: string, itemId: string, splitTime: number) => {
      let straddlingCueOriginal: TimedCaptionCue | undefined;
      let splitLeftCue: TimedCaptionCue | undefined;
      let splitRightCue: TimedCaptionCue | undefined;

      updateProject((prev) => {
        const track = prev.tracks.find((t) => t.id === trackId);
        if (!track) return prev;
        const item = track.items.find((i) => i.id === itemId);
        if (!item || splitTime <= item.timeline_start || splitTime >= item.timeline_end) return prev;

        const splitOffset = splitTime - item.timeline_start;
        const firstEnd = splitTime;
        const secondStart = splitTime;

        // Partition keyframes properly
        const firstKeyframes = Array.isArray(item.keyframes)
          ? item.keyframes.filter((k) => k.time < splitOffset)
          : [];
        const secondKeyframes = Array.isArray(item.keyframes)
          ? item.keyframes
              .filter((k) => k.time >= splitOffset)
              .map((k) => ({
                ...k,
                id: crypto.randomUUID(),
                time: Number((k.time - splitOffset).toFixed(3)),
              }))
          : [];

        // Partition caption cues if this is a CAPTION item or contains cues
        let firstCaption = item.caption ? { ...item.caption } : undefined;
        let secondCaption = item.caption ? JSON.parse(JSON.stringify(item.caption)) : undefined;

        if (item.type === 'CAPTION' || (item.caption && Array.isArray(item.caption.cues))) {
          const itemCues = Array.isArray(item.caption?.cues) ? item.caption.cues : [];
          const { leftCues, rightCues } = partitionCaptionCues(itemCues, splitTime, item.timeline_start);

          if (firstCaption) {
            firstCaption.cues = leftCues;
          }

          if (secondCaption) {
            secondCaption.cues = rightCues;
          }

          // Check if any cue straddles the split boundary
          straddlingCueOriginal = itemCues.find((c) => c.start < splitTime && c.end > splitTime);
          if (straddlingCueOriginal) {
            splitLeftCue = leftCues.find((c) => c.id === straddlingCueOriginal!.id);
            splitRightCue = rightCues.find((c) => c.id === `${straddlingCueOriginal!.id}_split`);
          }
        }

        const firstItem: EditorTrackItem = {
          ...item,
          timeline_end: firstEnd,
          source_end: item.source_start + splitOffset,
          keyframes: firstKeyframes,
          caption: firstCaption,
        };

        const secondItem: EditorTrackItem = {
          ...JSON.parse(JSON.stringify(item)),
          id: crypto.randomUUID(),
          timeline_start: secondStart,
          source_start: item.source_start + splitOffset,
          keyframes: secondKeyframes,
          caption: secondCaption,
        };

        return {
          ...prev,
          tracks: prev.tracks.map((t) => {
            if (t.id !== trackId) return t;
            return {
              ...t,
              items: t.items.flatMap((i) => (i.id === itemId ? [firstItem, secondItem] : [i])),
            };
          }),
        };
      });

      // Synchronize editor cues state if a cue was split across the cut
      if (straddlingCueOriginal) {
        setCues((prevCues) => {
          const replacements = [splitLeftCue, splitRightCue].filter(Boolean) as TimedCaptionCue[];
          return prevCues.flatMap((c) => (c.id === straddlingCueOriginal!.id ? replacements : [c]));
        });
      }
    },
    [updateProject]
  );

  // Ripple delete track item
  const rippleDeleteTrackItem = useCallback(
    (trackId: string, itemId: string) => {
      let cutStart = 0;
      let cutEnd = 0;
      let cutDuration = 0;

      updateProject((prev) => {
        const track = prev.tracks.find((t) => t.id === trackId);
        if (!track) return prev;
        const item = track.items.find((i) => i.id === itemId);
        if (!item) return prev;

        cutStart = item.timeline_start;
        cutEnd = item.timeline_end;
        cutDuration = Number((cutEnd - cutStart).toFixed(3));

        if (cutDuration <= 0) return prev;

        return applyRippleCutToProject(prev, cutStart, cutEnd);
      });

      if (cutDuration > 0) {
        setCues((prev) => sliceAndShiftCues(prev, cutStart, cutEnd, cutDuration));
      }
    },
    [updateProject]
  );

  // Delete track item without ripple (for overlays, stickers, and individual items)
  const deleteTrackItem = useCallback(
    (trackId: string, itemId: string) => {
      updateProject((prev) => {
        const track = prev.tracks.find((t) => t.id === trackId);
        if (!track) return prev;
        return {
          ...prev,
          tracks: prev.tracks.map((t) => {
            if (t.id !== trackId) return t;
            return {
              ...t,
              items: t.items.filter((i) => i.id !== itemId),
            };
          }),
        };
      });
    },
    [updateProject]
  );

  // Duplicate track item
  const duplicateTrackItem = useCallback(
    (trackId: string, itemId: string) => {
      updateProject((prev) => {
        const track = prev.tracks.find((t) => t.id === trackId);
        if (!track) return prev;
        const item = track.items.find((i) => i.id === itemId);
        if (!item) return prev;

        const dur = item.timeline_end - item.timeline_start;
        const copy: EditorTrackItem = {
          ...JSON.parse(JSON.stringify(item)),
          id: crypto.randomUUID(),
          timeline_start: item.timeline_end,
          timeline_end: item.timeline_end + dur,
        };

        return {
          ...prev,
          canvas: {
            ...prev.canvas,
            duration: Math.max(prev.canvas.duration, copy.timeline_end),
          },
          tracks: prev.tracks.map((t) => {
            if (t.id !== trackId) return t;
            return { ...t, items: [...t.items, copy] };
          }),
        };
      });
    },
    [updateProject]
  );

  return {
    loading,
    error,
    clip,
    project,
    cleanSourceUrl,
    renderedPreviewUrl,
    previewUrl,
    cues,
    timingMode,
    canUndo,
    canRedo,
    saveStatus,
    lastSavedAt,
    saveError,
    saveNow,
    undo,
    redo,
    updateProject,
    commitProject,
    updateTrackItem,
    updateCanvas,
    updateSettings,
    updateCueText,
    deleteCue,
    deleteTimeRange,
    deleteTimeRanges,
    replaceWordGlobally,
    updateWordTiming,
    splitTrackItem,
    deleteTrackItem,
    rippleDeleteTrackItem,
    duplicateTrackItem,
    reloadProject: loadData,
  };
}
