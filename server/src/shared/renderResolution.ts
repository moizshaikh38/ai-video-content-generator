/**
 * Export resolution tiers.
 *
 * Every render graph is authored in a 1080-class "design" canvas (9:16 is
 * 1080x1920, 16:9 is 1920x1080, 1:1 is 1080x1080). A tier scales that canvas
 * by `scale` and every geometry builder crops from the source at the scaled
 * size, so a 4K export samples the source at its native detail instead of
 * stretching a 1080p frame afterwards. Captions (ASS PlayRes) and text
 * overlays are authored in design units and scaled with the canvas.
 */
export type RenderResolution = '720p' | '1080p' | '1440p' | '2160p';
export type RenderAspect = '9:16' | '1:1' | '16:9' | string;

export const RENDER_RESOLUTIONS: RenderResolution[] = ['720p', '1080p', '1440p', '2160p'];
export const DEFAULT_RENDER_RESOLUTION: RenderResolution = '1080p';

const SHORT_SIDE: Record<RenderResolution, number> = {
  '720p': 720,
  '1080p': 1080,
  '1440p': 1440,
  '2160p': 2160,
};

export function parseRenderResolution(value: unknown): RenderResolution {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === '4k' || v === 'uhd') return '2160p';
  if (v === '2k') return '1440p';
  return (RENDER_RESOLUTIONS as string[]).includes(v) ? (v as RenderResolution) : DEFAULT_RENDER_RESOLUTION;
}

/** Strict parse for request validation: null for an unknown value. */
export function parseRenderResolutionStrict(value: unknown): RenderResolution | null {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === '4k' || v === 'uhd') return '2160p';
  if (v === '2k') return '1440p';
  return (RENDER_RESOLUTIONS as string[]).includes(v) ? (v as RenderResolution) : null;
}

/** Scale applied to the 1080-class design canvas. */
export function renderScale(res: RenderResolution): number {
  return SHORT_SIDE[res] / 1080;
}

function even(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2);
}

/** Design canvas (scale 1) for an aspect ratio. */
export function designCanvas(aspect: RenderAspect): { width: number; height: number } {
  if (aspect === '16:9') return { width: 1920, height: 1080 };
  if (aspect === '1:1') return { width: 1080, height: 1080 };
  return { width: 1080, height: 1920 };
}

/** Output canvas for an aspect ratio at a scale (even dimensions). */
export function canvasDims(aspect: RenderAspect, scale = 1): { width: number; height: number } {
  const d = designCanvas(aspect);
  return { width: even(d.width * scale), height: even(d.height * scale) };
}

export function canvasForResolution(aspect: RenderAspect, res: RenderResolution): { width: number; height: number } {
  return canvasDims(aspect, renderScale(res));
}

/**
 * Height in source pixels that a cover crop for this aspect maps onto the
 * output height.
 */
export function sourceRegionHeight(aspect: RenderAspect, srcW: number, srcH: number): number {
  if (aspect === '16:9') return Math.min(srcH, (srcW * 9) / 16);
  if (aspect === '1:1') return Math.min(srcW, srcH);
  return Math.min(srcH, (srcW * 16) / 9);
}

export interface EffectiveResolution {
  requested: RenderResolution;
  /** Always equals `requested`: the chosen tier is never swapped for another. */
  effective: RenderResolution;
  width: number;
  height: number;
  scale: number;
  /**
   * Output pixels per source pixel along the crop height. Above 1 the frame is
   * interpolated: the file has the requested size but not native detail.
   */
  upscaleFactor: number | null;
  /** Set when the output is interpolated; shown to the user, never hidden. */
  warning?: string;
}

/**
 * Resolves the render size. The requested tier is always honored (a 4K request
 * produces a 4K file). When the source cannot supply native pixels for that
 * size the result carries an explicit warning with the interpolation factor.
 */
export function resolveEffectiveResolution(
  requested: RenderResolution,
  aspect: RenderAspect,
  srcW?: number | null,
  srcH?: number | null
): EffectiveResolution {
  const dims = canvasForResolution(aspect, requested);
  const known = Number(srcW) > 0 && Number(srcH) > 0;
  const region = known ? sourceRegionHeight(aspect, Number(srcW), Number(srcH)) : null;
  const upscaleFactor = region ? Number((dims.height / region).toFixed(3)) : null;
  let warning: string | undefined;
  if (upscaleFactor !== null && upscaleFactor > 1.02) {
    warning =
      `Source is ${srcW}x${srcH}. This ${requested} (${dims.width}x${dims.height}) export is interpolated ` +
      `about ${upscaleFactor.toFixed(2)}x from the source crop, so it has the requested size but not native detail.`;
  }
  return {
    requested,
    effective: requested,
    width: dims.width,
    height: dims.height,
    scale: renderScale(requested),
    upscaleFactor,
    warning,
  };
}

/** Video bitrate hint (kbps) per tier for CRF-capped encodes. */
export function maxrateKbps(res: RenderResolution): number {
  return { '720p': 8000, '1080p': 16000, '1440p': 30000, '2160p': 60000 }[res];
}
