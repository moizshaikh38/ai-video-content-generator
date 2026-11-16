import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  EditorProject,
  RenderedClip,
  TimedCaptionCue,
  EditorTrackItem,
  EditorTrack,
  EditorCaptionItem,
} from '../../types';
import { applyPresetToEditorCaption, CaptionPresetId, DEFAULT_CAPTION_PRESET_ID, RenderableCaptionPresetId } from '../../lib/captionPresets';
import { CreditService } from '../../services/creditService';
import { useEditorPlayback } from '../../hooks/useEditorPlayback';
import { useEditorSelection, SidebarTab, AiToolType } from '../../hooks/useEditorSelection';
import { useEditorShortcuts } from '../../hooks/useEditorShortcuts';
import { useEditorRender } from '../../hooks/useEditorRender';
import { UpdateProjectOptions } from '../../hooks/useEditorProject';
import { EditorTopBar } from './EditorTopBar';
import { EditorSidebar } from './EditorSidebar';
import { PreviewCanvas } from './PreviewCanvas';
import { PlaybackController } from './PlaybackController';
import { ContextualInspector } from './ContextualInspector';
import { TranscriptEditor } from './TranscriptEditor';
import { UnifiedTimeline } from './UnifiedTimeline';
import { ExportDialog } from './ExportDialog';
import { MediaBin } from './MediaBin';
import { CommandPalette } from './CommandPalette';
import { AICopilotPanel } from './AICopilotPanel';
import { AudioWorkspacePanel } from './AudioWorkspacePanel';
import { MotionWorkspacePanel } from './MotionWorkspacePanel';
import { FramingWorkspacePanel } from './FramingWorkspacePanel';
import { AspectRatioWorkspacePanel } from './AspectRatioWorkspacePanel';
import { AiToolsPanel } from './AiToolsPanel';
import { BrandKitPanel } from './BrandKitPanel';
import { TextWorkspacePanel } from './TextWorkspacePanel';
import { ElementsWorkspacePanel, ElementMediaItem } from './ElementsWorkspacePanel';
import { ProducerPanel } from '../producer/ProducerPanel';
import { TranslationWorkspace } from '../translation/TranslationWorkspace';
import { ContentPackWorkspace } from '../contentPack/ContentPackWorkspace';
import { HookLabWorkspace } from '../hookLab/HookLabWorkspace';
import { ThumbnailLabWorkspace } from '../thumbnailLab/ThumbnailLabWorkspace';
import { AutopilotWorkspace } from '../autopilot/AutopilotWorkspace';
import { ABStudioWorkspace } from '../abStudio/ABStudioWorkspace';
import { ArrowLeft, Sparkles, Type as TypeIcon, Film, X, PanelRightOpen } from 'lucide-react';
import { insertIntroOutro, createTitleCardItem } from '../../utils/introOutro';
import { initCoveredEnd, healCaptionTracks } from '../../lib/captionExtendMerge';
import { clipRenderService } from '../../services/clipRenderService';
import { applyOutputTemplateToProject, getOutputTemplate, OutputTemplateId } from '../../../server/src/shared/outputTemplates';

interface EditorShellProps {
  clip: RenderedClip;
  project: EditorProject;
  cleanSourceUrl: string | null;
  renderedPreviewUrl: string | null;
  watermarkRequired: boolean;
  cues: TimedCaptionCue[];
  canUndo: boolean;
  canRedo: boolean;
  saveStatus: 'saved' | 'saving' | 'dirty' | 'error';
  saveError: string | null;
  onSaveNow: () => void | Promise<boolean>;
  onUndo: () => void;
  onRedo: () => void;
  onUpdateProject: (updater: (prev: EditorProject) => EditorProject, options?: UpdateProjectOptions) => void;
  onCommitProject?: (preOperationProject: EditorProject) => void;
  onUpdateTrackItem: (trackId: string, itemId: string, updates: Partial<EditorTrackItem>, options?: UpdateProjectOptions) => void;
  onUpdateCueText: (cueId: string, newText: string) => void;
  onDeleteCue: (cueId: string, cutMedia?: boolean) => void;
  onDeleteTimeRange?: (startSec: number, endSec: number) => void;
  onDeleteTimeRanges?: (ranges: Array<{ startSec: number; endSec: number }>) => void;
  onReplaceWordGlobally?: (targetWord: string, replacementWord: string) => void;
  onUpdateWordTiming?: (cueId: string, wordIndex: number, newStart: number, newEnd: number) => void;
  onSplitTrackItem: (trackId: string, itemId: string, splitTime: number) => void;
  onDeleteTrackItem?: (trackId: string, itemId: string) => void;
  onRippleDeleteTrackItem: (trackId: string, itemId: string) => void;
  onDuplicateTrackItem: (trackId: string, itemId: string) => void;
  onReloadData: (options?: { silent?: boolean }) => Promise<void>;
}

