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
  buildPcmDecodeArgs,
  buildPeaksFromPcm,
  isFreshWaveformRow,
  waveformCacheKey,
  WaveformData,
  WAVEFORM_FORMAT_VERSION,
  PEAKS_PER_SECOND,
} from '../shared/waveformPeaks.js';
import type { ClipRecord } from '../types/index.js';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';

/** Mono sample rate for peak extraction: ample for visuals, small PCM footprint. */
const WAVEFORM_SAMPLE_RATE = 8000;
/** Guard against decoding absurdly long windows for a timeline preview. */
const MAX_WAVEFORM_SECONDS = 1800;
const DECODE_TIMEOUT_MS = 60_000;

const WAVEFORM_COLLECTION = 'clip_waveforms';
const ASSET_WAVEFORM_COLLECTION = 'asset_waveforms';

export interface WaveformResult extends WaveformData {
  /** True when served from the cache rather than freshly decoded. */
  cached: boolean;
}

export class WaveformService {
  /**
   * Returns normalized peaks for a clip's source-audio window, decoding once and caching
   * the result keyed by source identity + window + format version. A later trim of the
   * clip does not invalidate the cache: the peaks cover the whole clip window and the
   * frontend indexes the sub-range it needs.
   */
  public static async getWaveformForClip(
    clipId: string,
    userId: string,
    options: { forceRefresh?: boolean } = {}
  ): Promise<WaveformResult> {
    const clip = await ClipRenderService.getClip(clipId, userId);
    const cacheKey = waveformCacheKey(clip.source_storage_path, clip.start_seconds, clip.end_seconds);

    if (!options.forceRefresh) {
      const cached = await this.readCache(clipId, userId, cacheKey);
      if (cached) {
        return { ...cached, cached: true };
      }
    }

    const data = await this.decodeClipWaveform(clip);
    await this.writeCache(clipId, userId, cacheKey, data);
    return { ...data, cached: false };
  }

