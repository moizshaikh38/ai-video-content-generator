import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Type,
  Volume2,
  VolumeX,
  Download,
  AlertCircle,
  Crop,
  CheckCircle2,
} from 'lucide-react';
import { clipRenderService } from '../services/clipRenderService';
import {
  RenderedClip,
  ClipAspectRatio,
  CaptionStyle,
  CaptionPosition,
  TimedCaptionCue,
  CaptionConfig,
  CropConfig,
  OverlayConfig,
} from '../types';

export const ClipEditorPage: React.FC = () => {
  const { clipId } = useParams<{ clipId: string }>();
  const navigate = useNavigate();

  // Core state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clip, setClip] = useState<RenderedClip | null>(null);
  const [timingMode, setTimingMode] = useState<string>('segment');
  const [cues, setCues] = useState<TimedCaptionCue[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Editor configuration state
  const [trimStartOffset, setTrimStartOffset] = useState<number>(0);
  const [trimEndOffset, setTrimEndOffset] = useState<number>(0);
  const [aspectRatio, setAspectRatio] = useState<ClipAspectRatio>('9:16');
  const [captionEnabled, setCaptionEnabled] = useState<boolean>(true);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>('clean');
  const [captionPosition, setCaptionPosition] = useState<CaptionPosition>('bottom');
  const [captionConfig, setCaptionConfig] = useState<CaptionConfig>({});
  const [cropConfig, setCropConfig] = useState<CropConfig>({ focusX: 0.5, focusY: 0.5 });
  const [overlayConfig, setOverlayConfig] = useState<OverlayConfig>({ enabled: false, text: '', position: 'top', size: 'md' });
  const [volume, setVolume] = useState<number>(1.0);
  const [muted, setMuted] = useState<boolean>(false);

  // Dirty state tracking
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [renderSuccessMsg, setRenderSuccessMsg] = useState<string | null>(null);

  // Video playback & caption simulation state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'captions' | 'layout' | 'text' | 'audio'>('captions');

  // Load editor data on mount
  useEffect(() => {
    if (!clipId) return;

    let mounted = true;
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [editorData, captionData] = await Promise.all([
          clipRenderService.getClipEditorData(clipId),
          clipRenderService.getClipCaptions(clipId).catch(() => ({ timingMode: 'segment', cues: [] })),
        ]);

        if (!mounted) return;

        const c = editorData.clip;
        setClip(c);
        setTimingMode(editorData.timingMode || 'segment');
        setCues(captionData.cues || []);
        setPreviewUrl(editorData.previewUrl || null);

        // Populate editor controls from saved clip configuration
        setTrimStartOffset(Number(c.trim_start_offset || 0));
        setTrimEndOffset(Number(c.trim_end_offset || 0));
        setAspectRatio(c.aspect_ratio || '9:16');
        setCaptionEnabled(c.caption_enabled !== false);
        setCaptionStyle(c.caption_style || 'clean');
        setCaptionPosition(c.caption_position || 'bottom');
        setCaptionConfig(c.caption_config || {});
        setCropConfig(c.crop_config || { focusX: 0.5, focusY: 0.5 });
        setOverlayConfig(c.overlay_config || { enabled: false, text: '', position: 'top', size: 'md' });
        setVolume(c.volume !== undefined ? Number(c.volume) : 1.0);
        setMuted(Boolean(c.muted));

        setIsDirty(false);
      } catch (err: any) {
        if (mounted) setError(err.message || 'Failed to load clip for editing.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadData();
    return () => {
      mounted = false;
    };
  }, [clipId]);

  // Track unsaved modifications
  const markDirty = () => {
    setIsDirty(true);
  };

  // Video time update listener
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  // Toggle play/pause
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  // Calculate durations and boundaries
  const origDuration = clip ? Number(clip.end_seconds - clip.start_seconds) : 0;
  const effectiveDuration = Math.max(0, origDuration - trimStartOffset - trimEndOffset);
  const isTrimValid = effectiveDuration >= 3.0;

  // Find active caption cue for current local playback time
  const currentLocalTime = currentTime;
  const activeCue = cues.find((c) => currentLocalTime >= c.start && currentLocalTime <= c.end);

  // Format seconds to MM:SS.s
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = (secs % 60).toFixed(1);
    return `${m.toString().padStart(2, '0')}:${parseFloat(s) < 10 ? '0' : ''}${s}`;
  };

  // Save changes handler
  const handleSave = async (): Promise<RenderedClip | null> => {
    if (!clipId || !clip) return null;
    if (!isTrimValid) {
      setError(`Trimmed duration must be at least 3.0 seconds (currently ${effectiveDuration.toFixed(1)}s).`);
      return null;
    }

    setIsSaving(true);
    setError(null);
    try {
      const updated = await clipRenderService.updateClipEditor(clipId, {
        trimStartOffset,
        trimEndOffset,
        aspectRatio,
        captionEnabled,
        captionStyle,
        captionPosition,
        captionConfig,
        cropConfig,
        overlayConfig,
        volume,
        muted,
      });

      setClip(updated);
      setIsDirty(false);
      return updated;
    } catch (err: any) {
      setError(err.message || 'Failed to save changes.');
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  // Reset to default handler
  const handleReset = async () => {
    if (!clipId) return;
    if (!window.confirm('Reset all editor adjustments back to defaults?')) return;

    setLoading(true);
    try {
      const reset = await clipRenderService.resetClipEditor(clipId);
      setClip(reset);
      setTrimStartOffset(0);
      setTrimEndOffset(0);
      setAspectRatio('9:16');
      setCaptionEnabled(true);
      setCaptionStyle('clean');
      setCaptionPosition('bottom');
      setCaptionConfig({});
      setCropConfig({ focusX: 0.5, focusY: 0.5 });
      setOverlayConfig({ enabled: false, text: '', position: 'top', size: 'md' });
      setVolume(1.0);
      setMuted(false);
      setIsDirty(false);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to reset editor settings.');
    } finally {
      setLoading(false);
    }
  };

  // Render changes handler (saves first, then triggers rerender)
  const handleRenderChanges = async () => {
    if (!clipId) return;
    const saved = await handleSave();
    if (!saved) return;

    setIsRendering(true);
    setRenderSuccessMsg(null);
    setError(null);

    try {
      await clipRenderService.renderClip(clipId);

      // Poll until render finishes
      let pollCount = 0;
      const pollInterval = setInterval(async () => {
        pollCount++;
        try {
          const fresh = await clipRenderService.getClip(clipId);
          setClip(fresh);

          if (fresh.render_status === 'ready') {
            clearInterval(pollInterval);
            setIsRendering(false);
            setRenderSuccessMsg(`Rendered successfully as Revision v${fresh.render_version || 1}!`);

            // Refresh preview with cache buster
            const pUrl = await clipRenderService.getPreviewUrl(clipId);
            setPreviewUrl(`${pUrl}?t=${Date.now()}`);
          } else if (fresh.render_status === 'failed') {
            clearInterval(pollInterval);
            setIsRendering(false);
            setError(`Rendering failed: ${fresh.render_error_message || 'Unknown render error'}`);
          }
        } catch {
          if (pollCount > 60) {
            clearInterval(pollInterval);
            setIsRendering(false);
            setError('Rendering timed out. Please check back shortly.');
          }
        }
      }, 2500);
    } catch (err: any) {
      setIsRendering(false);
      setError(err.message || 'Failed to trigger render.');
    }
  };

  // Download handler
  const handleDownload = async () => {
    if (!clipId) return;
    try {
      const { signedUrl, filename } = await clipRenderService.getDownloadUrl(clipId);
      const a = document.createElement('a');
      a.href = signedUrl;
      a.download = filename || 'vireo-clip.mp4';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err: any) {
      setError(err.message || 'Failed to download clip.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-neutral-400 text-sm">Loading Clip Editor...</p>
        </div>
      </div>
    );
  }

  if (error && !clip) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-6">
        <div className="bg-red-950/40 border border-red-800/60 rounded-xl p-6 max-w-md w-full text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-white mb-2">Error Loading Clip</h2>
          <p className="text-sm text-red-300 mb-6">{error}</p>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-sm rounded-lg transition"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      {/* Top Navbar */}
      <header className="h-16 border-b border-neutral-800/80 px-4 md:px-6 flex items-center justify-between bg-neutral-900/60 backdrop-blur sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(clip?.project_id ? `/projects/${clip.project_id}` : '/dashboard')}
            className="p-2 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition"
            title="Back to Project"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-semibold text-sm md:text-base text-white truncate max-w-xs md:max-w-md">
                Focused Clip Editor
              </h1>
              <span className="px-2 py-0.5 text-[11px] font-medium bg-neutral-800 text-neutral-300 rounded border border-neutral-700">
                v{clip?.render_version || 1}
              </span>
              {isDirty && (
                <span className="px-2 py-0.5 text-[10px] font-medium bg-orange-950/80 text-orange-400 rounded border border-orange-800 animate-pulse">
                  Unsaved Edits
                </span>
              )}
            </div>
            <p className="text-[11px] text-neutral-400">
              {clip?.aspect_ratio} • {effectiveDuration.toFixed(1)}s output • Timing: {timingMode}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            disabled={isRendering || isSaving}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-neutral-400 hover:text-white bg-neutral-800/60 hover:bg-neutral-800 rounded-lg transition border border-neutral-700"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>

          <button
            onClick={() => handleSave()}
            disabled={isSaving || isRendering || !isDirty}
            className="px-3 py-1.5 text-xs font-medium text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg transition border border-neutral-700 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Edits'}
          </button>

          <button
            onClick={handleRenderChanges}
            disabled={isRendering || isSaving || !isTrimValid}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition shadow-md shadow-orange-950/40 disabled:opacity-50"
          >
            {isRendering ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Rendering...
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                Render Changes
              </>
            )}
          </button>

          {clip?.render_status === 'ready' && (
            <button
              onClick={handleDownload}
              className="p-1.5 text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg transition border border-neutral-700 ml-1"
              title="Download Rendered MP4"
            >
              <Download className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* CENTER: Video Canvas & Live CSS Overlay */}
        <div className="flex-1 bg-neutral-950 flex flex-col items-center justify-center p-4 md:p-6 overflow-y-auto">
          {/* Notifications */}
          {error && (
            <div className="mb-4 w-full max-w-md bg-red-950/50 border border-red-800 text-red-300 px-4 py-2.5 rounded-lg text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {renderSuccessMsg && (
            <div className="mb-4 w-full max-w-md bg-emerald-950/50 border border-emerald-800 text-emerald-300 px-4 py-2.5 rounded-lg text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{renderSuccessMsg}</span>
            </div>
          )}

          {/* Video Container Framed by Aspect Ratio */}
          <div
            className={`relative bg-black rounded-xl overflow-hidden shadow-2xl border border-neutral-800 flex items-center justify-center transition-all ${
              aspectRatio === '9:16'
                ? 'w-[280px] sm:w-[320px] md:w-[360px] aspect-[9/16]'
                : aspectRatio === '1:1'
                ? 'w-[320px] sm:w-[380px] aspect-square'
                : 'w-[440px] sm:w-[560px] aspect-video'
            }`}
          >
            {previewUrl ? (
              <video
                ref={videoRef}
                src={previewUrl}
                playsInline
                onTimeUpdate={handleTimeUpdate}
                onEnded={() => setIsPlaying(false)}
                onClick={togglePlay}
                className="w-full h-full object-cover cursor-pointer"
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-6 text-center text-neutral-500">
                <p className="text-xs">Preview file not ready yet. Click "Render Changes" to compile initial video.</p>
              </div>
            )}

            {/* Play/Pause Overlay Icon on Hover / Pause */}
            {!isPlaying && previewUrl && (
              <button
                onClick={togglePlay}
                className="absolute inset-0 m-auto w-14 h-14 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center backdrop-blur-sm transition border border-white/20"
              >
                <Play className="w-6 h-6 ml-1" />
              </button>
            )}

            {/* Live Text Overlay Mock */}
            {overlayConfig.enabled && overlayConfig.text && (
              <div
                className={`absolute px-3 py-1.5 bg-black/70 backdrop-blur-sm text-white font-bold rounded-lg text-center shadow-lg pointer-events-none max-w-[85%] ${
                  overlayConfig.position === 'top'
                    ? 'top-6'
                    : overlayConfig.position === 'center'
                    ? 'top-1/2 -translate-y-1/2'
                    : 'bottom-24'
                } ${
                  overlayConfig.size === 'sm'
                    ? 'text-xs'
                    : overlayConfig.size === 'lg'
                    ? 'text-lg tracking-wide'
                    : 'text-sm'
                }`}
              >
                {overlayConfig.text}
              </div>
            )}

            {/* Live Caption Overlay Mock */}
            {captionEnabled && (
              <div
                className={`absolute w-full px-4 flex justify-center pointer-events-none transition-all ${
                  captionPosition === 'top'
                    ? 'top-12'
                    : captionPosition === 'center'
                    ? 'top-1/2 -translate-y-1/2'
                    : 'bottom-12'
                }`}
              >
                <div
                  className={`text-center font-bold px-3 py-1 rounded max-w-[90%] transition-all ${
                    captionStyle === 'bold'
                      ? 'text-white text-lg tracking-wider uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,1)]'
                      : captionStyle === 'minimal'
                      ? 'text-neutral-200 text-sm font-medium bg-black/40 backdrop-blur-sm'
                      : captionStyle === 'podcast'
                      ? 'text-yellow-400 text-base drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]'
                      : captionStyle === 'highlight'
                      ? 'text-white text-base drop-shadow-[0_2px_4px_rgba(0,0,0,1)]'
                      : captionStyle === 'karaoke'
                      ? 'text-emerald-400 text-base tracking-wide drop-shadow-[0_2px_4px_rgba(0,0,0,1)]'
                      : 'text-white text-base drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]'
                  }`}
                  style={{
                    color: captionConfig.primaryColor || undefined,
                  }}
                >
                  {activeCue?.text || (previewUrl ? '' : 'Captions will appear here')}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Trim & Playback Controls Bar */}
          <div className="w-full max-w-2xl mt-4 bg-neutral-900/80 border border-neutral-800/80 rounded-xl p-4 flex flex-col gap-3">
            {/* Play / Progress Scrub */}
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <div className="flex items-center gap-2">
                <button
                  onClick={togglePlay}
                  className="p-1.5 text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg transition"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <span>{formatTime(currentTime)}</span>
                <span>/</span>
                <span>{formatTime(effectiveDuration)}</span>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-[11px] text-neutral-400">
                  Cut: <strong className="text-white">{formatTime(trimStartOffset)}</strong> to{' '}
                  <strong className="text-white">{formatTime(origDuration - trimEndOffset)}</strong>
                </span>
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                    isTrimValid ? 'bg-neutral-800 text-neutral-200' : 'bg-red-950 text-red-400'
                  }`}
                >
                  {effectiveDuration.toFixed(1)}s {isTrimValid ? '' : '(Min 3.0s)'}
                </span>
              </div>
            </div>

            {/* Trim Slider Handles */}
            <div className="flex flex-col gap-1.5 pt-1">
              <div className="flex justify-between text-[11px] text-neutral-500">
                <span>Start Offset: +{trimStartOffset.toFixed(1)}s</span>
                <span>End Offset: -{trimEndOffset.toFixed(1)}s</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <input
                    type="range"
                    min="0"
                    max={Math.max(0, origDuration - trimEndOffset - 3.0)}
                    step="0.1"
                    value={trimStartOffset}
                    onChange={(e) => {
                      setTrimStartOffset(parseFloat(e.target.value) || 0);
                      markDirty();
                    }}
                    className="w-full accent-orange-500 cursor-pointer"
                  />
                </div>

                <div>
                  <input
                    type="range"
                    min="0"
                    max={Math.max(0, origDuration - trimStartOffset - 3.0)}
                    step="0.1"
                    value={trimEndOffset}
                    onChange={(e) => {
                      setTrimEndOffset(parseFloat(e.target.value) || 0);
                      markDirty();
                    }}
                    className="w-full accent-orange-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT / SIDEBAR: Modular Feature Tabs */}
        <div className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l border-neutral-800 bg-neutral-900/40 flex flex-col h-auto lg:h-full">
          {/* Subtabs selector */}
          <div className="flex border-b border-neutral-800 bg-neutral-900/60 p-1">
            <button
              onClick={() => setActiveTab('captions')}
              className={`flex-1 py-2 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition ${
                activeTab === 'captions'
                  ? 'bg-neutral-800 text-white shadow'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Captions
            </button>

            <button
              onClick={() => setActiveTab('layout')}
              className={`flex-1 py-2 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition ${
                activeTab === 'layout'
                  ? 'bg-neutral-800 text-white shadow'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Crop className="w-3.5 h-3.5" />
              Framing
            </button>

            <button
              onClick={() => setActiveTab('text')}
              className={`flex-1 py-2 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition ${
                activeTab === 'text'
                  ? 'bg-neutral-800 text-white shadow'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Type className="w-3.5 h-3.5" />
              Headline
            </button>

            <button
              onClick={() => setActiveTab('audio')}
              className={`flex-1 py-2 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition ${
                activeTab === 'audio'
                  ? 'bg-neutral-800 text-white shadow'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Volume2 className="w-3.5 h-3.5" />
              Audio
            </button>
          </div>

          {/* Tab Content Panels */}
          <div className="p-4 md:p-6 overflow-y-auto flex-1 space-y-6">
            {/* 1. CAPTIONS TAB */}
            {activeTab === 'captions' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Burned-in Captions</h3>
                    <p className="text-xs text-neutral-400">Grounded transcript subtitle styling</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={captionEnabled}
                      onChange={(e) => {
                        setCaptionEnabled(e.target.checked);
                        markDirty();
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-600"></div>
                  </label>
                </div>

                {captionEnabled && (
                  <>
                    {/* Style Presets */}
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-neutral-300">Style Presets</label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { id: 'clean', name: 'Clean', desc: 'Standard white & black' },
                          { id: 'bold', name: 'Bold Impact', desc: 'Uppercase heavy sans' },
                          { id: 'minimal', name: 'Minimal', desc: 'Light translucent box' },
                          { id: 'podcast', name: 'Podcast Gold', desc: 'Yellow key highlight' },
                          { id: 'highlight', name: 'Punchy', desc: 'Neon green accent' },
                          { id: 'karaoke', name: 'Karaoke', desc: 'Word-by-word pulse' },
                        ].map((p) => (
                          <button
                            key={p.id}
                            onClick={() => {
                              setCaptionStyle(p.id as CaptionStyle);
                              markDirty();
                            }}
                            className={`p-2.5 text-left rounded-lg border transition ${
                              captionStyle === p.id
                                ? 'bg-orange-950/40 border-orange-500 text-white'
                                : 'bg-neutral-800/40 border-neutral-700/60 text-neutral-300 hover:bg-neutral-800'
                            }`}
                          >
                            <p className="text-xs font-semibold">{p.name}</p>
                            <p className="text-[10px] text-neutral-400 mt-0.5">{p.desc}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Position */}
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-neutral-300">Vertical Position</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: 'top', label: 'Top' },
                          { id: 'center', label: 'Center' },
                          { id: 'bottom', label: 'Bottom (Safe)' },
                        ].map((pos) => (
                          <button
                            key={pos.id}
                            onClick={() => {
                              setCaptionPosition(pos.id as CaptionPosition);
                              markDirty();
                            }}
                            className={`py-2 text-xs font-medium rounded-lg border text-center transition ${
                              captionPosition === pos.id
                                ? 'bg-orange-950/40 border-orange-500 text-white'
                                : 'bg-neutral-800/40 border-neutral-700/60 text-neutral-300 hover:bg-neutral-800'
                            }`}
                          >
                            {pos.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Timing details */}
                    <div className="p-3 bg-neutral-900 border border-neutral-800 rounded-lg text-xs text-neutral-400">
                      <p>
                        Timing Engine: <strong className="text-neutral-200 capitalize">{timingMode}</strong>-level
                      </p>
                      <p className="mt-1 text-[11px] text-neutral-500">
                        {cues.length} caption cue chunks automatically timed to audio.
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 2. LAYOUT & FRAMING TAB */}
            {activeTab === 'layout' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-semibold text-white">Framing & Aspect Ratio</h3>
                  <p className="text-xs text-neutral-400">Target platform dimensions and focus</p>
                </div>

                {/* Aspect Ratio */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-neutral-300">Target Aspect Ratio</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: '9:16', label: '9:16', desc: 'Shorts/TikTok' },
                      { id: '1:1', label: '1:1', desc: 'Square Feed' },
                      { id: '16:9', label: '16:9', desc: 'Landscape' },
                    ].map((ar) => (
                      <button
                        key={ar.id}
                        onClick={() => {
                          setAspectRatio(ar.id as ClipAspectRatio);
                          markDirty();
                        }}
                        className={`p-2.5 text-center rounded-lg border transition ${
                          aspectRatio === ar.id
                            ? 'bg-orange-950/40 border-orange-500 text-white'
                            : 'bg-neutral-800/40 border-neutral-700/60 text-neutral-300 hover:bg-neutral-800'
                        }`}
                      >
                        <p className="text-xs font-bold">{ar.label}</p>
                        <p className="text-[10px] text-neutral-400 mt-0.5">{ar.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Manual Crop Focus Pad */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-medium text-neutral-300">Horizontal Crop Focus</label>
                    <span className="text-[11px] text-neutral-400">
                      {Math.round((cropConfig.focusX || 0.5) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={cropConfig.focusX ?? 0.5}
                    onChange={(e) => {
                      setCropConfig({ ...cropConfig, focusX: parseFloat(e.target.value) || 0.5 });
                      markDirty();
                    }}
                    className="w-full accent-orange-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-neutral-500">
                    <span>Left (0%)</span>
                    <span>Center (50%)</span>
                    <span>Right (100%)</span>
                  </div>
                </div>

                {/* Quick focus shortcuts */}
                <div className="flex gap-2">
                  {[
                    { label: 'Left', x: 0 },
                    { label: 'Center', x: 0.5 },
                    { label: 'Right', x: 1.0 },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => {
                        setCropConfig({ ...cropConfig, focusX: preset.x });
                        markDirty();
                      }}
                      className="flex-1 py-1.5 bg-neutral-800/60 hover:bg-neutral-800 text-neutral-300 text-xs rounded border border-neutral-700 transition"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 3. HEADLINE / TEXT OVERLAY TAB */}
            {activeTab === 'text' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Headline / Callout Banner</h3>
                    <p className="text-xs text-neutral-400">Top text hook for viral retention</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={overlayConfig.enabled}
                      onChange={(e) => {
                        setOverlayConfig({ ...overlayConfig, enabled: e.target.checked });
                        markDirty();
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-600"></div>
                  </label>
                </div>

                {overlayConfig.enabled && (
                  <>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <label className="font-medium text-neutral-300">Overlay Text</label>
                        <span className="text-neutral-500">{(overlayConfig.text || '').length}/120</span>
                      </div>
                      <input
                        type="text"
                        maxLength={120}
                        placeholder="e.g. The #1 Habit That Changed Everything"
                        value={overlayConfig.text || ''}
                        onChange={(e) => {
                          setOverlayConfig({ ...overlayConfig, text: e.target.value });
                          markDirty();
                        }}
                        className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:border-orange-500"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-neutral-300">Position</label>
                      <div className="grid grid-cols-3 gap-2">
                        {['top', 'center', 'bottom'].map((pos) => (
                          <button
                            key={pos}
                            onClick={() => {
                              setOverlayConfig({ ...overlayConfig, position: pos as any });
                              markDirty();
                            }}
                            className={`py-2 text-xs font-medium rounded-lg border capitalize transition ${
                              overlayConfig.position === pos
                                ? 'bg-orange-950/40 border-orange-500 text-white'
                                : 'bg-neutral-800/40 border-neutral-700/60 text-neutral-300 hover:bg-neutral-800'
                            }`}
                          >
                            {pos}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-neutral-300">Size</label>
                      <div className="grid grid-cols-3 gap-2">
                        {['sm', 'md', 'lg'].map((sz) => (
                          <button
                            key={sz}
                            onClick={() => {
                              setOverlayConfig({ ...overlayConfig, size: sz as any });
                              markDirty();
                            }}
                            className={`py-2 text-xs font-medium rounded-lg border uppercase transition ${
                              overlayConfig.size === sz
                                ? 'bg-orange-950/40 border-orange-500 text-white'
                                : 'bg-neutral-800/40 border-neutral-700/60 text-neutral-300 hover:bg-neutral-800'
                            }`}
                          >
                            {sz}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 4. AUDIO TAB */}
            {activeTab === 'audio' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-semibold text-white">Audio Levels</h3>
                  <p className="text-xs text-neutral-400">Mute or boost dialogue volume</p>
                </div>

                <div className="flex items-center justify-between p-3 bg-neutral-800/40 border border-neutral-700/60 rounded-lg">
                  <div className="flex items-center gap-2.5">
                    {muted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5 text-neutral-300" />}
                    <span className="text-sm font-medium text-white">Mute Clip Audio</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={muted}
                      onChange={(e) => {
                        setMuted(e.target.checked);
                        markDirty();
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-600"></div>
                  </label>
                </div>

                {!muted && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <label className="font-medium text-neutral-300">Volume Output</label>
                      <span className="text-neutral-400">{Math.round(volume * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="2.0"
                      step="0.05"
                      value={volume}
                      onChange={(e) => {
                        setVolume(parseFloat(e.target.value) || 1.0);
                        markDirty();
                      }}
                      className="w-full accent-orange-500 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-neutral-500">
                      <span>0% (Silent)</span>
                      <span>100% (Normal)</span>
                      <span>200% (Boosted)</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClipEditorPage;
