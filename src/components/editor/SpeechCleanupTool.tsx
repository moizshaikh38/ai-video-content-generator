import React, { useState, useMemo } from 'react';
import {
  Sliders,
  Scissors,
  ChevronUp,
  Volume2,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { TimedCaptionCue } from '../../types';

export interface PauseItem {
  id: string;
  startSec: number;
  endSec: number;
  duration: number;
  label: string;
}

export interface SpeechCleanupToolProps {
  cues: TimedCaptionCue[];
  threshold: number;
  onThresholdChange: (newThreshold: number) => void;
  onCleanAllPauses: (pauses: Array<{ startSec: number; endSec: number }>) => void;
  onCleanSinglePause: (startSec: number, endSec: number) => void;
  onCleanAllFillers: () => void;
  onSeek: (time: number) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export const COMMON_FILLER_WORDS = new Set([
  'um',
  'uh',
  'hmm',
  'er',
  'ah',
  'you know',
  'like',
  'actually',
  'basically',
  'sort of',
  'kind of',
]);

export const SpeechCleanupTool: React.FC<SpeechCleanupToolProps> = ({
  cues,
  threshold,
  onThresholdChange,
  onCleanAllPauses,
  onCleanSinglePause,
  onCleanAllFillers,
  onSeek,
  isOpen: controlledIsOpen,
  onClose,
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const setIsOpen = (next: boolean) => {
    if (controlledIsOpen !== undefined) {
      if (!next && onClose) onClose();
    } else {
      setInternalIsOpen(next);
    }
  };

  // Compute all silence intervals above threshold
  const detectedPauses: PauseItem[] = useMemo(() => {
    const list: PauseItem[] = [];

    for (let cIdx = 0; cIdx < cues.length; cIdx++) {
      const cue = cues[cIdx];

      // 1. Pauses within words of the same cue
      if (Array.isArray(cue.words) && cue.words.length > 1) {
        for (let wIdx = 0; wIdx < cue.words.length - 1; wIdx++) {
          const wCurrent = cue.words[wIdx];
          const wNext = cue.words[wIdx + 1];
          const gap = Number((wNext.start - wCurrent.end).toFixed(3));
          if (gap >= threshold) {
            list.push({
              id: `pause_internal_${cue.id}_${wIdx}`,
              startSec: wCurrent.end,
              endSec: wNext.start,
              duration: gap,
              label: `Pause inside "${cue.text.slice(0, 20)}..."`,
            });
          }
        }
      }

      // 2. Pause between this cue and the next cue
      if (cIdx < cues.length - 1) {
        const nextCue = cues[cIdx + 1];
        const gap = Number((nextCue.start - cue.end).toFixed(3));
        if (gap >= threshold) {
          list.push({
            id: `pause_between_${cue.id}_${nextCue.id}`,
            startSec: cue.end,
            endSec: nextCue.start,
            duration: gap,
            label: `Dead air after "${(cue.words?.[cue.words.length - 1]?.text || (cue.words?.[cue.words.length - 1] as any)?.word || cue.text.split(' ').pop()) || ''}"`,
          });
        }
      }
    }

    return list;
  }, [cues, threshold]);

  // Compute total dead air time
  const totalDeadAirSec = useMemo(() => {
    return detectedPauses.reduce((acc, p) => acc + p.duration, 0);
  }, [detectedPauses]);

  // Count filler words
  const fillerCount = useMemo(() => {
    let count = 0;
    for (const cue of cues) {
      if (Array.isArray(cue.words) && cue.words.length > 0) {
        for (const w of cue.words) {
          const clean = (w.text || (w as any).word || '').toLowerCase().replace(/[^a-z]/g, '');
          if (COMMON_FILLER_WORDS.has(clean)) count++;
        }
      } else {
        const words = cue.text.toLowerCase().split(/\s+/);
        for (const w of words) {
          if (COMMON_FILLER_WORDS.has(w.replace(/[^a-z]/g, ''))) count++;
        }
      }
    }
    return count;
  }, [cues]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="bg-[#0C0E15] border-b border-white/[0.08] text-neutral-200 select-none animate-fadeIn">
      {/* Header bar of drawer */}
      <div className="px-3.5 py-2.5 flex items-center justify-between border-b border-white/[0.04]">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Sparkles className="w-3 h-3" />
          </div>
          <span className="text-xs font-semibold text-white">Speech Tools</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
            {detectedPauses.length} pauses ({totalDeadAirSec.toFixed(1)}s)
          </span>
          {fillerCount > 0 && (
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20">
              {fillerCount} fillers
            </span>
          )}
        </div>

        {(onClose || controlledIsOpen === undefined) && (
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="p-1 rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.06] transition"
            title="Close speech tools"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Drawer content */}
      <div className="p-3 space-y-3">
        {/* Quick batch action buttons */}
        <div className="flex items-center gap-1.5">
          {fillerCount > 0 && (
            <button
              type="button"
              onClick={onCleanAllFillers}
              className="flex-1 px-2.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-200 text-xs font-medium flex items-center justify-center gap-1.5 transition"
              title="Remove filler words from captions"
            >
              <Sparkles className="w-3 h-3 text-rose-400" />
              <span>Clean Fillers ({fillerCount})</span>
            </button>
          )}

          {detectedPauses.length > 0 && (
            <button
              type="button"
              onClick={() => onCleanAllPauses(detectedPauses)}
              className="flex-1 px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-medium flex items-center justify-center gap-1.5 transition"
              title={`Ripple cut all ${detectedPauses.length} pauses (${totalDeadAirSec.toFixed(1)}s)`}
            >
              <Scissors className="w-3 h-3 text-amber-400" />
              <span>Cut All Pauses</span>
            </button>
          )}
        </div>

        {/* Silence Duration Threshold */}
        <div className="space-y-1.5 bg-black/20 p-2.5 rounded-lg border border-white/[0.04]">
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-400 flex items-center gap-1.5 text-[11px]">
              <Sliders className="w-3 h-3 text-neutral-400" />
              <span>Silence Threshold:</span>
            </span>
            <span className="font-mono text-amber-300 font-medium text-xs">{threshold.toFixed(2)}s</span>
          </div>
          <input
            type="range"
            min="0.2"
            max="1.5"
            step="0.05"
            value={threshold}
            onChange={(e) => onThresholdChange(parseFloat(e.target.value))}
            className="w-full accent-amber-400 cursor-pointer h-1 bg-white/[0.1] rounded-lg"
          />
          <div className="flex justify-between text-[9px] font-mono text-neutral-500">
            <span>0.2s Tight</span>
            <span>0.5s Natural</span>
            <span>1.5s Dead air</span>
          </div>
        </div>

        {/* List of Detected Pauses */}
        <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
          <div className="text-[10px] uppercase font-semibold text-neutral-400 tracking-wider mb-1">
            Silence Intervals ({detectedPauses.length}):
          </div>
          {detectedPauses.length === 0 ? (
            <div className="text-center py-3 text-xs text-neutral-500 italic">
              No pauses found above {threshold.toFixed(2)}s threshold
            </div>
          ) : (
            detectedPauses.map((pause, idx) => (
              <div
                key={pause.id}
                className="flex items-center justify-between px-2 py-1 rounded-md bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] text-xs transition"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-mono text-neutral-500 shrink-0">#{idx + 1}</span>
                  <button
                    type="button"
                    onClick={() => onSeek(pause.startSec)}
                    className="flex items-center gap-1 text-amber-300 hover:text-amber-200 font-mono text-[11px] shrink-0"
                    title="Seek to pause"
                  >
                    <Volume2 className="w-3 h-3 text-neutral-400" />
                    <span>{pause.duration.toFixed(2)}s</span>
                  </button>
                  <span className="text-[10px] font-mono text-neutral-500 truncate">
                    {pause.startSec.toFixed(1)}s – {pause.endSec.toFixed(1)}s
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => onCleanSinglePause(pause.startSec, pause.endSec)}
                  className="p-1 rounded text-neutral-400 hover:text-rose-400 hover:bg-rose-500/10 transition shrink-0"
                  title="Ripple cut this pause"
                  aria-label={`Cut pause ${pause.duration.toFixed(2)}s`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
