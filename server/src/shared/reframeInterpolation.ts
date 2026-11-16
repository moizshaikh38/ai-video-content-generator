/**
 * Shared smart-reframe center interpolation - the client mirror of the export's
 * crop math (SmartReframeService.buildSmartCropFilter). Both sides must agree on
 * the crop window center at any time t or the preview and the export diverge
 * (audit: preview never read smoothed_keyframes - static 50%/50% while the
 * export panned).
 *
 * Semantics mirrored exactly:
 * - keyframes sanitized: time >= 0, centerX/centerY clamped 0..1, centerY default 0.38
 * - near-static track (X within 0.015, Y within 0.02 of the first keyframe) or a
 *   single keyframe => static center
 * - otherwise piecewise-linear interpolation over time; Y is interpolated only
 *   when the track is not Y-static (same 0.02 threshold), matching the export's
 *   fixed-Y expression in that case.
 * The export additionally prunes collinear keyframes to fit FFmpeg expression
 * limits; that pruning changes the curve by < 0.005 (X) / 0.008 (Y) of frame
 * size, sub-pixel at preview scale, so the preview interpolates the full track.
 */

export interface ReframeCenterKeyframe {
  time: number;
  centerX: number;
  centerY?: number;
}

export interface ReframeCenter {
  centerX: number;
  centerY: number;
  /** true when the track is treated as static (no pan) by both sides. */
  isStatic: boolean;
}

export function sanitizeReframeKeyframes(kfs: ReframeCenterKeyframe[]): Array<{ time: number; centerX: number; centerY: number }> {
  return (kfs || [])
    .filter((k) => Number.isFinite(k.time) && Number.isFinite(k.centerX))
    .map((k) => ({
      time: Math.max(0, Number(k.time.toFixed(3))),
      centerX: Math.min(1, Math.max(0, Number(k.centerX.toFixed(4)))),
      centerY: Math.min(1, Math.max(0, Number((k.centerY ?? 0.38).toFixed(4)))),
    }))
    .sort((a, b) => a.time - b.time);
}

export function interpolateReframeCenter(kfs: ReframeCenterKeyframe[], t: number): ReframeCenter {
  const valid = sanitizeReframeKeyframes(kfs);
  if (valid.length === 0) return { centerX: 0.5, centerY: 0.38, isStatic: true };
  const first = valid[0];
  const isStatic =
    valid.length === 1 ||
    valid.every((k) => Math.abs(k.centerX - first.centerX) < 0.015 && Math.abs(k.centerY - first.centerY) < 0.02);
  if (isStatic) return { centerX: first.centerX, centerY: first.centerY, isStatic: true };

  const isYStatic = valid.every((k) => Math.abs(k.centerY - first.centerY) < 0.02);
  const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

  let centerX: number;
  let centerY: number;
  if (t <= valid[0].time) {
    centerX = valid[0].centerX;
    centerY = valid[0].centerY;
  } else if (t >= valid[valid.length - 1].time) {
    centerX = valid[valid.length - 1].centerX;
    centerY = valid[valid.length - 1].centerY;
  } else {
    let i = 0;
    while (i < valid.length - 2 && valid[i + 1].time < t) i++;
    const k0 = valid[i];
    const k1 = valid[i + 1];
    const p = (t - k0.time) / Math.max(0.001, k1.time - k0.time);
    centerX = lerp(k0.centerX, k1.centerX, p);
    centerY = lerp(k0.centerY, k1.centerY, p);
  }
  return { centerX, centerY: isYStatic ? first.centerY : centerY, isStatic: false };
}
