import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Scissors,
  Trash2,
  Copy,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Snowflake,
  Camera,
  Layers,
  Music,
  Video,
  Type as TypeIcon,
  Subtitles,
  Image as ImageIcon,
  Plus,
  ChevronDown,
  ChevronUp,
  Link2,
  Square,
} from 'lucide-react';
import {
  EditorProject,
  EditorTrackType,
  RenderedClip,
} from '../../types';
import { UpdateProjectOptions } from '../../hooks/useEditorProject';
import { WaveformClip } from './WaveformClip';
import { FilmstripClip } from './FilmstripClip';
import {
  collectSnapPoints,
  rulerXToTime,
  snapToPoints,
} from '../../../server/src/shared/timelineCoords';

interface TimelineProps {
  project: EditorProject;
  /** Source clip for this editor session; its window backs the audio waveform overlay. */
  clip?: RenderedClip | null;
  playhead: number;
  isPlaying: boolean;
  onPlayheadChange: (time: number) => void;
  onTogglePlay: () => void;
  onUpdateProject: (updated: EditorProject, options?: UpdateProjectOptions) => void;
  selectedItemId: string | null;
  onSelectItem: (itemId: string | null, trackId: string | null) => void;
  onSplit: () => void;
  onRippleDelete: () => void;
  onDuplicate: () => void;
  onFreezeFrame?: () => void;
  onSnapshot?: () => void;
  /** Shared transport group rendered in the toolbar centre (see PlaybackController). */
  transportSlot?: React.ReactNode;
  onCommitProject?: (preOperationProject: EditorProject) => void;
  /** Opens the intro/outro insert flow (title card or pick from media). */
  onAddIntroOutro?: (position: 'intro' | 'outro') => void;
  /** Triggers adding a text overlay or opening text studio */
  onAddText?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Timeline: React.FC<TimelineProps> = ({
  project,
  clip,
  playhead,
  isPlaying: _isPlaying,
  onPlayheadChange,
  onTogglePlay: _onTogglePlay,
  onUpdateProject,
  selectedItemId,
  onSelectItem,
  onSplit,
  onRippleDelete,
  onDuplicate,
  onFreezeFrame,
  onSnapshot,
  transportSlot,
  onCommitProject,
  onAddIntroOutro,
  onAddText,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  // Zoom: pixels per second (min 20px, max 240px)
  const [pixelsPerSec, setPixelsPerSec] = useState<number>(60);
  const containerRef = useRef<HTMLDivElement>(null);
  const tracksScrollRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  // Project state at the moment a drag began, committed once on release so a whole
  // drag is a single undo step instead of one per pointer-move.
  const preDragProjectRef = useRef<EditorProject | null>(null);

  const handleTracksScroll = () => {};

  // Dragging state for trimming or moving
  const [dragState, setDragState] = useState<{
    type: 'move' | 'trim-left' | 'trim-right';
    trackId: string;
    itemId: string;
    initialMouseX: number;
    initialStart: number;
    initialEnd: number;
    initialSourceStart: number;
    initialSourceEnd: number;
  } | null>(null);

  // Snapping indicator line position (in pixels)
  const [snapIndicatorX, setSnapIndicatorX] = useState<number | null>(null);

  // Left inset to accommodate the flanking Add Intro button matching Opus.pro
  const TRACK_INSET_LEFT = 48;
  const duration = Math.max(project.canvas.duration || 10, 10);
  const timelineWidth = Math.max(TRACK_INSET_LEFT + duration * pixelsPerSec + 80, 800);

  // Per-track lane heights: video track is tall (80px) so thumbnails are fully visible
  const VIDEO_LANE_H = 80;
  const WAVE_LANE_H = 48;
  const DEFAULT_LANE_H = 48;
  const laneHeight = (type: EditorTrackType) => (type === 'VIDEO' ? VIDEO_LANE_H : DEFAULT_LANE_H);

  // Determines if a track item belongs to the primary source clip rather than an external asset/B-roll
  const isPrimaryClipItem = useCallback(
    (item: (typeof project.tracks)[number]['items'][number]): boolean => {
      if (!clip?.id) return false;
      // Explicit clip ID match
      if (item.source_asset_id && item.source_asset_id === clip.id) return true;
      // Explicit storage path match
      if (clip.source_storage_path && item.source_path === clip.source_storage_path) return true;
      // Items initialized without an external URL or asset ID
      if (!item.source_asset_id && !item.source_path) return true;
      return false;
    },
    [clip?.id, clip?.source_storage_path]
  );

  // The main video item carries the clip's embedded dialogue. When there is no dedicated
  // audio track, we render the dialogue waveform in its own full-width lane under the video
  // (separate from the filmstrip), matching a standard NLE layout.
  const mainVideoTrack = project.tracks.find(
    (t) => t.type === 'VIDEO' && t.items.some((i) => isPrimaryClipItem(i) && i.source_end > i.source_start)
  );
  const mainVideoItem =
    mainVideoTrack?.items.find((i) => isPrimaryClipItem(i) && i.source_end > i.source_start) || null;
  const hasAudioTrack = project.tracks.some((t) => t.type === 'AUDIO');
  const showDialogueLane = Boolean(clip?.id && mainVideoItem && !hasAudioTrack);

  // Flattened render rows: each track, plus a synthetic dialogue-waveform row after the video.
  type RenderRow =
    | { kind: 'track'; track: (typeof project.tracks)[number]; height: number }
    | { kind: 'wave'; height: number };
  const renderRows: RenderRow[] = [];
  for (const track of project.tracks) {
    renderRows.push({ kind: 'track', track, height: laneHeight(track.type) });
    if (showDialogueLane && mainVideoTrack && track.id === mainVideoTrack.id) {
      renderRows.push({ kind: 'wave', height: WAVE_LANE_H });
    }
  }

  // Snap a target time to nearby clip edges / playhead / zero (shared pure helpers).
  const snapTime = useCallback(
    (targetTime: number, excludeItemId?: string): { time: number; snapped: boolean } => {
      const enabled = project.settings?.snapping ?? true;
      const tolerance = project.settings?.snap_tolerance_sec || 0.15;
      const points = collectSnapPoints(project.tracks, playhead, excludeItemId);
      return snapToPoints(targetTime, points, tolerance, enabled);
    },
    [project.settings, project.tracks, playhead]
  );

  // Mouse move handler for dragging / trimming
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragState) return;

      const deltaX = e.clientX - dragState.initialMouseX;
      const deltaTime = deltaX / pixelsPerSec;

      const targetTrack = project.tracks.find((t) => t.id === dragState.trackId);
      if (!targetTrack || targetTrack.locked) return;

      const itemIndex = targetTrack.items.findIndex((i) => i.id === dragState.itemId);
      if (itemIndex === -1) return;

      const item = targetTrack.items[itemIndex];
      const newTracks = [...project.tracks];
      const updatedTrack = { ...targetTrack, items: [...targetTrack.items] };

      if (dragState.type === 'move') {
        const itemDuration = dragState.initialEnd - dragState.initialStart;
        let newStart = Math.max(0, dragState.initialStart + deltaTime);
        const snapRes = snapTime(newStart, item.id);
        if (snapRes.snapped) {
          newStart = snapRes.time;
          setSnapIndicatorX(newStart * pixelsPerSec);
        } else {
          setSnapIndicatorX(null);
        }
        const newEnd = newStart + itemDuration;

        updatedTrack.items[itemIndex] = {
          ...item,
          timeline_start: Math.round(newStart * 1000) / 1000,
          timeline_end: Math.round(newEnd * 1000) / 1000,
        };
      } else if (dragState.type === 'trim-left') {
        let proposedStart = dragState.initialStart + deltaTime;
        proposedStart = Math.max(0, Math.min(proposedStart, item.timeline_end - 0.2));
        const snapRes = snapTime(proposedStart, item.id);
        if (snapRes.snapped) {
          proposedStart = snapRes.time;
          setSnapIndicatorX(proposedStart * pixelsPerSec);
        } else {
          setSnapIndicatorX(null);
        }

        const deltaSource = proposedStart - dragState.initialStart;
        const newSourceStart = Math.max(0, dragState.initialSourceStart + deltaSource);

        updatedTrack.items[itemIndex] = {
          ...item,
          timeline_start: Math.round(proposedStart * 1000) / 1000,
          source_start: Math.round(newSourceStart * 1000) / 1000,
        };
      } else if (dragState.type === 'trim-right') {
        let proposedEnd = dragState.initialEnd + deltaTime;
        proposedEnd = Math.max(item.timeline_start + 0.2, proposedEnd);
        const snapRes = snapTime(proposedEnd, item.id);
        if (snapRes.snapped) {
          proposedEnd = snapRes.time;
          setSnapIndicatorX(proposedEnd * pixelsPerSec);
        } else {
          setSnapIndicatorX(null);
        }

        const deltaSource = proposedEnd - dragState.initialEnd;
        const newSourceEnd = Math.max(item.source_start + 0.2, dragState.initialSourceEnd + deltaSource);

        updatedTrack.items[itemIndex] = {
          ...item,
          timeline_end: Math.round(proposedEnd * 1000) / 1000,
          source_end: Math.round(newSourceEnd * 1000) / 1000,
        };
      }

      const trackIdx = newTracks.findIndex((t) => t.id === targetTrack.id);
      newTracks[trackIdx] = updatedTrack;
      // Live preview only — no history/dirty churn mid-drag; committed once on release.
      onUpdateProject({ ...project, tracks: newTracks }, { recordHistory: false, markAsDirty: false });
    };

