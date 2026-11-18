import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play,
  Lock,
  Pause,
  RotateCcw,
  RotateCw,
  Plus,
  Trash2,
  Split,
  Merge,
  Save,
  Download,
  Sparkles,
  Layers,
  Palette,
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  Video as VideoIcon,
  X,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { SubtitleProject, SubtitleStyleConfig, TimedCaptionCue } from '../../types';
import { SubtitleService, BurnStatusResponse } from '../../services/subtitleService';
import { CreditService, PlanEntitlements } from '../../services/creditService';
import { Button } from '../Button';

interface SubtitleEditorProps {
  project: SubtitleProject;
  previewUrl: string;
  onProjectUpdated?: (project: SubtitleProject) => void;
}

const PRESETS: Array<{
  id: string;
  name: string;
  desc: string;
  badge: string;
  style: SubtitleStyleConfig;
}> = [
  {
    id: 'hormozi',
    name: 'Hormozi Punch',
    desc: 'Bold yellow and white, thick black stroke, punchy uppercase',
    badge: 'Viral',
    style: {
      preset: 'hormozi',
      fontFamily: 'Montserrat',
      fontSize: 48,
      fontWeight: 800,
      textColor: '#FFFFFF',
      highlightColor: '#FACC15',
      boxEnabled: false,
      boxColor: '#000000',
      boxOpacity: 0.8,
      boxPadding: 8,
      alignment: 'center',
      position: 'bottom',
      positionY: 0.85,
      strokeEnabled: true,
      strokeColor: '#000000',
      strokeWidth: 4,
      shadowEnabled: true,
      shadowColor: 'rgba(0,0,0,0.8)',
      shadowDepth: 3,
      uppercase: true,
      animation: 'pop',
    },
  },
  {
    id: 'neon',
    name: 'Cyber Neon',
    desc: 'Vibrant cyan text with glowing neon outline and drop shadow',
    badge: 'Popular',
    style: {
      preset: 'neon',
      fontFamily: 'Montserrat',
      fontSize: 44,
      fontWeight: 700,
      textColor: '#38BDF8',
      highlightColor: '#F43F5E',
      boxEnabled: false,
      boxColor: '#000000',
      boxOpacity: 0.5,
      boxPadding: 6,
      alignment: 'center',
      position: 'bottom',
      positionY: 0.85,
      strokeEnabled: true,
      strokeColor: '#0284C7',
      strokeWidth: 2,
      shadowEnabled: true,
      shadowColor: '#06B6D4',
      shadowDepth: 6,
      uppercase: false,
      animation: 'bounce',
    },
  },
  {
    id: 'beast',
    name: 'Beast Impact',
    desc: 'Heavy impact typography with high contrast yellow and black',
    badge: 'High CTR',
    style: {
      preset: 'beast',
      fontFamily: 'Impact',
      fontSize: 52,
      fontWeight: 900,
      textColor: '#FDE047',
      highlightColor: '#FFFFFF',
      boxEnabled: false,
      boxColor: '#000000',
      boxOpacity: 0.8,
      boxPadding: 10,
      alignment: 'center',
      position: 'bottom',
      positionY: 0.82,
      strokeEnabled: true,
      strokeColor: '#000000',
      strokeWidth: 5,
      shadowEnabled: true,
      shadowColor: '#000000',
      shadowDepth: 4,
      uppercase: true,
      animation: 'pop',
    },
  },
  {
    id: 'clean',
    name: 'Clean Modern',
    desc: 'Crisp white typography over a translucent dark rounded backdrop',
    badge: 'Elegant',
    style: {
      preset: 'clean',
      fontFamily: 'Inter',
      fontSize: 38,
      fontWeight: 600,
      textColor: '#FFFFFF',
      highlightColor: '#60A5FA',
      boxEnabled: true,
      boxColor: '#09090B',
      boxOpacity: 0.75,
      boxPadding: 10,
      alignment: 'center',
      position: 'bottom',
      positionY: 0.86,
      strokeEnabled: false,
      strokeColor: '#000000',
      strokeWidth: 0,
      shadowEnabled: true,
      shadowColor: 'rgba(0,0,0,0.5)',
      shadowDepth: 2,
      uppercase: false,
      animation: 'none',
    },
  },
  {
    id: 'karaoke',
    name: 'Karaoke Pop',
    desc: 'Animated word pop highlighting currently spoken phrases',
    badge: 'Dynamic',
    style: {
      preset: 'karaoke',
      fontFamily: 'Montserrat',
      fontSize: 44,
      fontWeight: 800,
      textColor: '#E2E8F0',
      highlightColor: '#A855F7',
      boxEnabled: false,
      boxColor: '#000000',
      boxOpacity: 0.6,
      boxPadding: 8,
      alignment: 'center',
      position: 'bottom',
      positionY: 0.84,
      strokeEnabled: true,
      strokeColor: '#1E1B4B',
      strokeWidth: 3,
      shadowEnabled: true,
      shadowColor: '#6B21A8',
      shadowDepth: 4,
      uppercase: true,
      animation: 'karaoke',
    },
  },
  {
    id: 'minimal',
    name: 'Minimal Dark',
    desc: 'Solid high-contrast dark box with clean white text',
    badge: 'Podcast',
    style: {
      preset: 'minimal',
      fontFamily: 'Arial',
      fontSize: 34,
      fontWeight: 700,
      textColor: '#FFFFFF',
      highlightColor: '#F59E0B',
      boxEnabled: true,
      boxColor: '#000000',
      boxOpacity: 0.9,
      boxPadding: 12,
      alignment: 'center',
      position: 'bottom',
      positionY: 0.88,
      strokeEnabled: false,
      strokeColor: '#000000',
      strokeWidth: 0,
      shadowEnabled: false,
      shadowColor: '#000000',
      shadowDepth: 0,
      uppercase: false,
      animation: 'none',
    },
  },
];

