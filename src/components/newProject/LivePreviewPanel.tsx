import React, { useEffect, useMemo, useState } from 'react';
import { Zap, Smartphone } from 'lucide-react';
import type { ClipAspectRatio, ContentGenre } from '../../types';

/**
 * Reactive "what you'll get" preview beside the new-project form. The frame morphs
 * between aspect ratios and the caption choreography re-renders per genre so the
 * user sees the output shape before committing to a 10-minute pipeline run.
 */

const FRAME_WIDTH = 210;

const ASPECT_FRAMES: Record<ClipAspectRatio, { height: number; platforms: string }> = {
  '9:16': { height: 372, platforms: 'TikTok · Shorts · Reels' },
  '4:5': { height: 262, platforms: 'IG Feed · Portrait' },
  '1:1': { height: 210, platforms: 'LinkedIn · IG Feed' },
  '16:9': { height: 118, platforms: 'YouTube · X' },
};

const GENRE_SCENES: Record<string, { gradient: string; line: string }> = {
  podcast_interview: {
    gradient: 'from-violet-900 via-zinc-900 to-zinc-950',
    line: 'nobody tells you this part of the story',
  },
  motivation: {
    gradient: 'from-orange-700 via-rose-800 to-purple-950',
    line: 'you are one decision away from everything',
  },
  gaming: {
    gradient: 'from-fuchsia-700 via-violet-800 to-indigo-950',
    line: 'and the whole lobby went completely silent',
  },
  education_tutorial: {
    gradient: 'from-sky-800 via-indigo-900 to-zinc-950',
    line: 'here is the three step framework that works',
  },
  business_finance: {
    gradient: 'from-emerald-800 via-zinc-900 to-zinc-950',
    line: 'the numbers tell a completely different story',
  },
  comedy_entertainment: {
    gradient: 'from-amber-700 via-rose-800 to-zinc-950',
    line: 'wait for it — this is the actual punchline',
  },
  default: {
    gradient: 'from-violet-700 via-purple-800 to-zinc-950',
    line: 'this changes everything about how we work',
  },
};

const CYCLE_MS = 4200;

export interface LivePreviewPanelProps {
  aspectRatio: ClipAspectRatio;
  genre: ContentGenre | 'auto';
  genreLabel: string;
  durationLabel: string;
  goalLabel: string;
  className?: string;
}

export const LivePreviewPanel: React.FC<LivePreviewPanelProps> = ({
  aspectRatio,
  genre,
  genreLabel,
  durationLabel,
  goalLabel,
  className = '',
}) => {
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setCycle((c) => c + 1), CYCLE_MS);
    return () => window.clearInterval(id);
  }, []);

  const scene = GENRE_SCENES[genre] || GENRE_SCENES.default;
  const frame = ASPECT_FRAMES[aspectRatio] || ASPECT_FRAMES['9:16'];

  const words = useMemo(() => scene.line.split(' '), [scene.line]);
  const highlightIndex = Math.floor(words.length / 2);

  return (
    <div
      className={`rounded-2xl bg-vc-surface1/90 p-5 backdrop-blur-xl ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-white font-['Sora',sans-serif]">
          <Smartphone className="size-4 text-violet-400" aria-hidden="true" />
          Live output preview
        </h3>
        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
          updates as you tune
        </span>
      </div>

      {/* Phone frame — height morphs between aspect ratios */}
      <div className="mt-5 flex justify-center">
        <div
          className="relative overflow-hidden rounded-[1.4rem] border border-white/15 bg-black shadow-[0_20px_60px_-15px_rgba(139,92,246,0.45)] transition-[height,width] duration-500 ease-out"
          style={{ width: FRAME_WIDTH, height: frame.height }}
          role="img"
          aria-label={`Preview of a ${aspectRatio} clip with kinetic captions for ${genreLabel}`}
        >
          {/* Scene */}
          <div className={`absolute inset-0 bg-gradient-to-br ${scene.gradient}`} />

          {/* Podcast split dual-stack speaker mock */}
          {genre === 'podcast_interview' && aspectRatio !== '16:9' && (
            <div className="absolute inset-x-3 top-5 bottom-16 flex flex-col gap-2">
              <div className="flex-1 rounded-xl border border-white/25 bg-white/[0.07] flex items-center justify-center">
                <div className="size-8 rounded-full bg-zinc-600 border-2 border-white/30" />
              </div>
              <div className="flex-1 rounded-xl border border-white/10 bg-black/30 flex items-center justify-center opacity-50">
                <div className="size-8 rounded-full bg-zinc-600" />
              </div>
            </div>
          )}

          {/* Center glyph for single-subject genres */}
          {genre !== 'podcast_interview' && (
            <div className="absolute inset-0 flex items-center justify-center pb-14">
              <div className="size-12 rounded-full border-2 border-white/25 bg-white/[0.06] backdrop-blur-sm" />
            </div>
          )}

          {/* Progress rail */}
          <div className="absolute top-2 inset-x-3 h-1 rounded-full bg-white/20">
            <div className="h-full w-2/3 rounded-full bg-violet-400" />
          </div>

          {/* Kinetic captions */}
          <div className="absolute inset-x-2.5 bottom-8 text-center">
            <p className="text-[13px] leading-snug font-extrabold tracking-tight text-white [text-shadow:0_2px_10px_rgba(0,0,0,0.65)]">
              {words.map((word, i) => (
                <span
                  key={`${cycle}-${i}`}
                  className={`np-word mr-1 ${
                    i === highlightIndex
                      ? 'text-violet-300'
                      : ''
                  }`}
                  style={{ animationDelay: `${i * 90}ms` }}
                >
                  {word}
                </span>
              ))}
            </p>
          </div>

          {/* Hook badge */}
          <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-200 backdrop-blur-sm">
            <Zap className="size-2.5" aria-hidden="true" />
            Hook · first 3s
          </div>
        </div>
      </div>

      <p className="mt-3 text-center text-[11px] font-mono text-zinc-400">{frame.platforms}</p>

      {/* Reactive spec chips */}
      <div className="mt-4 flex flex-wrap justify-center gap-1.5">
        <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-200">
          {genreLabel}
        </span>
        <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-zinc-300">
          {durationLabel}
        </span>
        <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-zinc-300">
          {goalLabel}
        </span>
        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-zinc-200">
          Kinetic captions
        </span>
      </div>
    </div>
  );
};
