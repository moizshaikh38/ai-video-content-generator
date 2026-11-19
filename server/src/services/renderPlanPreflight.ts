import {getMongoDb} from '../db/mongoClient.js';
import {AppError} from '../types/index.js';
import {EntitlementService} from './entitlementService.js';

/** Same saved-clip baseline policy as the Quick render route. This is a
 * preflight, not an account-wide atomic quota reservation. In-editor per-item
 * styles need their own explicit product policy; do not infer one here.
 */
export async function assertRenderPlanPreflight(userId: string, email: string | undefined, captionPreset: unknown): Promise<void> {
  const entitlements = await EntitlementService.resolveUserEntitlements(userId, email);
  if (!entitlements.isUnlimited) {
    const maximum = entitlements.limits.maxClipRenders;
    if (!Number.isSafeInteger(maximum) || maximum < 0) {
      throw new AppError('Render plan configuration is unavailable.', 503, 'RENDER_PLAN_UNAVAILABLE');
    }
    const currentMonthStart = new Date();
    currentMonthStart.setUTCDate(1);
    currentMonthStart.setUTCHours(0, 0, 0, 0);
    const db = await getMongoDb();
    const count = await db.collection('render_jobs').countDocuments({
      user_id: userId,
      $or: [
        {created_at: {$gte: currentMonthStart}},
        {created_at: {$gte: currentMonthStart.toISOString()}},
      ],
    });
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new AppError('Render usage could not be checked.', 503, 'RENDER_USAGE_UNAVAILABLE');
    }
    if (count >= maximum) {
      throw new AppError(`Your ${entitlements.displayName} plan allows up to ${maximum} clip renders per month. Please upgrade your plan to render more clips.`, 403, 'MONTHLY_RENDER_LIMIT_EXCEEDED');
    }
  }
  if (captionPreset && !EntitlementService.isPresetAllowed(entitlements, String(captionPreset))) {
    throw new AppError(`The subtitle preset "${String(captionPreset)}" is not available on your current ${entitlements.displayName} plan. Please upgrade to access this preset.`, 403, 'PRESET_RESTRICTED');
  }
}
