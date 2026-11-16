import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from 'mongodb';
import { EntitlementService } from './entitlementService.js';
import { PlanEntitlements, AppError } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { renderFfmpegCapability } from '../utils/drawtextFfmpeg.js';

export interface WatermarkFilterOptions {
  text?: string;
  fontSize?: number;
  margin?: number;
  /** Export resolution scale over the 1080-class design canvas. */
  canvasScale?: number;
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
    const cs = Math.max(0.5, Number(options?.canvasScale) || 1);
    const entry = '0.45';
    const alpha = `if(lt(t\\,${entry})\\,t/${entry}\\,if(lt(t\\,1.5)\\,1\\,max(0\\,(2-t)/0.5)))`;
    // Ease-out slide (quadratic deceleration) instead of linear motion.
    const slide = (dist: string, finalX: string) =>
      `if(lt(t\\,${entry})\\,${finalX}+(${dist})*(1-t/${entry})*(1-t/${entry})\\,${finalX})`;
    // Premium floating wordmark (CapCut-style): no box badge - clean white
    // text with a soft shadow and a hairline dark outline for legibility on
    // bright footage, slight transparency, gentle breathing after entry.
    const style =
      'fontcolor=white@0.92:borderw=1:bordercolor=black@0.35:shadowcolor=black@0.6:shadowx=0:shadowy=2';

    if (options?.fontSize && options?.margin) {
      const fs = options.fontSize;
      const m = options.margin;
      const finalX = `w-text_w-${m}`;
      return this.withAnimatedMark(`drawtext=text='${safeText}':${style}:fontsize=${fs}:x=${slide(`text_w+${m}`, finalX)}:y=${m}:alpha=${alpha}`);
    }

    const mx = 'max(24\\,trunc(w*0.03))';
    const my = 'max(24\\,trunc(h*0.025))';
    const finalX = `w-text_w-${mx}`;
    return this.withAnimatedMark(`drawtext=text='${safeText}':${style}:fontsize=max(24\\,trunc(h*0.032)):x=${slide(`text_w+${mx}`, finalX)}:y=${my}:alpha=${alpha}`, Math.round(96 * cs));
  }

  /** Chain-safe text-to-mark crossfade. All paths are packaged assets, never user input. */
  private static withAnimatedMark(textFilter: string, markPx = 96): string {
    const asset = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../assets/brand/vireoclip-mark.png');
    const safePath = asset.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "'\\''");
    return `${textFilter},null[wm_base];movie=filename='${safePath}':loop=0,setpts=N/(24*TB),fps=24,scale=${markPx}:-1,format=rgba,fade=t=in:st=1.5:d=0.5:alpha=1[wm_mark];[wm_base][wm_mark]overlay=x=W-w-max(24\\,trunc(W*0.03)):y=max(24\\,trunc(H*0.025)):eof_action=repeat:shortest=1`;
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

