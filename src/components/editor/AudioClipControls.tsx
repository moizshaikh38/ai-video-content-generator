import React from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { EditorAudioConfig, EditorTrackItem } from '../../types';

interface AudioClipControlsProps {
  item: EditorTrackItem;
  onUpdateItem: (itemId: string, updates: Partial<EditorTrackItem>) => void;
}

/** Defaults for an audio clip that has no explicit audio config yet. */
const DEFAULT_AUDIO: EditorAudioConfig = {
  volume: 1.0,
  fade_in: 0,
  fade_out: 0,
  normalized: false,
  target_lufs: -16,
};

/** Longest fade we expose; also clamped to the clip's own duration below. */
const MAX_FADE = 5;

/**
 * Per-clip audio controls for a selected AUDIO track item. Every control maps to a field
 * the export render graph honors (item.muted, item.audio.volume / fade_in / fade_out), so
 * the preview mix and the exported file stay in sync.
 */
export const AudioClipControls: React.FC<AudioClipControlsProps> = ({ item, onUpdateItem }) => {
  const audio = item.audio ?? DEFAULT_AUDIO;
  const muted = Boolean(item.muted);
  const clipDuration = Math.max(0.1, item.source_end - item.source_start);
  const fadeMax = Math.min(MAX_FADE, Number((clipDuration / 2).toFixed(2)));

  const patchAudio = (patch: Partial<EditorAudioConfig>) => {
    onUpdateItem(item.id, { audio: { ...DEFAULT_AUDIO, ...audio, ...patch } });
  };

  const volumePct = Math.round((audio.volume ?? 1) * 100);

  return (
    <div className="space-y-3 pt-3 border-t border-white/[0.08]">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
          Audio
        </label>
        <button
          type="button"
          onClick={() => onUpdateItem(item.id, { muted: !muted })}
          aria-pressed={muted}
          title={muted ? 'Unmute clip' : 'Mute clip'}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
            muted
              ? 'bg-red-500/15 border-red-500/40 text-red-300'
              : 'bg-vc-canvas border-white/[0.08] text-neutral-300 hover:border-white/20'
          }`}
        >
          {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          <span>{muted ? 'Muted' : 'Mute'}</span>
        </button>
      </div>

      {/* Volume */}
      <div className={muted ? 'opacity-40 pointer-events-none' : ''}>
        <div className="flex items-center justify-between text-[10px] mb-1">
          <label htmlFor="audio-volume" className="text-neutral-400 font-medium">
            Clip Volume
          </label>
          <span className="text-neutral-300 font-mono">{volumePct}%</span>
        </div>
        <input
          id="audio-volume"
          type="range"
          min={0}
          max={200}
          step={1}
          value={volumePct}
          onChange={(e) => patchAudio({ volume: Number(e.target.value) / 100 })}
          className="w-full accent-white cursor-pointer"
        />
      </div>

      {/* Fades */}
      <div className={`grid grid-cols-2 gap-3 ${muted ? 'opacity-40 pointer-events-none' : ''}`}>
        <div>
          <div className="flex items-center justify-between text-[10px] mb-1">
            <label htmlFor="audio-fade-in" className="text-neutral-400 font-medium">
              Fade In
            </label>
            <span className="text-neutral-300 font-mono">{(audio.fade_in ?? 0).toFixed(1)}s</span>
          </div>
          <input
            id="audio-fade-in"
            type="range"
            min={0}
            max={fadeMax}
            step={0.1}
            value={Math.min(audio.fade_in ?? 0, fadeMax)}
            onChange={(e) => patchAudio({ fade_in: Number(e.target.value) })}
            className="w-full accent-white cursor-pointer"
          />
        </div>
        <div>
          <div className="flex items-center justify-between text-[10px] mb-1">
            <label htmlFor="audio-fade-out" className="text-neutral-400 font-medium">
              Fade Out
            </label>
            <span className="text-neutral-300 font-mono">{(audio.fade_out ?? 0).toFixed(1)}s</span>
          </div>
          <input
            id="audio-fade-out"
            type="range"
            min={0}
            max={fadeMax}
            step={0.1}
            value={Math.min(audio.fade_out ?? 0, fadeMax)}
            onChange={(e) => patchAudio({ fade_out: Number(e.target.value) })}
            className="w-full accent-white cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
};
