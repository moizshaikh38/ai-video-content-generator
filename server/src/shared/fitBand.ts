/**
 * Fit band: in a portrait canvas, "Fit" shows a ~4:3 band of the source, full canvas width and
 * vertically centred, over a blurred (or coloured) backdrop. Measured from ONE Opus 406x720 preview
 * (sharp band 406x304 = 1.3355:1, 42% of height); Vireo uses 4:3 as its design default, not as an
 * Opus rule. 'full' keeps the whole frame (letterbox/blur-pad) and is the legacy behaviour.
 */
export const FIT_BAND_ASPECT = 4 / 3;
export type FitBand = '4:3' | 'full';

interface CanvasLike { aspect_ratio?: string; fit_band?: FitBand }
interface ItemLike { crop?: { band?: FitBand } | null }

/** Canvas-level choice (Background panel) overrides the item; a missing item band means legacy full frame. */
export function effectiveFitBand(canvas: CanvasLike | undefined | null, item: ItemLike | undefined | null): FitBand {
  if (canvas?.fit_band === '4:3' || canvas?.fit_band === 'full') return canvas.fit_band;
  return item?.crop?.band === '4:3' ? '4:3' : 'full';
}

/** The band only exists where the canvas is taller than the band (9:16). 16:9 / 1:1 canvases are wider-or-equal already. */
export function fitBandApplies(aspectRatio: string | undefined): boolean {
  return (aspectRatio || '9:16') === '9:16';
}

/** Canvas-height fraction occupied by the band for a given canvas width/height. */
export function fitBandHeightFraction(canvasW: number, canvasH: number): number {
  return Math.min(1, canvasW / FIT_BAND_ASPECT / canvasH);
}
