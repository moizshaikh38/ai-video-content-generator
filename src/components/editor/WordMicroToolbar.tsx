import React, { useState, useEffect, useRef } from 'react';
import {
  Edit3,
  Palette,
  ZoomIn,
  Clock,
  Trash2,
  Check,
  X,
  Volume2,
  Scissors,
  Sparkles,
} from 'lucide-react';
import { TimedCaptionCue, WordCustomStyle } from '../../types';

export interface WordMicroToolbarProps {
  word: {
    word?: string;
    text?: string;
    start: number;
    end: number;
    confidence?: number;
    customStyle?: WordCustomStyle;
  };
  cue: TimedCaptionCue;
  wordIdx: number;
  anchorRect: DOMRect;
  onClose: () => void;
  onUpdateWordText: (newWord: string, applyToAll: boolean) => void;
  onUpdateWordTiming: (newStart: number, newEnd: number) => void;
  onApplyHighlightColor: (color: string) => void;
  onApplyWordCustomStyle?: (style: WordCustomStyle) => void;
  onInsertEmoji: (emoji: string) => void;
  onPunchInZoom: (wordStart: number) => void;
  onDeleteWord: (cutMedia: boolean) => void;
  onSeek: (time: number) => void;
  matchCount: number;
}

const HIGHLIGHT_SWATCHES = [
  { name: 'Default', hex: '#FFFFFF', bg: 'bg-white' },
  { name: 'Viral Gold', hex: '#FACC15', bg: 'bg-yellow-400' },
  { name: 'Emerald Stat', hex: '#10B981', bg: 'bg-emerald-500' },
  { name: 'Fire Orange', hex: '#FF6B35', bg: 'bg-orange-500' },
  { name: 'Electric Violet', hex: '#A78BFA', bg: 'bg-purple-400' },
  { name: 'Cyber Cyan', hex: '#06B6D4', bg: 'bg-cyan-500' },
];

const EMOJI_PRESETS = ['🔥', '🚀', '💡', '🤯', '⚡', '👏', '🎯', '👀', '💯', '✨'];

