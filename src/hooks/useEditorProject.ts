import {constantSpeedSourceSplit} from '../../server/src/shared/constantSpeedSourceSplit';
import {manualCaptionTextEdit} from '../../server/src/shared/manualCaptionTextEdit';
import { getCurrentAuthOwner, ownerMismatch } from '../lib/authOwner';
import { useAuth } from '../context/AuthContext';
import { waitForDrain } from '../lib/editorSaveCoordinator';
import {normalizeHookTiming} from '../../server/src/shared/hookDisplayMode';
import {cueListsEqual} from '../lib/cuePosition';
import { editorReframeSourceKey } from '../../server/src/shared/editorReframeSourceKey';
import { useState, useEffect, useCallback, useRef } from 'react';
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
import {acknowledgeEditorVersion} from '../lib/editorSaveState';
import { useEditorAutosave } from './useEditorAutosave';
import { healCaptionTracks, initCoveredEnd } from '../lib/captionExtendMerge';
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
  /** True while a previous editor for this clip is still finishing its last save and has taken longer than expected. */
  drainSlow: boolean;
  error: string | null;
  clip: RenderedClip | null;
  project: EditorProject | null;
  cleanSourceUrl: string | null;
  renderedPreviewUrl: string | null;
  previewUrl: string | null;
  watermarkRequired: boolean;
  cues: TimedCaptionCue[];
  timingMode: string;
  canUndo: boolean;
  canRedo: boolean;
  saveStatus: 'saved' | 'saving' | 'dirty' | 'error';
  lastSavedAt: Date | null;
  persistedReframeSourceKey: string | null;
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

