import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  Shield,
  Volume2,
  VolumeX,
  Settings2,
} from 'lucide-react';

interface PlaybackControllerProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onStepFrames: (frames: number) => void;
  playbackRate: number;
  onChangePlaybackRate: (rate: number) => void;
  volume: number;
  isMuted: boolean;
  onChangeVolume: (vol: number) => void;
  onToggleMute: () => void;
  isLooping: boolean;
  onToggleLoop: () => void;
  showSafeGuides: boolean;
  onToggleSafeGuides: () => void;
  formatTime: (time: number) => string;
}

const iconBtn =
  'p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50';

/**
 * Compact transport group. Rendered inside the timeline toolbar (not as its own strip), so the
 * editor has a single playback surface driven by the shared playback state. Secondary settings —
 * speed, loop, safe guides, volume — live in the popover rather than taking toolbar width.
 */
export const PlaybackController: React.FC<PlaybackControllerProps> = ({
  currentTime,
  duration,
  isPlaying,
  onTogglePlay,
  onSeek: _onSeek,
  onStepFrames,
  playbackRate,
  onChangePlaybackRate,
  volume,
  isMuted,
  onChangeVolume,
  onToggleMute,
  isLooping,
  onToggleLoop,
  showSafeGuides,
  onToggleSafeGuides,
  formatTime,
}) => {
  const [showSettings, setShowSettings] = useState(false);
  // The timeline is bottom-docked, so the popover normally opens upward; flip it down if the
  // toolbar sits too close to the top of the viewport for it to fit.
  const [openUp, setOpenUp] = useState(true);
  const settingsRef = useRef<HTMLDivElement>(null);

  const toggleSettings = () => {
    setShowSettings((v) => {
      if (!v && settingsRef.current) {
        const POPOVER_H = 150;
        setOpenUp(settingsRef.current.getBoundingClientRect().top >= POPOVER_H);
      }
      return !v;
    });
  };

  // Close the popover on outside click / Escape so it never traps focus over the timeline.
  useEffect(() => {
    if (!showSettings) return;
    const onDown = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowSettings(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [showSettings]);

  const secondaryActive = isLooping || showSafeGuides || playbackRate !== 1 || isMuted;

  return (
    <div className="flex items-center gap-1.5 select-none">
      <button
        onClick={() => onStepFrames(-1)}
        className="p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
        title="Previous frame (←)"
        aria-label="Previous frame"
      >
        <SkipBack className="w-3.5 h-3.5" />
      </button>

      {/* Primary Play/Pause action matching Opus.pro */}
      <button
        onClick={onTogglePlay}
        title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        className="w-7 h-7 mx-0.5 rounded-full bg-white hover:bg-neutral-100 active:bg-zinc-200 text-vc-action-foreground flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_1px_2px_rgba(0,0,0,0.4)] transition-transform active:translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
      >
        {isPlaying ? (
          <Pause className="w-3.5 h-3.5 fill-current" />
        ) : (
          <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
        )}
      </button>

      <button
        onClick={() => onStepFrames(1)}
        className="p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
        title="Next frame (→)"
        aria-label="Next frame"
      >
        <SkipForward className="w-3.5 h-3.5" />
      </button>

      {/* Timecode display matching Opus MM:SS.ss / MM:SS.ss */}
      <div className="ml-2 font-mono text-[11px] tracking-tight tabular-nums whitespace-nowrap">
        <span className="text-white font-medium">{formatTime(currentTime)}</span>
        <span className="text-neutral-500 mx-1.5 font-normal">/</span>
        <span className="text-neutral-400 font-normal">{formatTime(duration)}</span>
      </div>

      {/* Secondary playback settings */}
      <div className="relative ml-0.5" ref={settingsRef}>
        <button
          onClick={toggleSettings}
          className={`p-1.5 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${
            showSettings || secondaryActive
              ? 'bg-white/[0.12] text-white'
              : 'text-neutral-400 hover:text-white hover:bg-white/[0.08]'
          }`}
          title="Playback settings"
          aria-label="Playback settings"
          aria-expanded={showSettings}
        >
          <Settings2 className="w-3.5 h-3.5" />
        </button>

        {showSettings && (
          <div className={`absolute left-1/2 -translate-x-1/2 z-50 w-56 rounded-2xl glass-float p-3 space-y-3 ${openUp ? "bottom-full mb-2" : "top-full mt-2"}`}>
            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] text-neutral-400">Speed</label>
              <select
                value={playbackRate}
                onChange={(e) => onChangePlaybackRate(parseFloat(e.target.value))}
                className="bg-vc-surface1 border border-white/[0.1] rounded-md px-1.5 py-0.5 text-[11px] font-mono text-neutral-200"
              >
                <option value="0.5">0.5x</option>
                <option value="1">1.0x</option>
                <option value="1.25">1.25x</option>
                <option value="1.5">1.5x</option>
                <option value="2">2.0x</option>
              </select>
            </div>

            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] text-neutral-400 flex items-center gap-1.5">
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-3.5 h-3.5 text-neutral-300" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-neutral-300" />
                )}
                Volume
              </label>
              <div className="flex items-center gap-1.5">
                <button onClick={onToggleMute} className={iconBtn} title={isMuted ? 'Unmute' : 'Mute'}>
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-3.5 h-3.5" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5" />
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => onChangeVolume(parseFloat(e.target.value))}
                  className="w-20"
                  aria-label="Volume"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/[0.06]">
              <button
                onClick={onToggleLoop}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                  isLooping
                    ? 'bg-white/[0.12] border-white/25 text-white'
                    : 'bg-transparent border-white/[0.08] text-neutral-400 hover:text-white'
                }`}
                title="Toggle looping"
                aria-pressed={isLooping}
              >
                <Repeat className="w-3.5 h-3.5" />
                Loop
              </button>
              <button
                onClick={onToggleSafeGuides}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                  showSafeGuides
                    ? 'bg-white/[0.12] border-white/25 text-white'
                    : 'bg-transparent border-white/[0.08] text-neutral-400 hover:text-white'
                }`}
                title="Toggle platform safe zones"
                aria-pressed={showSafeGuides}
              >
                <Shield className="w-3.5 h-3.5" />
                Safe
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
