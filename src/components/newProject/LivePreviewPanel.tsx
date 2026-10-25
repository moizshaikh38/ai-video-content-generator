import React, { useEffect, useMemo, useState } from 'react';
import { Zap, Smartphone, Users, MonitorPlay, Camera } from 'lucide-react';
import type { ClipAspectRatio, ContentGenre } from '../../types';

/**
 * Reactive "what you'll get" preview beside the new-project form.
 * Loads the real YouTube thumbnail from the pasted URL and simulates the
 * genre's recommended framing layout (split, screencast, blur, face-track)
 * with animated overlays so the user sees the output shape before committing.
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
  sports: {
    gradient: 'from-green-800 via-teal-900 to-zinc-950',
    line: 'and the ball is in the back of the net',
  },
  storytelling: {
    gradient: 'from-indigo-700 via-violet-800 to-zinc-950',
    line: 'and then everything changed forever',
  },
  product_marketing: {
    gradient: 'from-blue-700 via-cyan-800 to-zinc-950',
    line: 'here is how it actually works',
  },
  news_politics: {
    gradient: 'from-red-900 via-zinc-900 to-zinc-950',
    line: 'the breaking news nobody expected',
  },
  default: {
    gradient: 'from-violet-700 via-purple-800 to-zinc-950',
    line: 'this changes everything about how we work',
  },
};

const CYCLE_MS = 4200;

/** Layout mode the genre's reframe engine would produce. */
export type PreviewLayoutMode = 'face_track' | 'split' | 'screencast' | 'blur' | 'center';

export interface LivePreviewPanelProps {
  aspectRatio: ClipAspectRatio;
  genre: ContentGenre | 'auto';
  genreLabel: string;
  durationLabel: string;
  goalLabel: string;
  /** YouTube video ID or direct thumbnail URL for the real preview frame. */
  thumbnailUrl?: string | null;
  /** The framing layout the genre's reframe engine produces. */
  layoutMode?: PreviewLayoutMode;
  className?: string;
}

