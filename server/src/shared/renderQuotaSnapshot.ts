import {AppError} from '../types/index.js';

/** Invalid plan/usage data is not a free render allowance. This validates a
 * snapshot only, not atomic account-wide admission or a spending reservation. */
export function assertRenderQuotaMaximum(maximum: unknown): asserts maximum is number {
  if (!Number.isSafeInteger(maximum) || Number(maximum) < 0) {
    throw new AppError('Render plan configuration is unavailable.',503,'RENDER_PLAN_UNAVAILABLE');
  }
}
export function assertRenderUsageCount(count: unknown): asserts count is number {
  if (!Number.isSafeInteger(count) || Number(count) < 0) {
    throw new AppError('Render usage could not be checked.',503,'RENDER_USAGE_UNAVAILABLE');
  }
}