    const handleMouseUp = () => {
      // Record exactly one undo step for the whole drag, and mark dirty for autosave.
      if (preDragProjectRef.current) {
        const changed =
          JSON.stringify(preDragProjectRef.current.tracks) !== JSON.stringify(project.tracks);
        if (changed && onCommitProject) {
          onCommitProject(preDragProjectRef.current);
        }
        preDragProjectRef.current = null;
      }
      setDragState(null);
      setSnapIndicatorX(null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape cancels an in-progress drag, restoring the pre-drag state with no undo entry.
      if (e.key === 'Escape' && dragState && preDragProjectRef.current) {
        e.preventDefault();
        onUpdateProject(preDragProjectRef.current, { recordHistory: false, markAsDirty: false });
        preDragProjectRef.current = null;
        setDragState(null);
        setSnapIndicatorX(null);
      }
    };

    if (dragState) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('blur', handleMouseUp);
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('blur', handleMouseUp);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [dragState, pixelsPerSec, project, snapTime, onUpdateProject, onCommitProject]);

  // Handle Playhead Scrubbing on Ruler
  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!rulerRef.current) return;
    // The ruler lives inside the horizontally-scrolled content, so its bounding rect
    // already reflects scrollLeft; subtracting TRACK_INSET_LEFT maps back to zero-based time.
    const rect = rulerRef.current.getBoundingClientRect();
    const newTime = rulerXToTime(e.clientX - rect.left - TRACK_INSET_LEFT, pixelsPerSec, duration);
    onPlayheadChange(Math.round(newTime * 100) / 100);
  };

  // Toggle track properties (lock, mute, hide)
  const toggleTrackProperty = (trackId: string, prop: 'locked' | 'muted' | 'hidden') => {
    const updated = project.tracks.map((t) =>
      t.id === trackId ? { ...t, [prop]: !t[prop] } : t
    );
    onUpdateProject({ ...project, tracks: updated });
  };

  // Track Type Icons and Styles
  const getTrackIcon = (type: EditorTrackType) => {
    switch (type) {
      case 'VIDEO':
        return <Video className="w-3.5 h-3.5 text-blue-400" />;
      case 'AUDIO':
        return <Music className="w-3.5 h-3.5 text-emerald-400" />;
      case 'TEXT':
        return <TypeIcon className="w-3.5 h-3.5 text-purple-400" />;
      case 'CAPTION':
        return <Subtitles className="w-3.5 h-3.5 text-neutral-300" />;
      case 'IMAGE':
      case 'OVERLAY':
        return <ImageIcon className="w-3.5 h-3.5 text-rose-400" />;
      default:
        return <Layers className="w-3.5 h-3.5 text-neutral-400" />;
    }
  };

  // Track hues identify the lane type only. They deliberately avoid the semantic accents —
  // violet (AI), emerald (success) and amber (warning) — so colour never lies about meaning.
  // Selection is the neutral titanium ring, consistent with primary actions elsewhere.
  const getItemColor = (type: EditorTrackType, isSelected: boolean) => {
    const selectedRing = 'ring-2 ring-white/70 border-white/80 shadow-lg shadow-black/40';
    if (isSelected) {
      switch (type) {
        case 'VIDEO':
          return `bg-sky-900/70 ${selectedRing}`;
        case 'AUDIO':
          return `bg-cyan-900/70 ${selectedRing}`;
        case 'TEXT':
          return `bg-indigo-900/70 ${selectedRing}`;
        case 'CAPTION':
          return `bg-neutral-900/95 ${selectedRing}`;
        case 'IMAGE':
        case 'OVERLAY':
          return `bg-fuchsia-900/70 ${selectedRing}`;
        default:
          return `bg-neutral-800 ${selectedRing}`;
      }
    }
    switch (type) {
      case 'VIDEO':
        return 'bg-sky-900/55 border-sky-500/50 hover:bg-sky-900/75 hover:border-sky-400/70';
      case 'AUDIO':
        return 'bg-cyan-900/55 border-cyan-500/50 hover:bg-cyan-900/75 hover:border-cyan-400/70';
      case 'TEXT':
        return 'bg-indigo-900/55 border-indigo-500/50 hover:bg-indigo-900/75 hover:border-indigo-400/70';
      case 'CAPTION':
        return 'bg-neutral-900/80 border-white/15 hover:border-white/30';
      case 'IMAGE':
      case 'OVERLAY':
        return 'bg-fuchsia-900/55 border-fuchsia-500/50 hover:bg-fuchsia-900/75 hover:border-fuchsia-400/70';
      default:
        return 'bg-neutral-800 border-white/10 hover:bg-neutral-700';
    }
  };

  // Generate ruler marks based on current zoom matching Opus.pro
  // Major intervals (0, 60, 120 or dynamic zoom steps) with 5 intermediate tick dots
  const RULER_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  const MIN_LABEL_GAP_PX = 72;

  const renderRulerTicks = () => {
    const ticks = [];
    const step =
      RULER_STEPS.find((s) => s * pixelsPerSec >= MIN_LABEL_GAP_PX) ??
      RULER_STEPS[RULER_STEPS.length - 1];

    for (let sec = 0; sec <= duration; sec += step) {
      const left = TRACK_INSET_LEFT + sec * pixelsPerSec;
      const mins = Math.floor(sec / 60);
      const secs = Math.floor(sec % 60);
      const label =
        sec === 0
          ? '0'
          : sec >= 60
          ? sec % 60 === 0
            ? `${sec}`
            : `${mins}:${secs.toString().padStart(2, '0')}`
          : `${sec}`;

      // Major time label
      ticks.push(
        <div
          key={`major-${sec}`}
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 text-[11px] font-mono tabular-nums text-neutral-400 select-none pointer-events-none"
          style={{ left: `${left}px` }}
        >
          {label}
        </div>
      );

      // 5 intermediate tick dots between this major step and the next matching Opus
      if (sec + step <= duration) {
        for (let k = 1; k <= 5; k++) {
          const dotSec = sec + (k * step) / 6;
          const dotLeft = TRACK_INSET_LEFT + dotSec * pixelsPerSec;
          ticks.push(
            <div
              key={`dot-${sec}-${k}`}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white/20 select-none pointer-events-none"
              style={{ left: `${dotLeft}px` }}
            />
          );
        }
      }
    }
    return ticks;
  };

  return (
    <div
      ref={containerRef}
      className="flex flex-col bg-[#0A0B0E] border-t border-white/[0.07] select-none overflow-hidden h-full flex-1"
    >
      {/* TIMELINE TOOLBAR — three true zones matching Opus.pro:
          Left: [📹 Hide timeline] | [⬚] [🔗] [🗑️] [✂️] [📋]
          Center: [⏮] [▶] [⏭] 01:07.03 / 02:23.08
          Right: [🔍-] [====O====] [🔍+] [⤢] */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-1.5 bg-[#090A0E] border-b border-white/[0.07] text-xs">
        {/* Left: edit actions */}
        <div className="flex items-center gap-1.5 justify-self-start min-w-0 overflow-x-auto no-scrollbar">
          {/* Hide timeline toggle button matching Opus */}
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label={isCollapsed ? 'Show Timeline' : 'Hide Timeline'}
              title={isCollapsed ? 'Show Timeline' : 'Hide timeline'}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 hover:text-white text-xs font-medium border border-white/[0.06] transition shrink-0"
            >
              <Video className="w-3.5 h-3.5 text-neutral-400" />
              <span>{isCollapsed ? 'Show Timeline' : 'Hide timeline'}</span>
            </button>
          )}

          <div className="w-[1px] h-4 bg-white/10 mx-1 shrink-0" />

          {/* Frame/aspect tool */}
          <button
            type="button"
            className="p-1.5 rounded-md hover:bg-white/[0.08] text-neutral-400 hover:text-white transition shrink-0"
            title="Frame"
            aria-label="Frame"
          >
            <Square className="w-3.5 h-3.5" />
          </button>

          {/* Link tool */}
          <button
            type="button"
            className="p-1.5 rounded-md hover:bg-white/[0.08] text-neutral-400 hover:text-white transition shrink-0"
            title="Link tracks"
            aria-label="Link tracks"
          >
            <Link2 className="w-3.5 h-3.5" />
          </button>

          {/* Delete button */}
          <button
            type="button"
            onClick={onRippleDelete}
            disabled={!selectedItemId}
            title="Ripple Delete Clip"
            aria-label="Ripple Delete Clip"
            className="p-1.5 rounded-md hover:bg-white/[0.08] text-neutral-400 hover:text-red-400 disabled:opacity-30 transition shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {/* Split button (prominent in Opus style) */}
          <button
            type="button"
            onClick={onSplit}
            disabled={!selectedItemId}
            title="Split Clip at Playhead (S)"
            aria-label="Split Clip at Playhead"
            className={`p-1.5 rounded-md transition shrink-0 ${
              selectedItemId
                ? 'bg-[#232734] border border-white/[0.1] text-white hover:bg-[#2C3142] shadow-sm'
                : 'hover:bg-white/[0.08] text-neutral-400 disabled:opacity-30'
            }`}
          >
            <Scissors className="w-3.5 h-3.5" />
          </button>

          {/* Duplicate button */}
          <button
            type="button"
            onClick={onDuplicate}
            disabled={!selectedItemId}
            title="Duplicate Selected Clip"
            aria-label="Duplicate Selected Clip"
            className="p-1.5 rounded-md hover:bg-white/[0.08] text-neutral-400 hover:text-white disabled:opacity-30 transition shrink-0"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>

          {/* Freeze Frame */}
          {onFreezeFrame && (
            <button
              type="button"
              onClick={onFreezeFrame}
              disabled={!selectedItemId}
              title="Freeze Frame at Playhead"
              aria-label="Freeze Frame at Playhead"
              className="p-1.5 rounded-md hover:bg-white/[0.08] disabled:opacity-30 text-neutral-400 hover:text-sky-300 transition shrink-0"
            >
              <Snowflake className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Snapshot */}
          {onSnapshot && (
            <button
              type="button"
              onClick={onSnapshot}
              disabled={!selectedItemId}
              title="Export Current Frame as Image"
              aria-label="Export Current Frame as Image"
              className="p-1.5 rounded-md hover:bg-white/[0.08] disabled:opacity-30 text-neutral-400 hover:text-teal-300 transition shrink-0"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Center: shared transport (play/pause, stepping, timecode, settings) */}
        <div className="justify-self-center">{transportSlot}</div>

        {/* Right: zoom & collapse */}
        <div className="flex items-center gap-2.5 justify-self-end min-w-0">
          <button
            type="button"
            onClick={() => setPixelsPerSec((p) => Math.max(20, p - 20))}
            className="p-1 text-neutral-400 hover:text-white transition"
            title="Zoom Out"
            aria-label="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <div className="relative flex items-center">
            <input
              type="range"
              min="20"
              max="200"
              value={pixelsPerSec}
              onChange={(e) => setPixelsPerSec(parseInt(e.target.value, 10))}
              className="w-24 h-1.5 bg-[#232734] rounded-full appearance-none cursor-pointer accent-white hover:bg-[#2C3142] transition-colors"
              title="Timeline Zoom Slider"
              aria-label="Timeline Zoom"
            />
          </div>
          <button
            type="button"
            onClick={() => setPixelsPerSec((p) => Math.min(200, p + 20))}
            className="p-1 text-neutral-400 hover:text-white transition"
            title="Zoom In"
            aria-label="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (containerRef.current) {
                const availableW = containerRef.current.clientWidth - (TRACK_INSET_LEFT + 80);
                setPixelsPerSec(Math.max(20, Math.floor(availableW / duration)));
              }
            }}
            className="p-1 text-neutral-400 hover:text-white transition ml-0.5"
            title="Fit to Timeline"
            aria-label="Fit to Timeline"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          {/* Collapse / Expand Timeline Toggle */}
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label={isCollapsed ? 'Show Timeline' : 'Hide Timeline'}
              title={isCollapsed ? 'Show Timeline' : 'Hide Timeline'}
              className="p-1 rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.06] transition ml-1"
            >
              {isCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* TIMELINE BODY: FULL-WIDTH TRACKS CANVAS */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* TIMELINE TRACKS AREA (FULL-WIDTH SCROLLABLE) */}
        <div
          ref={tracksScrollRef}
          onScroll={handleTracksScroll}
          className="flex-1 overflow-x-auto overflow-y-auto relative bg-neutral-950/80 select-none"
        >
          <div
            className="relative"
            style={{ width: `${timelineWidth}px`, minHeight: '100%' }}
          >
            {/* RULER */}
            <div
              ref={rulerRef}
              onClick={handleRulerClick}
              className="h-7 border-b border-white/[0.07] bg-[#0C0D11]/80 sticky top-0 z-30 cursor-pointer overflow-hidden relative"
            >
              {renderRulerTicks()}
            </div>

            {/* SNAP INDICATOR LINE */}
            {snapIndicatorX !== null && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-yellow-400 z-40 pointer-events-none shadow-[0_0_8px_rgba(250,204,21,0.8)]"
                style={{ left: `${TRACK_INSET_LEFT + snapIndicatorX}px` }}
              />
            )}

            {/* PLAYHEAD SCRUBBER (VERTICAL CAPSULE PILL HEAD + 1PX NEEDLE MATCHING OPUS) */}
            <div
              className="absolute top-0 bottom-0 z-40 pointer-events-none flex flex-col items-center"
              style={{
                left: `${TRACK_INSET_LEFT + playhead * pixelsPerSec}px`,
                transform: 'translateX(-50%)',
              }}
            >
              {/* Vertical capsule pill head matching Opus.pro reference */}
              <div
                className="w-3.5 h-5 rounded-full border-2 border-white bg-[#0A0C11] -mt-1 shadow-sm flex items-center justify-center cursor-ew-resize select-none pointer-events-auto"
                aria-label="Playhead scrubber"
              >
                <div className="w-0.5 h-1.5 bg-white/50 rounded-full" />
              </div>
              {/* Razor-thin 1px vertical needle */}
              <div className="w-px flex-1 bg-white shadow-[0_0_8px_rgba(255,255,255,0.55)]" />
            </div>

            {/* TRACK LANES */}
            <div className="flex flex-col gap-1.5 pt-1.5">
              {renderRows.map((row) => {
                if (row.kind === 'wave') {
                  if (!mainVideoTrack || !clip) return null;
                  const primaryItems = mainVideoTrack.items.filter(
                    (i) => isPrimaryClipItem(i) && i.source_end > i.source_start
                  );
                  if (primaryItems.length === 0) return null;
                  return (
                    <div
                      key="dialogue-wave-lane"
                      style={{ height: row.height }}
                      className="relative group/waveRow"
                    >
                      {/* Dialogue Audio Hover Badge */}
                      <div className="sticky left-2 top-0.5 z-20 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#0E1017]/90 border border-white/[0.08] backdrop-blur-md text-[10px] text-emerald-400 font-medium shadow pointer-events-none opacity-0 group-hover/waveRow:opacity-100 transition-opacity">
                        <Music className="w-3 h-3" />
                        <span>Dialogue Audio</span>
                      </div>
                      {primaryItems.map((item) => {
                        const waveLeft = TRACK_INSET_LEFT + item.timeline_start * pixelsPerSec;
                        const waveWidth = Math.max(8, (item.timeline_end - item.timeline_start) * pixelsPerSec);
                        return (
                          <div
                            key={`dialogue-wave-${item.id}`}
                            className="absolute top-0 bottom-0 rounded-lg overflow-hidden bg-[#12151E] border border-white/[0.08]"
                            style={{ left: `${waveLeft}px`, width: `${waveWidth}px` }}
                          >
                            <WaveformClip
                              clipId={clip.id}
                              windowStart={clip.start_seconds}
                              sourceStart={item.source_start}
                              sourceEnd={item.source_end}
                              width={waveWidth}
                              color="rgba(192, 197, 216, 0.75)"
                              enabled={!item.muted}
                            />
                          </div>
                        );
                      })}
                    </div>
                  );
                }
                const track = row.track;
                const isVideoRow = track.id === mainVideoTrack?.id;
                return (
                <div
                  key={track.id}
                  style={{
                    height: row.height,
                    backgroundColor: track.locked ? 'rgba(0,0,0,0.3)' : 'transparent',
                  }}
                  className={`relative group/trackRow transition ${
                    track.hidden ? 'opacity-30' : ''
                  }`}
                  onClick={() => onSelectItem(null, track.id)}
                >
                  {/* Clean Track Controls on Hover */}
                  <div
                    className={`sticky left-2 top-1.5 z-20 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#0E1017]/90 border border-white/[0.08] backdrop-blur-md text-[10px] text-neutral-400 transition-opacity shadow pointer-events-auto ${
                      track.muted || track.locked || track.hidden ? 'opacity-100' : 'opacity-0 group-hover/trackRow:opacity-100'
                    }`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="flex items-center gap-1 font-medium text-neutral-300">
                      {getTrackIcon(track.type)}
                      <span className="truncate max-w-[70px]">{track.name}</span>
                    </span>

                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => toggleTrackProperty(track.id, 'muted')}
                        title={track.muted ? 'Unmute Track' : 'Mute Track'}
                        className={`p-0.5 rounded hover:bg-neutral-800 transition ${
                          track.muted ? 'text-red-400' : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        {track.muted ? <VolumeX className="w-2.5 h-2.5" /> : <Volume2 className="w-2.5 h-2.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleTrackProperty(track.id, 'locked')}
                        title={track.locked ? 'Unlock Track' : 'Lock Track'}
                        className={`p-0.5 rounded hover:bg-neutral-800 transition ${
                          track.locked ? 'text-amber-400' : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        {track.locked ? <Lock className="w-2.5 h-2.5" /> : <Unlock className="w-2.5 h-2.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleTrackProperty(track.id, 'hidden')}
                        title={track.hidden ? 'Show Track' : 'Hide Track'}
                        className={`p-0.5 rounded hover:bg-neutral-800 transition ${
                          track.hidden ? 'text-neutral-500' : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        {track.hidden ? <EyeOff className="w-2.5 h-2.5" /> : <Eye className="w-2.5 h-2.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Add Intro / Add Outro affordances flanking the main video track matching Opus */}
                  {isVideoRow && onAddIntroOutro && (
                    <>
                      <button
                        type="button"
                        title="Add intro"
                        aria-label="Add intro"
                        onClick={(e) => { e.stopPropagation(); onAddIntroOutro('intro'); }}
                        className="absolute left-2 top-1/2 -translate-y-1/2 z-30 w-8 h-8 rounded-lg bg-[#141724] hover:bg-[#1E2336] border border-white/[0.08] hover:border-white/20 text-neutral-400 hover:text-white flex items-center justify-center transition shadow-sm"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        title="Add outro"
                        aria-label="Add outro"
                        onClick={(e) => { e.stopPropagation(); onAddIntroOutro('outro'); }}
                        style={{ left: `${TRACK_INSET_LEFT + duration * pixelsPerSec + 10}px` }}
                        className="absolute top-1/2 -translate-y-1/2 z-30 w-8 h-8 rounded-lg bg-[#141724] hover:bg-[#1E2336] border border-white/[0.08] hover:border-white/20 text-neutral-400 hover:text-white flex items-center justify-center transition shadow-sm"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </>
                  )}

                  {/* Empty-state hint for overlay / audio lanes with no clips yet */}
                  {track.items.length === 0 &&
                    (track.type === 'AUDIO' || track.type === 'OVERLAY' || track.type === 'IMAGE') && (
                      <div className="absolute inset-0 flex items-center pl-3 pointer-events-none">
                        <span className="text-[10px] text-neutral-600 italic">
                          {track.type === 'AUDIO' ? 'No audio clips on this track' : 'No overlays on this track'}
                        </span>
                      </div>
                    )}

                  {/* Empty-state affordance for Text & Titles track */}
                  {track.type === 'TEXT' && track.items.length === 0 && (
                    <div className="absolute inset-0 flex items-center pl-3">
                      {onAddText ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddText();
                          }}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-dashed border-neutral-700 hover:border-neutral-500 bg-neutral-900/60 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 text-[11px] font-medium transition cursor-pointer"
                          title="Add text overlay at playhead"
                          aria-label="Add text overlay"
                        >
                          <Plus className="w-3 h-3 text-neutral-400" />
                          <span>Add Text / Title</span>
                        </button>
                      ) : (
                        <span className="text-[10px] text-neutral-600 italic">No text overlays</span>
                      )}
                    </div>
                  )}

                  {/* Track items */}
                  {track.items.map((item) => {
                    const itemWidth = Math.max(
                      8,
                      (item.timeline_end - item.timeline_start) * pixelsPerSec
                    );
                    const itemLeft = TRACK_INSET_LEFT + item.timeline_start * pixelsPerSec;
                    const isSelected = selectedItemId === item.id;
                    // Items backed by the clip's own source (dialogue / main video): the cached
                    // filmstrip + waveform cover these. Uploaded assets carry a separate source_asset_id.
                    const isClipSource =
                      !track.hidden &&
                      Boolean(clip?.id) &&
                      isPrimaryClipItem(item) &&
                      item.source_end > item.source_start;
                    const showFilmstrip = track.type === 'VIDEO' && isClipSource;
                    const showAudioWave = track.type === 'AUDIO' && isClipSource && !item.muted;
                    // Uploaded music / SFX clips: draw their own cached asset waveform.
                    const showAssetWave =
                      track.type === 'AUDIO' &&
                      !track.hidden &&
                      !item.muted &&
                      Boolean(item.source_asset_id && item.source_asset_id !== clip?.id) &&
                      item.source_end > item.source_start;
                    // Clips that draw real media carry their own identity, so they skip the
                    // coloured fill and keep only a hairline — the frames/waveform stay legible
                    // and the lane reads as a continuous strip rather than a row of cards.
                    const hasMedia = showFilmstrip || showAudioWave || showAssetWave;

                    return (
                      <div
                        key={item.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectItem(item.id, track.id);
                        }}
                        onMouseDown={(e) => {
                          if (track.locked) return;
                          e.stopPropagation();
                          onSelectItem(item.id, track.id);
                          preDragProjectRef.current = project;
                          setDragState({
                            type: 'move',
                            trackId: track.id,
                            itemId: item.id,
                            initialMouseX: e.clientX,
                            initialStart: item.timeline_start,
                            initialEnd: item.timeline_end,
                            initialSourceStart: item.source_start,
                            initialSourceEnd: item.source_end,
                          });
                        }}
                        style={{
                          left: `${itemLeft}px`,
                          width: `${itemWidth}px`,
                        }}
                        className={`absolute top-1 bottom-1 rounded-lg border text-xs flex items-center overflow-hidden cursor-move select-none transition-shadow ${
                          hasMedia
                            ? isSelected
                              ? 'bg-[#12151E] ring-2 ring-white border-white/90 shadow-xl shadow-black/50'
                              : 'bg-[#12151E] border-white/10 hover:border-white/25'
                            : getItemColor(track.type, isSelected)
                        }`}
                      >
                        {/* Video thumbnail filmstrip (fills the entire clip height edge-to-edge) */}
                        {showFilmstrip && clip && (
                          <FilmstripClip
                            clipId={clip.id}
                            windowStart={clip.start_seconds}
                            sourceStart={item.source_start}
                            sourceEnd={item.source_end}
                            width={itemWidth}
                            enabled={showFilmstrip}
                          />
                        )}

                        {/* Floating Fill layout badge at top-left matching Opus.pro */}
                        {showFilmstrip && (
                          <div className="absolute left-2.5 top-1.5 z-20 pointer-events-none">
                            <span className="px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-medium text-white shadow">
                              Fill
                            </span>
                          </div>
                        )}

                        {/* Full-height audio waveform for dialogue audio-track clips */}
                        {showAudioWave && clip && (
                          <WaveformClip
                            clipId={clip.id}
                            windowStart={clip.start_seconds}
                            sourceStart={item.source_start}
                            sourceEnd={item.source_end}
                            width={itemWidth}
                            color="rgba(255,255,255,0.4)"
                            enabled={showAudioWave}
                          />
                        )}

                        {/* Full-height waveform for uploaded music / SFX clips */}
                        {showAssetWave && (
                          <WaveformClip
                            clipId={null}
                            assetId={item.source_asset_id}
                            windowStart={0}
                            sourceStart={item.source_start}
                            sourceEnd={item.source_end}
                            width={itemWidth}
                            color="rgba(255,255,255,0.45)"
                            enabled={showAssetWave}
                          />
                        )}

                        {/* Left Trim Handle */}
                        {!track.locked && (
                          <div
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              onSelectItem(item.id, track.id);
                              preDragProjectRef.current = project;
                              setDragState({
                                type: 'trim-left',
                                trackId: track.id,
                                itemId: item.id,
                                initialMouseX: e.clientX,
                                initialStart: item.timeline_start,
                                initialEnd: item.timeline_end,
                                initialSourceStart: item.source_start,
                                initialSourceEnd: item.source_end,
                              });
                            }}
                            className="absolute left-0 top-0 bottom-0 w-2.5 bg-white/20 hover:bg-white/80 cursor-ew-resize z-20 flex items-center justify-center transition rounded-l-[2px]"
                            title="Trim Start"
                          >
                            <div className="w-0.5 h-3.5 bg-white/70 rounded-full" />
                          </div>
                        )}

                        {/* Caption Individual Cues vs Standard Item Label */}
                        {track.type === 'CAPTION' && Array.isArray(item.caption?.cues) && item.caption.cues.length > 0 ? (
                          <div className="absolute inset-0 overflow-hidden flex items-center pointer-events-none px-1">
                            {item.caption.cues.map((cue, cIdx) => {
                              const rawStart = typeof cue.start === 'number' && !isNaN(cue.start) ? cue.start : 0;
                              const rawEnd = typeof cue.end === 'number' && !isNaN(cue.end) ? cue.end : rawStart + 1.0;
                              
                              // Preserve clip-relative vs timeline-relative timing semantics:
                              // If cue.start is already offset by item.timeline_start, calculate offset relative to item.
                              const isTimelineRelative = item.timeline_start > 0 && rawStart >= item.timeline_start;
                              const cueStartOffset = Math.max(0, isTimelineRelative ? rawStart - item.timeline_start : rawStart);
                              const rawDuration = rawEnd - rawStart;
                              const cueDuration = Math.max(0.15, !isNaN(rawDuration) && rawDuration > 0 ? rawDuration : 1.0);

                              const cueLeft = cueStartOffset * pixelsPerSec;
                              const cueWidth = Math.max(16, cueDuration * pixelsPerSec - 2);
                              const targetSeekTime = isTimelineRelative ? rawStart : item.timeline_start + rawStart;
                              const displayStart = targetSeekTime;
                              const displayEnd = targetSeekTime + cueDuration;

                              return (
                                <div
                                  key={cue.id || `cue-${cIdx}`}
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectItem(item.id, track.id);
                                    onPlayheadChange(targetSeekTime);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      onSelectItem(item.id, track.id);
                                      onPlayheadChange(targetSeekTime);
                                    }
                                  }}
                                  style={{
                                    left: `${cueLeft}px`,
                                    width: `${cueWidth}px`,
                                  }}
                                  className="absolute top-1.5 bottom-1.5 pl-1.5 pr-1 rounded-[3px] bg-white/[0.09] hover:bg-white/[0.16] border-l-2 border-white/35 hover:border-white/60 focus:outline-none focus:ring-1 focus:ring-white/50 text-neutral-200 text-[11px] font-medium flex items-center overflow-hidden pointer-events-auto cursor-pointer transition-colors select-none"
                                  title={`"${cue.text || ''}" (${displayStart.toFixed(2)}s – ${displayEnd.toFixed(2)}s)`}
                                  aria-label={`Caption cue: ${cue.text || '...'} from ${displayStart.toFixed(2)}s to ${displayEnd.toFixed(2)}s`}
                                >
                                  <span className="truncate w-full leading-tight">{cue.text || '...'}</span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="flex-1 px-3 text-[11px] font-medium text-white truncate flex items-center justify-between pointer-events-none">
                            {/* A filmstrip or waveform already identifies the clip, so the label
                                would just repeat it over the media — show it only when there is
                                no visual, and keep text layers' own content. */}
                            <span className="truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                              {item.text?.text ||
                                (track.type === 'CAPTION'
                                  ? 'No captions'
                                  : showFilmstrip || showAudioWave
                                  ? ''
                                  : `${track.name} [${(item.timeline_end - item.timeline_start).toFixed(1)}s]`)}
                            </span>

                            {/* Keyframe Diamond Markers */}
                            {item.keyframes && item.keyframes.length > 0 && (
                              <div className="flex items-center gap-1 shrink-0 ml-1">
                                {item.keyframes.map((kf, kfIdx) => (
                                  <div
                                    key={kf.id || kfIdx}
                                    className="w-1.5 h-1.5 bg-yellow-400 rotate-45 shadow"
                                    title={`Keyframe: ${kf.property} at ${(item.timeline_start + kf.time).toFixed(2)}s`}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Right Trim Handle */}
                        {!track.locked && (
                          <div
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              onSelectItem(item.id, track.id);
                              preDragProjectRef.current = project;
                              setDragState({
                                type: 'trim-right',
                                trackId: track.id,
                                itemId: item.id,
                                initialMouseX: e.clientX,
                                initialStart: item.timeline_start,
                                initialEnd: item.timeline_end,
                                initialSourceStart: item.source_start,
                                initialSourceEnd: item.source_end,
                              });
                            }}
                            className="absolute right-0 top-0 bottom-0 w-2.5 bg-white/20 hover:bg-white/80 cursor-ew-resize z-20 flex items-center justify-center transition rounded-r-[2px]"
                            title="Trim End"
                          >
                            <div className="w-0.5 h-3.5 bg-white/70 rounded-full" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
