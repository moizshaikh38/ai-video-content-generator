import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';
import { isMongoConfigured } from '../db/mongoClient.js';
import { dataRepository } from '../db/repositories/dataRepository.js';
import { logger } from '../utils/logger.js';
import { ClipRenderService } from './clipRenderService.js';
import {
  buildThumbnailArgs,
  clampThumbnailCount,
  isFreshThumbnailRow,
  thumbnailCacheKey,
  ThumbnailStripData,
  THUMBNAIL_FORMAT_VERSION,
  THUMBNAIL_HEIGHT,
} from '../shared/thumbnailStrip.js';
import type { ClipRecord } from '../types/index.js';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';

const GEN_TIMEOUT_MS = 60_000;
const MAX_WINDOW_SECONDS = 1800;
const THUMBNAIL_COLLECTION = 'clip_thumbnails';

export interface ThumbnailResult extends ThumbnailStripData {
  cached: boolean;
}

/**
 * Generates and caches a horizontal sprite-sheet "filmstrip" for a clip's source window.
 * Same cache discipline as WaveformService: decode once, store in Mongo keyed by source
 * identity + window + frame count + format version; trimming the clip does not invalidate it.
 */
export class ThumbnailService {
  public static async getThumbnailsForClip(
    clipId: string,
    userId: string,
    options: { count?: number; forceRefresh?: boolean } = {}
  ): Promise<ThumbnailResult> {
    const clip = await ClipRenderService.getClip(clipId, userId);
    const count = clampThumbnailCount(options.count);
    const cacheKey = thumbnailCacheKey(clip.source_storage_path, clip.start_seconds, clip.end_seconds, count);

    if (!options.forceRefresh) {
      const cached = await this.readCache(clipId, userId, cacheKey);
      if (cached) return { ...cached, cached: true };
    }

    const data = await this.generateStrip(clip, count);
    await this.writeCache(clipId, userId, cacheKey, data);
    return { ...data, cached: false };
  }

  /** Extracts frames and tiles them into one base64 JPEG sprite. Pure I/O + shared args. */
  public static async generateStrip(clip: ClipRecord, count: number): Promise<ThumbnailStripData> {
    const windowDuration = Math.max(0, Number(clip.end_seconds) - Number(clip.start_seconds));
    const empty: ThumbnailStripData = {
      dataUrl: '',
      frameCount: 0,
      frameWidth: 0,
      frameHeight: THUMBNAIL_HEIGHT,
      duration: 0,
      version: THUMBNAIL_FORMAT_VERSION,
    };
    if (!Number.isFinite(windowDuration) || windowDuration <= 0) return empty;
    const genDuration = Math.min(windowDuration, MAX_WINDOW_SECONDS);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-thumb-'));
    const sourcePath = path.join(tmpDir, `source-${crypto.randomUUID()}`);
    const spritePath = path.join(tmpDir, 'sprite.jpg');

    try {
      let useOutput = false;
      if (clip.output_storage_path && (clip.render_status === 'ready' || (clip.render_status as any) === 'completed')) {
        try {
          await ClipRenderService.ensureSourceVideo(clip.output_storage_path, sourcePath, {
            timeoutMs: GEN_TIMEOUT_MS,
            projectId: clip.project_id,
            clipId: clip.id,
          });
          useOutput = true;
        } catch (err: any) {
          logger.warn(`[Thumbnails] Could not use output_storage_path for clip ${clip.id}, falling back to source: ${err?.message}`);
        }
      }

      if (!useOutput) {
        await ClipRenderService.ensureSourceVideo(clip.source_storage_path, sourcePath, {
          timeoutMs: GEN_TIMEOUT_MS,
          projectId: clip.project_id,
          clipId: clip.id,
        });
      }

      const offsetSeconds = useOutput ? 0 : Number(clip.start_seconds);
      const args = buildThumbnailArgs(sourcePath, offsetSeconds, genDuration, count, THUMBNAIL_HEIGHT, spritePath);
      await execFileAsync(ffmpegBin, args, { timeout: GEN_TIMEOUT_MS });

      if (!fs.existsSync(spritePath) || fs.statSync(spritePath).size === 0) {
        logger.warn(`[Thumbnails] No sprite produced for clip ${clip.id}; returning empty strip.`);
        return empty;
      }

      const buf = fs.readFileSync(spritePath);
      const dataUrl = `data:image/jpeg;base64,${buf.toString('base64')}`;
      // Per-cell width: total sprite width / count. Probe-free: derive from the known height
      // and the sprite's byte dimensions via a tiny header parse is overkill — the frontend
      // computes cell width from the rendered image's natural width / frameCount instead.
      return {
        dataUrl,
        frameCount: count,
        frameWidth: 0, // resolved client-side from naturalWidth / frameCount
        frameHeight: THUMBNAIL_HEIGHT,
        duration: Number(genDuration.toFixed(3)),
        version: THUMBNAIL_FORMAT_VERSION,
      };
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    }
  }

  private static async readCache(clipId: string, userId: string, cacheKey: string): Promise<ThumbnailStripData | null> {
    if (!isMongoConfigured) return null;
    try {
      const { data } = await dataRepository
        .from(THUMBNAIL_COLLECTION)
        .select('*')
        .eq('clip_id', clipId)
        .eq('user_id', userId)
        .eq('cache_key', cacheKey)
        .maybeSingle();

      if (isFreshThumbnailRow(data)) {
        return {
          dataUrl: data.dataUrl,
          frameCount: data.frameCount,
          frameWidth: Number(data.frameWidth) || 0,
          frameHeight: Number(data.frameHeight) || THUMBNAIL_HEIGHT,
          duration: Number(data.duration) || 0,
          version: data.version,
        };
      }
    } catch (err: any) {
      logger.warn(`[Thumbnails] Cache read failed for clip ${clipId}: ${err.message}`);
    }
    return null;
  }

  private static async writeCache(clipId: string, userId: string, cacheKey: string, data: ThumbnailStripData): Promise<void> {
    if (!isMongoConfigured || !data.dataUrl) return;
    try {
      await dataRepository.from(THUMBNAIL_COLLECTION).upsert(
        {
          id: `${clipId}:${cacheKey}`,
          clip_id: clipId,
          user_id: userId,
          cache_key: cacheKey,
          ...data,
        },
        { onConflict: 'id' }
      );
    } catch (err: any) {
      logger.warn(`[Thumbnails] Cache write failed for clip ${clipId}: ${err.message}`);
    }
  }
}
