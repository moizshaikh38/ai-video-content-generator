import React, { useEffect, useRef } from 'react';
import { Loader2, AudioLines } from 'lucide-react';
import { getClipRenderPeaks, useAssetWaveform, useClipWaveform, WaveformData } from '../../lib/waveform';

interface WaveformClipProps {
  /** Clip whose cached source waveform this item draws from (dialogue / main source). */
  clipId: string | null | undefined;
  /** Uploaded audio asset id: when set, the item draws that asset's waveform instead. */
  assetId?: string | null;
  /** Absolute source-second start of the waveform window (clip.start_seconds; 0 for assets). */
  windowStart: number;
  /** This item's source window in absolute source seconds. */
  sourceStart: number;
  sourceEnd: number;
  /** Rendered clip width in CSS px (drives bucket count / level of detail). */
  width: number;
  color: string;
  /** Only fetch/draw when the clip is on-screen and uses the clip's own source audio. */
  enabled: boolean;
}

/** px per waveform bar, including the gap. Keeps redraws light at any zoom. */
const BAR_STEP = 3;
const BAR_WIDTH = 2;

function draw(canvas: HTMLCanvasElement, peaks: number[], color: string) {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (cssW <= 0 || cssH <= 0) return;

  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  if (peaks.length === 0) return;

  const mid = cssH / 2;
  const maxBar = cssH * 0.9;
  ctx.fillStyle = color;
  for (let i = 0; i < peaks.length; i++) {
    const x = i * BAR_STEP;
    if (x > cssW) break;
    const h = Math.max(1, peaks[i] * maxBar);
    ctx.fillRect(x, mid - h / 2, BAR_WIDTH, h);
  }
}

const WaveformCanvas: React.FC<{ data: WaveformData; clipLocalStart: number; clipLocalEnd: number; width: number; color: string }> = ({
  data,
  clipLocalStart,
  clipLocalEnd,
  width,
  color,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const targetBuckets = Math.max(1, Math.floor(width / BAR_STEP));
    const peaks = getClipRenderPeaks(data, clipLocalStart, clipLocalEnd, targetBuckets);
    draw(canvas, peaks, color);
  }, [data, clipLocalStart, clipLocalEnd, width, color]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true" />;
};

/**
 * Audio waveform overlay for a timeline clip. Fetches the clip's cached peaks once and
 * draws the portion this item spans. Shows a placeholder while loading and renders nothing
 * (silently) when peaks are unavailable, so the clip still looks correct.
 */
export const WaveformClip: React.FC<WaveformClipProps> = ({
  clipId,
  assetId,
  windowStart,
  sourceStart,
  sourceEnd,
  width,
  color,
  enabled,
}) => {
  // Exactly one source is active; the other hook is disabled (hooks must run unconditionally).
  const useAsset = Boolean(assetId);
  const clipState = useClipWaveform(clipId, enabled && !useAsset);
  const assetState = useAssetWaveform(assetId, enabled && useAsset);
  const { status, data } = useAsset ? assetState : clipState;

  if (!enabled) return null;

  if (status === 'loading') {
    return (
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
        <Loader2 className="w-3 h-3 animate-spin text-white/50" />
      </div>
    );
  }

  if (status === 'error') {
    // Non-blocking: a failed waveform leaves the clip usable with a faint audio hint.
    return (
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-30" aria-hidden="true">
        <AudioLines className="w-3.5 h-3.5 text-white/60" />
      </div>
    );
  }

  if (status !== 'ready' || !data) return null;

  const clipLocalStart = Math.max(0, sourceStart - windowStart);
  const clipLocalEnd = Math.max(clipLocalStart, sourceEnd - windowStart);

  return (
    <WaveformCanvas
      data={data}
      clipLocalStart={clipLocalStart}
      clipLocalEnd={clipLocalEnd}
      width={width}
      color={color}
    />
  );
};