  /** Decodes the clip's source window to PCM and computes peaks. Pure I/O + shared math. */
  public static async decodeClipWaveform(clip: ClipRecord): Promise<WaveformData> {
    const windowDuration = Math.max(0, Number(clip.end_seconds) - Number(clip.start_seconds));
    if (!Number.isFinite(windowDuration) || windowDuration <= 0) {
      return { peaks: [], duration: 0, resolution: PEAKS_PER_SECOND, version: WAVEFORM_FORMAT_VERSION };
    }
    const decodeDuration = Math.min(windowDuration, MAX_WAVEFORM_SECONDS);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-wave-'));
    const sourcePath = path.join(tmpDir, `source-${crypto.randomUUID()}`);
    try {
      await ClipRenderService.ensureSourceVideo(clip.source_storage_path, sourcePath, {
        timeoutMs: DECODE_TIMEOUT_MS,
        projectId: clip.project_id,
        clipId: clip.id,
      });
      return await this.decodeWaveformFromFile(sourcePath, Number(clip.start_seconds), decodeDuration, tmpDir);
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        /* best-effort cleanup */
      }
    }
  }

  /** Decodes a local media file's window to PCM and returns normalized peaks. */
  public static async decodeWaveformFromFile(
    filePath: string,
    startSec: number,
    durationSec: number,
    workDir?: string
  ): Promise<WaveformData> {
    const empty: WaveformData = { peaks: [], duration: 0, resolution: PEAKS_PER_SECOND, version: WAVEFORM_FORMAT_VERSION };
    if (!fs.existsSync(filePath) || durationSec <= 0) return empty;

    const ownsDir = !workDir;
    const dir = workDir || fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-wave-f-'));
    const pcmPath = path.join(dir, `audio-${crypto.randomUUID()}.pcm`);
    try {
      const args = buildPcmDecodeArgs(filePath, startSec, Math.min(durationSec, MAX_WAVEFORM_SECONDS), WAVEFORM_SAMPLE_RATE);
      // Decode to a file (not stdout) so very long windows never overflow a pipe buffer.
      args[args.length - 1] = pcmPath;
      await execFileAsync(ffmpegBin, args, { timeout: DECODE_TIMEOUT_MS });

      if (!fs.existsSync(pcmPath)) return empty;
      const buf = fs.readFileSync(pcmPath);
      const samples = new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 2));
      const { peaks, duration } = buildPeaksFromPcm(samples, WAVEFORM_SAMPLE_RATE, PEAKS_PER_SECOND);
      return { peaks, duration, resolution: PEAKS_PER_SECOND, version: WAVEFORM_FORMAT_VERSION };
    } finally {
      if (ownsDir) {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
        } catch {
          /* best-effort */
        }
      }
    }
  }

  /**
   * Peaks for an uploaded audio asset (music / SFX), covering the whole asset, cached by
   * asset id + format version. Returns empty peaks when the asset's media isn't resolvable,
   * so the timeline shows a placeholder rather than failing.
   */
  public static async getWaveformForAsset(assetId: string, userId: string): Promise<WaveformResult> {
    const cacheKey = `asset:${assetId}|v${WAVEFORM_FORMAT_VERSION}`;
    const cached = await this.readCacheFrom(ASSET_WAVEFORM_COLLECTION, assetId, userId, cacheKey);
    if (cached) return { ...cached, cached: true };

    let data: WaveformData = { peaks: [], duration: 0, resolution: PEAKS_PER_SECOND, version: WAVEFORM_FORMAT_VERSION };
    if (isMongoConfigured) {
      try {
        const { data: asset } = await dataRepository
          .from('audio_assets')
          .select('*')
          .eq('id', assetId)
          .eq('user_id', userId)
          .maybeSingle();
        if (asset?.storage_path) {
          data = await this.decodeWaveformFromFile(asset.storage_path, 0, Number(asset.duration) || MAX_WAVEFORM_SECONDS);
        }
      } catch (err: any) {
        logger.warn(`[Waveform] Asset ${assetId} resolution failed: ${err.message}`);
      }
    }
    if (data.peaks.length > 0) {
      await this.writeCacheTo(ASSET_WAVEFORM_COLLECTION, `${assetId}:${WAVEFORM_FORMAT_VERSION}`, assetId, userId, cacheKey, data);
    }
    return { ...data, cached: false };
  }

  private static async readCache(clipId: string, userId: string, cacheKey: string): Promise<WaveformData | null> {
    return this.readCacheFrom(WAVEFORM_COLLECTION, clipId, userId, cacheKey);
  }

  private static async writeCache(clipId: string, userId: string, cacheKey: string, data: WaveformData): Promise<void> {
    return this.writeCacheTo(WAVEFORM_COLLECTION, `${clipId}:${WAVEFORM_FORMAT_VERSION}`, clipId, userId, cacheKey, data);
  }

  /** Generic cache read: matched by (user_id, cache_key); the cache_key encodes identity. */
  private static async readCacheFrom(
    collection: string,
    ownerId: string,
    userId: string,
    cacheKey: string
  ): Promise<WaveformData | null> {
    if (!isMongoConfigured) return null;
    try {
      const { data } = await dataRepository
        .from(collection)
        .select('*')
        .eq('user_id', userId)
        .eq('cache_key', cacheKey)
        .maybeSingle();

      if (isFreshWaveformRow(data)) {
        return {
          peaks: data.peaks,
          duration: Number(data.duration) || 0,
          resolution: data.resolution,
          version: data.version,
        };
      }
    } catch (err: any) {
      logger.warn(`[Waveform] Cache read failed (${collection}/${ownerId}): ${err.message}`);
    }
    return null;
  }

  private static async writeCacheTo(
    collection: string,
    docId: string,
    ownerId: string,
    userId: string,
    cacheKey: string,
    data: WaveformData
  ): Promise<void> {
    if (!isMongoConfigured || data.peaks.length === 0) return;
    try {
      await dataRepository.from(collection).upsert(
        {
          id: docId,
          owner_id: ownerId,
          user_id: userId,
          cache_key: cacheKey,
          peaks: data.peaks,
          duration: data.duration,
          resolution: data.resolution,
          version: data.version,
        },
        { onConflict: 'id' }
      );
    } catch (err: any) {
      // Caching is best-effort; a failure here must not fail the request.
      logger.warn(`[Waveform] Cache write failed (${collection}/${ownerId}): ${err.message}`);
    }
  }
}
