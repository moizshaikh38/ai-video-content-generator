import type { Db } from 'mongodb';
import { EntitlementService } from './entitlementService.js';
import { PlanEntitlements, AppError } from '../types/index.js';
import { logger } from '../utils/logger.js';

export interface WatermarkFilterOptions {
  text?: string;
  fontSize?: number;
  margin?: number;
}

/**
 * Service managing server-side watermark enforcement across all video export workflows.
 * 
 * Rules:
 * - Free plan users must receive exports containing a permanent VireoClip watermark.
 * - Creator, Pro, Studio and authorized Developer accounts must receive clean exports without watermark.
 * - Enforced server-side; client-supplied flags are never trusted.
 * - Downgrade protection prevents Free users from viewing/downloading unwatermarked exports generated prior to downgrade.
 */
export class WatermarkService {
  public static readonly BRAND_WATERMARK_TEXT = 'VireoClip';

  /**
   * Authoritatively determines whether a watermark is required for a user
   * based on their server-side canonical plan entitlements.
   */
  public static async shouldWatermark(
    userId: string,
    userEmail?: string,
    database?: Db
  ): Promise<boolean> {
    const entitlements = await EntitlementService.resolveUserEntitlements(userId, userEmail, database);
    return Boolean(entitlements.watermarkRequired);
  }

  /**
   * Generates the production-grade FFmpeg drawtext filter string for the VireoClip watermark.
   * Features:
   * - High-contrast white brand text with subtle shadow
   * - Semi-transparent rounded dark box badge (65% opacity)
   * - Top-right positioning: safe from subtitles (which are lower-third/bottom-center)
   * - Dynamic resolution scaling across 9:16 vertical, 16:9 widescreen, 1:1 square, and 4:5 social
   * - Escaped commas to prevent FFmpeg filterchain delimiter collisions
   */
  public static getFfmpegFilterString(options?: WatermarkFilterOptions): string {
    const text = options?.text || this.BRAND_WATERMARK_TEXT;
    const safeText = text.replace(/['\\]/g, '').trim() || this.BRAND_WATERMARK_TEXT;

    if (options?.fontSize && options?.margin) {
      const fs = options.fontSize;
      const m = options.margin;
      return `drawtext=text='${safeText}':fontcolor=white:fontsize=${fs}:box=1:boxcolor=black@0.65:boxborderw=10:shadowcolor=black@0.8:shadowx=2:shadowy=2:x=w-text_w-${m}:y=${m}`;
    }

    return `drawtext=text='${safeText}':fontcolor=white:fontsize=max(24\\,trunc(h*0.032)):box=1:boxcolor=black@0.65:boxborderw=10:shadowcolor=black@0.8:shadowx=2:shadowy=2:x=w-text_w-max(24\\,trunc(w*0.03)):y=max(24\\,trunc(h*0.025))`;
  }

  /**
   * Appends the watermark filter to a video filter list if required.
   */
  public static appendWatermarkFilter(
    existingFilters: string[],
    watermarkRequired: boolean,
    options?: WatermarkFilterOptions
  ): string[] {
    const filters = [...existingFilters];
    if (watermarkRequired) {
      filters.push(this.getFfmpegFilterString(options));
    }
    return filters;
  }

  /**
   * Validates export access against downgrade policy:
   * A user whose current plan requires a watermark must NOT access an export that was cleanly
   * rendered without a watermark under a former paid subscription.
   */
  public static assertExportAccess(
    entitlements: PlanEntitlements,
    exportRecord: { is_watermarked?: boolean } | null | undefined
  ): void {
    if (entitlements.watermarkRequired && exportRecord && exportRecord.is_watermarked === false) {
      throw new AppError(
        'This export was generated without a watermark under a paid plan. Your current plan requires a watermark. Please re-render this video to view or download.',
        403,
        'WATERMARK_REQUIRED_RERENDER'
      );
    }
  }
}