export const EditorShell: React.FC<EditorShellProps> = ({
  clip,
  project,
  cleanSourceUrl,
  renderedPreviewUrl,
  watermarkRequired,
  cues,
  canUndo,
  canRedo,
  saveStatus,
  saveError,
  onSaveNow,
  onUndo,
  onRedo,
  onUpdateProject,
  onCommitProject,
  onUpdateTrackItem,
  onUpdateCueText,
  onDeleteCue,
  onDeleteTimeRange,
  onDeleteTimeRanges,
  onReplaceWordGlobally,
  onUpdateWordTiming,
  onSplitTrackItem,
  onDeleteTrackItem,
  onRippleDeleteTrackItem,
  onDuplicateTrackItem,
  onReloadData,
}) => {
  const navigate = useNavigate();

  // Selection & UI Presets hook
  const {
    selectedItemId,
    selectedTrackId,
    selectedCueId,
    activeSidebarTab,
    activeAiTool,
    viewMode,
    selectItem,
    selectCue,
    setActiveSidebarTab,
    setActiveAiTool,
    setViewMode,
    clearSelection,
  } = useEditorSelection('captions');

  // Determine if active playback source is the raw unclipped video or pre-rendered MP4
  const isCleanSource = viewMode === 'edit' || !renderedPreviewUrl;
  const primaryVideoItem = project.tracks
    ?.find((t) => t.type === 'VIDEO' && !t.hidden)
    ?.items?.[0];
  const sourceOffset = isCleanSource
    ? (primaryVideoItem?.source_start ?? (Number(clip.start_seconds || 0) + Number(clip.trim_start_offset || 0)))
    : 0;

  // Playback hook
  const {
    videoRef,
    currentTime,
    duration,
    isPlaying,
    playbackRate,
    volume,
    isMuted,
    isLooping,
    showSafeGuides,
    previewQuality,
    togglePlay,
    seek,
    stepFrames,
    setVolume,
    toggleMute,
    setPlaybackRate,
    toggleLoop,
    toggleSafeGuides,
    setPreviewQuality,
    formatTime,
  } = useEditorPlayback({
    initialDuration: project.canvas.duration || 30,
    initialTime: project.playhead || 0,
    fps: project.canvas.fps || 30,
    sourceOffset,
    onTimeUpdate: (t) => {
      // Keep playhead aligned in project
      project.playhead = t;
    },
  });

  // Render & Export hook
  const {
    isRendering,
    renderProgress,
    renderStage,
    renderError,
    renderSuccessMsg,
    triggerRender,
    clearRenderStatus,
  } = useEditorRender({
    clipId: clip.id,
    onRenderComplete: () => {
      onReloadData({ silent: true });
    },
  });

  // Dialogs state
  const [isExportDialogOpen, setIsExportDialogOpen] = useState<boolean>(false);
  // Concise notice when an extend cannot supply full caption coverage
  // (missing/short transcript) or the coverage fetch fails after extending.
  const [extendCaptionNotice, setExtendCaptionNotice] = useState<string | null>(null);
  // Split-layout caption zones: reframe keyframes + measured speaker anchors
  // for the preview's export-parity caption attribution (speakerSplit).
  const [speakerSplit, setSpeakerSplit] = useState<{
    keyframes: Array<{ time: number; centerX: number }>;
    speaker1X: number | null;
    speaker2X: number | null;
    splitGeometry?: {
      speaker1: { x: number; y: number; windowW: number };
      speaker2: { x: number; y: number; windowW: number };
    } | null;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!clip?.id) return;
    clipRenderService
      .getClipReframe(clip.id)
      .then((r) => {
        if (cancelled) return;
        if (r.status === 'ready' && Array.isArray(r.smoothedKeyframes) && r.smoothedKeyframes.length > 0) {
          setSpeakerSplit({
            keyframes: r.smoothedKeyframes.map((k) => ({ time: Number(k.time), centerX: Number(k.centerX) })),
            speaker1X: typeof r.speaker1X === 'number' ? r.speaker1X : null,
            speaker2X: typeof r.speaker2X === 'number' ? r.speaker2X : null,
            splitGeometry: r.splitGeometry ?? null,
          });
        }
      })
      .catch(() => {
        // No reframe data: split captions render at the default band.
      });
    return () => {
      cancelled = true;
    };
  }, [clip?.id]);
  // Non-destructive reason when an action is refused (e.g. locked followers).
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  // Export staleness: caption setting changed after the last completed render;
  // the previously rendered file must not be offered as the changed export.
  const [exportStale, setExportStale] = useState<boolean>(false);
  // Last non-'none' caption preset, so Captions Off/On restores the chosen style.
  const [lastCaptionPreset, setLastCaptionPreset] = useState<RenderableCaptionPresetId>(DEFAULT_CAPTION_PRESET_ID);
  // Plan-allowed caption presets (null until loaded). Applying a premium preset
  // the plan does not include would make every subsequent save fail with
  // PRESET_RESTRICTED (the save endpoint enforces the same list), so resolve to
  // a free fallback at apply time instead. Fail-open while unloaded: the save
  // endpoint remains the backstop, matching SubtitleEditor's gallery behavior.
  const [allowedCaptionPresets, setAllowedCaptionPresets] = useState<string[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    CreditService.getUserEntitlements()
      .then((e) => {
        if (!cancelled) setAllowedCaptionPresets((e.allowedSubtitlePresets || []).map((x) => x.toLowerCase()));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  const resolvePlanAllowedPreset = useCallback((preset: RenderableCaptionPresetId): RenderableCaptionPresetId => {
    if (!allowedCaptionPresets) return preset;
    if (allowedCaptionPresets.includes('*')) return preset; // pro/studio wildcard
    // Fallback must be both plan-free and a renderable preset (CAPTION_PRESETS
    // has no 'clean' entry; the output-template mapper resolves preset colors).
    return allowedCaptionPresets.includes(preset.toLowerCase()) ? preset : 'simple';
  }, [allowedCaptionPresets]);
  // Intro/outro: which menu is open, and a pending position armed for the next media pick.
  const [introOutroMenu, setIntroOutroMenu] = useState<'intro' | 'outro' | null>(null);
  const [pendingIntroOutro, setPendingIntroOutro] = useState<'intro' | 'outro' | null>(null);
  // Timeline visibility state (persisted presentation preference, decoupled from project undo/redo history)
  const [isTimelineCollapsed, setIsTimelineCollapsed] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('vireo_editor_timeline_collapsed');
      if (stored !== null) return stored === 'true';
    } catch {}
    return false;
  });

  const handleToggleTimelineCollapse = () => {
    setIsTimelineCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('vireo_editor_timeline_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  // Responsive screen size tracking (< 1280px mutual exclusion between Left Drawer & Right Inspector)
  const [windowWidth, setWindowWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1440
  );

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isCompactScreen = windowWidth < 1280;

  // UI-only inspector collapse: lets the stage reclaim the right column's width when toggled.
  const [inspectorCollapsed, setInspectorCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('vireo_inspector_collapsed') === '1';
    } catch {
      return false;
    }
  });
  const toggleInspectorCollapsed = useCallback(() => {
    setInspectorCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem('vireo_inspector_collapsed', next ? '1' : '0');
      } catch {}
      return next;
    });
  }, []);

  const isDrawerTab =
    activeSidebarTab === 'media' ||
    activeSidebarTab === 'broll' ||
    activeSidebarTab === 'translate' ||
    activeSidebarTab === 'copilot' ||
    activeSidebarTab === 'ai_tools' ||
    activeSidebarTab === 'audio' ||
    activeSidebarTab === 'brand' ||
    activeSidebarTab === 'text' ||
    activeSidebarTab === 'elements' ||
    activeSidebarTab === 'layout' ||
    activeSidebarTab === 'framing' ||
    activeSidebarTab === 'aspect_ratio';

  const showLeftDrawer = isDrawerTab && (!isCompactScreen || !selectedItemId);
  const showRightInspector = !showLeftDrawer && activeSidebarTab !== 'transcript';

  // Transcript dock (far right). UI-only, persisted per viewer — never touches project state.
  // Defaults collapsed on narrower screens so the stage keeps its share of the width.
  const [transcriptCollapsed, setTranscriptCollapsed] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('vireo_transcript_collapsed');
      if (stored !== null) return stored === '1';
    } catch {}
    return typeof window !== 'undefined' && window.innerWidth < 1280;
  });
  const toggleTranscriptCollapsed = useCallback(() => {
    setTranscriptCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem('vireo_transcript_collapsed', next ? '1' : '0');
      } catch {}
      return next;
    });
  }, []);

  const [timelineHeight, setTimelineHeight] = useState<number>(() => {
    try {
      const s = localStorage.getItem('vireo_timeline_height');
      if (s) {
        const val = parseInt(s, 10);
        if (!isNaN(val) && val >= 140 && val <= 450) return val;
      }
    } catch {}
    return 240;
  });

  // Horizontal divider resize handler (Timeline Height)
  const handleStartResizeTimeline = (e: React.PointerEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = timelineHeight;
    let latestH = startH;

    const onPointerMove = (ev: PointerEvent) => {
      const newH = Math.max(140, Math.min(450, startH + (startY - ev.clientY)));
      latestH = newH;
      setTimelineHeight(newH);
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      try {
        localStorage.setItem('vireo_timeline_height', String(latestH));
      } catch {}
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Global Keyboard Shortcuts
  useEditorShortcuts({
    onTogglePlay: togglePlay,
    onUndo,
    onRedo,
    onSave: onSaveNow,
    onDeleteSelected: () => {
      if (selectedItemId && selectedTrackId) {
        const track = project.tracks.find((t) => t.id === selectedTrackId);
        if (track?.type === 'OVERLAY' || track?.type === 'IMAGE') {
          if (onDeleteTrackItem) {
            onDeleteTrackItem(selectedTrackId, selectedItemId);
          } else {
            onUpdateProject((prev) => ({
              ...prev,
              tracks: prev.tracks.map((t) =>
                t.id === selectedTrackId
                  ? { ...t, items: t.items.filter((i) => i.id !== selectedItemId) }
                  : t
              ),
            }));
          }
        } else {
          onRippleDeleteTrackItem(selectedTrackId, selectedItemId);
        }
        clearSelection();
      }
    },
    onSplit: () => {
      if (selectedItemId && selectedTrackId) {
        onSplitTrackItem(selectedTrackId, selectedItemId, currentTime);
      }
    },
    onStepFrame: stepFrames,
    onToggleCommandPalette: () => setIsCommandPaletteOpen((prev) => !prev),
    onEscape: () => {
      clearSelection();
      setIsExportDialogOpen(false);
      clearRenderStatus();
      setIsCommandPaletteOpen(false);
    },
  });

  // Freeze frame: split the selected video item at the playhead and insert a
  // still segment holding that exact source frame. Later content ripples by
  // the freeze duration and caption cues/words shift with it, so speech and
  // burned text stay aligned across the hold. One history step.
  const FREEZE_DURATION_SEC = 2;
  const handleFreezeFrame = () => {
    if (!selectedItemId || !selectedTrackId) return;
    const track = project.tracks.find((t) => t.id === selectedTrackId);
    const item = track?.items.find((i) => i.id === selectedItemId);
    if (!track || !item || track.type !== 'VIDEO' || item.is_freeze) return;
    const t = currentTime;
    if (t <= item.timeline_start + 0.05 || t >= item.timeline_end - 0.05) return;
    // Refuse the freeze when a locked track holds content past the freeze
    // point: everything else ripples +dur, which would silently misalign the
    // locked content (consistent with scene reorder's locked-follower block).
    const lockedHit = project.tracks.some(
      (tr) => tr.locked && tr.items.some((it) => it.timeline_end > t)
    );
    if (lockedHit) {
      setActionNotice('Freeze not applied: a locked track has content past the playhead. Unlock it first - nothing was changed.');
      return;
    }
    const dur = FREEZE_DURATION_SEC;
    const itemSpeed = item.speed?.speed || 1;
    const srcTime = item.source_start + (t - item.timeline_start) * itemSpeed;
    const r3 = (v: number) => Math.round(v * 1000) / 1000;
    onUpdateProject((prev) => ({
      ...prev,
      // The freeze extends the timeline; the canvas must grow with it or the
      // tail of the clip falls off the end of preview and export.
      canvas: { ...prev.canvas, duration: r3(prev.canvas.duration + dur) },
      tracks: prev.tracks.map((tr) => {
        if (tr.locked) return tr;
        const items: EditorTrackItem[] = [];
        for (const it of tr.items) {
          if (it.timeline_end <= t) {
            items.push(it);
            continue;
          }
          if (it.timeline_start >= t) {
            const shifted: EditorTrackItem = {
              ...it,
              timeline_start: r3(it.timeline_start + dur),
              timeline_end: r3(it.timeline_end + dur),
            };
            if (tr.type === 'CAPTION' && it.caption && Array.isArray(it.caption.cues)) {
              shifted.caption = {
                ...it.caption,
                cues: it.caption.cues.map((c: any) => ({
                  ...c,
                  start: r3(c.start + dur),
                  end: r3(c.end + dur),
                  words: Array.isArray(c.words)
                    ? c.words.map((w: any) => ({ ...w, start: r3(w.start + dur), end: r3(w.end + dur) }))
                    : c.words,
                })),
              };
            }
            items.push(shifted);
            continue;
          }
          if (tr.id === selectedTrackId && it.id === selectedItemId) {
            const left: EditorTrackItem = { ...it, timeline_end: r3(t), source_end: r3(srcTime) };
            const freeze: EditorTrackItem = {
              ...it,
              id: crypto.randomUUID(),
              type: 'IMAGE',
              is_freeze: true,
              freeze_source_time: r3(srcTime),
              timeline_start: r3(t),
              timeline_end: r3(t + dur),
              source_start: r3(srcTime),
              source_end: r3(srcTime + 0.1),
              muted: true,
            };
            const right: EditorTrackItem = {
              ...it,
              id: crypto.randomUUID(),
              timeline_start: r3(t + dur),
              timeline_end: r3(it.timeline_end + dur),
              source_start: r3(srcTime),
            };
            items.push(left, freeze, right);
            continue;
          }
          if (tr.type === 'CAPTION' && it.caption && Array.isArray(it.caption.cues)) {
            // Caption item spans the freeze: stretch its span; cues after t
            // shift with the ripple, a cue straddling t stretches over the
            // hold and only its post-freeze words move.
            const cues = it.caption.cues.map((c: any) => {
              if (c.start >= t) {
                return {
                  ...c,
                  start: r3(c.start + dur),
                  end: r3(c.end + dur),
                  words: Array.isArray(c.words)
                    ? c.words.map((w: any) => ({ ...w, start: r3(w.start + dur), end: r3(w.end + dur) }))
                    : c.words,
                };
              }
              if (c.end > t) {
                return {
                  ...c,
                  end: r3(c.end + dur),
                  words: Array.isArray(c.words)
                    ? c.words.map((w: any) =>
                        w.start >= t ? { ...w, start: r3(w.start + dur), end: r3(w.end + dur) } : w
                      )
                    : c.words,
                };
              }
              return c;
            });
            items.push({ ...it, timeline_end: r3(it.timeline_end + dur), caption: { ...it.caption, cues } });
            continue;
          }
          if (tr.type === 'AUDIO' && it.source_path) {
            // Speech/music pauses during the hold: split and shift.
            const aSpeed = it.speed?.speed || 1;
            const aSrc = it.source_start + (t - it.timeline_start) * aSpeed;
            items.push(
              { ...it, timeline_end: r3(t), source_end: r3(aSrc) },
              {
                ...it,
                id: crypto.randomUUID(),
                timeline_start: r3(t + dur),
                timeline_end: r3(it.timeline_end + dur),
                source_start: r3(aSrc),
              }
            );
            continue;
          }
          // Static overlays stretch over the freeze.
          items.push({ ...it, timeline_end: r3(it.timeline_end + dur) });
        }
        return { ...tr, items };
      }),
    }));
  };

  // Smart-reframe track for the base-video preview pan. The export reads the
  // same track (clip.crop_config.mode === 'smart' -> ReframeTrackRecord); the
  // preview mirrors its crop window via PreviewCanvas. Fetched once per clip.
  const [smartReframe, setSmartReframe] = useState<{
    keyframes: Array<{ time: number; centerX: number; centerY?: number }>;
    clipStartSec?: number;
  } | null>(null);
  useEffect(() => {
    const clipId = clip?.id;
    const mode = (clip?.crop_config as { mode?: string } | null | undefined)?.mode;
    if (!clipId || mode !== 'smart') {
      setSmartReframe(null);
      return;
    }
    let cancelled = false;
    void clipRenderService
      .getClipReframe(clipId)
      .then((r) => {
        if (cancelled) return;
        const kfs = Array.isArray(r.smoothedKeyframes) ? r.smoothedKeyframes : [];
        // Stale tracks mirror the export's resolveReframeDecision: it falls
        // back to center (reason stale_track), so the preview must not pan
        // on them either.
        if (r.status === 'ready' && kfs.length > 0 && !r.isStale) {
          setSmartReframe({ keyframes: kfs, clipStartSec: Number(clip?.start_seconds) || 0 });
        } else {
          setSmartReframe(null);
        }
      })
      .catch(() => {
        if (!cancelled) setSmartReframe(null);
      });
    return () => {
      cancelled = true;
    };
  }, [clip?.id, (clip?.crop_config as { mode?: string } | null | undefined)?.mode]);

  // Split speaker-anchor seeding, shared by the panel's Split button and the
  // Podcast Split output template: fetch measured analysis anchors (GET
  // /clips/:id/reframe) and seed item.crop_config.split. Existing values are
  // user picks (panel sliders) and are never overwritten; when analysis has
  // no credible pair the symmetric defaults apply.
  const seedSplitAnchorsFromAnalysis = () => {
    if (!clip?.id) return;
    const item = project.tracks.find((t) => t.type === 'VIDEO')?.items[0] as any;
    const existing = item?.crop_config?.split;
    if (Number.isFinite(existing?.speaker1X) && Number.isFinite(existing?.speaker2X)) return;
    void clipRenderService
      .getClipReframe(clip.id)
      .then((r) => {
        const s1 = typeof r.speaker1X === 'number' && Number.isFinite(r.speaker1X) ? r.speaker1X : 0.25;
        const s2 = typeof r.speaker2X === 'number' && Number.isFinite(r.speaker2X) ? r.speaker2X : 0.75;
        onUpdateProject((prev) => ({
          ...prev,
          tracks: prev.tracks.map((t) => {
            if (t.type !== 'VIDEO') return t;
            return {
              ...t,
              items: t.items.map((i: any) => {
                const cur = i?.crop_config?.split;
                if (Number.isFinite(cur?.speaker1X) && Number.isFinite(cur?.speaker2X)) return i;
                return {
                  ...i,
                  crop_config: {
                    ...(i.crop_config || {}),
                    split: { ...(cur || {}), speaker1X: s1, speaker2X: s2 },
                  },
                };
              }),
            };
          }),
        }));
      })
      .catch(() => {
        // Anchor fetch failed: preview + export both fall back to the
        // symmetric defaults; sliders remain available.
      });
  };

  // Face-safe hook placement: a template hook inserted at the template's
  // default band can cover the tracked subject's face (measured: the
  // headline_impact box at position_y -240 overlapped the woman's forehead in
  // the two-shot fixture). When analysis exists, move the INSERTED hook (never
  // a pre-existing/user-positioned text item) to the band opposite the
  // dominant face zone inside the hook window. Without analysis the template
  // default stands. Mirrors the export exactly: the item transform persists
  // and drawtext burns the same position.
  const seedHookPlacementFromAnalysis = (hookDurationSec: number) => {
    if (!clip?.id) return;
    void clipRenderService
      .getClipReframe(clip.id)
      .then((r) => {
        const kfs = (r.smoothedKeyframes || []).filter((k) => k.time < hookDurationSec);
        if (kfs.length === 0) return;
        const faceY = kfs.reduce((acc, k) => acc + (k.centerY ?? 0.5), 0) / kfs.length;
        // Face clearly in the upper band -> hook below center but ABOVE the
        // caption zone (measured: +240 lands inside the bottom caption band);
        // clearly lower -> upper band; middle -> keep the template default.
        const hookY = faceY < 0.45 ? 140 : faceY > 0.6 ? -240 : null;
        if (hookY === null) return;
        onUpdateProject((prev) => ({
          ...prev,
          tracks: prev.tracks.map((t) => {
            if (t.type !== 'TEXT') return t;
            return {
              ...t,
              items: t.items.map((i: any) => {
                // Only the template-inserted hook: starts inside the hook window
                // and still sits at the template default band.
                if (i.timeline_start >= hookDurationSec) return i;
                if (i.transform?.position_y !== -240) return i;
                return { ...i, transform: { ...i.transform, position_y: hookY } };
              }),
            };
          }),
        }));
      })
      .catch(() => {
        // Placement fetch failed: the template default band stands.
      });
  };

  // One-click output template: ONE object owns aspect + framing + captions +
  // hook + transitions. Applied through the pure shared mapper so preview and
  // export see exactly what a hand-picked combination would produce.
  const handleApplyOutputTemplate = (templateId: OutputTemplateId) => {
    const tpl = getOutputTemplate(templateId);
    if (!tpl) return;
    setExportStale(true);
    // A template whose caption preset exceeds the current plan would otherwise
    // stamp a premium style the save endpoint then rejects (PRESET_RESTRICTED),
    // blocking every later save. Substitute the free fallback for this plan.
    const allowedPreset = resolvePlanAllowedPreset(tpl.captions.presetId);
    if (allowedPreset !== tpl.captions.presetId) {
      setActionNotice(`The "${tpl.name}" template's caption preset is not on your current plan - applied the free "simple" preset instead. Framing, aspect and hook are unchanged.`);
    }
    const effectiveTpl = allowedPreset === tpl.captions.presetId
      ? tpl
      : { ...tpl, captions: { ...tpl.captions, presetId: allowedPreset } };
    // The shared mapper is typed against the server EditorProject; the client
    // type is structurally identical for every field the mapper touches
    // (tracks/items/caption/crop/canvas), so the boundary cast is safe.
    onUpdateProject((prev) => applyOutputTemplateToProject(prev as any, effectiveTpl) as unknown as EditorProject);
    if (tpl.framing.layoutMode === 'split') seedSplitAnchorsFromAnalysis();
    if (tpl.hook) seedHookPlacementFromAnalysis(tpl.hook.durationSec);
  };

  // Apply Caption Preset: 'none' hides the caption track (captionEnabled=false on save),
  // any other preset re-enables it and swaps the style while keeping cues and position.
  const handleApplyCaptionPreset = (requested: CaptionPresetId) => {
    const preset: CaptionPresetId = requested === 'none'
      ? 'none'
      : resolvePlanAllowedPreset(requested as RenderableCaptionPresetId);
    if (requested !== 'none' && preset !== requested) {
      setActionNotice(`The "${requested.replace(/_/g, ' ')}" caption preset is not on your current plan - applied the free "simple" preset instead. Your other edits are unaffected.`);
    }
    if (preset !== 'none') setLastCaptionPreset(preset as RenderableCaptionPresetId);
    setExportStale(true);
    onUpdateProject((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => {
        if (t.type !== 'CAPTION') return t;
        if (preset === 'none') return { ...t, hidden: true };
        return {
          ...t,
          hidden: false,
          items: t.items.map((i) => ({
            ...i,
            caption: applyPresetToEditorCaption(i.caption, preset),
          })),
        };
      }),
    }));
  };

  // A completed render matches current editor settings again.
  useEffect(() => {
    if (renderSuccessMsg) setExportStale(false);
  }, [renderSuccessMsg]);

  // Persistent staleness: the rendered file predates the current editor
  // project whenever the project was SAVED after the snapshot taken at render
  // start (updated_at comparison; a never-edited project - updated_at equals
  // created_at - matches the default state the render already reflects).
  const editorProjectStale =
    !!clip &&
    clip.render_status === 'ready' &&
    !!(clip as any).rendered_editor_saved_at &&
    project.updated_at > (clip as any).rendered_editor_saved_at &&
    project.updated_at !== project.created_at;

  // Discoverable Captions On/Off. Hiding the track already preserves the
  // item's caption config, so re-enabling just unhides - the chosen style
  // (gallery preset or legacy style) survives the off/on round-trip.
  const handleToggleCaptions = (enabled: boolean) => {
    setExportStale(true);
    onUpdateProject((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => {
        if (t.type !== 'CAPTION') return t;
        if (!enabled) return { ...t, hidden: true };
        const hasConfig = t.items.some((i) => i.caption && i.caption.style);
        if (hasConfig) return { ...t, hidden: false };
        // No config to restore (unexpected): fall back to the last used preset.
        return {
          ...t,
          hidden: false,
          items: t.items.map((i) => ({
            ...i,
            caption: applyPresetToEditorCaption(i.caption, lastCaptionPreset),
          })),
        };
      }),
    }));
  };

  const hasWordTiming = cues.some((c) => Array.isArray(c.words) && c.words.length > 0);

  // Add Track Item (for Text / Template overlays)
  const handleAddTrackItem = (item: EditorTrackItem) => {
    let targetTrackId = item.track_id;

    onUpdateProject((prev) => {
      const existingTextTrack = prev.tracks.find((t) => t.type === 'TEXT');
      if (!existingTextTrack) {
        targetTrackId = crypto.randomUUID();
        const newTextTrack: EditorTrack = {
          id: targetTrackId,
          name: 'Text Overlay',
          type: 'TEXT',
          items: [{ ...item, track_id: targetTrackId }],
          locked: false,
          hidden: false,
          muted: false,
        };
        return {
          ...prev,
          tracks: [...prev.tracks, newTextTrack],
        };
      }

      targetTrackId = existingTextTrack.id;
      const updatedItem = { ...item, track_id: targetTrackId };
      return {
        ...prev,
        tracks: prev.tracks.map((t) => {
          if (t.id !== targetTrackId) return t;
          return { ...t, items: [...t.items, updatedItem] };
        }),
      };
    });

    selectItem(item.id, targetTrackId);
  };

  // Add Element / Sticker Layer
  const handleAddElement = (element: ElementMediaItem) => {
    let targetTrackId = '';
    const itemDuration = 3.0; // 3 seconds default duration

    let createdItemId = '';

    onUpdateProject((prev) => {
      let elementsTrack = prev.tracks.find(
        (t) => t.type === 'OVERLAY' || t.name === 'Elements & Stickers'
      );

      if (!elementsTrack) {
        targetTrackId = crypto.randomUUID();
        createdItemId = crypto.randomUUID();
        const newTrack: EditorTrack = {
          id: targetTrackId,
          name: 'Elements & Stickers',
          type: 'OVERLAY',
          items: [],
          locked: false,
          hidden: false,
          muted: false,
        };
        const newItem: EditorTrackItem = {
          id: createdItemId,
          track_id: targetTrackId,
          type: 'OVERLAY',
          name: `${element.type === 'sticker' ? 'Sticker' : 'GIF'}: ${element.title || 'Overlay'}`,
          timeline_start: currentTime,
          timeline_end: Math.min(prev.canvas.duration, currentTime + itemDuration),
          source_start: 0,
          source_end: itemDuration,
          transform: {
            position_x: 0,
            position_y: 0,
            scale: 1.0,
            rotation: 0,
            opacity: 1.0,
            // Versioned overlay semantics (see EditorTransform.position_space):
            // new elements speak center-origin design space in both channels.
            position_space: 'design_center',
          },
          source_path: element.sourceUrl,
          speed: { speed: 1.0, pitch_preserved: true },
          effects: [],
          keyframes: [],
          locked: false,
          muted: false,
          hidden: false,
          z_index: 25,
        };
        return {
          ...prev,
          tracks: [...prev.tracks, { ...newTrack, items: [newItem] }],
        };
      }

      targetTrackId = elementsTrack.id;
      createdItemId = crypto.randomUUID();
      const newItem: EditorTrackItem = {
        id: createdItemId,
        track_id: targetTrackId,
        type: 'OVERLAY',
        name: `${element.type === 'sticker' ? 'Sticker' : 'GIF'}: ${element.title || 'Overlay'}`,
        timeline_start: currentTime,
        timeline_end: Math.min(prev.canvas.duration, currentTime + itemDuration),
        source_start: 0,
        source_end: itemDuration,
        transform: {
          position_x: 0,
          position_y: 0,
          scale: 1.0,
          rotation: 0,
          opacity: 1.0,
          // Versioned overlay semantics (see EditorTransform.position_space):
          // new elements speak center-origin design space in both channels.
          position_space: 'design_center',
        },
        source_path: element.sourceUrl,
        speed: { speed: 1.0, pitch_preserved: true },
        effects: [],
        keyframes: [],
        locked: false,
        muted: false,
        hidden: false,
        z_index: 25,
      };

      return {
        ...prev,
        tracks: prev.tracks.map((t) => {
          if (t.id !== targetTrackId) return t;
          return { ...t, items: [...t.items, newItem] };
        }),
      };
    });

    if (createdItemId && targetTrackId) {
      selectItem(createdItemId, targetTrackId);
    }
  };

  // Add Text Layer (legacy / quick button)
  const handleAddTextLayer = (text: string) => {
    const textTrack = project.tracks.find((t) => t.type === 'TEXT');
    const trackId = textTrack ? textTrack.id : crypto.randomUUID();

    const newItem: EditorTrackItem = {
      id: crypto.randomUUID(),
      track_id: trackId,
      type: 'TEXT',
      timeline_start: currentTime,
      timeline_end: Math.min(project.canvas.duration, currentTime + 3.0),
      source_start: 0,
      source_end: 3.0,
      transform: { position_x: 0, position_y: 0, scale: 1.0, rotation: 0, opacity: 1.0 },
      speed: { speed: 1.0, pitch_preserved: true },
      text: {
        text,
        font_family: 'Inter',
        font_size: 44,
        font_weight: 'bold',
        italic: false,
        alignment: 'center',
        color: '#FFFFFF',
        background_color: '#00000099',
        preset: 'bold',
        animation: 'pop',
        animation_duration: 0.4,
      },
      effects: [],
      keyframes: [],
      locked: false,
      muted: true,
      hidden: false,
      z_index: 20,
    };

    handleAddTrackItem(newItem);
  };

  // Add Media Layer (B-Roll or Library footage/image/audio)
  const handleAddMediaLayer = (
    type: any,
    name: string,
    url: string,
    duration = 3.0
  ) => {
    const isAudio = type === 'AUDIO';
    const targetTrack =
      project.tracks.find((t) => t.type === type) ||
      (isAudio ? project.tracks.find((t) => t.type === 'AUDIO') : project.tracks.find((t) => t.type === 'VIDEO')) ||
      project.tracks[0];
    if (!targetTrack) return;

    const itemDuration = Math.max(0.5, Math.min(10.0, duration));
    const newItem: EditorTrackItem = {
      id: crypto.randomUUID(),
      track_id: targetTrack.id,
      type: isAudio ? 'AUDIO' : type === 'IMAGE' ? 'IMAGE' : 'VIDEO',
      timeline_start: currentTime,
      timeline_end: Math.min(project.canvas.duration, currentTime + itemDuration),
      source_start: 0,
      source_end: itemDuration,
      transform: { position_x: 0, position_y: 0, scale: 1.0, rotation: 0, opacity: 1.0 },
      speed: { speed: 1.0, pitch_preserved: true },
      source_path: url,
      name,
      effects: [],
      keyframes: [],
      locked: false,
      muted: false,
      hidden: false,
      z_index: isAudio ? 2 : 5,
    };

    // If an intro/outro slot was armed, insert this media there (ripple) instead of inline.
    if (pendingIntroOutro) {
      const videoTrack = project.tracks.find((t) => t.type === 'VIDEO') || targetTrack;
      const mediaItem: EditorTrackItem = { ...newItem, track_id: videoTrack.id, type: type === 'IMAGE' ? 'IMAGE' : 'VIDEO', name };
      const pos = pendingIntroOutro;
      setPendingIntroOutro(null);
      onUpdateProject((prev) => insertIntroOutro(prev, pos, videoTrack.id, mediaItem).project);
      selectItem(mediaItem.id, videoTrack.id);
      return;
    }

    onUpdateProject((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => {
        if (t.id !== targetTrack.id) return t;
        return { ...t, items: [...t.items, newItem] };
      }),
    }));

    selectItem(newItem.id, targetTrack.id);
  };

  // Intro/outro: open the choice menu, then insert a title card or arm a media pick.
  const handleAddIntroOutro = (position: 'intro' | 'outro') => {
    setIntroOutroMenu(position);
  };

  const handleInsertTitleCard = (position: 'intro' | 'outro') => {
    const videoTrack = project.tracks.find((t) => t.type === 'VIDEO') || project.tracks[0];
    if (!videoTrack) return;
    const card = createTitleCardItem(videoTrack.id, position, 0);
    onUpdateProject((prev) => insertIntroOutro(prev, position, videoTrack.id, card).project);
    selectItem(card.id, videoTrack.id);
    setIntroOutroMenu(null);
  };

  const handlePickMediaForIntroOutro = (position: 'intro' | 'outro') => {
    setPendingIntroOutro(position);
    setActiveSidebarTab('media');
    setIntroOutroMenu(null);
  };

  // The contextual options panel sits beside the tool rail and swaps content with the selected
  // tool. A drawer tab renders its own drawer; everything else (and any selected canvas object)
  // renders the inspector here, so there is only ever one contextual column.
  const inspectorPanel = (
    <ContextualInspector
      project={project}
      clip={clip}
      selectedItemId={selectedItemId}
      selectedTrackId={selectedTrackId}
      activeSidebarTab={activeSidebarTab}
      activeAiTool={activeAiTool}
      onSelectAiTool={setActiveAiTool}
      onNavigateTab={setActiveSidebarTab}
      onUpdateProject={onUpdateProject}
      onUpdateItem={(itemId, updates, options) => {
        // Selection via the preview overlay sets only the item id; resolve the
        // owning track from the item when no track is selected, otherwise
        // inspector edits (hook duration, visibility, ...) silently no-op.
        const trackId =
          selectedTrackId ||
          project.tracks.find((t) => t.items.some((i) => i.id === itemId))?.id ||
          null;
        if (trackId) {
          onUpdateTrackItem(trackId, itemId, updates, options);
        }
      }}
      onAddKeyframe={(itemId, prop, val, easing) => {
        if (selectedTrackId) {
          const track = project.tracks.find((t) => t.id === selectedTrackId);
          const item = track?.items.find((i) => i.id === itemId);
          if (item) {
            const kfs = [...(item.keyframes || [])];
            kfs.push({
              id: crypto.randomUUID(),
              property: prop,
              value: val,
              time: currentTime - item.timeline_start,
              easing,
            });
            onUpdateTrackItem(selectedTrackId, itemId, { keyframes: kfs });
          }
        }
      }}
      onDeleteKeyframe={(itemId, kfId) => {
        if (selectedTrackId) {
          const track = project.tracks.find((t) => t.id === selectedTrackId);
          const item = track?.items.find((i) => i.id === itemId);
          if (item) {
            const kfs = (item.keyframes || []).filter((k) => k.id !== kfId);
            onUpdateTrackItem(selectedTrackId, itemId, { keyframes: kfs });
          }
        }
      }}
      onApplyCaptionPreset={handleApplyCaptionPreset}
      allowedCaptionPresetIds={allowedCaptionPresets ?? undefined}
      onToggleCaptions={handleToggleCaptions}
      hasWordTiming={hasWordTiming}
      onAddTextLayer={handleAddTextLayer}
      onUpdateCropMode={(_mode) => {
        onUpdateProject((prev) => ({
          ...prev,
          canvas: { ...prev.canvas },
        }));
      }}
      onActionNotice={setActionNotice}
    />
  );

  // Transcript lives in a persistent right-hand dock, independent of the selected tool, so it
  // never disappears when the user switches to Captions / Audio / B-roll / AI tools.
  const primaryVideoForExtend = project.tracks
    .find((t) => t.type === 'VIDEO')
    ?.items.find((i) => !i.hidden);
  // Reclaimable tail: footage between the current item end and the furthest safe
  // source point. The candidate boundary (clip.end_seconds) is the floor; when the
  // source media runs longer (source_duration_seconds from the project record) the
  // user may extend beyond the candidate - the server re-validates the bound.
  const extendSlackSec = primaryVideoForExtend
    ? Math.max(
        0,
        Number(
          (
            Math.min(
              (project as any).source_duration_seconds ?? clip.end_seconds,
              Number.MAX_SAFE_INTEGER
            ) - primaryVideoForExtend.source_end
          ).toFixed(3)
        )
      )
    : 0;
  const transcriptPanel = (
    <TranscriptEditor
      cues={cues}
      currentTime={currentTime}
      onSeek={seek}
      onUpdateCueText={onUpdateCueText}
      onDeleteCue={onDeleteCue}
      selectedCueId={selectedCueId}
      onSelectCue={selectCue}
      onDeleteTimeRange={onDeleteTimeRange}
      onDeleteTimeRanges={onDeleteTimeRanges}
      extendSlackSec={extendSlackSec}
      onExtendClip={() => {
        // Extend the clip tail toward the source media end (or the candidate boundary
        // when the source duration is unknown): same field updates as timeline
        // trim-right, committed in one step, plus the canvas duration so the pro
        // render covers the extended tail.
        if (!primaryVideoForExtend || extendSlackSec <= 0.05) return;
        const trackId = primaryVideoForExtend.track_id;
        const itemId = primaryVideoForExtend.id;
        const bound = (project as any).source_duration_seconds ?? clip.end_seconds;
        const newSourceEnd = Math.min(
          bound,
          Number((primaryVideoForExtend.source_end + extendSlackSec).toFixed(3))
        );
        const delta = Number((newSourceEnd - primaryVideoForExtend.source_end).toFixed(3));
        if (delta <= 0) return;
        // Single history entry for the whole extend: video item + canvas +
        // coverage marker commit together, so one undo restores all of it.
        void trackId; void itemId;
        onUpdateProject((prev) => ({
          ...prev,
          canvas: {
            ...prev.canvas,
            duration: Number(((prev.canvas.duration || 0) + delta).toFixed(3)),
          },
          tracks: prev.tracks.map((t) => {
            if (t.id === trackId) {
              return {
                ...t,
                items: t.items.map((i) =>
                  i.id !== itemId
                    ? i
                    : {
                        ...i,
                        source_end: newSourceEnd,
                        timeline_end: Number((i.timeline_end + delta).toFixed(3)),
                      }
                ),
              };
            }
            // Record the pre-extend caption coverage BEFORE the extension is
            // saved, so the heal can append the newly exposed span on the very
            // next load - no second-load gap for existing projects.
            if (t.type !== 'CAPTION' || t.hidden) return t;
            return {
              ...t,
              items: t.items.map((i) =>
                i.hidden || !i.caption || !Array.isArray(i.caption.cues) ||
                i.caption.cues.length === 0 || i.caption.cues_covered_end != null
                  ? i
                  : {
                      ...i,
                      caption: {
                        ...i.caption,
                        cues_covered_end: initCoveredEnd(i.caption.cues),
                      },
                    }
              ),
            };
          }),
        }));
        // Persist the new trim, then append cues for the newly exposed span
        // in-session (fresh extraction honors the saved trim). This is its own
        // history entry, so undo reverts caption append first, then the extend;
        // no reload, so existing undo history is preserved.
        void (async () => {
          try {
            // Let React flush the extend state updates (track item + canvas +
            // coverage marker) into the autosave ref before saving; otherwise
            // saveNow persists the pre-extend snapshot and the caption fetch
            // below would read a pre-extend clip.
            await new Promise((r) => setTimeout(r, 0));
            let saved = await onSaveNow();
            if (!saved) {
              // A save was already in flight; wait for it to settle and retry
              // once so the heal is not silently dropped.
              await new Promise((r) => setTimeout(r, 800));
              saved = await onSaveNow();
            }
            if (!saved) {
              console.error('[extend-heal] save did not complete; caption coverage will heal on next editor load.');
              setExtendCaptionNotice(
                'Clip extended, but saving failed. Captions for the added footage will load on next open.'
              );
              return;
            }
            const cap = await clipRenderService.getClipCaptions(clip.id);
            if (!Array.isArray(cap?.cues) || cap.cues.length === 0) {
              setExtendCaptionNotice(
                'Clip extended, but no transcript captions are available for this clip yet.'
              );
              return;
            }
            onUpdateProject((prev) => {
              const { tracks: healed, appended, markersChanged } = healCaptionTracks(
                prev.tracks,
                cap.cues,
                prev.canvas?.duration
              );
              if (!markersChanged) return prev;
              if (appended === 0) {
                // Coverage did not move past the pre-extend boundary: the
                // transcript has no words in the extended span (missing or
                // shorter than the extension), so captions cannot cover it.
                setExtendCaptionNotice(
                  'The transcript has no words in the added footage, so captions cannot cover the full extension.'
                );
              } else {
                setExtendCaptionNotice(null);
              }
              return { ...prev, tracks: healed };
            });
          } catch (e) {
            // The heal re-runs on next editor load; surface for diagnostics.
            console.error('[extend-heal] failed:', e);
            setExtendCaptionNotice(
              'Clip extended, but loading captions for the added footage failed. They will retry on next open.'
            );
          }
        })();
      }}
      onReplaceWordGlobally={onReplaceWordGlobally}
      onUpdateWordTiming={onUpdateWordTiming}
      onPlayRange={(start) => {
        seek(start);
        if (!isPlaying) togglePlay();
      }}
      onPunchInZoom={(wordStart: number) => {
        onUpdateProject((prev) => {
          const videoTrack = prev.tracks.find((t) => t.type === 'VIDEO' && !t.locked);
          if (!videoTrack || videoTrack.items.length === 0) return prev;
          const targetItem = videoTrack.items.find(
            (i) => wordStart >= i.timeline_start && wordStart <= i.timeline_end
          );
          if (!targetItem) return prev;

          const relTime = wordStart - targetItem.timeline_start;
          const keyframes = targetItem.keyframes ? [...targetItem.keyframes] : [];
          keyframes.push(
            {
              id: crypto.randomUUID(),
              time: Math.max(0, Number(relTime.toFixed(3))),
              property: 'scale',
              value: 1.08,
              easing: 'ease-out',
            },
            {
              id: crypto.randomUUID(),
              time: Math.max(0, Number((relTime + 1.5).toFixed(3))),
              property: 'scale',
              value: 1.0,
              easing: 'ease-in-out',
            }
          );

          return {
            ...prev,
            tracks: prev.tracks.map((t) => {
              if (t.id !== videoTrack.id) return t;
              return {
                ...t,
                items: t.items.map((i) => (i.id === targetItem.id ? { ...i, keyframes } : i)),
              };
            }),
          };
        });
      }}
      onUpdateCuePreset={(cueId, presetId) => {
        onUpdateProject((prev) => {
          const captionTrack = prev.tracks.find((t) => t.type === 'CAPTION');
          if (!captionTrack) return prev;
          return {
            ...prev,
            tracks: prev.tracks.map((t) => {
              if (t.id !== captionTrack.id) return t;
              return {
                ...t,
                items: t.items.map((item) => {
                  if (item.type !== 'CAPTION' || !item.caption?.cues) return item;
                  return {
                    ...item,
                    caption: {
                      ...item.caption,
                      cues: item.caption.cues.map((c) =>
                        c.id === cueId ? { ...c, presetOverride: presetId } : c
                      ),
                    },
                  };
                }),
              };
            }),
          };
        });
      }}
      onUpdateWordCustomStyle={(cueId, wordIndex, style) => {
        onUpdateProject((prev) => {
          const captionTrack = prev.tracks.find((t) => t.type === 'CAPTION');
          if (!captionTrack) return prev;
          return {
            ...prev,
            tracks: prev.tracks.map((t) => {
              if (t.id !== captionTrack.id) return t;
              return {
                ...t,
                items: t.items.map((item) => {
                  if (item.type !== 'CAPTION' || !item.caption?.cues) return item;
                  return {
                    ...item,
                    caption: {
                      ...item.caption,
                      cues: item.caption.cues.map((c) => {
                        if (c.id !== cueId || !Array.isArray(c.words)) return c;
                        const updatedWords = [...c.words];
                        if (updatedWords[wordIndex]) {
                          updatedWords[wordIndex] = {
                            ...updatedWords[wordIndex],
                            customStyle: {
                              ...(updatedWords[wordIndex].customStyle || {}),
                              ...style,
                            },
                          };
                        }
                        return {
                          ...c,
                          words: updatedWords,
                          tokens: updatedWords,
                        };
                      }),
                    },
                  };
                }),
              };
            }),
          };
        });
      }}
      onToggleCollapse={toggleTranscriptCollapsed}
    />
  );

  return (
    <div className="flex flex-col h-screen w-screen bg-vc-canvas text-white overflow-hidden font-sans select-none">
      {/* 1. TOP NAVIGATION BAR */}
      <EditorTopBar
        title={project.title || clip.title || 'Untitled Clip'}
        onUpdateTitle={(newTitle) => {
          onUpdateProject((prev) => ({ ...prev, title: newTitle }));
        }}
        onBack={() => navigate(`/projects/${clip.project_id}`)}
        saveStatus={saveStatus}
        saveError={saveError}
        onSaveNow={onSaveNow}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={onUndo}
        onRedo={onRedo}
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
        previewQuality={previewQuality}
        onChangePreviewQuality={setPreviewQuality}
        showSafeGuides={showSafeGuides}
        onToggleSafeGuides={toggleSafeGuides}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenExportDialog={() => setIsExportDialogOpen(true)}
        isRendering={isRendering}
      />

      {/* 2. MAIN WORKSPACE BODY */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative select-none">
        {/* LEFT VERTICAL SIDEBAR */}
        <EditorSidebar
          activeTab={activeSidebarTab}
          onChangeTab={(tab) => {
            if (tab === 'transcript') {
              setTranscriptCollapsed(false);
              setActiveSidebarTab('transcript');
              return;
            }
            if (activeSidebarTab === tab && !selectedItemId) {
              toggleInspectorCollapsed();
              return;
            }
            setActiveSidebarTab(tab);
            if (tab === 'captions') {
              setInspectorCollapsed(false);
            } else if (
              tab === 'media' ||
              tab === 'broll' ||
              tab === 'audio' ||
              tab === 'brand' ||
              tab === 'text' ||
              tab === 'elements' ||
              tab === 'layout' ||
              tab === 'framing' ||
              tab === 'aspect_ratio' ||
              tab === 'copilot' ||
              tab === 'ai_tools' ||
              tab === 'translate'
            ) {
              clearSelection();
            }
          }}
          activeAiTool={activeAiTool}
          onSelectAiTool={setActiveAiTool}
        />

        {/* DIRECT B-ROLL DRAWER */}
        {showLeftDrawer && activeSidebarTab === 'broll' && (
          <div className="w-[350px] shrink-0 flex flex-col min-h-0 overflow-hidden border-r border-vc-border bg-vc-surface1 animate-panelSlideIn">
            <MediaBin
              project={project}
              sourceVideoUrl={cleanSourceUrl || renderedPreviewUrl}
              onAddMediaToTimeline={handleAddMediaLayer}
              onRefreshProject={onReloadData}
              currentTime={currentTime}
              initialTab="broll"
            />
          </div>
        )}

        {/* DIRECT TRANSLATE DRAWER */}
        {showLeftDrawer && activeSidebarTab === 'translate' && (
          <div className="w-[350px] shrink-0 flex flex-col min-h-0 overflow-hidden border-r border-vc-border bg-vc-surface1 animate-panelSlideIn">
            <TranslationWorkspace
              project={project}
              sourceTranscriptText={cues.map((c) => c.text).join(' ')}
              sourceSegments={cues.map((c, i) => ({
                id: c.id || `cue-${i}`,
                start: c.start,
                end: c.end,
                text: c.text,
                speaker_id: 'speaker-0',
              }))}
              onApplyCaptions={(_lang, translatedSegs) => {
                const newCues: TimedCaptionCue[] = translatedSegs.map((s, idx) => ({
                  id: s.segment_id || `tc-${idx}`,
                  start: s.start_time,
                  end: s.end_time,
                  text: s.translated_text,
                  words: [],
                }));

                onUpdateProject((prev) => {
                  const captionTrack = prev.tracks.find((t) => t.type === 'CAPTION');
                  if (!captionTrack) return prev;

                  return {
                    ...prev,
                    tracks: prev.tracks.map((t) => {
                      if (t.id !== captionTrack.id) return t;
                      return {
                        ...t,
                        items: t.items.map((i) => ({
                          ...i,
                          caption: {
                            cues: newCues,
                            style: i.caption?.style || 'clean',
                            position: i.caption?.position || 'bottom',
                            highlight_color: i.caption?.highlight_color || '#8B5CF6',
                            primary_color: i.caption?.primary_color || '#FFFFFF',
                            ...i.caption,
                          },
                        })),
                      };
                    }),
                  };
                });
              }}
              onRefreshProject={onReloadData}
            />
          </div>
        )}

        {/* MEDIA LIBRARY DRAWER */}
        {showLeftDrawer && activeSidebarTab === 'media' && (
          <div className="w-[350px] shrink-0 flex flex-col min-h-0 overflow-hidden border-r border-vc-border bg-vc-surface1 animate-panelSlideIn">
            <MediaBin
              project={project}
              sourceVideoUrl={cleanSourceUrl || renderedPreviewUrl}
              onAddMediaToTimeline={handleAddMediaLayer}
              onRefreshProject={onReloadData}
              currentTime={currentTime}
              initialTab="library"
            />
          </div>
        )}

        {/* AI COPILOT DRAWER */}
        {showLeftDrawer && activeSidebarTab === 'copilot' && (
          <div className="w-[350px] shrink-0 flex flex-col min-h-0 overflow-hidden border-r border-vc-border bg-vc-surface1 animate-panelSlideIn">
            <AICopilotPanel
              project={project}
              cues={cues}
              onUpdateProject={onUpdateProject}
              onUpdateCueText={onUpdateCueText}
            />
          </div>
        )}

        {/* AI TOOLS DRAWER */}
        {showLeftDrawer && activeSidebarTab === 'ai_tools' && (
          <div className="w-[350px] shrink-0 flex flex-col min-h-0 overflow-hidden border-r border-vc-border bg-vc-surface1 animate-panelSlideIn">
            <AiToolsPanel
              activeToolId={null}
              onSelectToolId={() => {}}
              onActivate={(tool) => {
                if (tool.target?.aiTool) {
                  setActiveAiTool(tool.target.aiTool as AiToolType);
                } else if (tool.target?.tab) {
                  setActiveSidebarTab(tool.target.tab as SidebarTab);
                }
              }}
            />
          </div>
        )}

        {/* AUDIO STUDIO DRAWER */}
        {showLeftDrawer && activeSidebarTab === 'audio' && (
          <div className="w-[350px] shrink-0 flex flex-col min-h-0 overflow-hidden border-r border-vc-border bg-vc-surface1 animate-panelSlideIn">
            <AudioWorkspacePanel
              project={project}
              currentTime={currentTime}
              onAddAudioTrack={(title, url, dur) => handleAddMediaLayer('AUDIO', title, url, dur)}
              onUpdateProject={onUpdateProject}
            />
          </div>
        )}

        {/* BRAND KIT DRAWER */}
        {showLeftDrawer && activeSidebarTab === 'brand' && (
          <div className="w-[350px] shrink-0 flex flex-col min-h-0 overflow-hidden border-r border-vc-border bg-vc-surface1 animate-panelSlideIn">
            <BrandKitPanel
              project={project}
              onUpdateProject={onUpdateProject}
            />
          </div>
        )}

        {/* TEXT & MOTION TEMPLATES DRAWER */}
        {showLeftDrawer && activeSidebarTab === 'text' && (
          <div className="w-[350px] shrink-0 flex flex-col min-h-0 overflow-hidden border-r border-vc-border bg-vc-surface1 animate-panelSlideIn">
            <TextWorkspacePanel
              project={project}
              currentTime={currentTime}
              onAddTextItem={handleAddTrackItem}
              onSelectTrackItem={(itemId, trackId) => selectItem(itemId, trackId)}
            />
          </div>
        )}

        {/* ELEMENTS & STICKERS DRAWER */}
        {showLeftDrawer && activeSidebarTab === 'elements' && (
          <div className="w-[350px] shrink-0 flex flex-col min-h-0 overflow-hidden border-r border-vc-border bg-vc-surface1 animate-panelSlideIn">
            <ElementsWorkspacePanel
              project={project}
              currentTime={currentTime}
              onAddElement={handleAddElement}
              onSelectTrackItem={(itemId, trackId) => selectItem(itemId, trackId)}
            />
          </div>
        )}

        {/* MOTION DRAWER */}
        {showLeftDrawer && activeSidebarTab === 'layout' && (
          <div className="w-[350px] shrink-0 flex flex-col min-h-0 overflow-hidden border-r border-vc-border bg-vc-surface1 animate-panelSlideIn">
            <MotionWorkspacePanel
              project={project}
              selectedItemId={selectedItemId}
              onUpdateProject={onUpdateProject}
            />
          </div>
        )}

        {/* FRAMING & SMART REFRAME DRAWER */}
        {showLeftDrawer && activeSidebarTab === 'framing' && (
          <div className="w-[350px] shrink-0 flex flex-col min-h-0 overflow-hidden border-r border-vc-border bg-vc-surface1 animate-panelSlideIn">
            <FramingWorkspacePanel
              project={project}
              showSafeGuides={showSafeGuides}
              onToggleSafeGuides={toggleSafeGuides}
              onUpdateCropMode={(mode) => {
                // Same routing as the preview toolbar Layout toggle: fill/fit/blur
                // write item.crop (the channel the export compiler honors); 'smart'
                // stays legacy-only. crop_mode is mirrored for back-compat.
                onUpdateProject((prev) => ({
                  ...prev,
                  tracks: prev.tracks.map((t) => {
                    if (t.type === 'VIDEO') {
                      return {
                        ...t,
                        items: t.items.map((i) => ({
                          ...i,
                          crop_mode: mode === 'blur' ? 'fit' : mode,
                          ...(mode === 'smart'
                            ? {}
                            : {
                                crop: {
                                  mode: (mode === 'center' ? 'fill' : mode) as 'fit' | 'fill' | 'blur',
                                  focusX: i.crop?.focusX ?? 0.5,
                                  focusY: i.crop?.focusY ?? 0.5,
                                  scale: i.crop?.scale ?? 1,
                                },
                              }),
                        })),
                      };
                    }
                    return t;
                  }),
                }));
              }}
              onUpdateLayoutMode={(layout) => {
                onUpdateProject((prev) => ({
                  ...prev,
                  tracks: prev.tracks.map((t) => {
                    if (t.type === 'VIDEO') {
                      return {
                        ...t,
                        items: t.items.map((i) => ({ ...i, layout_mode: layout })),
                      };
                    }
                    return t;
                  }),
                }));
                // Split pick: seed the speaker windows from measured analysis
                // anchors so both the preview and the export center the actual
                // speakers (see seedSplitAnchorsFromAnalysis).
                if (layout === 'split') seedSplitAnchorsFromAnalysis();
              }}
              onApplyOutputTemplate={handleApplyOutputTemplate}
              onUpdateSplitAnchors={(anchors) => {
                const clamp = (v: number) => Math.min(0.9, Math.max(0.1, Number(v)));
                const s1 = clamp(anchors.speaker1X);
                const s2 = clamp(anchors.speaker2X);
                onUpdateProject((prev) => ({
                  ...prev,
                  tracks: prev.tracks.map((t) => {
                    if (t.type !== 'VIDEO') return t;
                    return {
                      ...t,
                      items: t.items.map((i: any) => ({
                        ...i,
                        crop_config: {
                          ...(i.crop_config || {}),
                          split: { ...(i.crop_config?.split || {}), speaker1X: s1, speaker2X: s2 },
                        },
                      })),
                    };
                  }),
                }));
              }}
              onUpdateScreencast={(patch) => {
                onUpdateProject((prev) => ({
                  ...prev,
                  tracks: prev.tracks.map((t) => {
                    if (t.type === 'VIDEO') {
                      return {
                        ...t,
                        items: t.items.map((i) => {
                          const prevScreencast = (i as any).crop_config?.screencast || {};
                          // null is an explicit opt-out and MUST persist -
                          // deleting the key would fall back to (and resurrect)
                          // the analysis suggestion at render time.
                          const nextScreencast = { ...prevScreencast, ...patch };
                          return {
                            ...i,
                            crop_config: { ...(i as any).crop_config, screencast: nextScreencast },
                          } as any;
                        }),
                      };
                    }
                    return t;
                  }),
                }));
              }}
              onUpdateProject={onUpdateProject}
            />
          </div>
        )}

        {/* ASPECT RATIO DRAWER */}
        {showLeftDrawer && activeSidebarTab === 'aspect_ratio' && (
          <div className="w-[350px] shrink-0 flex flex-col min-h-0 overflow-hidden border-r border-vc-border bg-vc-surface1 animate-panelSlideIn">
            <AspectRatioWorkspacePanel
              project={project}
              onUpdateProject={onUpdateProject}
            />
          </div>
        )}

        {/* CONTEXTUAL INSPECTOR PANEL — smoothly docks beside the rail */}
        {showRightInspector && !inspectorCollapsed && (
          <div className="relative shrink-0 flex z-20">
            {inspectorPanel}
          </div>
        )}

        {/* CENTER VIEWPORT (VIDEO PREVIEW + TRANSPORT) */}
        <div className="flex-1 flex flex-col min-w-0 bg-vc-surface1 overflow-hidden relative">
          <PreviewCanvas
            project={project}
            playhead={currentTime}
            isPlaying={isPlaying}
            sourceOffset={sourceOffset}
            cleanSourceUrl={cleanSourceUrl}
            renderedPreviewUrl={renderedPreviewUrl}
            viewMode={viewMode}
            speakerSplit={speakerSplit}
            onPlayheadChange={seek}
            onTogglePlay={togglePlay}
            selectedItemId={selectedItemId}
            onSelectItem={(id) => selectItem(id)}
            onDeleteItem={(itemId) => {
              const track = project.tracks.find((t) => t.items.some((i) => i.id === itemId));
              if (track) {
                if (onDeleteTrackItem) {
                  onDeleteTrackItem(track.id, itemId);
                } else {
                  onUpdateProject((prev) => ({
                    ...prev,
                    tracks: prev.tracks.map((t) =>
                      t.id === track.id ? { ...t, items: t.items.filter((i) => i.id !== itemId) } : t
                    ),
                  }));
                }
              }
              clearSelection();
            }}
            onCommitProject={onCommitProject}
            onUpdateItemTransform={(itemId, transform, options) => {
              if (selectedTrackId) {
                onUpdateTrackItem(selectedTrackId, itemId, { transform }, options);
              }
            }}
            onUpdateItemCrop={(itemId, crop, options) => {
              const track = project.tracks.find((t) => t.items.some((i) => i.id === itemId));
              if (track) {
                onUpdateTrackItem(track.id, itemId, { crop }, options);
              }
            }}
            smartReframe={smartReframe}
            showSafeGuides={showSafeGuides}
            onToggleSafeGuides={toggleSafeGuides}
            onChangeAspectRatio={(aspectRatio) => {
              onUpdateProject((prev) => ({
                ...prev,
                canvas: {
                  ...prev.canvas,
                  aspect_ratio: aspectRatio,
                },
              }));
            }}
            onUpdateCropMode={(mode) => {
              // Route through item.crop: the export compiler (buildSliceCropFilter)
              // honors item.crop.mode and never reads legacy crop_mode, so writing
              // crop_mode alone left this toggle with no effect on the render.
              // crop_mode is still mirrored for legacy preview fallbacks.
              onUpdateProject((prev) => ({
                ...prev,
                tracks: prev.tracks.map((t) =>
                  t.type === 'VIDEO'
                    ? {
                        ...t,
                        items: t.items.map((i) => ({
                          ...i,
                          crop_mode: mode === 'blur' ? 'fit' : mode,
                          crop: {
                            // 'smart' stays on the legacy crop_mode channel; the
                            // per-item compiler modes are fill/fit/blur/custom.
                            mode: (mode === 'center' || mode === 'smart' ? 'fill' : mode) as 'fit' | 'fill' | 'blur',
                            focusX: i.crop?.focusX ?? 0.5,
                            focusY: i.crop?.focusY ?? 0.5,
                            scale: i.crop?.scale ?? 1,
                          },
                        })),
                      }
                    : t
                ),
              }));
            }}
            videoRef={videoRef}
            cues={cues}
            onUpdateCaptionPosition={(pos, options) => {
              const captionTrack = project.tracks.find((t) => t.type === 'CAPTION');
              const item = captionTrack?.items[0];
              if (item && captionTrack) {
                const isObj = typeof pos === 'object';
                const cueId = isObj ? (pos as any).cueId : undefined;
                const newFontSize = isObj ? (pos as any).fontSize : undefined;

                if (cueId) {
                  // Per-cue position override
                  const updatedCues = (item.caption?.cues || []).map((c) => {
                    if (c.id === cueId) {
                      return {
                        ...c,
                        ...(isObj && pos.x !== undefined ? { position_x: Number(pos.x.toFixed(3)) } : {}),
                        ...(isObj && pos.y !== undefined ? { position_y: Number(pos.y.toFixed(3)) } : {}),
                      };
                    }
                    return c;
                  });

                  const updatedCaption: EditorCaptionItem = {
                    position_explicit: true,
                    cues: updatedCues,
                    style: item.caption?.style || 'clean',
                    position: item.caption?.position || 'bottom',
                    highlight_color: item.caption?.highlight_color || '#FF6B35',
                    primary_color: item.caption?.primary_color || '#FFFFFF',
                    ...item.caption,
                    ...(newFontSize !== undefined ? { font_size: newFontSize } : {}),
                  };

                  onUpdateTrackItem(captionTrack.id, item.id, {
                    caption: updatedCaption,
                  }, options);
                } else {
                  // Global position / font size update
                  const posX = isObj && pos.x !== undefined ? pos.x : (item.caption?.position_x ?? 0.5);
                  const posY = isObj ? (pos.y ?? item.caption?.position_y ?? 0.667) : pos;
                  const updatedCaption: EditorCaptionItem = {
                    position_explicit: true,
                    cues: item.caption?.cues || [],
                    style: item.caption?.style || 'clean',
                    position: item.caption?.position || 'bottom',
                    highlight_color: item.caption?.highlight_color || '#FF6B35',
                    primary_color: item.caption?.primary_color || '#FFFFFF',
                    ...item.caption,
                    position_x: Number(posX.toFixed(3)),
                    position_y: Number(posY.toFixed(3)),
                    ...(newFontSize !== undefined ? { font_size: newFontSize } : {}),
                  };
                  onUpdateTrackItem(captionTrack.id, item.id, {
                    caption: updatedCaption,
                    transform: {
                      ...item.transform,
                      position_x: Number(((posX - 0.5) * 1920).toFixed(1)),
                      position_y: Number((posY * 1080).toFixed(1)),
                    },
                  }, options);
                }
              }
            }}
          />
        </div>

        {/* TRANSCRIPT DOCK — persistent on the far right, independent of the selected tool */}
        {transcriptCollapsed ? (
          <div className="w-10 shrink-0 glass-rail flex flex-col items-center py-3 z-20 border-l border-white/[0.08]">
            <button
              onClick={toggleTranscriptCollapsed}
              title="Show transcript"
              aria-label="Show transcript"
              className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-neutral-400 hover:text-white flex items-center justify-center transition-colors"
            >
              <PanelRightOpen className="w-4 h-4" />
            </button>
            <span className="mt-3 text-[9px] font-medium uppercase tracking-[0.12em] text-neutral-500 [writing-mode:vertical-rl] rotate-180">
              Transcript
            </span>
          </div>
        ) : (
          <div className="w-[320px] md:w-[340px] xl:w-[360px] shrink-0 glass-dock flex flex-col min-h-0 z-20 border-l border-white/[0.08]">
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              {actionNotice && (
                <div className="mx-3 mt-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-950/40 border border-amber-800/50">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  <p className="text-[11px] text-amber-200/90 leading-snug">{actionNotice}</p>
                  <button
                    onClick={() => setActionNotice(null)}
                    className="ml-auto text-amber-300/70 hover:text-amber-200 text-xs px-1"
                    aria-label="Dismiss"
                  >
                    ×
                  </button>
                </div>
              )}
              {extendCaptionNotice && (
                <div className="mx-3 mt-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-950/40 border border-amber-800/50">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  <p className="text-[11px] text-amber-200/90 leading-snug">{extendCaptionNotice}</p>
                  <button
                    onClick={() => setExtendCaptionNotice(null)}
                    className="ml-auto text-amber-300/70 hover:text-amber-200 text-xs px-1"
                    aria-label="Dismiss"
                  >
                    ×
                  </button>
                </div>
              )}
              {transcriptPanel}
            </div>
          </div>
        )}

        {/* FULLSCREEN / EXPANDED AI WORKSPACE MODAL OVERLAY */}
        {activeSidebarTab === 'ai_tools' && activeAiTool !== 'copilot' && (
          <div className="absolute inset-0 z-40 bg-vc-canvas/95 flex flex-col overflow-hidden animate-fadeIn">
            {/* Header */}
            <div className="h-12 px-6 border-b border-white/[0.08] flex items-center justify-between bg-vc-surface1">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-400" />
                <span className="font-semibold text-white capitalize text-sm">
                  {activeAiTool.replace('_', ' ')} Studio
                </span>
              </div>
              <button
                onClick={() => setActiveSidebarTab('captions')}
                className="px-3 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-neutral-300 flex items-center gap-1.5 transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Return to Canvas</span>
              </button>
            </div>

            {/* AI Workspace Body */}
            <div className="flex-1 overflow-auto p-4">
              {activeAiTool === 'producer' && (
                <ProducerPanel
                  clipId={clip.id}
                  clip={clip}
                  onPlanApplied={() => onReloadData()}
                />
              )}

              {activeAiTool === 'translate' && (
                <TranslationWorkspace
                  project={project}
                  sourceTranscriptText={cues.map((c) => c.text).join(' ')}
                  sourceSegments={cues.map((c, i) => ({
                    id: c.id || `cue-${i}`,
                    start: c.start,
                    end: c.end,
                    text: c.text,
                    speaker_id: 'speaker-0',
                  }))}
                  onApplyCaptions={(_lang, translatedSegs) => {
                    const newCues: TimedCaptionCue[] = translatedSegs.map((s, idx) => ({
                      id: s.segment_id || `cue-${idx}`,
                      start: s.start_time,
                      end: s.end_time,
                      text: s.translated_text,
                    }));
                    newCues.forEach((nc) => onUpdateCueText(nc.id, nc.text));
                  }}
                  onRefreshProject={onReloadData}
                />
              )}

              {activeAiTool === 'content_pack' && (
                <ContentPackWorkspace
                  projectId={clip.project_id}
                  clipId={clip.id}
                  clipTitle={clip.title || 'Clip'}
                  clipDurationSeconds={clip.duration_seconds}
                  onOpenHookLab={() => setActiveAiTool('hook_lab')}
                  onOpenThumbnailLab={() => setActiveAiTool('thumbnail_lab')}
                />
              )}

              {activeAiTool === 'hook_lab' && (
                <HookLabWorkspace
                  clipId={clip.id}
                  projectId={clip.project_id}
                  editorProjectId={project.id}
                  clipTitle={clip.title || 'Clip'}
                  clipDurationSeconds={clip.duration_seconds}
                  onEditorProjectUpdated={onReloadData}
                />
              )}

              {activeAiTool === 'thumbnail_lab' && (
                <ThumbnailLabWorkspace
                  clipId={clip.id}
                  projectId={clip.project_id}
                  clipTitle={clip.title || 'Clip'}
                  clipDurationSeconds={clip.duration_seconds}
                />
              )}

              {activeAiTool === 'autopilot' && (
                <AutopilotWorkspace
                  clipId={clip.id}
                  projectId={clip.project_id}
                  clipTitle={clip.title || 'Clip'}
                  clipDurationSeconds={clip.duration_seconds}
                />
              )}

              {activeAiTool === 'ab_studio' && (
                <ABStudioWorkspace
                  clipId={clip.id}
                  projectId={clip.project_id}
                  clipTitle={clip.title || 'Clip'}
                  clipDurationSeconds={clip.duration_seconds}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* HORIZONTAL DIVIDER 3: Top of Timeline */}
      {!isTimelineCollapsed && (
        <div
          onPointerDown={handleStartResizeTimeline}
          className="h-2.5 -my-1 cursor-row-resize relative z-30 group flex items-center justify-center transition-all select-none shrink-0"
          title="Drag to adjust timeline height"
        >
          <div className="h-[1px] w-full bg-white/[0.08] group-hover:bg-violet-400 group-active:bg-violet-400 transition-colors" />
          <div className="absolute left-1/2 -translate-x-1/2 w-12 h-2 rounded-full bg-vc-surface2 border border-white/20 group-hover:border-violet-400 transition-all shadow-md flex items-center justify-center gap-0.5">
            <div className="w-0.5 h-1 bg-white/60 rounded-full" />
            <div className="w-0.5 h-1 bg-white/60 rounded-full" />
            <div className="w-0.5 h-1 bg-white/60 rounded-full" />
          </div>
        </div>
      )}

      {/* 3. MULTI-TRACK UNIFIED TIMELINE */}
      <UnifiedTimeline
        height={timelineHeight}
        project={project}
        clip={clip}
        sourceVideoUrl={cleanSourceUrl}
        playhead={currentTime}
        isPlaying={isPlaying}
        transportSlot={
          <PlaybackController
            currentTime={currentTime}
            duration={duration}
            isPlaying={isPlaying}
            onTogglePlay={togglePlay}
            onSeek={seek}
            onStepFrames={stepFrames}
            playbackRate={playbackRate}
            onChangePlaybackRate={setPlaybackRate}
            volume={volume}
            isMuted={isMuted}
            onChangeVolume={setVolume}
            onToggleMute={toggleMute}
            isLooping={isLooping}
            onToggleLoop={toggleLoop}
            showSafeGuides={showSafeGuides}
            onToggleSafeGuides={toggleSafeGuides}
            formatTime={formatTime}
          />
        }
        onPlayheadChange={seek}
        onTogglePlay={togglePlay}
        onUpdateProject={(up, options) => onUpdateProject(() => up, options)}
        onCommitProject={onCommitProject}
        onAddIntroOutro={handleAddIntroOutro}
        selectedItemId={selectedItemId}
        selectedTrackId={selectedTrackId}
        onSelectItem={(itemId, trackId) => selectItem(itemId, trackId)}
        onSplit={() => {
          if (selectedItemId && selectedTrackId) {
            onSplitTrackItem(selectedTrackId, selectedItemId, currentTime);
          }
        }}
        onFreezeFrame={handleFreezeFrame}
        onRippleDelete={() => {
          if (selectedItemId && selectedTrackId) {
            onRippleDeleteTrackItem(selectedTrackId, selectedItemId);
            clearSelection();
          }
        }}
        onDuplicate={() => {
          if (selectedItemId && selectedTrackId) {
            onDuplicateTrackItem(selectedTrackId, selectedItemId);
          }
        }}
        isCollapsed={isTimelineCollapsed}
        onToggleCollapse={handleToggleTimelineCollapse}
        onAddText={() => {
          handleAddTextLayer('New Text Overlay');
          setActiveSidebarTab('text');
        }}
      />

      {/* 4. EXPORT DIALOG */}
      <ExportDialog
        isOpen={isExportDialogOpen}
        onClose={() => {
          setIsExportDialogOpen(false);
          // Success/error feedback is transient: once dismissed, reopening shows
          // the settings view again (with the download row while the render is
          // current, or the stale notice when edits happened since).
          clearRenderStatus();
        }}
        clip={clip}
        project={project}
        duration={duration}
        isRendering={isRendering}
        renderProgress={renderProgress}
        renderStage={renderStage}
        renderError={renderError}
        renderSuccessMsg={renderSuccessMsg}
        onTriggerRender={async () => {
          // Flush pending edits first so export renders the caption preset the preview shows
          const saved = await onSaveNow();
          if (saved !== false) triggerRender();
        }}
        downloadUrl={renderedPreviewUrl}
        watermarkRequired={watermarkRequired}
        captionsEnabled={!project.tracks.find((t) => t.type === 'CAPTION')?.hidden}
        onToggleCaptions={handleToggleCaptions}
        downloadStale={exportStale || editorProjectStale}
      />

      {/* 5. COMMAND PALETTE (Cmd+K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSplit={() => {
          if (selectedItemId && selectedTrackId) {
            onSplitTrackItem(selectedTrackId, selectedItemId, currentTime);
          }
        }}
        onAddText={() => handleAddTextLayer('New Text Overlay')}
        onAddCaption={() => handleApplyCaptionPreset(DEFAULT_CAPTION_PRESET_ID)}
        onReframe={() => {}}
        onNormalizeAudio={() => {}}
        onOpenProducer={() => setActiveAiTool('producer')}
        onRender={() => setIsExportDialogOpen(true)}
        onUndo={onUndo}
        onRedo={onRedo}
      />

      {/* INTRO / OUTRO CHOICE POPOVER */}
      {introOutroMenu && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center glass-scrim"
          onClick={() => setIntroOutroMenu(null)}
        >
          <div
            className="glass-float rounded-3xl p-5 w-[320px]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={`Add ${introOutroMenu}`}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white capitalize">Add {introOutroMenu}</h3>
              <button
                type="button"
                onClick={() => setIntroOutroMenu(null)}
                className="p-1 rounded text-neutral-400 hover:text-white hover:bg-white/[0.06]"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleInsertTitleCard(introOutroMenu)}
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-vc-canvas border border-white/[0.08] hover:border-white/30 hover:bg-white/[0.06] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <TypeIcon className="w-5 h-5 text-neutral-300" />
                <span className="text-xs font-medium text-white">Title card</span>
                <span className="text-[10px] text-neutral-500 text-center leading-snug">Editable text on a solid background</span>
              </button>
              <button
                type="button"
                onClick={() => handlePickMediaForIntroOutro(introOutroMenu)}
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-vc-canvas border border-white/[0.08] hover:border-white/30 hover:bg-white/[0.06] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <Film className="w-5 h-5 text-zinc-300" />
                <span className="text-xs font-medium text-white">From media</span>
                <span className="text-[10px] text-neutral-500 text-center leading-snug">Pick a clip or image from your library</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