const AVAILABLE_FONTS = [
  'Montserrat',
  'Inter',
  'Roboto',
  'Arial',
  'Impact',
  'Oswald',
  'Bebas Neue',
  'Poppins',
];

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00.00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

export const SubtitleEditor: React.FC<SubtitleEditorProps> = ({
  project,
  previewUrl,
  onProjectUpdated,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Video playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(project.duration_seconds || 0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  // Subtitle cues state
  const [cues, setCues] = useState<TimedCaptionCue[]>(project.subtitle_cues || []);
  const [searchFilter, setSearchFilter] = useState('');
  const [hasUnsavedCues, setHasUnsavedCues] = useState(false);
  const [isSavingCues, setIsSavingCues] = useState(false);
  const [activeCueIndex, setActiveCueIndex] = useState<number | null>(null);

  // Style state
  const defaultStyle: SubtitleStyleConfig = project.subtitle_style || PRESETS[0].style;
  const [style, setStyle] = useState<SubtitleStyleConfig>(defaultStyle);
  const [hasUnsavedStyle, setHasUnsavedStyle] = useState(false);
  const [isSavingStyle, setIsSavingStyle] = useState(false);

  // Active tab
  const [activeTab, setActiveTab] = useState<'cues' | 'style'>('cues');

  // Burn export state
  const [showBurnModal, setShowBurnModal] = useState(false);
  const [burnStatus, setBurnStatus] = useState<BurnStatusResponse | null>(null);
  const [isStartingBurn, setIsStartingBurn] = useState(false);
  const [entitlements, setEntitlements] = useState<PlanEntitlements | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // Auto sync active cue with video time
  useEffect(() => {
    CreditService.getUserEntitlements().then(setEntitlements).catch(() => undefined);
    const idx = cues.findIndex((c) => currentTime >= c.start && currentTime <= c.end);
    setActiveCueIndex(idx !== -1 ? idx : null);
  }, [currentTime, cues]);

  // Video time update listener
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const seekTo = (seconds: number) => {
    if (!videoRef.current) return;
    const clamped = Math.max(0, Math.min(seconds, duration || 999999));
    videoRef.current.currentTime = clamped;
    setCurrentTime(clamped);
  };

  const skipSeconds = (delta: number) => {
    seekTo(currentTime + delta);
  };

  const handleSpeedChange = (speed: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
      setPlaybackRate(speed);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  // Cue editing actions
  const handleCueTextChange = (index: number, text: string) => {
    setCues((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], text };
      return copy;
    });
    setHasUnsavedCues(true);
  };

  const handleCueTimeAdjust = (index: number, field: 'start' | 'end', delta: number) => {
    setCues((prev) => {
      const copy = [...prev];
      const cue = { ...copy[index] };
      let newTime = Math.max(0, Number((cue[field] + delta).toFixed(3)));

      if (field === 'start') {
        if (newTime >= cue.end) newTime = Math.max(0, cue.end - 0.1);
        cue.start = newTime;
      } else {
        if (newTime <= cue.start) newTime = cue.start + 0.1;
        cue.end = newTime;
      }

      copy[index] = cue;
      return copy;
    });
    setHasUnsavedCues(true);
  };

  const handleAddCue = () => {
    const start = Number(currentTime.toFixed(2));
    const end = Number((currentTime + 2.0).toFixed(2));
    const newCue: TimedCaptionCue = {
      id: `cue_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      start,
      end,
      text: 'New subtitle text',
    };

    setCues((prev) => {
      const updated = [...prev, newCue].sort((a, b) => a.start - b.start);
      return updated;
    });
    setHasUnsavedCues(true);
  };

  const handleDeleteCue = (index: number) => {
    setCues((prev) => prev.filter((_, i) => i !== index));
    setHasUnsavedCues(true);
  };

  const handleSplitCue = (index: number) => {
    const cue = cues[index];
    if (!cue) return;
    const splitTime =
      currentTime > cue.start && currentTime < cue.end
        ? Number(currentTime.toFixed(2))
        : Number(((cue.start + cue.end) / 2).toFixed(2));

    const words = cue.text.split(' ');
    const midpoint = Math.ceil(words.length / 2);
    const text1 = words.slice(0, midpoint).join(' ') || cue.text;
    const text2 = words.slice(midpoint).join(' ') || '...';

    const cue1: TimedCaptionCue = { ...cue, end: splitTime, text: text1 };
    const cue2: TimedCaptionCue = { id: `cue_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`, start: splitTime, end: cue.end, text: text2 };

    setCues((prev) => {
      const copy = [...prev];
      copy.splice(index, 1, cue1, cue2);
      return copy;
    });
    setHasUnsavedCues(true);
  };

  const handleMergeWithNext = (index: number) => {
    if (index >= cues.length - 1) return;
    const current = cues[index];
    const next = cues[index + 1];

    const merged: TimedCaptionCue = {
      id: current.id || `cue_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      start: current.start,
      end: next.end,
      text: `${current.text.trim()} ${next.text.trim()}`,
    };

    setCues((prev) => {
      const copy = [...prev];
      copy.splice(index, 2, merged);
      return copy;
    });
    setHasUnsavedCues(true);
  };

  // Save Cues to backend
  const handleSaveCues = async () => {
    if (isSavingCues) return;
    setIsSavingCues(true);
    setExportError(null);
    try {
      const res = await SubtitleService.updateCues(project.id, cues);
      setCues(res.cues);
      setHasUnsavedCues(false);
      if (onProjectUpdated) {
        onProjectUpdated({ ...project, subtitle_cues: res.cues });
      }
    } catch (err: any) {
      setExportError(err.message || 'Failed to save subtitle cues.');
    } finally {
      setIsSavingCues(false);
    }
  };

  // Style change handler
  const handleStyleChange = (updates: Partial<SubtitleStyleConfig>) => {
    setStyle((prev) => ({ ...prev, ...updates }));
    setHasUnsavedStyle(true);
  };

  const handleApplyPreset = (presetConfig: SubtitleStyleConfig) => {
    setStyle(presetConfig);
    setHasUnsavedStyle(true);
  };

  // Save style to backend
  const handleSaveStyle = async () => {
    if (isSavingStyle) return;
    setIsSavingStyle(true);
    setExportError(null);
    try {
      const res = await SubtitleService.updateStyle(project.id, style);
      setStyle(res.style);
      setHasUnsavedStyle(false);
      if (onProjectUpdated) {
        onProjectUpdated({ ...project, subtitle_style: res.style });
      }
    } catch (err: any) {
      setExportError(err.message || 'Failed to save subtitle style.');
    } finally {
      setIsSavingStyle(false);
    }
  };

  // Export SRT & VTT
  const handleDownloadSRT = async () => {
    try {
      await SubtitleService.downloadSubtitleFile(project.id, 'srt');
    } catch (err: any) {
      setExportError(err.message || 'Failed to download SRT.');
    }
  };

  const handleDownloadVTT = async () => {
    try {
      await SubtitleService.downloadSubtitleFile(project.id, 'vtt');
    } catch (err: any) {
      setExportError(err.message || 'Failed to download VTT.');
    }
  };

  // Burn FFmpeg Export
  const handleStartBurn = async () => {
    setIsStartingBurn(true);
    setExportError(null);
    setShowBurnModal(true);
    try {
      // First persist unsaved cues or style if needed
      if (hasUnsavedCues) await handleSaveCues();
      if (hasUnsavedStyle) await handleSaveStyle();

      await SubtitleService.startBurn(project.id);
      pollBurnStatus();
    } catch (err: any) {
      setExportError(err.message || 'Failed to start video rendering.');
      setIsStartingBurn(false);
    }
  };

  // Poll burn status
  const pollBurnStatus = useCallback(() => {
    let cancelled = false;
    const interval = setInterval(async () => {
      if (cancelled) return;
      try {
        const res = await SubtitleService.getBurnStatus(project.id);
        setBurnStatus(res.burnStatus);
        if (res.burnStatus.status === 'ready' || res.burnStatus.status === 'failed') {
          clearInterval(interval);
          setIsStartingBurn(false);
        }
      } catch (err) {
        // Keep polling
      }
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [project.id]);

  // Filtered cues
  const filteredCues = searchFilter.trim()
    ? cues.filter((c) => c.text.toLowerCase().includes(searchFilter.toLowerCase()))
    : cues;

  // Active cue for overlay
  const activeCue = activeCueIndex !== null ? cues[activeCueIndex] : null;

  // Compute CSS for active subtitle overlay
  const getOverlayStyle = (): React.CSSProperties => {
    const pos = style.position || 'bottom';
    const align = style.alignment || 'center';

    let topVal: string | undefined = undefined;
    let bottomVal: string | undefined = '12%';

    if (pos === 'top') {
      topVal = '10%';
      bottomVal = undefined;
    } else if (pos === 'middle') {
      topVal = '48%';
      bottomVal = undefined;
    }

    const textShadowList: string[] = [];
    if (style.strokeEnabled) {
      const sw = style.strokeWidth || 3;
      const sc = style.strokeColor || '#000000';
      textShadowList.push(
        `-${sw}px -${sw}px 0 ${sc}`,
        `${sw}px -${sw}px 0 ${sc}`,
        `-${sw}px ${sw}px 0 ${sc}`,
        `${sw}px ${sw}px 0 ${sc}`
      );
    }
    if (style.shadowEnabled) {
      const depth = style.shadowDepth || 3;
      const shadowColor = style.shadowColor || 'rgba(0,0,0,0.8)';
      textShadowList.push(`${depth}px ${depth}px ${depth * 2}px ${shadowColor}`);
    }

    return {
      position: 'absolute',
      left: '50%',
      transform: pos === 'middle' ? 'translate(-50%, -50%)' : 'translateX(-50%)',
      top: topVal,
      bottom: bottomVal,
      width: '90%',
      maxWidth: '560px',
      textAlign: align,
      fontFamily: style.fontFamily || 'Montserrat, sans-serif',
      fontSize: `${Math.max(16, Math.min(48, (style.fontSize || 42) * 0.55))}px`,
      fontWeight: style.fontWeight || 800,
      color: style.textColor || '#FFFFFF',
      textTransform: style.uppercase ? 'uppercase' : 'none',
      textShadow: textShadowList.length > 0 ? textShadowList.join(', ') : undefined,
      lineHeight: 1.25,
      padding: style.boxEnabled ? `${style.boxPadding || 8}px ${Number(style.boxPadding || 8) * 1.5}px` : undefined,
      backgroundColor: style.boxEnabled
        ? `${style.boxColor || '#000000'}${Math.round((style.boxOpacity ?? 0.8) * 255).toString(16).padStart(2, '0')}`
        : 'transparent',
      borderRadius: style.boxEnabled ? '8px' : undefined,
      pointerEvents: 'none',
      transition: 'all 0.15s ease-out',
      zIndex: 20,
    };
  };

  return (
    <div className="space-y-6">
      {/* Top Studio Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400">
            <VideoIcon className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex flex-wrap items-center gap-2">
              <span>{project.title}</span>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                {cues.length} Subtitles
              </span>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/20">
                0 Credits • Free Edits & Exports
              </span>
            </h2>
            <p className="text-xs text-zinc-400">
              Duration: {formatTime(duration)} • Preset: <span className="text-violet-300 capitalize">{style.preset || 'Custom'}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Save Cues / Style button */}
          {(hasUnsavedCues || hasUnsavedStyle) && (
            <Button
              variant="brand"
              size="sm"
              onClick={() => {
                if (hasUnsavedCues) handleSaveCues();
                if (hasUnsavedStyle) handleSaveStyle();
              }}
              disabled={isSavingCues || isSavingStyle}
              className="text-xs font-semibold"
            >
              {isSavingCues || isSavingStyle ? (
                <Loader2 className="size-3.5 mr-1.5 animate-spin" />
              ) : (
                <Save className="size-3.5 mr-1.5" />
              )}
              Save Changes
            </Button>
          )}

          {/* Download SRT */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadSRT}
            className="text-xs text-zinc-300 hover:text-white"
            title="Download SubRip (.srt) caption file"
          >
            <FileText className="size-3.5 mr-1.5 text-zinc-400" />
            Export .SRT
          </Button>

          {/* Download VTT */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadVTT}
            className="text-xs text-zinc-300 hover:text-white"
            title="Download WebVTT (.vtt) caption file"
          >
            <FileText className="size-3.5 mr-1.5 text-zinc-400" />
            Export .VTT
          </Button>

          {/* Burn into MP4 */}
          <Button
            variant="brand"
            size="sm"
            onClick={handleStartBurn}
            disabled={isStartingBurn}
            className="text-xs font-bold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500"
          >
            <Sparkles className="size-3.5 mr-1.5" />
            Burn Video (.mp4)
          </Button>
        </div>
      </div>

      {/* Global Error Banner */}
      {exportError && (
        <div className="flex items-center gap-3 p-3.5 rounded-xl bg-red-500/10 border border-red-500/25 text-red-300 text-xs">
          <AlertCircle className="size-4 shrink-0 text-red-400" />
          <span className="flex-1">{exportError}</span>
          <button onClick={() => setExportError(null)} className="text-zinc-400 hover:text-white">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Main Studio Grid: Video Player (Left) + Editor Panels (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ======================================================== */}
        {/* LEFT COLUMN: Video Player & Controls (col-span-6)       */}
        {/* ======================================================== */}
        <div className="lg:col-span-6 space-y-4">
          <div className="relative rounded-2xl bg-black border border-zinc-800 overflow-hidden shadow-2xl aspect-[9/16] max-h-[620px] mx-auto flex items-center justify-center">
            {previewUrl ? (
              <video
                ref={videoRef}
                src={previewUrl}
                playsInline
                className="w-full h-full object-contain"
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={() => setIsPlaying(false)}
                onClick={togglePlay}
              />
            ) : (
              <div className="text-center p-8 text-zinc-500">
                <Loader2 className="size-8 mx-auto animate-spin text-violet-400 mb-2" />
                <p className="text-xs">Loading video preview...</p>
              </div>
            )}

            {/* LIVE SUBTITLE OVERLAY */}
            {activeCue && (
              <div style={getOverlayStyle()}>
                {activeCue.text}
              </div>
            )}

            {/* Center Big Play Pause indicator when clicked */}
            <button
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity cursor-pointer group"
            >
              <div className="size-16 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white shadow-2xl group-hover:scale-110 transition-transform">
                {isPlaying ? <Pause className="size-7 fill-white" /> : <Play className="size-7 fill-white ml-1" />}
              </div>
            </button>
          </div>

          {/* Video Playback Scrubber & Controls */}
          <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-3">
            {/* Timeline Progress Slider */}
            <div className="space-y-1">
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.05}
                value={currentTime}
                onChange={(e) => seekTo(parseFloat(e.target.value))}
                className="w-full h-2 rounded-lg bg-zinc-800 appearance-none cursor-pointer accent-violet-500"
              />
              <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Control Buttons */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => skipSeconds(-5)}
                  title="Rewind 5s"
                  className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                >
                  <RotateCcw className="size-4" />
                </button>
                <button
                  onClick={togglePlay}
                  title={isPlaying ? 'Pause' : 'Play'}
                  className="p-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white shadow-lg transition"
                >
                  {isPlaying ? <Pause className="size-4 fill-white" /> : <Play className="size-4 fill-white ml-0.5" />}
                </button>
                <button
                  onClick={() => skipSeconds(5)}
                  title="Forward 5s"
                  className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                >
                  <RotateCw className="size-4" />
                </button>
                <button
                  onClick={toggleMute}
                  title={isMuted ? 'Unmute' : 'Mute'}
                  className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                >
                  {isMuted ? <VolumeX className="size-4 text-red-400" /> : <Volume2 className="size-4" />}
                </button>
              </div>

              {/* Playback speed buttons */}
              <div className="flex items-center gap-1 text-[11px] font-mono">
                {[0.75, 1, 1.25, 1.5].map((speed) => (
                  <button
                    key={speed}
                    onClick={() => handleSpeedChange(speed)}
                    className={`px-2 py-1 rounded-md transition ${
                      playbackRate === speed
                        ? 'bg-violet-600 text-white font-bold'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* RIGHT COLUMN: Cues Editor & Style Customization (col-6) */}
        {/* ======================================================== */}
        <div className="lg:col-span-6 space-y-4">
          {/* Navigation Tabs (Subtitles vs Styling) */}
          <div className="flex items-center gap-2 p-1.5 rounded-xl bg-zinc-900 border border-zinc-800">
            <button
              onClick={() => setActiveTab('cues')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition ${
                activeTab === 'cues'
                  ? 'bg-violet-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
              }`}
            >
              <Type className="size-3.5" />
              <span>Subtitles ({cues.length})</span>
              {hasUnsavedCues && <span className="size-2 rounded-full bg-amber-400" />}
            </button>
            <button
              onClick={() => setActiveTab('style')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition ${
                activeTab === 'style'
                  ? 'bg-violet-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
              }`}
            >
              <Palette className="size-3.5" />
              <span>Presets & Style</span>
              {hasUnsavedStyle && <span className="size-2 rounded-full bg-amber-400" />}
            </button>
          </div>

          {/* ======================================================== */}
          {/* TAB 1: SUBTITLES CUES LIST                               */}
          {/* ======================================================== */}
          {activeTab === 'cues' && (
            <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-3 shadow-xl">
              <div className="flex items-center justify-between gap-3">
                <input
                  type="text"
                  placeholder="Search subtitle text..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-800/80 border border-zinc-700/60 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddCue}
                  className="text-xs text-violet-300 border-violet-500/30 hover:bg-violet-500/10 cursor-pointer"
                >
                  <Plus className="size-3.5 mr-1" />
                  Add at {formatTime(currentTime)}
                </Button>
              </div>

              {/* Scrollable list of cues */}
              <div className="space-y-2.5 max-h-[580px] overflow-y-auto pr-1">
                {filteredCues.length === 0 ? (
                  <div className="text-center py-12 text-zinc-500 text-xs">
                    No subtitles match your search query.
                  </div>
                ) : (
                  filteredCues.map((cue, index) => {
                    const isActive = activeCueIndex === index;
                    return (
                      <div
                        key={index}
                        onClick={() => seekTo(cue.start)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer ${
                          isActive
                            ? 'bg-violet-950/40 border-violet-500 shadow-lg ring-1 ring-violet-500/50'
                            : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700'
                        }`}
                      >
                        {/* Cue Timestamps & Quick Time Nudges */}
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-1.5 text-[11px] font-mono">
                            <span className="text-zinc-500">#{index + 1}</span>
                            <div className="flex items-center gap-1 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCueTimeAdjust(index, 'start', -0.1);
                                }}
                                className="text-zinc-500 hover:text-white px-0.5"
                                title="-0.1s"
                              >
                                -
                              </button>
                              <span className="text-violet-300 font-bold">{formatTime(cue.start)}</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCueTimeAdjust(index, 'start', 0.1);
                                }}
                                className="text-zinc-500 hover:text-white px-0.5"
                                title="+0.1s"
                              >
                                +
                              </button>
                            </div>
                            <span className="text-zinc-600">→</span>
                            <div className="flex items-center gap-1 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCueTimeAdjust(index, 'end', -0.1);
                                }}
                                className="text-zinc-500 hover:text-white px-0.5"
                                title="-0.1s"
                              >
                                -
                              </button>
                              <span className="text-violet-300 font-bold">{formatTime(cue.end)}</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCueTimeAdjust(index, 'end', 0.1);
                                }}
                                className="text-zinc-500 hover:text-white px-0.5"
                                title="+0.1s"
                              >
                                +
                              </button>
                            </div>
                          </div>

                          {/* Cue Actions: Split, Merge, Delete */}
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSplitCue(index);
                              }}
                              title="Split segment"
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                            >
                              <Split className="size-3.5" />
                            </button>
                            {index < cues.length - 1 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMergeWithNext(index);
                                }}
                                title="Merge with next segment"
                                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                              >
                                <Merge className="size-3.5" />
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteCue(index);
                              }}
                              title="Delete segment"
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Editable Subtitle Text */}
                        <textarea
                          value={cue.text}
                          rows={2}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => handleCueTextChange(index, e.target.value)}
                          className="w-full p-2 rounded-lg bg-zinc-900/90 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 transition resize-none"
                        />
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 2: STYLING & PRESETS                                 */}
          {/* ======================================================== */}
          {activeTab === 'style' && (
            <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-6 shadow-xl max-h-[620px] overflow-y-auto">
              {/* Presets Gallery */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="size-3.5 text-violet-400" />
                    <span>Viral Subtitle Presets</span>
                  </h3>
                  <span className="text-[10px] text-zinc-500">1-click apply</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {PRESETS.map((p) => {
                    const isSelected = (style.preset || '').toLowerCase() === p.id.toLowerCase();
                    const isAllowed = !entitlements || entitlements.allowedSubtitlePresets.map((x: string) => x.toLowerCase()).includes(p.id.toLowerCase());
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          if (!isAllowed) {
                            setExportError(`The preset "${p.name}" requires a Creator or Pro plan. Upgrade your plan to unlock viral presets, or choose Clean.`);
                            return;
                          }
                          handleApplyPreset(p.style);
                        }}
                        className={`p-3 rounded-xl text-left border transition-all cursor-pointer relative ${
                          !isAllowed
                            ? 'bg-zinc-950/40 border-zinc-800/60 opacity-80 hover:border-zinc-700'
                            : isSelected
                            ? 'bg-violet-950/40 border-violet-500 shadow-md ring-1 ring-violet-500/50'
                            : 'bg-zinc-950/60 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="text-xs font-bold text-white truncate flex items-center gap-1">
                            {!isAllowed && <Lock className="size-3 text-amber-400 shrink-0" />}
                            {p.name}
                          </span>
                          <span
                            className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                              !isAllowed
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-violet-500/20 text-violet-300'
                            }`}
                          >
                            {!isAllowed ? 'Creator+' : p.badge}
                          </span>
                        </div>
                        <p className="text-[10px] text-zinc-400 line-clamp-2">{p.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Typography Controls */}
              <div className="space-y-3 pt-4 border-t border-zinc-800">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Type className="size-3.5 text-zinc-400" />
                  <span>Typography</span>
                </h3>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Font Family</label>
                    <select
                      value={style.fontFamily || 'Montserrat'}
                      onChange={(e) => handleStyleChange({ fontFamily: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-white focus:outline-none focus:border-violet-500"
                    >
                      {AVAILABLE_FONTS.map((font) => (
                        <option key={font} value={font}>
                          {font}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">
                      Font Size: {style.fontSize || 42}px
                    </label>
                    <input
                      type="range"
                      min={24}
                      max={72}
                      value={style.fontSize || 42}
                      onChange={(e) => handleStyleChange({ fontSize: parseInt(e.target.value) })}
                      className="w-full accent-violet-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="uppercase-toggle"
                      checked={!!style.uppercase}
                      onChange={(e) => handleStyleChange({ uppercase: e.target.checked })}
                      className="size-4 rounded accent-violet-600 bg-zinc-800 border-zinc-700"
                    />
                    <label htmlFor="uppercase-toggle" className="text-xs text-zinc-300 cursor-pointer">
                      Uppercase Text (ALL CAPS)
                    </label>
                  </div>

                  <div className="flex items-center gap-1 bg-zinc-800 p-1 rounded-lg border border-zinc-700">
                    {(['left', 'center', 'right'] as const).map((align) => (
                      <button
                        key={align}
                        onClick={() => handleStyleChange({ alignment: align })}
                        className={`p-1.5 rounded transition ${
                          (style.alignment || 'center') === align
                            ? 'bg-violet-600 text-white'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {align === 'left' ? (
                          <AlignLeft className="size-3.5" />
                        ) : align === 'center' ? (
                          <AlignCenter className="size-3.5" />
                        ) : (
                          <AlignRight className="size-3.5" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Color Customization */}
              <div className="space-y-3 pt-4 border-t border-zinc-800">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Palette className="size-3.5 text-zinc-400" />
                  <span>Colors</span>
                </h3>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Primary Text Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={style.textColor || '#FFFFFF'}
                        onChange={(e) => handleStyleChange({ textColor: e.target.value })}
                        className="size-7 rounded cursor-pointer bg-transparent border-0"
                      />
                      <input
                        type="text"
                        value={style.textColor || '#FFFFFF'}
                        onChange={(e) => handleStyleChange({ textColor: e.target.value })}
                        className="flex-1 px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-xs text-white font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Highlight Word Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={style.highlightColor || '#FACC15'}
                        onChange={(e) => handleStyleChange({ highlightColor: e.target.value })}
                        className="size-7 rounded cursor-pointer bg-transparent border-0"
                      />
                      <input
                        type="text"
                        value={style.highlightColor || '#FACC15'}
                        onChange={(e) => handleStyleChange({ highlightColor: e.target.value })}
                        className="flex-1 px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-xs text-white font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Position & Placement */}
              <div className="space-y-3 pt-4 border-t border-zinc-800">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Sliders className="size-3.5 text-zinc-400" />
                  <span>Position</span>
                </h3>

                <div className="grid grid-cols-3 gap-2">
                  {(['bottom', 'middle', 'top'] as const).map((pos) => (
                    <button
                      key={pos}
                      onClick={() => handleStyleChange({ position: pos })}
                      className={`py-2 px-3 rounded-lg text-xs font-semibold capitalize border transition ${
                        (style.position || 'bottom') === pos
                          ? 'bg-violet-600 border-violet-500 text-white'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {pos}
                    </button>
                  ))}
                </div>
              </div>

              {/* Background Box & Stroke */}
              <div className="space-y-3 pt-4 border-t border-zinc-800">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="size-3.5 text-zinc-400" />
                  <span>Box & Outline</span>
                </h3>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label htmlFor="box-toggle" className="text-xs text-zinc-300 cursor-pointer">
                      Background Backdrop Box
                    </label>
                    <input
                      type="checkbox"
                      id="box-toggle"
                      checked={!!style.boxEnabled}
                      onChange={(e) => handleStyleChange({ boxEnabled: e.target.checked })}
                      className="size-4 rounded accent-violet-600 bg-zinc-800 border-zinc-700"
                    />
                  </div>

                  {style.boxEnabled && (
                    <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-zinc-800/60 border border-zinc-700/60">
                      <div>
                        <label className="text-[11px] text-zinc-400 block mb-1">Box Color</label>
                        <input
                          type="color"
                          value={style.boxColor || '#000000'}
                          onChange={(e) => handleStyleChange({ boxColor: e.target.value })}
                          className="size-7 rounded cursor-pointer bg-transparent border-0"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-zinc-400 block mb-1">
                          Opacity: {Math.round((style.boxOpacity ?? 0.8) * 100)}%
                        </label>
                        <input
                          type="range"
                          min={0.1}
                          max={1}
                          step={0.05}
                          value={style.boxOpacity ?? 0.8}
                          onChange={(e) => handleStyleChange({ boxOpacity: parseFloat(e.target.value) })}
                          className="w-full accent-violet-500"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <label htmlFor="stroke-toggle" className="text-xs text-zinc-300 cursor-pointer">
                      Black Text Outline (Stroke)
                    </label>
                    <input
                      type="checkbox"
                      id="stroke-toggle"
                      checked={!!style.strokeEnabled}
                      onChange={(e) => handleStyleChange({ strokeEnabled: e.target.checked })}
                      className="size-4 rounded accent-violet-600 bg-zinc-800 border-zinc-700"
                    />
                  </div>
                </div>
              </div>

              {/* Save Style Button */}
              <div className="pt-4 border-t border-zinc-800">
                <Button
                  variant="brand"
                  size="sm"
                  onClick={handleSaveStyle}
                  disabled={isSavingStyle}
                  className="w-full text-xs font-bold"
                >
                  {isSavingStyle ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Save className="size-3.5 mr-1.5" />}
                  Save Custom Style
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* FFmpeg Burned-in Export Modal                            */}
      {/* ======================================================== */}
      {showBurnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-lg p-6 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="size-9 rounded-xl bg-violet-500/15 text-violet-400 flex items-center justify-center border border-violet-500/30">
                  <Sparkles className="size-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Burn Subtitles into Video</h3>
                  <p className="text-xs text-zinc-400">FFmpeg libx264 high-quality rendering</p>
                </div>
              </div>
              <button
                onClick={() => setShowBurnModal(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Watermark Commercial Gate Notice */}
            {entitlements?.watermarkRequired ? (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2.5 text-xs text-amber-300">
                <AlertCircle className="size-4 shrink-0 text-amber-400" />
                <span>
                  <strong>Free Plan Notice:</strong> Video will be exported with the official VireoClip watermark in the top-right corner. Upgrade to Creator for clean exports.
                </span>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2.5 text-xs text-emerald-300">
                <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
                <span>
                  <strong>Clean Export:</strong> Your plan entitles you to export this video without any watermark.
                </span>
              </div>
            )}

            {/* Render Status & Progress */}
            {burnStatus?.status === 'ready' ? (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center space-y-3">
                <CheckCircle2 className="size-10 mx-auto text-emerald-400" />
                <div>
                  <h4 className="text-sm font-bold text-white">Export Completed Successfully!</h4>
                <div className="flex items-center justify-center gap-2 mt-1">
                  {burnStatus.is_watermarked || entitlements?.watermarkRequired ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Watermarked (Free Plan)
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Clean Export (Paid Plan)
                    </span>
                  )}
                </div>
                  <p className="text-xs text-emerald-300/80">Your video with burned-in subtitles is ready for download.</p>
                </div>
                {burnStatus.downloadUrl && (
                  <a
                    href={burnStatus.downloadUrl}
                    download={`burned_${project.title.replace(/\s+/g, '_')}.mp4`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg transition"
                  >
                    <Download className="size-4" />
                    Download MP4 Video
                  </a>
                )}
              </div>
            ) : burnStatus?.status === 'failed' ? (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-center space-y-3">
                <AlertCircle className="size-10 mx-auto text-red-400" />
                <div>
                  <h4 className="text-sm font-bold text-white">Rendering Failed</h4>
                  <p className="text-xs text-red-300/80">{burnStatus.error || 'FFmpeg process failed'}</p>
                </div>
                <Button
                  variant="brand"
                  size="sm"
                  onClick={handleStartBurn}
                  className="text-xs font-bold"
                >
                  <RotateCw className="size-3.5 mr-1.5" />
                  Retry Export
                </Button>
              </div>
            ) : (
              <div className="p-6 rounded-xl bg-zinc-950/80 border border-zinc-800 text-center space-y-4">
                <Loader2 className="size-8 mx-auto animate-spin text-violet-400" />
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-white">
                    {burnStatus?.stage || 'Preparing FFmpeg rendering...'}
                  </h4>
                  <p className="text-xs text-zinc-400">
                    Applying ASS subtitle overlays and encoding libx264 video streams.
                  </p>
                </div>
                {/* Progress bar */}
                <div className="w-full bg-zinc-800 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-violet-600 to-indigo-500 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${burnStatus?.progress || 15}%` }}
                  />
                </div>
                <p className="text-[11px] font-mono text-zinc-500">{burnStatus?.progress || 15}% complete</p>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBurnModal(false)}
                className="text-xs"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