// Canonical absolute-time cues aggregated from a project's visible caption
// items - the same convention as the load path (segment-relative item cues
// are shifted by the item's timeline start).
function deriveCaptionCuesFromProject(project: EditorProject): TimedCaptionCue[] | null {
  const capTrack = project.tracks?.find((t) => t.type === 'CAPTION' && !t.hidden);
  if (!capTrack || !Array.isArray(capTrack.items)) return null;
  const validItems = capTrack.items.filter(
    (i: any) => !i.hidden && i.caption && Array.isArray(i.caption.cues) && i.caption.cues.length > 0
  );
  if (validItems.length === 0) return null;
  const aggregated: TimedCaptionCue[] = [];
  const seenIds = new Set<string>();
  for (const itm of validItems.sort((a, b) => (a.timeline_start || 0) - (b.timeline_start || 0))) {
    const startOff = itm.timeline_start || 0;
    const itmCues = (itm.caption?.cues ?? []) as TimedCaptionCue[];
    const isSegRel = startOff > 0 && itmCues.length > 0 && itmCues[0].start < startOff - 0.05;
    for (const c of itmCues) {
      if (seenIds.has(c.id)) continue;
      seenIds.add(c.id);
      aggregated.push({
        ...c,
        start: isSegRel ? Number((c.start + startOff).toFixed(3)) : c.start,
        end: isSegRel ? Number((c.end + startOff).toFixed(3)) : c.end,
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
  aggregated.sort((a, b) => a.start - b.start);
  return aggregated;
}

export function useEditorProject(clipId: string | undefined): UseEditorProjectReturn {
  const [loading, setLoading] = useState<boolean>(true);
  const [drainSlow, setDrainSlow] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [clip, setClip] = useState<RenderedClip | null>(null);
  const [project, setProject] = useState<EditorProject | null>(null);
  const [cleanSourceUrl, setCleanSourceUrl] = useState<string | null>(null);
  const [renderedPreviewUrl, setRenderedPreviewUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [watermarkRequired, setWatermarkRequired] = useState<boolean>(false);
  const [cues, setCues] = useState<TimedCaptionCue[]>([]);
  const [timingMode, setTimingMode] = useState<string>('segment');
  const loadSequenceRef = useRef(0);
  const cancelWaitRef = useRef<(() => void) | null>(null);
  const { user: authUser } = useAuth();
  const localEditSequenceRef = useRef(0);
  const activeClipIdRef = useRef(clipId);
  activeClipIdRef.current = clipId;

  const { canUndo, canRedo, pushHistory, undo: historyUndo, redo: historyRedo, resetHistory } =
    useEditorHistory(project);

  const [persistedReframeSourceKey, setPersistedReframeSourceKey] = useState<string | null>(null);
  // A generic Saved transition can describe an older in-flight payload while
  // the editor already contains a newer edit. Invalidate from these exact
  // server responses, after BOTH project and clip synchronization succeeded.
  const handleSavedReframeSource = useCallback((savedProject: EditorProject, savedClip?: RenderedClip) => {
    if (savedClip && savedClip.id === activeClipIdRef.current) {
      setClip(current=>current?.id===savedClip.id?savedClip:current);
      setPersistedReframeSourceKey(editorReframeSourceKey(savedClip, savedProject));
    }
  }, []);
  const handleProjectVersionAck=useCallback((savedProject:EditorProject)=>{
    setProject(current=>acknowledgeEditorVersion(current,savedProject));
  },[]);
  const { saveStatus, lastSavedAt, saveError, saveNow, markDirty } = useEditorAutosave(
    project,
    clip,
    { onSaved: handleSavedReframeSource,onProjectVersionAck:handleProjectVersionAck }
  );

  const loadData = useCallback(async (options?: { silent?: boolean }) => {
    if (!clipId) return;
    cancelWaitRef.current?.();
    const ownerAtStart = getCurrentAuthOwner();
    if (!ownerAtStart) { setError('Sign in to open this clip.'); setLoading(false); return; }
    const sequence = ++loadSequenceRef.current;
    const editSequence = localEditSequenceRef.current;
    const isCurrent = () => sequence === loadSequenceRef.current && activeClipIdRef.current === clipId && getCurrentAuthOwner() === ownerAtStart;
    const isSilent = Boolean(options?.silent);
    if (!isSilent) {
      setLoading(true);
    }
    setError(null);

    try {
      // A previous editor for this clip may still be draining its last save: load the live revision only after it settles.
      // Waits for every drain on this clip (conservative). The coordinator supports owner/project scoping, but the auth user id is not yet proven equal to project.user_id, so it is not used here.
      const ac = new AbortController();
      cancelWaitRef.current = () => ac.abort();
      const drained = await waitForDrain(clipId, () => { if (isCurrent()) setDrainSlow(true); }, 20000, { user: ownerAtStart, signal: ac.signal });
      if (!drained || !isCurrent()) { setDrainSlow(false); return; }
      setDrainSlow(false);
      const [editorData, captionData] = await Promise.all([
        clipRenderService.getClipEditorData(clipId),
        clipRenderService.getClipCaptions(clipId).catch(() => ({ timingMode: 'segment', cues: [] })),
      ]);

      if (!isCurrent() || editSequence !== localEditSequenceRef.current) return;
      const c = editorData.clip;
      if (!c || c.id !== clipId) throw new Error('The editor response did not match the requested clip.');

      let proj = editorData.editorProject;
      if (!proj) {
        // Fallback: request from proEditorService
        proj = await proEditorService.getOrCreateEditorProject(clipId);
      }

      if (!isCurrent() || editSequence !== localEditSequenceRef.current) return;
      if (!proj || proj.clip_id !== clipId) throw new Error('The editor project did not match the requested clip.');
      if (ownerMismatch(proj.user_id, ownerAtStart) || (c.user_id && ownerMismatch(c.user_id, ownerAtStart))) throw new Error('This clip belongs to a different account.');
      setClip(c);
      const cleanSrc = editorData.cleanSourceUrl || null;
      const renderedSrc = editorData.renderedPreviewUrl || null;
      setWatermarkRequired(editorData.watermarkRequired === true);
      setCleanSourceUrl(cleanSrc);
      setRenderedPreviewUrl(renderedSrc);
      setPreviewUrl(cleanSrc || editorData.previewUrl || renderedSrc || null);

      // Prioritize canonical cues saved in EditorProject across all active caption items
      const capTrack = proj?.tracks?.find((t: any) => t.type === 'CAPTION' && !t.hidden);
      let projCaptionCues: TimedCaptionCue[] | null = null;
      if (capTrack && Array.isArray(capTrack.items)) {
        const validItems = capTrack.items.filter(
          (i: any) => !i.hidden && i.caption && Array.isArray(i.caption.cues) &&
            (i.caption.cues.length > 0 || (Number.isFinite(i.caption.cues_covered_end) && i.caption.cues_covered_end >= 0))
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
      const initialCues = Array.isArray(projCaptionCues)
        ? projCaptionCues
        : (captionData.cues || []);

      setCues(initialCues);
      setTimingMode(
        initialCues.some((c: any) => Array.isArray(c.words) && c.words.length > 0)
          ? 'word'
          : (captionData.timingMode || editorData.timingMode || 'segment')
      );

      if (proj) {
        if (Array.isArray(proj.tracks)) {
          if (projCaptionCues !== null && Array.isArray(captionData.cues) && captionData.cues.length > 0) {
            // Empty saved cues with coverage are an intentional edit. Only
            // speech beyond that saved coverage may be appended on extension.
            const { tracks, appended, markersChanged } = healCaptionTracks(proj.tracks, captionData.cues as any, proj.canvas?.duration);
            if (markersChanged) {
              proj = { ...proj, tracks };
              markDirty();
            }
            if (appended > 0) {
              const healedCues = deriveCaptionCuesFromProject(proj) || [];
              setCues(healedCues);
              setTimingMode(healedCues.some(cue => Array.isArray(cue.words) && cue.words.length > 0) ? 'word' : 'segment');
            }
          } else if (projCaptionCues === null && initialCues.length > 0) {
            // Legacy uninitialized items may still be seeded. Do not refill
            // a known saved empty edit or change a hidden captions-off track.
            const uninitializedTrack = proj.tracks.find((track: any) => track.type === 'CAPTION' && !track.hidden);
            const item = uninitializedTrack?.items?.find((entry: any) => !entry.hidden);
            if (item && !item.caption) item.caption = { cues: initialCues, style: 'clean' };
            else if (item?.caption && (!Array.isArray(item.caption.cues) || item.caption.cues.length === 0)) item.caption.cues = initialCues;
          }
        }
        setProject(proj);
        setPersistedReframeSourceKey(editorReframeSourceKey(c, proj));
        resetHistory(proj);
      }
    } catch (err: any) {
      if (isCurrent() && editSequence === localEditSequenceRef.current) setError(err.message || 'Failed to load clip editor data.');
    } finally {
      if (isCurrent() && !isSilent) {
        setLoading(false);
      }
    }
  }, [clipId, resetHistory]);

  // Account change (sign-out or another account): drop everything of the previous account (project, clip, cues, media, history),
  // invalidate any load still in flight, and cancel a pending wait. Its unsaved drafts stay in scoped storage under its own user id
  // and are never listed for another account.
  const loadDataRef = useRef(loadData);
  loadDataRef.current = loadData;
  const prevAuthIdRef = useRef<string | undefined>(authUser?.id);
  useEffect(() => {
    const id = authUser?.id;
    const prev = prevAuthIdRef.current;
    prevAuthIdRef.current = id;
    if (prev === id) return;
    loadSequenceRef.current++;
    if (cancelWaitRef.current) cancelWaitRef.current();
    setProject(null); setClip(null); setCues([]);
    setCleanSourceUrl(null); setRenderedPreviewUrl(null); setPreviewUrl(null); setPersistedReframeSourceKey(null);
    setDrainSlow(false);
    resetHistory();
    // Restart the load for the account that is signed in now (it refuses a clip that is not theirs); signed out shows the sign-in message instead of loading forever.
    if (id) { void loadDataRef.current({}); } else { setError('Sign in to open this clip.'); setLoading(false); }
  }, [authUser?.id, resetHistory]);

  useEffect(() => {
    setClip(null);
    setProject(null);
    setCues([]);
    setCleanSourceUrl(null);
    setRenderedPreviewUrl(null);
    setPreviewUrl(null);
    setPersistedReframeSourceKey(null);
    loadData();
    return () => { loadSequenceRef.current++; cancelWaitRef.current?.(); };
  }, [loadData]);

  // The transcript panel and preview caption overlay read a separate `cues`
  // state seeded at load. Caption edits write both that state and the caption
  // items, but project-level mutations that retime item cues directly (scene
  // reorder, undo/redo, API-driven changes) used to leave the panel showing
  // stale cue times. Resync whenever the cues derivable from the project's
  // caption items actually change; extension-tail cues beyond the items'
  // coverage (panel view of not-yet-healed transcript spans) are preserved.
  const lastItemCuesRef = useRef<TimedCaptionCue[] | null>(null);
  useEffect(() => {
    if (!project) return;
    const derived = deriveCaptionCuesFromProject(project);
    const prev = lastItemCuesRef.current;
    lastItemCuesRef.current = derived;
    if (!derived || (prev && cueListsEqual(prev, derived))) return;
    setCues((current) => {
      if (cueListsEqual(current, derived)) return current;
      const maxEnd = derived.reduce((m, c) => Math.max(m, c.end || 0), 0);
      const derivedIds = new Set(derived.map((c) => c.id));
      const tail = current.filter(
        (c) => (c.start || 0) >= maxEnd - 0.001 && !derivedIds.has(c.id)
      );
      return tail.length > 0
        ? [...derived, ...tail].sort((a, b) => a.start - b.start)
        : derived;
    });
  }, [project]);

  // Mutate project with optional history and autosave trigger
  const updateProject = useCallback(
    (
      updater: (prev: EditorProject) => EditorProject,
      options?: UpdateProjectOptions
    ) => {
      localEditSequenceRef.current++;
      const recordHistory = options?.recordHistory ?? true;
      const shouldMarkDirty = options?.markAsDirty ?? true;

      setProject((prev) => {
        if (!prev) return prev;
        if (recordHistory) {
          pushHistory(prev);
        }
        const next = normalizeHookTiming(updater(prev) as any) as unknown as EditorProject;
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
      localEditSequenceRef.current++;
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
      localEditSequenceRef.current++;
      setProject(prev);
      markDirty();
    }
  }, [project, historyUndo, markDirty]);

  // Redo
  const redo = useCallback(() => {
    if (!project) return;
    const next = historyRedo(project);
    if (next) {
      localEditSequenceRef.current++;
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
      // Build each state's replacement from its own cue. State updater
      // scheduling must not decide which words are persisted to the project.
      const updateCue = (cue: TimedCaptionCue): TimedCaptionCue => {
        if (cue.id !== cueId) return cue;
        return manualCaptionTextEdit(cue, newText);
      };
      setCues(previous => previous.map(updateCue));
      updateProject(previous => ({
        ...previous,
        tracks: previous.tracks.map(track => track.type !== 'CAPTION' ? track : {
          ...track,
          items: track.items.map(item => !item.caption ? item : {
            ...item,
            caption: {
              ...item.caption,
              cues: (Array.isArray(item.caption.cues) ? item.caption.cues : cues).map(updateCue),
            },
          }),
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
                    cues_covered_end: Math.max(
                      Number.isFinite(item.caption.cues_covered_end) && Number(item.caption.cues_covered_end) >= 0 ? Number(item.caption.cues_covered_end) : 0,
                      initCoveredEnd(item.caption.cues)
                    ),
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

          const updatedText = c.text.replace(regex, () => replacementWord);
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
              const sourceCues = Array.isArray(item.caption.cues)
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
                      text: c.text.replace(regex, () => replacementWord),
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
        // Constant-speed source footage must split at its media clock, not
        // its edited timeline clock. Preserve separate generated-item paths.
        const constantMedia=(item.type==='VIDEO'||item.type==='AUDIO')&&!item.is_freeze&&!item.is_title_card&&!item.speed?.speed_ramp;
        const sourceSplit=constantMedia?constantSpeedSourceSplit(item,splitTime):item.source_start+splitOffset;
        if(sourceSplit===undefined)return prev;
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
          source_end: sourceSplit,
          keyframes: firstKeyframes,
          caption: firstCaption,
        };

        const secondItem: EditorTrackItem = {
          ...JSON.parse(JSON.stringify(item)),
          id: crypto.randomUUID(),
          timeline_start: secondStart,
          source_start: sourceSplit,
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
    drainSlow,
    error,
    clip,
    project,
    cleanSourceUrl,
    renderedPreviewUrl,
    previewUrl,
    watermarkRequired,
    cues,
    timingMode,
    canUndo,
    canRedo,
    saveStatus,
    lastSavedAt,
    persistedReframeSourceKey,
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
