import React, { useEffect, useRef } from 'react';
import { Loader2, Film } from 'lucide-react';
import { frameIndexForTime, useClipThumbnails, ThumbnailStripData } from '../../lib/thumbnails';

export interface FilmstripClipProps {
  clipId: string | null | undefined;
  /** Absolute source-second start of the sprite window (clip.start_seconds). */
  windowStart: number;
  /** This item's source window in absolute source seconds. */
  sourceStart: number;
  sourceEnd: number;
  /** Rendered clip width in CSS px. */
  width: number;
  /** Only fetch/draw when the clip is on-screen and backed by the clip's own source. */
  enabled: boolean;
  /** Instant preview thumbnail poster while sprite is generating */
  thumbnailUrl?: string | null;
}

const FilmstripCanvas: React.FC<{
  data: ThumbnailStripData;
  image: HTMLImageElement;
  clipLocalStart: number;
  clipLocalEnd: number;
  width: number;
}> = ({ data, image, clipLocalStart, clipLocalEnd, width }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image.naturalWidth) return;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const cssH = canvas.clientHeight;
    const cssW = canvas.clientWidth;
    if (cssW <= 0 || cssH <= 0) return;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const cellW = image.naturalWidth / data.frameCount; // source cell px
    const cellH = image.naturalHeight;
    const cellAspect = cellW / cellH;
    const displayW = Math.max(8, cssH * cellAspect); // one frame scaled to lane height
    const cells = Math.max(1, Math.ceil(cssW / displayW));
    const span = Math.max(0.001, clipLocalEnd - clipLocalStart);

    for (let k = 0; k < cells; k++) {
      const centerTime = clipLocalStart + ((k + 0.5) / cells) * span;
      const frame = frameIndexForTime(centerTime, data.duration, data.frameCount);
      ctx.drawImage(image, frame * cellW, 0, cellW, cellH, k * displayW, 0, displayW, cssH);
    }
  }, [data, image, clipLocalStart, clipLocalEnd, width]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none opacity-90" aria-hidden="true" />;
};

/**
 * Video thumbnail filmstrip for a timeline clip. Fetches the clip's cached sprite once and
 * draws the frames the item spans. Shows a loading spinner, and a quiet film-icon fallback
 * if generation failed, so the clip is always usable.
 */
export const FilmstripClip: React.FC<FilmstripClipProps> = ({
  clipId,
  windowStart,
  sourceStart,
  sourceEnd,
  width,
  enabled,
  thumbnailUrl,
}) => {
  // Use 8 frames for rapid 3x faster extraction and sub-second caching
  const { status, data, image } = useClipThumbnails(clipId, enabled, 8);

  if (!enabled) return null;

  const clipLocalStart = Math.max(0, sourceStart - windowStart);
  const clipLocalEnd = Math.max(clipLocalStart, sourceEnd - windowStart);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
      {/* Instant fallback/preview poster while sprite is loading or on error */}
      {thumbnailUrl && status !== 'ready' ? (
        <div
          className="absolute inset-0 bg-cover bg-center opacity-80 transition-opacity duration-300"
          style={{ backgroundImage: `url(${thumbnailUrl})` }}
          aria-hidden="true"
        />
      ) : status === 'loading' ? (
        /* Instant skeleton filmstrip frames with cell divisions matching Opus Clip */
        <div className="absolute inset-0 flex divide-x divide-white/[0.08] bg-[#121520]/80">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="flex-1 h-full bg-gradient-to-b from-white/[0.04] to-transparent animate-pulse"
              style={{ animationDelay: `${i * 120}ms` }}
            />
          ))}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-white/50 drop-shadow" />
          </div>
        </div>
      ) : null}

      {status === 'error' && !thumbnailUrl && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-25" aria-hidden="true">
          <Film className="w-4 h-4 text-white/70" />
        </div>
      )}

      {status === 'ready' && data && image && (
        <FilmstripCanvas
          data={data}
          image={image}
          clipLocalStart={clipLocalStart}
          clipLocalEnd={clipLocalEnd}
          width={width}
        />
      )}
    </div>
  );
};