export const LivePreviewPanel: React.FC<LivePreviewPanelProps> = ({
  aspectRatio,
  genre,
  genreLabel,
  durationLabel,
  goalLabel,
  thumbnailUrl,
  layoutMode = 'face_track',
  className = '',
}) => {
  const [cycle, setCycle] = useState(0);
  const [thumbLoaded, setThumbLoaded] = useState(false);
  const [thumbError, setThumbError] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setCycle((c) => c + 1), CYCLE_MS);
    return () => window.clearInterval(id);
  }, []);

  // Reset thumb state when the URL changes
  useEffect(() => { setThumbLoaded(false); setThumbError(false); }, [thumbnailUrl]);

  const scene = GENRE_SCENES[genre] || GENRE_SCENES.default;
  const frame = ASPECT_FRAMES[aspectRatio] || ASPECT_FRAMES['9:16'];

  const words = useMemo(() => scene.line.split(' '), [scene.line]);
  const highlightIndex = Math.floor(words.length / 2);

  const thumbSrc = thumbnailUrl || null;
  const showRealThumb = thumbSrc && thumbLoaded && !thumbError;

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
          {/* ── Real video content ── */}
          {thumbSrc && (
            <img
              src={thumbSrc}
              alt=""
              onLoad={() => setThumbLoaded(true)}
              onError={() => setThumbError(true)}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${showRealThumb ? 'opacity-100' : 'opacity-0'}`}
            />
          )}

          {/* ── Genre-specific reframe simulation (overlays the content) ── */}

          {/* 1. Podcast — split dual-stack: two speaker boxes */}
          {layoutMode === 'split' && (
            <div className="absolute inset-x-3 top-4 bottom-14 flex flex-col gap-1.5 pointer-events-none">
              <div className="flex-1 rounded-xl border-2 border-cyan-400/70 bg-black/20 flex items-center justify-center relative">
                <Users className="size-6 text-cyan-300/80" aria-hidden="true" />
                <span className="absolute top-1 left-1.5 text-[7px] font-bold text-cyan-300/80 uppercase tracking-wider">Speaker A</span>
              </div>
              <div className="flex-1 rounded-xl border border-white/25 bg-black/40 flex items-center justify-center relative opacity-60">
                <Users className="size-5 text-white/40" aria-hidden="true" />
                <span className="absolute top-1 left-1.5 text-[7px] font-bold text-white/40 uppercase tracking-wider">Speaker B</span>
              </div>
            </div>
          )}

          {/* 2. Screencast — 60/40 split: gameplay/screen top, face cam bottom */}
          {layoutMode === 'screencast' && (
            <div className="absolute inset-x-0 top-0 bottom-0 pointer-events-none flex flex-col">
              <div className="flex-[3] relative overflow-hidden flex items-center justify-center">
                <MonitorPlay className="size-7 text-white/60" aria-hidden="true" />
                <span className="absolute top-2 left-2 text-[7px] font-bold text-white/60 uppercase tracking-wider bg-black/40 px-1 rounded">Gameplay / Screen</span>
              </div>
              <div className="h-px bg-white/20" />
              <div className="flex-[2] relative bg-black/50 flex items-center justify-center">
                <Camera className="size-5 text-white/50" aria-hidden="true" />
                <span className="absolute top-1 left-2 text-[7px] font-bold text-white/50 uppercase tracking-wider">Face Cam</span>
              </div>
            </div>
          )}

          {/* 3. Blur — blurred bg with sharp center face */}
          {layoutMode === 'blur' && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center backdrop-blur-[2px] bg-black/10">
              <div className="size-14 rounded-full border-2 border-white/50 bg-white/10 backdrop-blur-none flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.2)]">
                <Camera className="size-6 text-white/70" aria-hidden="true" />
              </div>
              <span className="absolute bottom-14 left-1/2 -translate-x-1/2 text-[7px] font-bold text-white/50 uppercase tracking-wider">Subject tracked · bg blurred</span>
            </div>
          )}

          {/* 4. Face track — animated face indicator moving between positions */}
          {layoutMode === 'face_track' && (
            <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
              <div
                className="absolute size-10 rounded-full border-2 border-cyan-400/70 bg-cyan-400/10 flex items-center justify-center transition-all duration-[2800ms] ease-in-out"
                style={{
                  left: cycle % 2 === 0 ? '18%' : '58%',
                  top: cycle % 2 === 0 ? '30%' : '22%',
                }}
              >
                <Camera className="size-4 text-cyan-300/80" aria-hidden="true" />
              </div>
              <span className="absolute bottom-12 left-2 text-[7px] font-bold text-cyan-400/60 uppercase tracking-wider">Face tracking active</span>
            </div>
          )}

          {/* 5. Center — neutral face glyph (no layout data) */}
          {layoutMode === 'center' && (
            <div className="absolute inset-0 flex items-center justify-center pb-14 pointer-events-none">
              <div className="size-12 rounded-full border-2 border-white/25 bg-white/[0.06] backdrop-blur-sm" />
            </div>
          )}

          {/* Progress rail */}
          <div className="absolute top-2 inset-x-3 h-1 rounded-full bg-white/20 z-10">
            <div className="h-full w-2/3 rounded-full bg-violet-400" />
          </div>

          {/* Kinetic captions */}
          <div className="absolute inset-x-2.5 bottom-8 text-center z-10">
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
          <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-200 backdrop-blur-sm z-10">
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
        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-zinc-200 flex items-center gap-0.5">
          <Camera size={9} aria-hidden="true" />
          {layoutMode === 'split' ? 'Split view' : layoutMode === 'screencast' ? '60/40 split' : layoutMode === 'blur' ? 'Blur bg' : layoutMode === 'face_track' ? 'Face tracking' : 'Center'}
        </span>
      </div>
    </div>
  );
};
