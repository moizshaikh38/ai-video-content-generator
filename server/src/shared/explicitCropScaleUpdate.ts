import { AppError } from '../types/index.js';
/** Only an explicit scale update can change the stored Quick crop zoom.
 * Studio scene zoom remains in item.crop and is not projected globally. */
export function explicitCropScaleUpdate(crop: { scale?: unknown }): { scale?: number } {
  if (crop.scale === undefined) return {};
  if (typeof crop.scale !== 'number' || !Number.isFinite(crop.scale)) {
    throw new AppError('Crop scale must be a finite number.', 400, 'INVALID_CROP_SCALE');
  }
  return { scale: Math.min(4, Math.max(1, crop.scale)) };
}
