import type { Db } from 'mongodb';
import { EntitlementService } from './entitlementService.js';
import { PlanEntitlements, AppError } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { renderFfmpegCapability } from '../utils/drawtextFfmpeg.js';

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
  /**
   * Fails fast with an explicit capability error when the resolved render
   * ffmpeg cannot draw text at all (bundled static build without libfreetype
   * and no system fallback). Without this the render dies minutes in with
   * ffmpeg's opaque "Filter not found". An explicit FFMPEG_BIN override is
   * preserved as operator intent (getRenderFfmpeg already warned).
   */
  private static assertDrawtextCapability(): void {
    const cap = renderFfmpegCapability();
    if (!cap.hasDrawtext && !cap.isOverride) {
      throw new AppError(
        'This host cannot burn watermark or caption text: the bundled ffmpeg build lacks drawtext (libfreetype) and no system ffmpeg with drawtext was found. Set FFMPEG_BIN to a full ffmpeg build and retry.',
        500,
        'FFMPEG_DRAWTEXT_UNAVAILABLE'
      );
    }
  }

  public static getFfmpegFilterString(options?: WatermarkFilterOptions): string {
    this.assertDrawtextCapability();
    const text = options?.text || this.BRAND_WATERMARK_TEXT;
    const safeText = text.replace(/['\\]/g, '').trim() || this.BRAND_WATERMARK_TEXT;

    // Premium animated badge, VireoClip branding (CapCut-style entry):
    // the badge slides in from the right edge and fades in over the first
    // 0.45s, then holds with a gentle opacity breathing (0.85-1.0, 3.2s
    // period). x/y/alpha are per-frame drawtext expressions; the box badge
    // moves with the text. Commas inside expressions are escaped.
    const entry = '0.45';
    const alpha = `if(lt(t\\,${entry})\\,t/${entry}\\,0.85+0.15*sin(2*PI*(t-${entry})/3.2))`;

    if (options?.fontSize && options?.margin) {
      const fs = options.fontSize;
      const m = options.margin;
      const finalX = `w-text_w-${m}`;
      const slideX = `if(lt(t\\,${entry})\\,${finalX}+(text_w+${m})*(1-t/${entry})\\,${finalX})`;
      return `drawtext=text='${safeText}':fontcolor=white:fontsize=${fs}:box=1:boxcolor=black@0.55:boxborderw=12:shadowcolor=black@0.8:shadowx=2:shadowy=2:x=${slideX}:y=${m}:alpha=${alpha}`;
    }

    const mx = 'max(24\\,trunc(w*0.03))';
    const my = 'max(24\\,trunc(h*0.025))';
    const finalX = `w-text_w-${mx}`;
    const slideX = `if(lt(t\\,${entry})\\,${finalX}+(text_w+${mx})*(1-t/${entry})\\,${finalX})`;
    return `drawtext=text='${safeText}':fontcolor=white:fontsize=max(24\\,trunc(h*0.032)):box=1:boxcolor=black@0.55:boxborderw=12:shadowcolor=black@0.8:shadowx=2:shadowy=2:x=${slideX}:y=${my}:alpha=${alpha}`;
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

