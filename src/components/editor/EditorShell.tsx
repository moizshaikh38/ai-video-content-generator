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
import { applyPresetToEditorCaption, CaptionPresetId, DEFAULT_CAPTION_PRESET_ID } from '../../lib/captionPresets';
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

interface EditorShellProps {
  clip: RenderedClip;
  project: EditorProject;
  cleanSourceUrl: string | null;
  renderedPreviewUrl: string | null;
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
  } = useEditorRender({
    clipId: clip.id,
    onRenderComplete: () => {
      onReloadData({ silent: true });
    },
  });

  // Dialogs state
  const [isExportDialogOpen, setIsExportDialogOpen] = useState<boolean>(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
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
      setIsCommandPaletteOpen(false);
    },
  });

  // Apply Caption Preset: 'none' hides the caption track (captionEnabled=false on save),
  // any other preset re-enables it and swaps the style while keeping cues and position.
  const handleApplyCaptionPreset = (preset: CaptionPresetId) => {
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
      onUpdateItem={(itemId, updates) => {
        if (selectedTrackId) {
          onUpdateTrackItem(selectedTrackId, itemId, updates);
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
      hasWordTiming={hasWordTiming}
      onAddTextLayer={handleAddTextLayer}
      onUpdateCropMode={(_mode) => {
        onUpdateProject((prev) => ({
          ...prev,
          canvas: { ...prev.canvas },
        }));
      }}
    />
  );

  // Transcript lives in a persistent right-hand dock, independent of the selected tool, so it
  // never disappears when the user switches to Captions / Audio / B-roll / AI tools.
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
    <div className="flex flex-col h-screen w-screen bg-[#07080D] text-white overflow-hidden font-sans select-none">
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
                onUpdateProject((prev) => ({
                  ...prev,
                  tracks: prev.tracks.map((t) => {
                    if (t.type === 'VIDEO') {
                      return {
                        ...t,
                        items: t.items.map((i) => ({ ...i, crop_mode: mode })),
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
        <div className="flex-1 flex flex-col min-w-0 bg-[#08090B] overflow-hidden relative">
          <PreviewCanvas
            project={project}
            playhead={currentTime}
            isPlaying={isPlaying}
            sourceOffset={sourceOffset}
            cleanSourceUrl={cleanSourceUrl}
            renderedPreviewUrl={renderedPreviewUrl}
            viewMode={viewMode}
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
              onUpdateProject((prev) => ({
                ...prev,
                tracks: prev.tracks.map((t) =>
                  t.type === 'VIDEO'
                    ? { ...t, items: t.items.map((i) => ({ ...i, crop_mode: mode })) }
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
          <div className="w-10 shrink-0 glass-rail flex flex-col items-center py-3 z-20 border-l border-white/[0.08] bg-[#07080D]/95">
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
          <div className="w-[320px] md:w-[340px] xl:w-[360px] shrink-0 glass-dock flex flex-col min-h-0 z-20 border-l border-white/[0.08] bg-[#07080D]/95 backdrop-blur-md">
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">{transcriptPanel}</div>
          </div>
        )}

        {/* FULLSCREEN / EXPANDED AI WORKSPACE MODAL OVERLAY */}
        {activeSidebarTab === 'ai_tools' && activeAiTool !== 'copilot' && (
          <div className="absolute inset-0 z-40 bg-[#07080D]/95 flex flex-col overflow-hidden animate-fadeIn">
            {/* Header */}
            <div className="h-12 px-6 border-b border-white/[0.08] flex items-center justify-between bg-[#0E1017]">
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
          <div className="absolute left-1/2 -translate-x-1/2 w-12 h-2 rounded-full bg-[#12141C] border border-white/20 group-hover:border-violet-400 transition-all shadow-md flex items-center justify-center gap-0.5">
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
        onClose={() => setIsExportDialogOpen(false)}
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setIntroOutroMenu(null)}
        >
          <div
            className="bg-[#0E1017] border border-white/[0.1] rounded-2xl p-5 w-[320px] shadow-2xl"
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
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-[#07080D] border border-white/[0.08] hover:border-white/30 hover:bg-white/[0.06] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <TypeIcon className="w-5 h-5 text-neutral-300" />
                <span className="text-xs font-medium text-white">Title card</span>
                <span className="text-[10px] text-neutral-500 text-center leading-snug">Editable text on a solid background</span>
              </button>
              <button
                type="button"
                onClick={() => handlePickMediaForIntroOutro(introOutroMenu)}
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-[#07080D] border border-white/[0.08] hover:border-white/30 hover:bg-white/[0.06] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <Film className="w-5 h-5 text-sky-400" />
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
