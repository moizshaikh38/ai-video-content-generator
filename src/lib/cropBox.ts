/**
 * Crop-box geometry shared by the preview Crop dialog and tests.
 * Everything is normalised to the SOURCE frame. The model is the one the export
 * compiler uses (buildCropFilter / crop.scale): scale the source to cover the canvas,
 * zoom by `scale` (1-4), crop a canvas-aspect window whose left/top are
 * (1 - windowSize) * focus. So box <-> {focusX, focusY, scale} is exact, not approximate.
 */
export interface CropBox { left: number; top: number; w: number; h: number }
export interface CropState { focusX: number; focusY: number; scale: number }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Window size (fractions of source w/h) at scale 1 = the full "cover" window for this canvas aspect. */
export function coverWindow(srcW: number, srcH: number, canvasAspect: number): { w: number; h: number } {
  return { w: Math.min(1, (srcH * canvasAspect) / srcW), h: Math.min(1, srcW / (canvasAspect * srcH)) };
}

export function boxFromCrop(srcW: number, srcH: number, canvasAspect: number, crop: CropState): CropBox {
  const c = coverWindow(srcW, srcH, canvasAspect);
  const s = clamp(crop.scale || 1, 1, 4);
  const w = c.w / s, h = c.h / s;
  return { left: (1 - w) * clamp(crop.focusX, 0, 1), top: (1 - h) * clamp(crop.focusY, 0, 1), w, h };
}

export function cropFromBox(srcW: number, srcH: number, canvasAspect: number, box: CropBox): CropState {
  const c = coverWindow(srcW, srcH, canvasAspect);
  const scale = clamp(c.w / box.w, 1, 4);
  const w = c.w / scale, h = c.h / scale;
  const fx = 1 - w > 1e-6 ? clamp(box.left / (1 - w), 0, 1) : 0.5;
  const fy = 1 - h > 1e-6 ? clamp(box.top / (1 - h), 0, 1) : 0.5;
  return { focusX: Number(fx.toFixed(4)), focusY: Number(fy.toFixed(4)), scale: Number(scale.toFixed(3)) };
}

/**
 * Resize from a corner while the opposite corner (anchor) stays fixed; aspect locked to the canvas.
 * Contract: the result is ALWAYS inside the source frame and has w in [cover/4, cover], so
 * cropFromBox(result) maps to exactly the box that is drawn (no hidden clamping at Apply).
 * - Pointer crossing the anchor flips the box to the other side, using the room available there.
 * - If neither side has room for the minimum size (anchor within min/size of both edges), the box
 *   keeps the minimum size and slides inside the frame; the anchor moves, nothing leaves the frame.
 */
export function resizeBox(srcW: number, srcH: number, canvasAspect: number, anchor: { x: number; y: number }, pointer: { x: number; y: number }): CropBox {
  const c = coverWindow(srcW, srcH, canvasAspect);
  const k = c.h / c.w; // h per w
  const minW = c.w / 4;
  const maxFor = (dx: number, dy: number) => Math.min(c.w, dx > 0 ? 1 - anchor.x : anchor.x, (dy > 0 ? 1 - anchor.y : anchor.y) / k);
  let dirX = pointer.x >= anchor.x ? 1 : -1;
  let dirY = pointer.y >= anchor.y ? 1 : -1;
  const raw = Math.max(Math.abs(pointer.x - anchor.x), Math.abs(pointer.y - anchor.y) / k);
  // Not enough room toward the pointer: use the opposite side if it has more.
  if (maxFor(dirX, dirY) < minW) {
    const flipped = maxFor(-dirX, -dirY);
    if (flipped > maxFor(dirX, dirY)) { dirX = -dirX; dirY = -dirY; }
  }
  const w = clamp(raw, minW, Math.max(minW, maxFor(dirX, dirY)));
  const h = w * k;
  let left = dirX > 0 ? anchor.x : anchor.x - w;
  let top = dirY > 0 ? anchor.y : anchor.y - h;
  left = clamp(left, 0, 1 - w);
  top = clamp(top, 0, 1 - h);
  return { left, top, w, h };
}

export function moveBox(box: CropBox, dx: number, dy: number): CropBox {
  return { ...box, left: clamp(box.left + dx, 0, 1 - box.w), top: clamp(box.top + dy, 0, 1 - box.h) };
}
