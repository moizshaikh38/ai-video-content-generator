/**
 * Pure fit math for the responsive preview canvas.
 *
 * The preview composition is authored at a fixed design resolution (e.g. 360×640 for 9:16); the
 * whole layer is then uniformly scaled by this factor so the video fills the available stage while
 * every child — captions, overlays, transform handles — scales with it and keeps export parity.
 * Dependency-free so it runs under the backend node:test runner.
 */

export interface CanvasFitInput {
  /** Design-resolution canvas size (px). */
  baseW: number;
  baseH: number;
  /** Stage viewport inner size (px), typically clientWidth/clientHeight of the preview area. */
  availW: number;
  availH: number;
  /** Total horizontal + vertical padding to subtract from the available size (default 32). */
  pad?: number;
  /** Clamp bounds for the returned scale (defaults: min 0.2, max 2.5). */
  min?: number;
  max?: number;
}

/**
 * Largest uniform scale that fits the design canvas inside the available space, preserving aspect
 * ratio and clamped to [min, max]. Returns 1 when space can't be measured yet.
 */
export function computeCanvasFitScale(input: CanvasFitInput): number {
  const pad = input.pad ?? 32;
  const min = input.min ?? 0.2;
  const max = input.max ?? 2.5;
  const { baseW, baseH, availW, availH } = input;

  if (baseW <= 0 || baseH <= 0) return 1;
  const usableW = availW - pad;
  const usableH = availH - pad;
  if (usableW <= 0 || usableH <= 0) return 1;

  const raw = Math.min(usableW / baseW, usableH / baseH);
  return Math.max(min, Math.min(raw, max));
}