export const WordMicroToolbar: React.FC<WordMicroToolbarProps> = ({
  word,
  cue,
  wordIdx: _wordIdx,
  anchorRect,
  onClose,
  onUpdateWordText,
  onUpdateWordTiming,
  onApplyHighlightColor,
  onApplyWordCustomStyle,
  onInsertEmoji,
  onPunchInZoom,
  onDeleteWord,
  onSeek,
  matchCount,
}) => {
  const currentWordText = word.word || word.text || '';
  const [activeTab, setActiveTab] = useState<'edit' | 'color' | 'timing' | 'delete'>('edit');
  const [editText, setEditText] = useState(currentWordText);
  const [startSec, setStartSec] = useState(word.start);
  const [endSec, setEndSec] = useState(word.end);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Compute anchored position (clamp to screen boundaries)
  const popoverWidth = 320;
  const topPos = Math.max(10, anchorRect.top - 180);
  const leftPos = Math.min(
    Math.max(10, anchorRect.left + anchorRect.width / 2 - popoverWidth / 2),
    window.innerWidth - popoverWidth - 20
  );

  const durationMs = Math.round((endSec - startSec) * 1000);

  return (
    <div
      ref={popoverRef}
      style={{ top: `${topPos}px`, left: `${leftPos}px`, width: `${popoverWidth}px` }}
      className="fixed z-50 bg-[#0E1017]/95 backdrop-blur-xl border border-white/[0.1] rounded-2xl shadow-2xl p-3 text-neutral-200 animate-in fade-in zoom-in-95 duration-150 select-none"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Top Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-2 mb-2">
        <div className="flex items-center gap-1 bg-white/[0.04] p-0.5 rounded-xl border border-white/[0.08]">
          <button
            onClick={() => setActiveTab('edit')}
            className={`px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition ${
              activeTab === 'edit'
                ? 'bg-white/[0.1] text-white shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
            title="Edit word spelling"
          >
            <Edit3 className="w-3 h-3 text-neutral-300" />
            <span>Edit</span>
          </button>

          <button
            onClick={() => setActiveTab('color')}
            className={`px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition ${
              activeTab === 'color'
                ? 'bg-white/[0.1] text-white shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
            title="Highlight color & emojis"
          >
            <Palette className="w-3 h-3 text-yellow-400" />
            <span>Style</span>
          </button>

          <button
            onClick={() => setActiveTab('timing')}
            className={`px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition ${
              activeTab === 'timing'
                ? 'bg-white/[0.1] text-white shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
            title="Trim word boundaries"
          >
            <Clock className="w-3 h-3 text-emerald-400" />
            <span>Timing</span>
          </button>

          <button
            onClick={() => setActiveTab('delete')}
            className={`px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition ${
              activeTab === 'delete'
                ? 'bg-rose-950/60 text-rose-300 border border-rose-800/40'
                : 'text-neutral-400 hover:text-rose-400'
            }`}
            title="Delete word or ripple cut footage"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-white/[0.08] text-neutral-400 hover:text-white transition"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Tab 1: Edit Word (Single vs Global Replace) */}
      {activeTab === 'edit' && (
        <div className="space-y-2">
          <div className="relative">
            <input
              type="text"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onUpdateWordText(editText.trim(), false);
                  onClose();
                }
              }}
              autoFocus
              className="w-full bg-[#07080D] border border-white/[0.1] rounded-xl px-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white/30 shadow-inner"
              placeholder="Correct word..."
            />
          </div>

          <div className="flex items-center gap-1.5 pt-1">
            <button
              onClick={() => {
                if (editText.trim()) {
                  onUpdateWordText(editText.trim(), false);
                  onClose();
                }
              }}
              className="flex-1 py-1.5 px-2 rounded-xl bg-white/[0.15] hover:bg-white/20 text-white text-[11px] font-medium flex items-center justify-center gap-1 shadow-md shadow-black/50 transition"
            >
              <Check className="w-3 h-3" />
              <span>Apply</span>
            </button>

            {matchCount > 1 && (
              <button
                onClick={() => {
                  if (editText.trim()) {
                    onUpdateWordText(editText.trim(), true);
                    onClose();
                  }
                }}
                className="py-1.5 px-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-neutral-200 text-[11px] font-medium flex items-center gap-1 border border-white/[0.08] transition"
                title={`Replace all ${matchCount} occurrences across this video`}
              >
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span>Apply All ({matchCount})</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Style, Swatches & Emojis */}
      {activeTab === 'color' && (
        <div className="space-y-2.5">
          {/* Word Visual FX Quick Actions */}
          <div>
            <div className="text-[10px] uppercase font-semibold text-neutral-400 mb-1.5 tracking-wider">
              Word Visual FX
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onApplyWordCustomStyle?.({ fontSizeMultiplier: 1.25, effect: 'pop' });
                  onClose();
                }}
                className="py-1 px-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-[10px] font-semibold flex items-center justify-center gap-1 transition"
                title="Pop Scale (1.25x)"
              >
                <span>🔥</span>
                <span>Pop</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onApplyWordCustomStyle?.({ effect: 'pill', pillColor: '#ED3A7C' });
                  onClose();
                }}
                className="py-1 px-1.5 rounded-lg bg-pink-500/15 hover:bg-pink-500/25 border border-pink-500/30 text-pink-300 text-[10px] font-semibold flex items-center justify-center gap-1 transition"
                title="CapCut Pill Badge"
              >
                <span>💊</span>
                <span>Pill</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onApplyWordCustomStyle?.({ effect: 'glow', highlightColor: '#A855F7' });
                  onClose();
                }}
                className="py-1 px-1.5 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 text-[10px] font-semibold flex items-center justify-center gap-1 transition"
                title="Neon Glow"
              >
                <span>⚡</span>
                <span>Glow</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onApplyWordCustomStyle?.({ uppercase: true });
                  onClose();
                }}
                className="py-1 px-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 text-[10px] font-mono font-bold flex items-center justify-center gap-1 transition"
                title="Force Uppercase"
              >
                <span>🔠</span>
                <span>AA</span>
              </button>
            </div>
          </div>

          {/* Swatches */}
          <div>
            <div className="text-[10px] uppercase font-semibold text-neutral-400 mb-1.5 tracking-wider">
              Word Color
            </div>
            <div className="flex items-center gap-1.5">
              {HIGHLIGHT_SWATCHES.map((swatch) => (
                <button
                  key={swatch.hex}
                  onClick={() => {
                    if (onApplyWordCustomStyle) {
                      onApplyWordCustomStyle({ color: swatch.hex, highlightColor: swatch.hex });
                    } else {
                      onApplyHighlightColor(swatch.hex);
                    }
                    onClose();
                  }}
                  className={`w-6 h-6 rounded-lg ${swatch.bg} border border-neutral-700 hover:scale-110 transition shadow-sm`}
                  title={swatch.name}
                />
              ))}
            </div>
          </div>

          {/* Quick Emojis */}
          <div>
            <div className="text-[10px] uppercase font-semibold text-neutral-400 mb-1.5 tracking-wider">
              Insert Emoji
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {EMOJI_PRESETS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    onInsertEmoji(emoji);
                    onClose();
                  }}
                  className="w-7 h-7 rounded-lg bg-[#07080D] hover:bg-white/[0.08] text-sm flex items-center justify-center hover:scale-110 transition"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* 1-Click Punch-In Zoom */}
          <div className="pt-1 border-t border-white/[0.08]">
            <button
              onClick={() => {
                onPunchInZoom(word.start);
                onClose();
              }}
              className="w-full py-1.5 px-2 rounded-xl bg-white/[0.08] border border-white/[0.12] hover:border-white/40 text-white text-[11px] font-medium flex items-center justify-center gap-1.5 transition"
            >
              <ZoomIn className="w-3.5 h-3.5 text-neutral-300" />
              <span>1-Click Punch-In Zoom (1.08x)</span>
            </button>
          </div>
        </div>
      )}

      {/* Tab 3: Timing Scrubber */}
      {activeTab === 'timing' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] text-neutral-400">
            <span>Duration: <strong className="text-white font-mono">{durationMs}ms</strong></span>
            <button
              onClick={() => onSeek(startSec)}
              className="flex items-center gap-1 text-neutral-300 hover:text-white font-medium"
            >
              <Volume2 className="w-3 h-3" />
              <span>Preview</span>
            </button>
          </div>

          {/* Start Stepper */}
          <div className="flex items-center justify-between bg-neutral-900 p-1.5 rounded-xl border border-neutral-800 text-xs">
            <span className="text-neutral-400 text-[11px]">Start:</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setStartSec((s) => Math.max(cue.start, Number((s - 0.05).toFixed(3))))}
                className="w-5 h-5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 flex items-center justify-center font-mono text-[10px]"
              >
                -
              </button>
              <span className="font-mono text-white text-[11px] w-12 text-center">
                {startSec.toFixed(2)}s
              </span>
              <button
                onClick={() => setStartSec((s) => Math.min(endSec - 0.05, Number((s + 0.05).toFixed(3))))}
                className="w-5 h-5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 flex items-center justify-center font-mono text-[10px]"
              >
                +
              </button>
            </div>
          </div>

          {/* End Stepper */}
          <div className="flex items-center justify-between bg-neutral-900 p-1.5 rounded-xl border border-neutral-800 text-xs">
            <span className="text-neutral-400 text-[11px]">End:</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setEndSec((e) => Math.max(startSec + 0.05, Number((e - 0.05).toFixed(3))))}
                className="w-5 h-5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 flex items-center justify-center font-mono text-[10px]"
              >
                -
              </button>
              <span className="font-mono text-white text-[11px] w-12 text-center">
                {endSec.toFixed(2)}s
              </span>
              <button
                onClick={() => setEndSec((e) => Math.min(cue.end + 2.0, Number((e + 0.05).toFixed(3))))}
                className="w-5 h-5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 flex items-center justify-center font-mono text-[10px]"
              >
                +
              </button>
            </div>
          </div>

          <button
            onClick={() => {
              onUpdateWordTiming(startSec, endSec);
              onClose();
            }}
            className="w-full py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-medium flex items-center justify-center gap-1 shadow-md shadow-emerald-950/50 transition"
          >
            <Check className="w-3 h-3" />
            <span>Apply Word Timing</span>
          </button>
        </div>
      )}

      {/* Tab 4: Dual-Mode Delete */}
      {activeTab === 'delete' && (
        <div className="space-y-2">
          <div className="text-[11px] text-neutral-300 font-medium">
            Choose how to remove "{currentWordText}":
          </div>

          <button
            onClick={() => {
              onDeleteWord(false);
              onClose();
            }}
            className="w-full py-2 px-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-left text-xs transition space-y-0.5"
          >
            <div className="text-neutral-200 font-medium">Remove Caption Text Only</div>
            <div className="text-[10px] text-neutral-500">
              Hides word subtitle but keeps video and background dialogue
            </div>
          </button>

          <button
            onClick={() => {
              onDeleteWord(true);
              onClose();
            }}
            className="w-full py-2 px-2.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/70 border border-rose-800/60 text-left text-xs text-rose-200 transition space-y-0.5 shadow-md shadow-rose-950/30"
          >
            <div className="font-semibold flex items-center gap-1.5 text-rose-300">
              <Scissors className="w-3.5 h-3.5" />
              <span>✂️ Ripple Cut Video & Word</span>
            </div>
            <div className="text-[10px] text-rose-400/80">
              Cuts out {durationMs}ms of video footage & shifts subsequent timeline items
            </div>
          </button>
        </div>
      )}
    </div>
  );
};
