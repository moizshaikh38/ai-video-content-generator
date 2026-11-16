import { resolveCaptionPreset } from '../shared/captionPresets.js';
import { clampCaptionFontSize } from '../shared/captionPresets.js';
import { assFontsDirArg } from './editorFontFiles.js';
import { canvasDims, parseRenderResolution, resolveEffectiveResolution, type EffectiveResolution } from '../shared/renderResolution.js';
import { createClipWithJob } from '../db/repositories/clipRepository.js';
import { isMongoConfigured, getMongoDb } from '../db/mongoClient.js';
import { dataRepository, ownerContext } from '../db/repositories/dataRepository.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import ffmpeg from 'fluent-ffmpeg';
import { getRenderFfmpeg } from '../utils/drawtextFfmpeg.js';
import { clipObjectPrefix, deletePrefix, downloadObjectToFile, renderObjectKey, signObjectGet, uploadFile } from './objectStorageService.js';
import { deleteClipRecords } from '../db/repositories/deletionRepository.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import {
  ClipRecord,
  RenderJobRecord,
  ClipAspectRatio,
  ClipCropMode,
  CropMode,
  CaptionStyle,
  CaptionPosition,
  CropConfig,
  OverlayConfig,
  CaptionConfig,
  ClipEditorUpdateDTO,
  AppError,
  isValidUUID,
  ReframeKeyframe,
  ReframeLayoutMode,
  QuickClipMusicConfig,
} from '../types/index.js';
import { CaptionService } from './captionService.js';
import { ALL_CAPTION_STYLES, CAPTION_PRESET_IDS, isCaptionPresetId, sanitizePresetOverrides } from '../shared/captionPresets.js';
import { SmartReframeService, activeReframeAnalysisSet } from './smartReframeService.js';
import { JobReliabilityService } from './queue/jobReliabilityService.js';
import { ProEditorService } from './proEditorService.js';
import { AudioDuckingService } from './audioDuckingService.js';
import { FilterGraphBuilder } from './ffmpeg/filterGraphBuilder.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ClipPosterService } from './clipPosterService.js';
import { WatermarkService } from './watermarkService.js';
import { EntitlementService } from './entitlementService.js';
import { HardwareEncoderService } from './hardwareEncoderService.js';

const execFileAsync = promisify(execFile);

/**
 * drawtext (watermark, headline and text overlays) needs libfreetype, which
 * the bundled ffmpeg-static build lacks; renders under it fail with ffmpeg's
 * opaque "Error opening output files: Filter not found". getRenderFfmpeg is
 * the single resolution every fluent-ffmpeg configuration in this process
 * must share: setFfmpegPath writes a process-wide module cache, so any
 * module pinning a different binary (e.g. ffmpeg-static) at import time
 * silently overrides the render binary for the whole process.
 */
const ffmpegBin = getRenderFfmpeg();

// Configure fluent-ffmpeg to use the same resolved binary
if (ffmpegBin) {
  ffmpeg.setFfmpegPath(ffmpegBin);
}

// In-memory set to prevent duplicate simultaneous render jobs for the same clip
export const activeRenderSet = new Set<string>();

// CPU-bound FFmpeg renders must not run unbounded inside the web process.
// Inline (request-triggered) launches defer to the background sweep once the
// per-process cap is reached; the job stays 'queued' and is picked up later.
export function maxConcurrentRenders(): number {
  const cpus = os.cpus().length || 1;
  return Math.max(1, Math.min(4, Math.floor(cpus / 2)));
}

// Admission slots are reserved synchronously, BEFORE any await, by every path that
// starts a render (inline launch and background sweep). activeRenderSet only fills
// after renderClipJob's first awaits (clip fetch, Mongo lease claim), so counting it
// alone let two launches in the same tick both pass the cap, and the sweep never
// checked the cap at all. A slot is always released in a finally.
const reservedRenderSlots = new Set<string>();

/** Clip ids that hold a slot, either reserved by a launcher or actively rendering. */
function occupiedRenderClipIds(): string[] {
  return Array.from(new Set<string>([...reservedRenderSlots, ...activeRenderSet]));
}

export function renderOccupancy(): number {
  return occupiedRenderClipIds().length;
}

/**
 * Reserves one render slot for a clip. Returns false (and reserves nothing) when the
 * clip already holds a slot or the cap is reached. `cap` is injectable for tests.
 */
export function tryReserveRenderSlot(clipId: string, cap: number = maxConcurrentRenders()): boolean {
  if (reservedRenderSlots.has(clipId) || activeRenderSet.has(clipId)) return false;
  if (renderOccupancy() >= cap) return false;
  reservedRenderSlots.add(clipId);
  return true;
}

export function releaseRenderSlot(clipId: string): void {
  reservedRenderSlots.delete(clipId);
}

export function shouldLaunchInlineRender(): boolean {
  return renderOccupancy() < maxConcurrentRenders();
}

/**
 * Fires an inline render only when the per-process concurrency cap allows it.
 * When deferred, the job stays 'queued' in render_jobs and the background sweep
 * started in index.ts picks it up.
 */
export function launchInlineRender(clipId: string, userId: string, jobId: string | undefined): boolean {
  if (!tryReserveRenderSlot(clipId)) {
    logger.warn(`[ClipRender] Inline render deferred to background sweep for clip ${clipId} (concurrency cap ${maxConcurrentRenders()} reached or clip already holds a slot)`);
    return false;
  }
  try {
    ownerContext.run(userId, () => {
      ClipRenderService.renderClipJob(clipId, userId, jobId)
        .catch((renderErr) => {
          logger.error('Background clip rendering caught top-level error', {
            clipId,
            error: renderErr instanceof Error ? renderErr.message : String(renderErr),
          });
        })
        .finally(() => releaseRenderSlot(clipId));
    });
  } catch (launchErr) {
    releaseRenderSlot(clipId);
    throw launchErr;
  }
  return true;
}

export interface CreateClipResult {
  clip: ClipRecord;
  renderJob: RenderJobRecord;
}

export interface SignedUrlResult {
  signedUrl: string;
  filename?: string;
  expiresInSeconds: number;
}

export interface QuickClipAudioGraph {
  hasBackgroundMusic: boolean;
  musicPath?: string;
  inputArgs: string[];
  filterComplex: string[];
  audioMap: string;
}

/**
 * Checks if a clip is currently rendering in-memory
 */
export function isClipRenderActive(clipId: string): boolean {
  return activeRenderSet.has(clipId) || reservedRenderSlots.has(clipId);
}

/**
 * Sanitizes a title string into a safe, valid filename without special characters
 */
export function sanitizeFilename(name: string): string {
  const sanitized = name
    .replace(/\.\.+/g, '')
    .replace(/[^\w\s.-]/gi, '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 80);
  return sanitized || 'clip';
}

/**
 * Generates the FFmpeg video filter string for scaling and center/manual cropping
 * to the requested target aspect ratio without distortion.
 */
/**
 * Composes the quick-render video filter chain for ffmpeg execution.
 * Simple chains (no link labels) run under -vf via fluent-ffmpeg videoFilters.
 * Labeled layout graphs (screencast/split outputs of SmartReframeService.buildLayoutCropFilter)
 * cannot go through -vf: labels require -filter_complex with an explicit [0:v] input
 * pad and a labeled [out_v] final output. Previously both were fed to -vf verbatim,
 * which made every smart render resolving to a labeled layout fail permanently.
 */
export function composeQuickVideoGraph(videoFilters: string[]): { graph: string; labeled: boolean } {
  const chain = videoFilters.join(',');
  if (!chain.includes('[')) {
    return { graph: `[0:v]${chain}[out_v]`, labeled: false };
  }
  let stripped = chain.startsWith('[0:v]') ? chain.slice('[0:v]'.length) : chain;
  // Layout builders terminate their graph with a labeled [out] link; leaving it labeled
  // when more filters follow makes ffmpeg reject the graph (labeled link unused). Unlabel
  // it so the trailing simple filters (captions, watermark) auto-chain from it.
  stripped = stripped.replace(/\[out\](?=,|$)/g, '');
  return { graph: `[0:v]${stripped}[out_v]`, labeled: true };
}

export function buildCropFilter(
  aspectRatio: ClipAspectRatio = '9:16',
  cropConfig?: { focusX?: number; focusY?: number; scale?: number },
  canvasScale = 1
): string {
  const fx = Math.min(1.0, Math.max(0.0, Number(cropConfig?.focusX ?? 0.5)));
  const fy = Math.min(1.0, Math.max(0.0, Number(cropConfig?.focusY ?? 0.5)));
  // Zoom factor: 1 = cover window fills the frame, >1 crops a smaller window
  // around the focus and scales it back up (single-pass to avoid double blur).
  const zoom = Math.min(4.0, Math.max(1.0, Number(cropConfig?.scale ?? 1)));
  const { width: ow, height: oh } = canvasDims(aspectRatio, canvasScale);
  const arW = aspectRatio === '16:9' ? 16 : aspectRatio === '1:1' ? 1 : 9;
  const arH = aspectRatio === '16:9' ? 9 : aspectRatio === '1:1' ? 1 : 16;

  if (zoom > 1) {
    return (
      `crop=w='min(iw,ih*${arW}/${arH})/${zoom}':h='min(ih,iw*${arH}/${arW})/${zoom}'` +
      `:x='(in_w-out_w)*${fx}':y='(in_h-out_h)*${fy}',scale=${ow}:${oh}`
    );
  }

  const base = `scale=${ow}:${oh}:force_original_aspect_ratio=increase,crop=${ow}:${oh}`;
  // Default focus is the canonical center-crop filter.
  if (fx === 0.5 && fy === 0.5) return base;
  // Manual framing crop using exact clamped focus offsets
  return `${base}:(in_w-out_w)*${fx}:(in_h-out_h)*${fy}`;
}

/**
 * Builds a letterbox "fit" filter: whole frame visible, black bars to fill the
 * target canvas. Mirrors the studio preview's fit mode so export matches it.
 */
export function buildFitFilter(
  aspectRatio: ClipAspectRatio = '9:16',
  zoom: number = 1,
  focusX: number = 0.5,
  focusY: number = 0.5,
  canvasScale: number = 1
): string {
  const cd = canvasDims(aspectRatio, canvasScale);
  const ar = { w: cd.width, h: cd.height };
  const z = Math.min(4, Math.max(1, Number(zoom) || 1));
  if (z <= 1) {
    return `scale=${ar.w}:${ar.h}:force_original_aspect_ratio=decrease,pad=${ar.w}:${ar.h}:(ow-iw)/2:(oh-ih)/2:color=black`;
  }
  // Zoom within fit: scale the contained frame by z around the focus point,
  // pad back up to at least the frame size, then crop the frame window.
  return (
    `scale=${ar.w}:${ar.h}:force_original_aspect_ratio=decrease` +
    `,scale=trunc(iw*${z}/2)*2:trunc(ih*${z}/2)*2` +
    `,pad='max(iw,${ar.w})':'max(ih,${ar.h})':(ow-iw)/2:(oh-ih)/2:color=black` +
    `,crop=${ar.w}:${ar.h}:x='(in_w-${ar.w})*${focusX}':y='(in_h-${ar.h})*${focusY}'`
  );
}

/**
 * Chain-safe blurred-background fill ("Fit with Blur") for the pro editor
 * compiler. Unlike SmartReframeService.buildBlurBackgroundFilter (labeled
 * [0:v]...[out] form), this returns a fragment that drops into the middle of a
 * comma-joined slice chain: it consumes the incoming stream with split and
 * ends on an unlabeled overlay output, so callers can keep appending filters.
 * `tag` must be unique per graph (slice labels collide otherwise).
 */
export function buildBlurFitChain(
  aspectRatio: ClipAspectRatio = '9:16',
  zoom: number = 1,
  tag: string = 'vcb',
  canvasScale: number = 1
): string {
  const cd = canvasDims(aspectRatio, canvasScale);
  const ar = { w: cd.width, h: cd.height };
  const z = Math.min(4, Math.max(1, Number(zoom) || 1));
  const fgW = Math.max(2, Math.round((ar.w * z) / 2) * 2);
  return (
    `split=2[${tag}_bgs][${tag}_fgs];` +
    `[${tag}_bgs]scale=${ar.w}:${ar.h}:force_original_aspect_ratio=increase,crop=${ar.w}:${ar.h},boxblur=${Math.round(25 * canvasScale)}:5,eq=brightness=-0.15:contrast=0.95[${tag}_bg];` +
    `[${tag}_fgs]scale=${fgW}:-2[${tag}_fg];` +
    `[${tag}_bg][${tag}_fg]overlay=(W-w)/2:(H-h)/2`
  );
}

export interface CanvasBackdropSpec {
  /** 'blur' = blurred copy of the source; 'color' = solid fill. */
  kind: 'blur' | 'color';
  /** #RRGGBB for kind 'color'. */
  color?: string;
  /** Inset of the video from every canvas edge, percent of canvas width (0-20). */
  spacingPct?: number;
  /** Video corner radius in output pixels (0-120). */
  cornerRadius?: number;
  /** When set (w/h, e.g. 4/3), the source is cover-cropped to this band before placement (Fit band). */
  bandAspect?: number;
  /** Crop focus 0-1 inside the source for the band crop. */
  focusX?: number;
  focusY?: number;
}

export function normalizeBackdropHex(input: unknown, fallback = '000000'): string {
  const m = String(input ?? '').trim().replace(/^#/, '');
  return /^[0-9a-fA-F]{6}$/.test(m) ? m.toUpperCase() : fallback;
}

/**
 * Chain-safe backdrop layout used by the pro editor for the Background panel:
 * the whole frame is scaled to fit inside a spaced inset, optionally rounded,
 * and composited over a blurred copy of the source or a solid colour. Callers
 * keep legacy filters when spacing and radius are both 0 (see proEditorService).
 */
export function buildBackdropFitChain(
  aspectRatio: ClipAspectRatio = '9:16',
  zoom: number = 1,
  spec: CanvasBackdropSpec,
  tag: string = 'vcd',
  /** Output scale vs the 1080-based canvas (1 = 1080p, 2 = 4K-class). Geometry, radius and blur scale with it. */
  canvasScale: number = 1
): string {
  const cs = Math.min(4, Math.max(0.25, Number(canvasScale) || 1));
  const base = aspectRatio === '16:9' ? { w: 1920, h: 1080 } : aspectRatio === '1:1' ? { w: 1080, h: 1080 } : { w: 1080, h: 1920 };
  const ar = { w: Math.round(base.w * cs / 2) * 2, h: Math.round(base.h * cs / 2) * 2 };
  const z = Math.min(4, Math.max(1, Number(zoom) || 1));
  const space = Math.round((ar.w * Math.min(20, Math.max(0, Number(spec.spacingPct) || 0))) / 100 / 2) * 2;
  const radius = Math.round(Math.min(120, Math.max(0, Number(spec.cornerRadius) || 0)) * cs);
  const boxW = Math.max(2, ar.w - 2 * space);
  const boxH = Math.max(2, ar.h - 2 * space);
  const fgW = Math.max(2, Math.round((boxW * z) / 2) * 2);
  const bg = spec.kind === 'color'
    ? `scale=${ar.w}:${ar.h},drawbox=x=0:y=0:w=${ar.w}:h=${ar.h}:color=0x${normalizeBackdropHex(spec.color)}:t=fill`
    : `scale=${ar.w}:${ar.h}:force_original_aspect_ratio=increase,crop=${ar.w}:${ar.h},boxblur=${Math.round(25 * cs)}:5,eq=brightness=-0.15:contrast=0.95`;
  // Fit inside the inset box (never wider than the box at zoom 1; zoom widens it, overlay crops at canvas edge).
  const fgScale = z > 1 ? `scale=${fgW}:-2` : `scale=${boxW}:${boxH}:force_original_aspect_ratio=decrease`;
  let fg = `${fgScale}`;
  if (spec.bandAspect && spec.bandAspect > 0) {
    const B = Number(spec.bandAspect).toFixed(5);
    const fx = Math.min(1, Math.max(0, Number(spec.focusX ?? 0.5))).toFixed(4);
    const fy = Math.min(1, Math.max(0, Number(spec.focusY ?? 0.5))).toFixed(4);
    const bandH = Math.max(2, Math.round(fgW / spec.bandAspect / 2) * 2);
    fg = `crop=w='min(iw,ih*${B})':h='min(ih,iw/${B})':x='(iw-ow)*${fx}':y='(ih-oh)*${fy}',scale=${fgW}:${bandH}`;
  }
  if (radius > 0) {
    const r = radius;
    fg += `,format=yuva420p,geq=lum='p(X,Y)':cb='p(X,Y)':cr='p(X,Y)':a='if(gt(max(abs(X+0.5-W/2)-(W/2-${r}),0)*max(abs(X+0.5-W/2)-(W/2-${r}),0)+max(abs(Y+0.5-H/2)-(H/2-${r}),0)*max(abs(Y+0.5-H/2)-(H/2-${r}),0),${r}*${r}),0,255)'`;
  }
  return (
    `split=2[${tag}_bgs][${tag}_fgs];` +
    `[${tag}_bgs]${bg}[${tag}_bg];` +
    `[${tag}_fgs]${fg}[${tag}_fg];` +
    `[${tag}_bg][${tag}_fg]overlay=(W-w)/2:(H-h)/2:format=auto`
  );
}

/**
 * Builds an FFmpeg dynamic crop filter graph expression for smart auto-reframe
 */
export function buildSmartCropFilter(
  keyframes: ReframeKeyframe[],
  aspectRatio: ClipAspectRatio = '9:16',
  sourceWidth = 1920,
  sourceHeight = 1080,
  duration = 30.0
): string {
  return SmartReframeService.buildSmartCropFilter(keyframes, aspectRatio, sourceWidth, sourceHeight, duration);
}

/**
 * Parses FFmpeg timemark strings (HH:MM:SS.ms) into total seconds
 */

export function parseTimemarkToSeconds(timemark: string): number {
  if (!timemark || typeof timemark !== 'string') return 0;
  const parts = timemark.split(':');
  if (parts.length === 3) {
    const hours = parseFloat(parts[0]) || 0;
    const minutes = parseFloat(parts[1]) || 0;
    const seconds = parseFloat(parts[2]) || 0;
    return hours * 3600 + minutes * 60 + seconds;
  }
  return parseFloat(timemark) || 0;
}

export class ClipRenderService {
  /**
   * Creates a new clip record grounded strictly in an existing AI candidate,
   * creates an initial render_jobs row, and triggers async rendering.
   */
  public static async createClipFromCandidate(
    projectId: string,
    userId: string,
    candidateId: string,
    aspectRatio: ClipAspectRatio = '9:16',
    cropMode: ClipCropMode = 'center',
    options?: { caption_enabled?: boolean; caption_style?: string; caption_config?: any }
  ): Promise<CreateClipResult> {
    if (!isMongoConfigured) {
      const err = new Error('Database service is not configured.');
      (err as any).code = 'SERVICE_UNAVAILABLE';
      throw err;
    }

    if (!isValidUUID(projectId) || !isValidUUID(candidateId)) {
      const err = new Error('Valid UUIDs required for project and candidate.');
      (err as any).code = 'INVALID_UUID';
      throw err;
    }

    const validRatios: ClipAspectRatio[] = ['9:16', '1:1', '16:9'];
    const validAspectRatio = validRatios.includes(aspectRatio) ? aspectRatio : '9:16';
    const { clip, renderJob } = await createClipWithJob(projectId, candidateId, userId, validAspectRatio, cropMode, options);

    // 6. Launch in-process background rendering (deferred to the sweep when at cap)
    launchInlineRender(clip.id, userId, renderJob.id);

    return {
      clip: clip as ClipRecord,
      renderJob: renderJob as RenderJobRecord,
    };
  }

  /**
   * Puts a read-only working copy of a source video at targetLocalPath. A hard link is instant
   * where a full copy of a multi-GB source takes seconds; callers only read and then unlink the
   * target, which never touches the cached file. Falls back to a copy across filesystems.
   */
  private static placeSourceFile(sourcePath: string, targetLocalPath: string): void {
    try {
      fs.linkSync(sourcePath, targetLocalPath);
    } catch {
      fs.copyFileSync(sourcePath, targetLocalPath);
    }
  }

  /**
   * Resolves, caches, or downloads the source video to targetLocalPath.
   * 1. Checks if sourceStoragePath points to a valid local file on disk (absolute or repo-relative).
   * 2. Checks if the source is already cached in a shared project/source disk cache in os.tmpdir().
   * 3. Otherwise downloads from R2 with strict timeout protection and caches it atomically.
   */
  public static async ensureSourceVideo(
    sourceStoragePath: string | null | undefined,
    targetLocalPath: string,
    options: { timeoutMs?: number; projectId?: string; clipId?: string } = {}
  ): Promise<'local_fallback' | 'cache_hit' | 'downloaded'> {
    if (!sourceStoragePath) {
      throw new AppError('Source storage path is missing for clip.', 400, 'SOURCE_PATH_MISSING');
    }

    // 1. Local filesystem fallback check
    const candidatePaths = [
      sourceStoragePath,
      path.resolve(process.cwd(), sourceStoragePath),
      path.resolve(process.cwd(), '..', sourceStoragePath),
      path.resolve(process.cwd(), '../..', sourceStoragePath),
    ];

    for (const p of candidatePaths) {
      try {
        if (fs.existsSync(p) && fs.statSync(p).isFile() && fs.statSync(p).size > 0) {
          logger.info(`[ClipRender] Using local source video fallback: ${p}`);
          ClipRenderService.placeSourceFile(p, targetLocalPath);
          return 'local_fallback';
        }
      } catch {}
    }

    // 2. Shared Source Disk Cache Check
    const cacheDir = path.join(os.tmpdir(), 'vireo-source-cache');
    try {
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
    } catch {}

    const hash = crypto.createHash('sha256').update(sourceStoragePath).digest('hex');
    const cachedFile = path.join(cacheDir, `${hash}.mp4`);

    try {
      if (fs.existsSync(cachedFile) && fs.statSync(cachedFile).size > 0) {
        logger.info(`[ClipRender] Reused cached source video: ${cachedFile}`);
        ClipRenderService.placeSourceFile(cachedFile, targetLocalPath);
        return 'cache_hit';
      }
    } catch {}

    // 3. Strict Download from R2 with Timeout and Atomic Cache Placement
    const downloadTimeout = Math.max(options.timeoutMs || 120000, 120000);
    const stagingFile = path.join(cacheDir, `${hash}.tmp.${Date.now()}`);

    try {
      await downloadObjectToFile('source', sourceStoragePath, stagingFile, { timeoutMs: downloadTimeout });

      if (!fs.existsSync(stagingFile) || fs.statSync(stagingFile).size === 0) {
        throw new AppError('Downloaded source file is empty.', 500, 'EMPTY_SOURCE_FILE');
      }

      // Atomically move staging file into cache
      try {
        fs.renameSync(stagingFile, cachedFile);
      } catch {
        fs.copyFileSync(stagingFile, cachedFile);
        try { fs.unlinkSync(stagingFile); } catch {}
      }

      ClipRenderService.placeSourceFile(cachedFile, targetLocalPath);
      logger.info(`[ClipRender] Downloaded and cached source video to ${cachedFile}`);
      return 'downloaded';
    } catch (err: any) {
      try {
        if (fs.existsSync(stagingFile)) fs.unlinkSync(stagingFile);
      } catch {}
      throw err;
    }
  }

  /**
   * Executes the real FFmpeg cut, reframe, encode, and storage upload pipeline.
   */
  public static async renderClipJob(
    clipId: string,
    userId: string,
    existingJobId?: string
  ): Promise<void> {
    if (activeRenderSet.has(clipId)) {
      const err = new Error('Render is already in progress for this clip.');
      (err as any).code = 'RENDER_ALREADY_ACTIVE';
      throw err;
    }

    // Fetch clip and verify ownership
    const { data: clip, error: clipErr } = await dataRepository
      .from('clips')
      .select('*')
      .eq('id', clipId)
      .eq('user_id', userId)
      .maybeSingle();

    if (clipErr || !clip) {
      const err = new Error('Clip not found or access denied.');
      (err as any).code = 'CLIP_NOT_FOUND';
      throw err;
    }

    // Concurrency check on DB state (allow recovery if stuck > 15m)
    const isStale =
      Date.now() - new Date(clip.updated_at || clip.created_at).getTime() > 15 * 60 * 1000;
    if (['rendering', 'uploading'].includes(clip.render_status) && !isStale) {
      const err = new Error('Clip is currently being rendered. Please wait.');
      (err as any).code = 'RENDER_ALREADY_ACTIVE';
      throw err;
    }

    // Distributed worker and lease identification
    const workerId = `worker_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
    const RENDER_LOCK_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes stale lease recovery
    const now = new Date();
    const staleCutoff = new Date(now.getTime() - RENDER_LOCK_TIMEOUT_MS);

    let jobId = existingJobId;
    const db = await getMongoDb();
    const renderJobsCol = db.collection('render_jobs');

    // Ensure a render job exists in MongoDB
    if (!jobId) {
      const existingJob = await renderJobsCol.findOne({ clip_id: clipId, user_id: userId }, { sort: { created_at: -1 } });
      if (existingJob) {
        jobId = existingJob.id;
      } else {
        const newId = crypto.randomUUID();
        await renderJobsCol.insertOne({
          id: newId,
          clip_id: clipId,
          user_id: userId,
          status: 'queued',
          progress: 0,
          stage: 'queued',
          attempts: 0,
          max_attempts: 3,
          worker_id: null,
          locked_at: null,
          created_at: now,
          updated_at: now,
        });
        jobId = newId;
      }
    }

    // Atomic distributed lease acquisition:
    // Claim only if queued OR processing with an expired stale lock
    const claimedJob = await renderJobsCol.findOneAndUpdate(
      {
        id: jobId,
        $or: [
          { status: 'queued' },
          { status: 'processing', locked_at: { $lt: staleCutoff } },
        ],
      },
      {
        $set: {
          status: 'processing',
          stage: 'downloading',
          worker_id: workerId,
          locked_at: now,
          started_at: now,
          updated_at: now,
        },
        $inc: { attempts: 1 },
      },
      { returnDocument: 'after' }
    );

    if (!claimedJob) {
      const currentJob = await renderJobsCol.findOne({ id: jobId });
      if (currentJob?.status === 'completed') {
        logger.info(`[ClipRender] Clip ${clipId} is already rendered and completed.`);
        return;
      }
      const err = new Error('Render is already in progress for this clip by another worker.');
      (err as any).code = 'RENDER_ALREADY_ACTIVE';
      throw err;
    }

    activeRenderSet.add(clipId);

    // Heartbeat timer to renew lease during long rendering operations
    const heartbeatTimer = setInterval(async () => {
      try {
        await db.collection('render_jobs').updateOne(
          { id: jobId, worker_id: workerId },
          { $set: { locked_at: new Date(), updated_at: new Date() } }
        );
      } catch (hbErr: any) {
        logger.warn(`[ClipRender] Heartbeat failed for job ${jobId}: ${hbErr.message}`);
      }
    }, 15000);
    heartbeatTimer.unref();

    const uniqueTag = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const tempDir = path.join(os.tmpdir(), `vireo-render-${clipId}-${uniqueTag}`);

    try {
      fs.mkdirSync(tempDir, { recursive: true });

      // Update stage: downloading (5%)
      await ClipRenderService.updateJobStage(jobId, clipId, 'downloading', 5, 'rendering', workerId);

      // 1. Download private source video
      const sourcePath = path.join(tempDir, 'source.mp4');
      const outputPath = path.join(tempDir, 'rendered.mp4');

      const timeoutMs = config.clipRenderTimeoutMs || 300000;

      logger.info(`[ClipRender] Downloading source video from Storage: ${clip.source_storage_path}`, {
        clipId,
        sourcePath: clip.source_storage_path,
      });

      await ClipRenderService.ensureSourceVideo(clip.source_storage_path, sourcePath, {
        timeoutMs,
        projectId: clip.project_id,
        clipId,
      });

      // 2. FFmpeg cut, manual framing, ASS subtitles, text overlay, and MP4 encode
      await ClipRenderService.updateJobStage(jobId, clipId, 'cutting', 10, 'rendering', workerId);

      const trimStart = Number(clip.trim_start_offset || 0);
      const trimEnd = Number(clip.trim_end_offset || 0);
      const startSec = Number(clip.start_seconds) + trimStart;
      const originalDuration = Number(clip.duration_seconds || (clip.end_seconds - clip.start_seconds));
      const durationSec = Math.max(0.1, Number((originalDuration - trimStart - trimEnd).toFixed(3)));

      // Speaker-following guarantee: generate the smart-reframe track on demand
      // so active-speaker framing works out of the box.
      await ClipRenderService.ensureReframeTrackAtRender(clip, sourcePath, jobId);

      // Shared reframing decision (Quick path filter + Pro per-slice context).
      // Export resolution: requested tier from the clip (set by the export
      // dialog), lowered only when the source cannot carry it.
      const srcDims = await ClipRenderService.probeSourceDimensions(sourcePath);
      const resolution = resolveEffectiveResolution(
        parseRenderResolution((clip as any).render_resolution),
        clip.aspect_ratio as string,
        srcDims?.width,
        srcDims?.height
      );
      const canvasScale = resolution.scale;
      const outputCanvas = { width: resolution.width, height: resolution.height };
      let expectedCanvas = outputCanvas;
      logger.info(
        `[ClipRender] Resolution for clip ${clipId}: requested=${resolution.requested} effective=${resolution.effective} ` +
        `canvas=${outputCanvas.width}x${outputCanvas.height} source=${srcDims ? `${srcDims.width}x${srcDims.height}` : 'unknown'}` +
        (resolution.warning ? ` WARNING: ${resolution.warning}` : '')
      );
      const reframeDecision = await ClipRenderService.resolveReframeDecision(clip, durationSec, canvasScale);
      const cropFilter = reframeDecision.cropFilter;
      const actualReframeMode = reframeDecision.mode;
      const reframeMetadata = reframeDecision.metadata;

      const videoFilters: string[] = [cropFilter];

      // Check if a multi-track EditorProject exists with custom pro edits (splits, cuts, B-roll, secondary audio, keyframes, text layers).
      // Loaded before headline/caption burn-in decisions because studio state
      // is authoritative for the opening headline once a project exists.
      let hasCustomProTracks = false;
      let editorProject: any = null;
      let editorProjectExists = false;
      try {
        const { data: proj } = await dataRepository
          .from('editor_projects')
          .select('*')
          .eq('clip_id', clipId)
          .eq('user_id', userId)
          .maybeSingle();

        if (proj && Array.isArray(proj.tracks)) {
          editorProjectExists = true;
          hasCustomProTracks = ClipRenderService.hasCustomProEdits(proj, clip);
          if (hasCustomProTracks) {
            editorProject = proj;
          }
        }
      } catch (err: any) {
        logger.warn(`[ClipRender] Error checking EditorProject for clip ${clipId}: ${err.message}`);
      }

      // ASS Subtitles burn-in
      if (clip.caption_enabled !== false) {
        await ClipRenderService.updateJobStage(jobId, clipId, 'preparing_captions', 12, 'rendering');
        const assPath = path.join(tempDir, 'subtitles.ass');
        try {
          // Blur-fit layouts letterbox the source; anchor bottom captions to
          // the sharp content band so they do not sit on the blurred fill.
          // Screencast inset modes with a blurred stage letterbox the main
          // content the same way; split_stacked has its own geometry.
          // The pro-graph blur fill (per-item crop.mode 'blur', set by the
          // editor Layout toggle / panel) letterboxes the sharp band over a
          // blurred background exactly like reframe 'blur' layouts, so its
          // captions need the same band anchor. reframeDecision only reflects
          // the clip-level crop_config channel and cannot see item.crop.
          const proPrimaryCropMode =
            hasCustomProTracks && editorProject
              ? (editorProject.tracks || [])
                  .filter((t: any) => t.type === 'VIDEO' && !t.hidden)
                  .flatMap((t: any) => t.items || [])
                  .find((i: any) => !i.hidden && !i.is_title_card)?.crop?.mode
              : undefined;
          let proBlurSourceWidth: number | undefined;
          let proBlurSourceHeight: number | undefined;
          if (editorProject && !reframeDecision.track) {
            try {
              const { stdout } = await execFileAsync('ffprobe', [
                '-v', 'error', '-select_streams', 'v:0',
                '-show_entries', 'stream=width,height', '-of', 'json', sourcePath,
              ]);
              const st = ((JSON.parse(stdout) as any).streams || [])[0] || {};
              proBlurSourceWidth = Number(st.width) || undefined;
              proBlurSourceHeight = Number(st.height) || undefined;
            } catch {
              // Degrade to the default caption position, matching the policy of
              // the other probe sites in this file.
            }
          }
          const blurFitStage =
            reframeDecision.layoutMode === 'blur' ||
            proPrimaryCropMode === 'blur' ||
            (reframeDecision.layoutMode === 'screencast' &&
              clip.crop_config?.screencast?.background === 'blur' &&
              (clip.crop_config?.screencast?.mode === 'circular_inset' ||
                clip.crop_config?.screencast?.mode === 'rounded_card_inset'));
          const bandAnchorPositionY = blurFitStage
            ? CaptionService.computeBlurFitBandAnchor(
                clip.aspect_ratio as ClipAspectRatio,
                reframeDecision.track?.source_width ?? proBlurSourceWidth ?? undefined,
                reframeDecision.track?.source_height ?? proBlurSourceHeight ?? undefined
              )
            : undefined;
          // Speaker-split captions (OpenShorts): only in the two-speaker
          // split layout, with zones + followed-subject keyframes from the
          // smart-reframe track. Otherwise captions render unchanged.
          const splitZones =
            reframeDecision.layoutMode === 'split' && reframeDecision.track
              ? {
                  speaker1X: Number(
                    (reframeDecision.track.metadata as any)?.speaker1X ?? clip.crop_config?.split?.speaker1X
                  ),
                  speaker2X: Number(
                    (reframeDecision.track.metadata as any)?.speaker2X ?? clip.crop_config?.split?.speaker2X
                  ),
                }
              : null;
          const speakerSplit =
            splitZones &&
            Number.isFinite(splitZones.speaker1X) &&
            Number.isFinite(splitZones.speaker2X) &&
            Array.isArray(reframeDecision.track?.smoothed_keyframes) &&
            reframeDecision.track.smoothed_keyframes.length > 0
              ? {
                  keyframes: reframeDecision.track!.smoothed_keyframes.map((k: any) => ({
                    time: Number(k.time),
                    centerX: Number(k.centerX),
                  })),
                  speaker1X: splitZones.speaker1X,
                  speaker2X: splitZones.speaker2X,
                }
              : undefined;
          const captionResult = await CaptionService.generateCaptionsForClip({
            clip,
            targetAspectRatio: clip.aspect_ratio as ClipAspectRatio,
            outputPath: assPath,
            bandAnchorPositionY,
            sourceWidth: reframeDecision.track?.source_width ?? proBlurSourceWidth,
            sourceHeight: reframeDecision.track?.source_height ?? proBlurSourceHeight,
            sceneLayoutFallback: reframeDecision.layoutMode,
            speakerSplit,
          });

          if (captionResult.cues.length > 0 && fs.existsSync(assPath)) {
            const safeAss = assPath.replace(/\\/g, '/').replace(/:/g, '\\\\:');
            videoFilters.push(`ass=${safeAss}${assFontsDirArg()}`);
            logger.info(`[ClipRender] Burning ${captionResult.cues.length} caption cues using style "${clip.caption_style || 'clean'}"`);
          }
        } catch (capErr: any) {
          if (capErr?.code === 'TRANSCRIPT_REVIEW_REQUIRED') throw capErr;
          logger.warn(`Failed to generate ASS subtitles for clip ${clipId}: ${capErr.message}. Rendering without subtitles.`);
        }
      }

      // Text Overlay burn-in. With no overlay configured, the clip title is
      // burned as an opening headline (Opus shows its headline for the first
      // seconds only, observed on the 15 Nov 2026 comparison set); an
      // explicit overlay_config.enabled === false (e.g. editor reset) opts
      // out. overlay_config.headline_duration_sec overrides the 5s default;
      // <= 0 keeps the headline for the whole clip.
      // Once an editor project exists, studio state is authoritative for the
      // opening headline/hook: if the user deleted the auto hook item there,
      // the legacy auto-title must not resurrect on export. (A visible hook
      // item makes the project pro-render eligible above, so this gate only
      // affects the deleted-hook case.)
      const headline = editorProjectExists ? null : ClipRenderService.buildHeadlineSpec(clip);
      if (headline) {
        // textfile transport: no drawtext text expansion, so user text is
        // rendered byte-for-byte (apostrophes, %, backslashes, unicode).
        // One drawtext per wrapped line: text_align is unavailable before
        // ffmpeg 5, and per-line filters center each line exactly anyway.
        const lines = headline.text.split('\n');
        const style =
          `fontcolor=white:borderw=${Math.max(1, Math.round(3 * canvasScale))}:bordercolor=black@0.9:shadowcolor=black@0.6:shadowx=0:shadowy=${Math.max(1, Math.round(2 * canvasScale))}`;
        const enable =
          headline.durationSec > 0 ? `:enable='lt(t,${headline.durationSec.toFixed(2)})'` : '';
        // Hook placement away from faces/captions (OpenShorts). The auto
        // headline only exists when no editor project does, so clip-level
        // caption_position is the effective caption band here. Face zone from
        // the reframe track's keyframes inside the headline window.
        const headlineWindowSec = headline.durationSec > 0 ? headline.durationSec : durationSec;
        const windowKeyframes = (reframeDecision.track?.smoothed_keyframes || []).filter(
          (k: any) => typeof k?.time === 'number' && k.time >= 0 && k.time <= headlineWindowSec &&
            typeof k?.centerY === 'number' && Number.isFinite(k.centerY)
        );
        const faceCenterY01 = windowKeyframes.length > 0
          ? windowKeyframes.reduce((acc: number, k: any) => acc + k.centerY, 0) / windowKeyframes.length
          : undefined;
        const canvasH = clip.aspect_ratio === '16:9' || clip.aspect_ratio === '1:1' ? 1080 : 1920;
        const placement = ClipRenderService.resolveHeadlinePlacement({
          captionPosition: (clip.caption_position as any) || 'bottom',
          canvasHeight: canvasH,
          faceCenterY01,
        });
        if (placement.zone !== 'top') {
          logger.info(`[ClipRender] Hook headline moved to ${placement.zone} (reason: ${placement.reason}) for clip ${clipId}`);
        }
        const firstY = placement.zone === 'bottom'
          ? placement.yBase - (lines.length - 1) * (headline.fontSize + 8)
          : placement.yBase;
        lines.forEach((line, idx) => {
          const linePath = path.join(tempDir, `headline-${idx}.txt`);
          fs.writeFileSync(linePath, line, 'utf8');
          const safeLine = linePath.replace(/\\/g, '/').replace(/:/g, '\\:');
          const y = Math.round((firstY + idx * (headline.fontSize + 8)) * canvasScale);
          videoFilters.push(
            `drawtext=textfile='${safeLine}':${style}:fontsize=${Math.round(headline.fontSize * canvasScale)}:x=(w-text_w)/2:y=${y}${enable}`
          );
        });
      } else if (clip.overlay_config?.enabled && clip.overlay_config?.text) {
        const rawText = String(clip.overlay_config.text);
        const safeText = rawText
          .replace(/[\r\n]+/g, ' ')
          .replace(/['\\%]/g, '')
          .replace(/:/g, '\\:')
          .slice(0, 90)
          .trim();
        if (safeText) {
          const pos = clip.overlay_config.position || 'top';
          const size = clip.overlay_config.size || 'md';
          const fontSize = Math.round((size === 'sm' ? 36 : size === 'lg' ? 60 : 46) * canvasScale);
          let yExpr = String(Math.round(120 * canvasScale));
          if (pos === 'center') yExpr = '(h-text_h)/2';
          else if (pos === 'bottom') yExpr = `h-text_h-${Math.round(260 * canvasScale)}`;

          videoFilters.push(
            `drawtext=text='${safeText}':fontcolor=white:fontsize=${fontSize}:box=1:boxcolor=black@0.65:boxborderw=${Math.round(10 * canvasScale)}:x=(w-text_w)/2:y=${yExpr}`
          );
        }
      }

      // Phase F: Authoritative Server-Side Watermark Enforcement
      const watermarkRequired = await WatermarkService.shouldWatermark(userId);
      if (watermarkRequired) {
        videoFilters.push(WatermarkService.getFfmpegFilterString({ canvasScale }));
        logger.info(`[ClipRender] Watermark enforced for user ${userId} on clip ${clipId}`);
      }

      logger.info(
        `[ClipRender] Preparing FFmpeg for clip ${clipId}: start=${startSec}s, dur=${durationSec}s, filters=${videoFilters.length}`
      );

      // Resolve optional background music for Quick Clips
      let resolvedMusicPath: string | null = null;
      if (clip.background_music && clip.background_music.enabled !== false && !clip.muted) {
        resolvedMusicPath = await ClipRenderService.resolveBackgroundMusicPath(clip.background_music, userId);
        if (!resolvedMusicPath) {
          logger.warn(`[ClipRender] Background music configured for clip ${clipId} but file could not be resolved. Falling back to dialogue-only audio.`);
        }
      }

      let expectedDurationSec = durationSec;
      if (hasCustomProTracks && editorProject) {
        logger.info(`[ClipRender] Compiling and executing multi-track EditorProject graph for clip ${clipId}`);
        await ProEditorService.preloadRemoteOverlayAssets(editorProject, tempDir);
        const videoTrackItems = editorProject.tracks
          ?.filter((t: any) => t.type === 'VIDEO' && !t.hidden)
          ?.flatMap((t: any) => t.items || []) || [];
        const isMultiSlice = videoTrackItems.length > 1;
        // Single-slice renders seek the input; the loudnorm measurement pass must
        // apply the same seek so it measures the exact audio window being rendered.
        // Candidate shot plans use source-relative item windows. A single
        // trimmed item must seek to its own source_start, just as multi-slice
        // trim filters do, not silently keep the clip's old opening.
        const candidateSingle = (reframeDecision.track?.metadata?.shot_composition_candidate === true || videoTrackItems.some((i:any)=>i.framing_window !== undefined)) && !isMultiSlice
          ? editorProject.tracks.find((t: {type:string;hidden?:boolean}) => t.type === 'VIDEO' && !t.hidden)?.items.find((i: {hidden?:boolean}) => !i.hidden)
          : undefined;
        const candidateSourceStart = candidateSingle && !(candidateSingle as any).is_freeze
          ? Number(candidateSingle.source_start ?? startSec) : startSec;
        const candidateSourceDuration = candidateSingle && !(candidateSingle as any).is_freeze
          ? Number(editorProject.canvas.duration || durationSec) * Math.min(4, Math.max(.25, candidateSingle.speed?.speed || 1)) : durationSec;
        const inputSeekArgs = !isMultiSlice
          ? ['-ss', candidateSourceStart.toFixed(3), '-t', candidateSourceDuration.toFixed(3)]
          : [];
        // Two-pass loudness normalization: measures dialogue audio first (audio-only
        // pass), then compiles with linear loudnorm when feasible, or a pre-rendered
        // dynamic-normalized dialogue WAV when peak/range-limited. Throws
        // LoudnormNormalizationError only for degenerate/silent measurements.
        const graph = await ProEditorService.compileRenderGraphWithNormalization(
          editorProject,
          sourcePath,
          outputPath,
          tempDir,
          {
            aspectRatio: clip.aspect_ratio as ClipAspectRatio,
            cropConfig: clip.crop_config || null,
            clipStartSec: startSec,
            decodedSource: srcDims,
            sourceStoragePath: clip.source_storage_path,
            mode: actualReframeMode,
            layoutMode: reframeDecision.layoutMode,
            track: reframeDecision.track,
            canvasScale,
          },
          inputSeekArgs
        );
        // Single-slice renders input-seek with -t durationSec, so the output
        // can never exceed the trimmed input window; a stale canvas.duration
        // beyond it stalls ffmpeg on buffer backpressure until it is killed
        // (reproduced locally). Clamp the output duration to the input window.
        const canvasDuration = Number((editorProject.canvas?.duration || durationSec).toFixed(3));
        const renderDuration = !isMultiSlice ? Math.min(canvasDuration, durationSec) : canvasDuration;
        expectedDurationSec = renderDuration;
        if (graph.canvas) expectedCanvas = graph.canvas;

        if (watermarkRequired) {
          const wmFilter = WatermarkService.getFfmpegFilterString({ canvasScale });
          const nextLabel = '[v_watermarked]';
          graph.filterComplex.push(`${graph.videoMap}${wmFilter}${nextLabel}`);
          graph.videoMap = nextLabel;
        }

        const filterBuilder = new FilterGraphBuilder(graph.filterComplex);
        const scriptExec = await filterBuilder.compileForExecution(tempDir);

        try {
          await HardwareEncoderService.executeWithFallback(async (encoderFlags) => {
            const ffmpegArgs = [
              '-y',
              ...encoderFlags.initArgs,
              ...inputSeekArgs,
              ...graph.inputArgs,
              ...scriptExec.args,
              '-map', graph.videoMap,
              '-map', graph.audioMap,
              ...encoderFlags.videoCodecArgs,
              ...encoderFlags.qualityArgs,
              '-c:a', 'aac',
              '-b:a', '128k',
              '-movflags', '+faststart',
              '-t', renderDuration.toFixed(3),
              outputPath,
            ];

            await execFileAsync(ffmpegBin, ffmpegArgs, { timeout: timeoutMs });
          });
        } finally {
          await scriptExec.cleanup();
        }
        await ClipRenderService.updateJobProgress(jobId, 85, 'encoding');
      } else {
        const audioGraph = ClipRenderService.compileQuickClipAudioGraph({
          durationSec,
          clipVolume: clip.volume,
          backgroundMusic: clip.background_music,
          resolvedMusicPath,
        });

        if (audioGraph.hasBackgroundMusic && !clip.muted) {
          logger.info(`[ClipRender] Executing Quick Clips render with background music and ducking: ${audioGraph.musicPath}`);
          await ClipRenderService.updateJobProgress(jobId, 25, 'encoding');

          const fullFilterComplex = [
            composeQuickVideoGraph(videoFilters).graph,
            ...audioGraph.filterComplex,
          ];

          await HardwareEncoderService.executeWithFallback(async (encoderFlags) => {
            const ffmpegArgs = [
              '-nostdin',
              '-y',
              ...encoderFlags.initArgs,
              '-ss', startSec.toFixed(3),
              '-t', durationSec.toFixed(3),
              '-i', sourcePath,
              ...audioGraph.inputArgs,
              '-filter_complex', fullFilterComplex.join(';'),
              '-map', '[out_v]',
              '-map', audioGraph.audioMap,
              ...encoderFlags.videoCodecArgs,
              ...encoderFlags.qualityArgs,
              '-c:a', 'aac',
              '-b:a', '128k',
              '-pix_fmt', 'yuv420p',
              '-movflags', '+faststart',
              '-t', durationSec.toFixed(3),
              outputPath,
            ];

            await execFileAsync(ffmpegBin, ffmpegArgs, { timeout: timeoutMs });
          });
          await ClipRenderService.updateJobProgress(jobId, 85, 'encoding');
        } else {
          await new Promise<void>((resolve, reject) => {
          let isResolved = false;
          let lastProgressUpdate = 0;

          const videoGraph = composeQuickVideoGraph(videoFilters);
          const cmd = ffmpeg(sourcePath)
            .setStartTime(startSec)
            .setDuration(durationSec);
          // -filter_complex disables ffmpeg's default stream selection, so the
          // labeled-graph path must map the source audio explicitly.
          const labeledGraph = videoGraph.labeled;
          if (labeledGraph) {
            cmd.complexFilter([videoGraph.graph], ['out_v']);
          } else {
            cmd.videoFilters(videoFilters);
          }
          cmd.videoCodec('libx264');

          if (clip.muted) {
            cmd.noAudio();
          } else {
            cmd.audioCodec('aac');
            if (clip.volume !== undefined && Number(clip.volume) !== 1.0) {
              const vol = Math.min(2.0, Math.max(0.0, Number(clip.volume)));
              cmd.audioFilters(`volume=${vol}`);
            }
          }

          const outputOpts = [
            '-pix_fmt yuv420p',
            `-preset ${config.renderPreset}`,
            '-crf', '22',
            '-movflags +faststart',
          ];
          if (!clip.muted) {
            outputOpts.push('-b:a 128k');
            if (labeledGraph) {
              // fluent-ffmpeg brackets bare complexFilter map labels, so the
              // optional source-audio map goes through outputOptions instead.
              outputOpts.push('-map 0:a?');
            }
          }

          cmd.outputOptions(outputOpts)
          .output(outputPath);


          // Explicit timeout enforcement
          const timer = setTimeout(() => {
            if (!isResolved) {
              isResolved = true;
              try {
                cmd.kill('SIGKILL');
              } catch (kErr) {}
              const err = new Error(`FFmpeg rendering timed out after ${timeoutMs / 1000}s`);
              (err as any).code = 'RENDER_TIMEOUT';
              reject(err);
            }
          }, timeoutMs);

          // Progress listener
          cmd.on('progress', (progress) => {
            const now = Date.now();
            if (now - lastProgressUpdate > 1500) {
              lastProgressUpdate = now;
              const currentSec = parseTimemarkToSeconds(progress.timemark);
              const rawProgress = 15 + Math.round((currentSec / durationSec) * 70);
              const clampedProgress = Math.min(85, Math.max(15, rawProgress));

              ClipRenderService.updateJobProgress(jobId, clampedProgress, 'encoding').catch(() => {});
            }
          });

          cmd.on('end', () => {
            if (!isResolved) {
              isResolved = true;
              clearTimeout(timer);
              resolve();
            }
          });

          cmd.on('error', (err, stdout, stderr) => {
            if (!isResolved) {
              isResolved = true;
              clearTimeout(timer);
              // ffmpeg's final lines ("Error opening output files: ...") hide
              // the real cause earlier in stderr; keep a tail for diagnosis.
              const stderrTail = String(stderr || '').trim().split('\n').slice(-8).join('\n');
              const wrappedErr = new Error(`FFmpeg processing failed: ${err.message}${stderrTail ? `\nffmpeg stderr: ${stderrTail}` : ''}`);
              (wrappedErr as any).code = 'FFMPEG_FAILED';
              reject(wrappedErr);
            }
          });

          cmd.run();
        });
        }
      }

      // Verify output file exists and has size
      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
        const err = new Error('Rendered output file was not generated or is empty.');
        (err as any).code = 'FFMPEG_FAILED';
        throw err;
      }

      // Output validation gate: streams + duration must match what was requested.
      const outputDims = await ClipRenderService.validateRenderedOutput(outputPath, expectedDurationSec, {
        expectAudio: !clip.muted,
        expectDimensions: expectedCanvas,
      });

      // 3. Upload rendered MP4 to storage with revision versioning
      await ClipRenderService.updateJobStage(jobId, clipId, 'uploading', 90, 'uploading', workerId);

      const renderedSize = (await fs.promises.stat(outputPath)).size;
      const renderVersion = Number(clip.render_version || 1);
      const outputStoragePath = renderObjectKey(clip.user_id, clip.project_id, clip.id, renderVersion);

      logger.info(
        `[ClipRender] Uploading rendered MP4 v${renderVersion} (${(renderedSize / (1024 * 1024)).toFixed(2)} MB) to path: ${outputStoragePath}`
      );
      await uploadFile('clips', outputStoragePath, outputPath, renderedSize, 'video/mp4');
      const finalStoragePath = outputStoragePath;

      // Output verification guard: ensure deliverable exists before marking ready
      JobReliabilityService.verifyRequiredOutputs('clip_render', { output_storage_path: finalStoragePath });

      // 4. Update clip status -> 'ready'
      await dataRepository
        .from('clips')
        .update({
          render_status: 'ready',
          output_storage_path: finalStoragePath,
          output_object_key: finalStoragePath,
          reframe_mode: actualReframeMode,
          reframe_metadata: reframeMetadata || null,
          is_watermarked: watermarkRequired,
          render_resolution_requested: resolution.requested,
          render_resolution_effective: resolution.effective,
          render_output_width: outputDims?.width ?? outputCanvas.width,
          render_output_height: outputDims?.height ?? outputCanvas.height,
          render_source_width: srcDims?.width ?? null,
          render_source_height: srcDims?.height ?? null,
          render_resolution_note: resolution.warning ?? null,
          render_upscale_factor: resolution.upscaleFactor,
          render_error_code: null,
          render_error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', clipId);

      // 4b. Poster frame for the Media Library while the rendered file is still local (best-effort).
      await ClipPosterService.generateFromRenderedFile(
        { ...clip, output_storage_path: finalStoragePath, render_version: renderVersion },
        outputPath,
      );

      // 5. Update render job -> 'completed' (100%) - only if worker still owns it
      if (jobId) {
        await db.collection('render_jobs').updateOne(
          { id: jobId, worker_id: workerId },
          {
            $set: {
              status: 'completed',
              progress: 100,
              stage: 'completed',
              completed_at: new Date(),
              updated_at: new Date(),
            },
          }
        );
      }

      logger.info(`[ClipRender] Successfully rendered and published clip ${clipId} to ${finalStoragePath}`);
    } catch (err: any) {
      const code = err.code || 'RENDER_FAILED';
      const isTransient = JobReliabilityService.isTransientError(err) || ['RENDER_TIMEOUT', 'STORAGE_UNAVAILABLE', 'FFMPEG_FAILED', 'NETWORK_ERROR'].includes(code);
      const message = JobReliabilityService.sanitizeErrorMessage(err.message || 'Video rendering failed.');

      logger.error(`[ClipRender] Clip rendering failed for clip ${clipId}`, {
        clipId,
        code,
        message,
      });

      // Update clip to failed
      try {
        await dataRepository
          .from('clips')
          .update({
            render_status: 'failed',
            render_error_code: code,
            render_error_message: message.substring(0, 500),
            updated_at: new Date().toISOString(),
          })
          .eq('id', clipId);
      } catch {}

      // Update render job status with retry logic (Step 5)
      if (jobId) {
        try {
          const currentJob = await db.collection('render_jobs').findOne({ id: jobId });
          const attempts = currentJob?.attempts || 1;
          const maxAttempts = currentJob?.max_attempts || 3;

          if (isTransient && attempts < maxAttempts) {
            // Exponential backoff with jitter
            const delayMs = JobReliabilityService.computeBackoffDelayMs(attempts, { baseDelayMs: 2000, maxDelayMs: 30000, jitter: true });
            const nextRetryAt = new Date(Date.now() + delayMs);

            await db.collection('render_jobs').updateOne(
              { id: jobId },
              {
                $set: {
                  status: 'queued',
                  stage: 'queued',
                  worker_id: null,
                  locked_at: null,
                  next_retry_at: nextRetryAt,
                  error_code: code,
                  error_message: message.substring(0, 500),
                  updated_at: new Date(),
                },
              }
            );
            logger.warn(`[ClipRender] Transient failure for clip ${clipId}. Job ${jobId} scheduled for retry ${attempts + 1}/${maxAttempts} at ${nextRetryAt.toISOString()}`);
          } else {
            await db.collection('render_jobs').updateOne(
              { id: jobId },
              {
                $set: {
                  status: 'failed',
                  stage: 'failed',
                  worker_id: null,
                  locked_at: null,
                  next_retry_at: null,
                  error_code: code,
                  error_message: message.substring(0, 500),
                  updated_at: new Date(),
                },
              }
            );
            logger.error(`[ClipRender] Permanent render job failure for clip ${clipId} (${attempts}/${maxAttempts})`);
          }
        } catch (dbErr) {
          logger.error('Failed to update render job status on failure', { jobId, dbErr });
        }
      }
    } finally {
      clearInterval(heartbeatTimer);
      // 6. Reliable cleanup of all temporary directories and files
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } catch (rmErr) {
        logger.warn(`Failed to clean up temp render directory: ${tempDir}`);
      }
      activeRenderSet.delete(clipId);
    }
  }

  /**
   * Helper to update job progress safely
   */
  private static async updateJobProgress(
    jobId?: string,
    progress?: number,
    stage?: string
  ): Promise<void> {
    if (!jobId) return;
    const clamped = Math.min(100, Math.max(0, progress || 0));
    try {
      await dataRepository
        .from('render_jobs')
        .update({
          progress: clamped,
          stage: stage || 'encoding',
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);
    } catch {}
  }

  /**
   * Helper to update stage and clip render_status
   */
  public static async updateJobStage(
    jobId: string | undefined,
    clipId: string,
    stage: string,
    progress: number,
    clipStatus: string,
    expectedWorkerId?: string
  ): Promise<void> {
    if (jobId) {
      const db = await getMongoDb();
      const filter: any = { id: jobId };
      if (expectedWorkerId) {
        filter.worker_id = expectedWorkerId;
      }
      const res = await db.collection('render_jobs').updateOne(
        filter,
        {
          $set: {
            stage,
            progress,
            status: 'processing',
            ...(stage === 'cutting' ? { started_at: new Date() } : {}),
            updated_at: new Date(),
          },
        }
      );
      if (expectedWorkerId && res.matchedCount === 0) {
        throw new AppError('Render lease was expired or claimed by another worker.', 409, 'FENCING_TOKEN_MISMATCH');
      }
    }

    try {
      await dataRepository
        .from('clips')
        .update({
          render_status: clipStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', clipId);
    } catch {}
  }

  /**
   * Render-time speaker-following guarantee (quality roadmap: active-speaker
   * framing). When the clip's crop mode is 'smart' but no ready reframe track
   * exists, run the CV analyzer on the ALREADY-downloaded source and persist
   * the track before the reframing decision. Failures fall back to the
   * existing center-crop path — this must never break a render.
   */
  private static async ensureReframeTrackAtRender(
    clip: ClipRecord,
    localSourcePath: string,
    jobId?: string
  ): Promise<void> {
    if (!config.smartReframeEnabled || !config.reframeAutoGenerate) return;
    if (clip.crop_config?.mode !== 'smart') return;

    const existing = await SmartReframeService.getReframeTrack(clip.id, clip.user_id);
    if (existing && existing.status === 'ready' && !existing.isStale &&
        Array.isArray(existing.smoothed_keyframes) && existing.smoothed_keyframes.length > 0) {
      return;
    }

    if (existing && activeReframeAnalysisSet.has(clip.id)) return; // analysis already in flight

    logger.info(`[ClipRender] No ready reframe track for smart clip ${clip.id}; auto-generating from local source`);
    try {
      if (jobId) {
        await ClipRenderService.updateJobStage(jobId, clip.id, 'analyzing_speakers', 8, 'rendering');
      }
      await SmartReframeService.analyzeClipFraming(clip.id, clip.user_id, { localSourcePath });
    } catch (err: any) {
      logger.warn(`[ClipRender] Auto reframe analysis failed for clip ${clip.id}: ${err?.message || err}. Falling back to center crop.`);
    }
  }

  /**
   * Shared reframing decision for both render paths (audit H-1).
   * Quick Clip render consumes `cropFilter` directly; the Pro editor path consumes
   * `track`/`layoutMode` to build per-slice dynamic crops in compileRenderGraph,
   * guaranteeing both paths frame identical source identically.
   *
   * Reframe keyframes are clip-relative (t=0 at clip start incl. trim), matching
   * the `-ss startSec` input seek used by both quick and single-slice pro renders.
   */
  /**
   * Auto-headline spec for the render path, or null when the headline is not
   * shown. Pure and unit-tested; the drawtext string assembly stays inline.
   * Fit model: drawtext cannot auto-fit, so text is capped (45 chars +
   * ellipsis) and font size tiered by character count (~0.58em average glyph
   * width, 40px side margins on a 1080 canvas - verified 15 Nov 2026: a
   * 41-char title overflowed at 60px, fits at 38px).
   */
  /**
   * Hook/headline placement (OpenShorts): keep the opening hook headline off
   * the caption band and off the subject's face. Pure and unit-tested.
   * Zone rules: default top (legacy y=150). Move to the lower zone when
   * captions occupy the top, or when the followed face sits in the top 40% of
   * the frame during the headline window. If the lower zone is also blocked
   * (face below 65%), drop to an upper-middle band instead of covering either.
   * Only the auto hook headline uses this; an explicit overlay_config position
   * is the user's own choice and is never moved.
   */
  public static resolveHeadlinePlacement(opts: {
    captionPosition: 'top' | 'center' | 'bottom';
    canvasHeight: number;
    faceCenterY01?: number;
  }): { yBase: number; zone: 'top' | 'bottom' | 'upper_middle'; reason: string } {
    const topY = 150;
    const bottomY = Math.round(opts.canvasHeight * 0.72);
    const face = typeof opts.faceCenterY01 === 'number' && Number.isFinite(opts.faceCenterY01)
      ? Math.min(1, Math.max(0, opts.faceCenterY01))
      : undefined;
    const topBlocked = opts.captionPosition === 'top' || (face !== undefined && face < 0.4);
    if (!topBlocked) return { yBase: topY, zone: 'top', reason: 'default_top' };
    const bottomBlocked = face !== undefined && face > 0.65;
    if (!bottomBlocked) {
      return {
        yBase: bottomY,
        zone: 'bottom',
        reason: opts.captionPosition === 'top' ? 'caption_band_top' : 'face_in_top_zone',
      };
    }
    return { yBase: Math.round(opts.canvasHeight * 0.3), zone: 'upper_middle', reason: 'top_caption_plus_low_face' };
  }

  public static buildHeadlineSpec(
    clip: Pick<ClipRecord, 'title' | 'overlay_config'>
  ): { text: string; fontSize: number; durationSec: number } | null {
    const autoHeadline =
      clip.overlay_config?.enabled === undefined && !clip.overlay_config?.text && !!clip.title;
    if (!autoHeadline) return null;
    const stripped = String(clip.title).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!stripped) return null;
    const capped = stripped.length > 60 ? stripped.slice(0, 57).trimEnd() + '...' : stripped;
    // Two-line wrap at a word boundary near the midpoint; single line when
    // short. Rendered via drawtext textfile so user text (apostrophes,
    // percent, backslashes, unicode) is preserved byte-for-byte.
    let lines = [capped];
    if (capped.length > 26) {
      const words = capped.split(' ');
      let best = -1;
      let bestImbalance = Infinity;
      let acc = 0;
      for (let i = 0; i < words.length - 1; i++) {
        acc += words[i].length + 1;
        const imbalance = Math.abs(capped.length - 2 * acc);
        if (imbalance < bestImbalance) {
          bestImbalance = imbalance;
          best = i;
        }
      }
      if (best >= 0) {
        lines = [words.slice(0, best + 1).join(' '), words.slice(best + 1).join(' ')];
      }
    }
    const longest = Math.max(...lines.map((l) => l.length));
    const fontSize = longest <= 22 ? 64 : longest <= 28 ? 56 : longest <= 34 ? 48 : 40;
    const rawDur = (clip.overlay_config as any)?.headline_duration_sec;
    const durationSec = typeof rawDur === 'number' && Number.isFinite(rawDur) ? rawDur : 5.0;
    return { text: lines.join('\n'), fontSize, durationSec };
  }

  public static async resolveReframeDecision(
    clip: ClipRecord,
    durationSec: number,
    canvasScale = 1
  ): Promise<{
    cropFilter: string;
    mode: 'smart' | 'fallback_center' | 'manual';
    metadata?: Record<string, any>;
    layoutMode: ReframeLayoutMode | string;
    track: Awaited<ReturnType<typeof SmartReframeService.getReframeTrack>>;
  }> {
    const centerCrop = () => buildCropFilter(clip.aspect_ratio as ClipAspectRatio, { focusX: 0.5, focusY: 0.5 }, canvasScale);

    if (clip.crop_config?.mode === 'manual') {
      return { cropFilter: buildCropFilter(clip.aspect_ratio as ClipAspectRatio, clip.crop_config, canvasScale), mode: 'manual', layoutMode: 'manual', track: null };
    }

    if (clip.crop_config?.mode === 'fit_blur') {
      const zoom = Math.min(4, Math.max(1, Number(clip.crop_config.scale ?? 1)));
      return { cropFilter: buildBlurFitChain(clip.aspect_ratio as ClipAspectRatio, zoom, 'vcb', canvasScale), mode: 'manual', layoutMode: 'manual', track: null };
    }

    if (clip.crop_config?.mode === 'fit') {
      const zoom = Math.min(4, Math.max(1, Number(clip.crop_config.scale ?? 1)));
      const clampF = (v: number | undefined): number => Math.min(1, Math.max(0, typeof v === 'number' && Number.isFinite(v) ? v : 0.5));
      return { cropFilter: buildFitFilter(clip.aspect_ratio as ClipAspectRatio, zoom, clampF(clip.crop_config.focusX), clampF(clip.crop_config.focusY), canvasScale), mode: 'manual', layoutMode: 'manual', track: null };
    }

    if (clip.crop_config?.mode !== 'smart') {
      return { cropFilter: buildCropFilter(clip.aspect_ratio as ClipAspectRatio, clip.crop_config, canvasScale), mode: 'fallback_center', layoutMode: 'manual', track: null };
    }

    try {
      const track = await SmartReframeService.getReframeTrack(clip.id, clip.user_id);
      if (
        track &&
        track.status === 'ready' &&
        Array.isArray(track.smoothed_keyframes) &&
        track.smoothed_keyframes.length > 0
      ) {
        if (track.isStale) {
          logger.warn(`[ClipRender] Smart reframe track is stale for clip ${clip.id}. Falling back to center crop.`);
          return { cropFilter: centerCrop(), mode: 'fallback_center', metadata: { reason: 'stale_track', detected_face_count: track.detected_face_count || 0 }, layoutMode: 'track', track };
        }

        if ((track.detected_face_count || 0) === 0 || !track.dominant_track_id) {
          // A genre-stamped layout recommendation is not authoritative; with no
          // detected subject the measured outcome is the modern blurred layout.
          const cropLayout = (clip.crop_config as any)?.layout_mode_source !== 'genre_recommendation' ? clip.crop_config?.layout_mode : undefined;
          const targetLayout = cropLayout || 'blur';
          if (targetLayout === 'blur' && (clip.aspect_ratio === '9:16' || !clip.aspect_ratio)) {
            logger.info(`[ClipRender] No subject detected in smart reframe track for clip ${clip.id}. Using modern blurred background layout.`);
            return {
              cropFilter: SmartReframeService.buildBlurBackgroundFilter({ canvasWidth: canvasDims('9:16', canvasScale).width, canvasHeight: canvasDims('9:16', canvasScale).height }),
              mode: 'smart',
              metadata: { layout_mode: 'blur', reason: 'broll_or_no_face', detected_face_count: 0 },
              layoutMode: 'blur',
              track,
            };
          }
          logger.info(`[ClipRender] No subject detected in smart reframe track for clip ${clip.id}. Using fallback center.`);
          return { cropFilter: centerCrop(), mode: 'fallback_center', metadata: { reason: 'no_subject_detected', detected_face_count: 0 }, layoutMode: targetLayout, track };
        }

        // Provenance-aware precedence: user/legacy crop layout wins; otherwise
        // the measured track layout (which already applies the genre hint
        // rules) beats a genre-stamped crop_config value.
        const cropLayout = (clip.crop_config as any)?.layout_mode_source !== 'genre_recommendation' ? clip.crop_config?.layout_mode : undefined;
        const targetLayout = cropLayout || track.layout_mode || clip.crop_config?.layout_mode || 'track';
        const splitGeometry =
          targetLayout === 'split'
            ? SmartReframeService.computeSplitSpeakerGeometry({
                rawSamples: track.raw_samples,
                sourceWidth: track.source_width || 1920,
                sourceHeight: track.source_height || 1080,
                speaker1X: clip.crop_config?.split?.speaker1X,
                speaker2X: clip.crop_config?.split?.speaker2X,
              })
            : null;
        if (targetLayout === 'track' && (clip.aspect_ratio === '9:16' || !clip.aspect_ratio) && track.metadata?.shot_composition_candidate === true) {
          const plan = SmartReframeService.computeShotComposition({rawSamples:track.raw_samples,sceneCuts:track.metadata.scene_cuts,
            duration:durationSec,sourceWidth:track.source_width||1920,sourceHeight:track.source_height||1080});
          if (plan.length) return {cropFilter:SmartReframeService.buildShotCompositionFilter({plan,duration:durationSec,
            sourceWidth:track.source_width||1920,sourceHeight:track.source_height||1080,canvasScale}),mode:'smart',
            metadata:{layout_mode:'track',shot_composition_candidate:true},layoutMode:'track',track};
        }
        // Multi-person single-view: keep the whole group visible (blur-fill
        // fit) instead of tight tracking that crops people at the edges.
        const groupFrame =
          targetLayout === 'track'
            ? SmartReframeService.computeGroupFrameGeometry({
                rawSamples: track.raw_samples,
                sourceWidth: track.source_width || 1920,
                sourceHeight: track.source_height || 1080,
              })
            : null;
        // Tracking-quality floor: when the dominant subject is only weakly
        // established (low presence/area/confidence mix), a tight track is
        // confidently wrong more often than right (e.g. it locks onto a lamp
        // or a background artifact). With no credible group frame either,
        // degrade to the modern blurred layout instead of a bad tight track.
        const dominantScore = Number(track.metadata?.dominant_score);
        if (
          targetLayout === 'track' &&
          !groupFrame &&
          SmartReframeService.isLowConfidenceTrack(track)
        ) {
          logger.warn(
            `[ClipRender] Dominant track score ${dominantScore.toFixed(3)} below tracking floor 0.30 for clip ${clip.id}. Degrading to blurred layout.`
          );
          if (clip.aspect_ratio === '9:16' || !clip.aspect_ratio) {
            return {
              cropFilter: SmartReframeService.buildBlurBackgroundFilter({ canvasWidth: canvasDims('9:16', canvasScale).width, canvasHeight: canvasDims('9:16', canvasScale).height }),
              mode: 'smart',
              metadata: {
                layout_mode: 'blur',
                reason: 'low_tracking_confidence',
                dominant_score: dominantScore,
                detected_face_count: track.detected_face_count || 0,
              },
              layoutMode: 'blur',
              track,
            };
          }
          return {
            cropFilter: centerCrop(),
            mode: 'fallback_center',
            metadata: { reason: 'low_tracking_confidence', dominant_score: dominantScore, detected_face_count: track.detected_face_count || 0 },
            layoutMode: 'track',
            track,
          };
        }
        const cropFilter = SmartReframeService.buildLayoutCropFilter({
          layoutMode: targetLayout as any,
          aspectRatio: clip.aspect_ratio as ClipAspectRatio,
          keyframes: track.smoothed_keyframes,
          sourceWidth: track.source_width || 1920,
          sourceHeight: track.source_height || 1080,
          duration: durationSec,
          speaker1X: clip.crop_config?.split?.speaker1X,
          speaker2X: clip.crop_config?.split?.speaker2X,
          splitGeometry,
          splitFit: (clip.crop_config?.split as any)?.fit,
          splitDividerX: (clip.crop_config?.split as any)?.dividerX,
          groupFrame,
          screencastMode: clip.crop_config?.screencast?.mode,
          screencastInsetPosition: clip.crop_config?.screencast?.insetPosition,
          screencastInsetDiameter: clip.crop_config?.screencast?.insetDiameter,
          screencastScreenRatio: clip.crop_config?.screencast?.screenRatio,
          screencastBackground: clip.crop_config?.screencast?.background,
          screencastFacecamBox: SmartReframeService.resolveFacecamBox(clip.crop_config?.screencast, track.metadata),
          canvasScale,
        });
        logger.info(`[ClipRender] Applied dynamic smart reframe filter (${targetLayout}) with ${track.smoothed_keyframes.length} keyframes for clip ${clip.id}`);
        return {
          cropFilter,
          mode: 'smart',
          metadata: {
            layout_mode: targetLayout,
            dominant_track_id: track.dominant_track_id,
            detected_face_count: track.detected_face_count,
            keyframe_count: track.smoothed_keyframes.length,
            dominant_score: track.metadata?.dominant_score,
          },
          layoutMode: targetLayout,
          track,
        };
      }

      logger.warn(`[ClipRender] No ready smart reframe track found for clip ${clip.id}. Falling back to center crop.`);
      return { cropFilter: centerCrop(), mode: 'fallback_center', metadata: { reason: 'no_ready_track' }, layoutMode: clip.crop_config?.layout_mode || 'track', track };
    } catch (reframeErr: any) {
      logger.warn(`[ClipRender] Smart reframe resolution error for clip ${clip.id}: ${reframeErr.message}. Falling back to center crop.`);
      return { cropFilter: centerCrop(), mode: 'fallback_center', metadata: { reason: 'error', error: reframeErr.message }, layoutMode: clip.crop_config?.layout_mode || 'track', track: null };
    }
  }

  /**
   * Post-render output gate (audit M-1): the rendered file must contain a video
   * stream, the expected audio presence, and a duration within 0.5s of the
   * requested render duration before the job may be marked ready.
   * Failures are permanent (non-transient) — a retry re-renders, it does not
   * re-validate the same broken file.
   * A missing/unavailable ffprobe degrades to a warning, matching the policy of
   * probeAvStartTimes, rather than failing renders on ops environments without ffprobe.
   */
  public static async validateRenderedOutput(
    filePath: string,
    expectedDurationSec: number,
    options: { expectAudio: boolean; expectDimensions?: { width: number; height: number } }
  ): Promise<{ width: number; height: number } | null> {
    try {
      const { stdout } = await execFileAsync(
        'ffprobe',
        [
          '-v', 'error',
          '-show_entries', 'stream=codec_type,width,height',
          '-show_entries', 'format=duration',
          '-of', 'json',
          filePath,
        ],
        { timeout: 15000, maxBuffer: 4 * 1024 * 1024 }
      );

      const probe = JSON.parse(stdout) as {
        streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
        format?: { duration?: string };
      };
      const streams = Array.isArray(probe.streams) ? probe.streams : [];
      const hasVideo = streams.some((s) => s?.codec_type === 'video');
      const hasAudio = streams.some((s) => s?.codec_type === 'audio');
      const duration = Number.parseFloat(probe.format?.duration || '0');

      const videoStream = streams.find((s) => s?.codec_type === 'video');
      const dims = videoStream && Number(videoStream.width) > 0 && Number(videoStream.height) > 0
        ? { width: Number(videoStream.width), height: Number(videoStream.height) }
        : null;
      const problems: string[] = [];
      if (!hasVideo) problems.push('no video stream');
      if (options.expectDimensions && dims &&
          (dims.width !== options.expectDimensions.width || dims.height !== options.expectDimensions.height)) {
        problems.push(`frame size ${dims.width}x${dims.height} differs from requested ${options.expectDimensions.width}x${options.expectDimensions.height}`);
      }
      if (options.expectAudio && !hasAudio) problems.push('missing audio stream');
      if (!Number.isFinite(duration) || duration <= 0) {
        problems.push('unreadable duration');
      } else if (Math.abs(duration - expectedDurationSec) > 0.5) {
        problems.push(`duration ${duration.toFixed(2)}s differs from expected ${expectedDurationSec.toFixed(2)}s by more than 0.5s`);
      }

      if (problems.length > 0) {
        const err = new Error(`Rendered output failed validation: ${problems.join('; ')}.`);
        (err as any).code = 'OUTPUT_VALIDATION_FAILED';
        throw err;
      }
      return dims;
    } catch (err: any) {
      if (err?.code === 'OUTPUT_VALIDATION_FAILED') throw err;
      logger.warn(`[ClipRender] Output validation probe unavailable, accepting render without stream checks: ${err.message}`);
      return null;
    }
  }

  /** Native frame size of the first video stream, or null when ffprobe is unavailable. */
  public static async probeSourceDimensions(filePath: string): Promise<{ width: number; height: number } | null> {
    try {
      const { stdout } = await execFileAsync(
        'ffprobe',
        ['-v', 'error', '-select_streams', 'v:0', '-show_streams', '-of', 'json', filePath],
        { timeout: 15000, maxBuffer: 1024 * 1024 }
      );
      const st = ((JSON.parse(stdout) as any).streams || [])[0] || {};
      let w = Number(st.width);
      let h = Number(st.height);
      if (!(w > 0 && h > 0)) return null;
      const rot = Math.abs(Number(st.tags?.rotate ?? st.side_data_list?.[0]?.rotation ?? 0)) % 180;
      if (rot === 90) [w, h] = [h, w];
      return { width: w, height: h };
    } catch {
      return null;
    }
  }

  /**
   * Background processor: claims due queued render jobs and recovers stale leases
   */
  public static async processDueRenderJobs(): Promise<number> {
    if (!isMongoConfigured) return 0;
    const db = await getMongoDb();
    const now = new Date();
    const staleCutoff = new Date(now.getTime() - 15 * 60 * 1000); // 15 min stale lease

    // 1. Recover stale locks
    await db.collection('render_jobs').updateMany(
      {
        status: 'processing',
        locked_at: { $lt: staleCutoff },
      },
      {
        $set: {
          status: 'queued',
          stage: 'queued',
          worker_id: null,
          locked_at: null,
          updated_at: now,
        },
      }
    );

    // 2. Admission: no free slot means leave the job queued. Checked before the
    // query so the sweep never claims past the per-process cap shared with inline launches.
    if (renderOccupancy() >= maxConcurrentRenders()) return 0;

    // 3. Pick the next due job, skipping clips that already hold a slot.
    const busyClipIds = occupiedRenderClipIds();
    const dueJob = await db.collection('render_jobs').findOne(
      {
        status: 'queued',
        attempts: { $lt: 3 },
        $or: [{ next_retry_at: null }, { next_retry_at: { $lte: now } }],
        ...(busyClipIds.length > 0 ? { clip_id: { $nin: busyClipIds } } : {}),
      },
      { sort: { created_at: 1 } }
    );

    if (!dueJob) return 0;

    // Invariant check: job must have a valid string owner identity
    if (!dueJob.user_id || typeof dueJob.user_id !== 'string') {
      logger.error(`[ClipRender] Invariant violation: render job ${dueJob.id} is missing a valid user_id`);
      await db.collection('render_jobs').updateOne(
        {
          id: dueJob.id,
          status: 'queued',
          worker_id: null,
          locked_at: null,
        },
        {
          $set: {
            status: 'failed',
            stage: 'failed',
            error_code: 'INVALID_OWNER_ID',
            error_message: 'Job cannot be processed: missing or invalid owner context.',
            updated_at: new Date(),
          },
        }
      );
      return 1;
    }

    // Reserve synchronously (no await since the check above) so a concurrent inline
    // launch cannot also pass the cap; released in the finally below.
    if (!tryReserveRenderSlot(dueJob.clip_id)) return 0;

    try {
      // Part 1: Propagate authenticated owner context using trusted persisted owner ID
      await ownerContext.run(dueJob.user_id, async () => {
        await this.renderClipJob(dueJob.clip_id, dueJob.user_id, dueJob.id);
      });
      return 1;
    } catch (err: any) {
      const code = err.code || 'RENDER_FAILED';
      const rawMessage = err.message || 'Render processing failed.';
      logger.warn(`[ClipRender] Error processing due render job ${dueJob.id}: ${rawMessage}`, {
        jobId: dueJob.id,
        clipId: dueJob.clip_id,
        userId: dueJob.user_id,
        code,
      });

      // Part 2: Permanent pre-lease failure handling
      if (code === 'CLIP_NOT_FOUND') {
        const safeMessage = JobReliabilityService.sanitizeErrorMessage(rawMessage);
        // Atomic conditional update: matches job ID, owner ID, expected queued status and ensures
        // we never overwrite a job already claimed (worker_id != null or status != queued) by another worker.
        await db.collection('render_jobs').updateOne(
          {
            id: dueJob.id,
            user_id: dueJob.user_id,
            status: 'queued',
            worker_id: null,
            locked_at: null,
          },
          {
            $set: {
              status: 'failed',
              stage: 'failed',
              error_code: 'CLIP_NOT_FOUND',
              error_message: safeMessage,
              updated_at: new Date(),
            },
          }
        );
      } else if (code === 'AUTH_REQUIRED') {
        // Invariant violation: do not mark permanently failed; log for investigation
        logger.error(`[ClipRender] Invariant violation: Authenticated owner context was not established for job ${dueJob.id} (user ${dueJob.user_id}): ${rawMessage}`);
      } else if (code !== 'RENDER_ALREADY_ACTIVE') {
        // Transient database/network errors: preserve existing retry and recovery behaviour
        const isTransient = JobReliabilityService.isTransientError(err) ||
          ['DATABASE_UNAVAILABLE', 'NETWORK_ERROR', 'RENDER_TIMEOUT'].includes(code);

        if (isTransient) {
          const attempts = dueJob.attempts || 0;
          const maxAttempts = dueJob.max_attempts || 3;
          if (attempts < maxAttempts) {
            const delayMs = JobReliabilityService.computeBackoffDelayMs(attempts + 1, { baseDelayMs: 2000, maxDelayMs: 30000, jitter: true });
            const nextRetryAt = new Date(Date.now() + delayMs);
            await db.collection('render_jobs').updateOne(
              {
                id: dueJob.id,
                user_id: dueJob.user_id,
                status: 'queued',
                worker_id: null,
                locked_at: null,
              },
              {
                $set: {
                  next_retry_at: nextRetryAt,
                  updated_at: new Date(),
                },
                $inc: { attempts: 1 },
              }
            );
            logger.warn(`[ClipRender] Transient pre-lease failure for job ${dueJob.id}. Scheduled retry at ${nextRetryAt.toISOString()}`);
          } else {
            await db.collection('render_jobs').updateOne(
              {
                id: dueJob.id,
                user_id: dueJob.user_id,
                status: 'queued',
                worker_id: null,
                locked_at: null,
              },
              {
                $set: {
                  status: 'failed',
                  stage: 'failed',
                  error_code: code || 'MAX_ATTEMPTS_EXCEEDED',
                  error_message: JobReliabilityService.sanitizeErrorMessage(rawMessage),
                  updated_at: new Date(),
                },
              }
            );
          }
        }
      }

      return 1;
    } finally {
      releaseRenderSlot(dueJob.clip_id);
    }
  }

  /**
   * Fetches all clips belonging to a project and user, attaching the latest render job.
   */
  public static async getProjectClips(projectId: string, userId: string): Promise<ClipRecord[]> {
    if (!isMongoConfigured) return [];

    const { data: clips, error } = await dataRepository
      .from('clips')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error || !clips) {
      logger.error('Error fetching project clips', { error: error?.message, projectId, userId });
      return [];
    }

    // Attach latest render job for each clip
    const enrichedClips: ClipRecord[] = await Promise.all(
      clips.map(async (clip: any) => {
        const { data: job } = await dataRepository
          .from('render_jobs')
          .select('*')
          .eq('clip_id', clip.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        return {
          ...clip,
          latest_job: job || null,
        } as ClipRecord;
      })
    );

    return enrichedClips;
  }

  /**
   * Fetches a single clip and its latest render job.
   */
  public static async getClip(clipId: string, userId: string): Promise<ClipRecord> {
    if (!isMongoConfigured) {
      const err = new Error('Database service is not configured.');
      (err as any).code = 'SERVICE_UNAVAILABLE';
      throw err;
    }

    const { data: clip, error } = await dataRepository
      .from('clips')
      .select('*')
      .eq('id', clipId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !clip) {
      const err = new Error('Clip not found or access denied.');
      (err as any).code = 'CLIP_NOT_FOUND';
      throw err;
    }

    const { data: job } = await dataRepository
      .from('render_jobs')
      .select('*')
      .eq('clip_id', clipId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      ...clip,
      latest_job: job || null,
    } as ClipRecord;
  }

  /**
   * Generates a short-lived signed URL for previewing the rendered MP4.
   */
  public static async getSignedPreviewUrl(clipId: string, userId: string): Promise<SignedUrlResult> {
    const clip = await ClipRenderService.getClip(clipId, userId);

    if (clip.render_status !== 'ready' || !clip.output_storage_path) {
      const err = new Error('Clip is not ready for preview.');
      (err as any).code = 'CLIP_NOT_READY';
      throw err;
    }

    const entitlements = await EntitlementService.resolveUserEntitlements(userId);
    WatermarkService.assertExportAccess(entitlements, clip);

    const expiresIn = 300;
    const signedUrl = await signObjectGet('clips', clip.output_storage_path);

    return {
      signedUrl,
      expiresInSeconds: expiresIn,
    };
  }

  /**
   * Generates a short-lived signed URL with content-disposition download attachment header.
   */
  public static async getSignedDownloadUrl(clipId: string, userId: string): Promise<SignedUrlResult> {
    const clip = await ClipRenderService.getClip(clipId, userId);

    if (clip.render_status !== 'ready' || !clip.output_storage_path) {
      const err = new Error('Clip is not ready for download.');
      (err as any).code = 'CLIP_NOT_READY';
      throw err;
    }

    const entitlements = await EntitlementService.resolveUserEntitlements(userId);
    WatermarkService.assertExportAccess(entitlements, clip);

    // Fetch project title and candidate title for human-friendly filename
    const { data: project } = await dataRepository
      .from('projects')
      .select('title')
      .eq('id', clip.project_id)
      .maybeSingle();

    let candidateTitle = 'clip';
    if (clip.candidate_id) {
      const { data: cand } = await dataRepository
        .from('clip_candidates')
        .select('title')
        .eq('id', clip.candidate_id)
        .maybeSingle();
      if (cand?.title) candidateTitle = cand.title;
    }

    const safeProj = sanitizeFilename(project?.title || 'vireo');
    const safeTitle = sanitizeFilename(candidateTitle);
    const downloadFilename = `vireo-${safeProj}-${safeTitle}.mp4`;

    const expiresIn = 300;
    const signedUrl = await signObjectGet('clips', clip.output_storage_path, downloadFilename);

    return {
      signedUrl,
      filename: downloadFilename,
      expiresInSeconds: expiresIn,
    };
  }

  /**
   * Deletes a clip record, cleans up all rendered video revisions from Storage, and cascades to render_jobs.
   */
  public static async deleteClip(clipId: string, userId: string): Promise<void> {
    const clip = await ClipRenderService.getClip(clipId, userId);

    await deletePrefix('clips', clipObjectPrefix(clip.user_id, clip.project_id, clip.id));

    await deleteClipRecords(userId, clipId);
  }

  /**
   * Updates editor configuration (trim, aspect ratio, framing, captions, text overlay, audio).
   * Validates limits strictly and increments editor_version.
   */
  public static async updateClipEditorConfig(
    clipId: string,
    userId: string,
    update: ClipEditorUpdateDTO
  ): Promise<ClipRecord> {
    const clip = await ClipRenderService.getClip(clipId, userId);

    const validRatios: ClipAspectRatio[] = ['9:16', '1:1', '16:9'];
    if (update.aspectRatio && !validRatios.includes(update.aspectRatio)) {
      const err = new Error(`Invalid aspect ratio. Supported: ${validRatios.join(', ')}`);
      (err as any).code = 'INVALID_ASPECT_RATIO';
      throw err;
    }

    const validStyles = ALL_CAPTION_STYLES as readonly CaptionStyle[];
    if (update.captionStyle && !validStyles.includes(update.captionStyle)) {
      const err = new Error(`Invalid caption style. Supported: ${validStyles.join(', ')}`);
      (err as any).code = 'INVALID_CAPTION_STYLE';
      throw err;
    }

    const validPositions: CaptionPosition[] = ['top', 'center', 'bottom'];
    if (update.captionPosition && !validPositions.includes(update.captionPosition)) {
      const err = new Error(`Invalid caption position. Supported: ${validPositions.join(', ')}`);
      (err as any).code = 'INVALID_CAPTION_POSITION';
      throw err;
    }

    // Trim validation: trimStart cannot exceed the candidate start; trimEnd may be
    // NEGATIVE to extend the tail beyond the candidate boundary (beyond-candidate
    // extend), bounded by the source media duration.
    const originalDuration = Number(clip.end_seconds - clip.start_seconds);
    const trimStart = update.trimStartOffset !== undefined
      ? Math.max(0, Number(update.trimStartOffset))
      : Number(clip.trim_start_offset || 0);

    const trimEnd = update.trimEndOffset !== undefined
      ? Number(update.trimEndOffset)
      : Number(clip.trim_end_offset || 0);

    if (isNaN(trimStart) || isNaN(trimEnd) || trimStart < 0) {
      const err = new Error('Trim offsets must be non-negative numbers.');
      (err as any).code = 'INVALID_TRIM';
      throw err;
    }

    const effectiveDuration = Number((originalDuration - trimStart - trimEnd).toFixed(3));
    if (effectiveDuration < 3.0) {
      const err = new Error(`Trimmed duration (${effectiveDuration.toFixed(1)}s) cannot be shorter than 3 seconds.`);
      (err as any).code = 'TRIM_TOO_SHORT';
      throw err;
    }

    if (trimEnd < 0) {
      // Beyond-candidate extension: the effective end (end_seconds - trimEnd) must not
      // exceed the source media duration from the owning project.
      const { data: proj } = await dataRepository
        .from('projects')
        .select('duration_seconds')
        .eq('id', clip.project_id)
        .maybeSingle();
      const sourceDuration = typeof proj?.duration_seconds === 'number' && proj.duration_seconds > 0
        ? proj.duration_seconds
        : null;
      const requestedEnd = Number((clip.end_seconds - trimEnd).toFixed(3));
      if (sourceDuration === null || requestedEnd > Number((sourceDuration + 0.05).toFixed(3))) {
        throw new AppError(
          sourceDuration === null
            ? 'Cannot extend beyond the candidate boundary: source duration is unknown.'
            : `Cannot extend to ${requestedEnd.toFixed(1)}s: source media is ${sourceDuration.toFixed(1)}s.`,
          400,
          'EXTEND_BEYOND_SOURCE'
        );
      }
    }

    // Crop config
    let safeCrop = clip.crop_config || { mode: 'center', focusX: 0.5, focusY: 0.5 };
    if (update.cropConfig) {
      const mode: CropMode = (['smart', 'manual', 'fit', 'fit_blur'] as const).includes(update.cropConfig.mode as any) ? (update.cropConfig.mode as CropMode) : 'center';
      // Preserve stored layout geometry (layout_mode/split/screencast, e.g.
      // measured split anchors from analysis) unless this update overrides it:
      // the editor's save always sends cropConfig, so rebuilding from scratch
      // here would wipe the stored layout on every unrelated editor save.
      const validLayouts = ['track', 'split', 'screencast', 'blur'] as const;
      const incomingLayout = (update.cropConfig as any).layout_mode;
      const clampSpeakerX = (v: unknown): number | undefined => {
        const n = Number(v);
        return Number.isFinite(n) ? Math.min(0.9, Math.max(0.1, n)) : undefined;
      };
      const incomingSplit = (update.cropConfig as any).split;
      const incomingScreencast = (update.cropConfig as any).screencast;
      safeCrop = {
        ...safeCrop,
        mode,
        focusX: Math.min(1.0, Math.max(0.0, Number(update.cropConfig.focusX ?? 0.5))),
        focusY: Math.min(1.0, Math.max(0.0, Number(update.cropConfig.focusY ?? 0.5))),
        smart: update.cropConfig.smart ? {
          trackId: update.cropConfig.smart.trackId ? String(update.cropConfig.smart.trackId) : undefined,
          strength: Math.min(1.0, Math.max(0.0, Number(update.cropConfig.smart.strength ?? 1.0))),
        } : undefined,
        // An explicit layout in the update is a user panel pick; stamp provenance.
        ...(incomingLayout && (validLayouts as readonly string[]).includes(incomingLayout)
          ? { layout_mode: incomingLayout, layout_mode_source: 'user' as const }
          : {}),
        ...(incomingSplit
          ? {
              split: {
                speaker1X: clampSpeakerX(incomingSplit.speaker1X),
                speaker2X: clampSpeakerX(incomingSplit.speaker2X),
                ...(incomingSplit.dividerColor ? { dividerColor: String(incomingSplit.dividerColor).slice(0, 9) } : {}),
                ...(incomingSplit.fit === 'cover' || incomingSplit.fit === 'contain' ? { fit: incomingSplit.fit } : {}),
                ...(typeof incomingSplit.dividerX === 'number' && Number.isFinite(incomingSplit.dividerX)
                  ? { dividerX: Math.min(0.95, Math.max(0.05, incomingSplit.dividerX)) } : {}),
              },
            }
          : {}),
        ...(incomingScreencast
          ? {
              screencast: {
                ...safeCrop.screencast,
                ...incomingScreencast,
                mode: ['split_stacked', 'circular_inset', 'rounded_card_inset'].includes(incomingScreencast.mode)
                  ? incomingScreencast.mode
                  : safeCrop.screencast?.mode,
              },
            }
          : {}),
      };
    }


    // Overlay config
    // Preserve an unset overlay_config (undefined) so the auto-headline keeps firing for
    // untouched clips; only an explicit overlayConfig update changes it. Previously this
    // defaulted to { enabled: false }, silently suppressing the headline on any editor save.
    let safeOverlay = clip.overlay_config;
    if (update.overlayConfig) {
      const text = typeof update.overlayConfig.text === 'string'
        ? update.overlayConfig.text.replace(/[\r\n]+/g, ' ').replace(/['\\]/g, '').slice(0, 120).trim()
        : '';
      safeOverlay = {
        enabled: Boolean(update.overlayConfig.enabled),
        text,
        position: update.overlayConfig.position || 'top',
        size: update.overlayConfig.size || 'md',
      };
    }

    // Caption config validation & sanitization
    let safeCaptionConfig: CaptionConfig = clip.caption_config || {};
    if (update.captionConfig) {
      const incoming = update.captionConfig;
      const sanitized: CaptionConfig = {};

      if (incoming.fontFamily) {
        sanitized.fontFamily = CaptionService.validateFontFamily(String(incoming.fontFamily));
      }
      if (incoming.fontSize !== undefined) {
        sanitized.fontSize = clampCaptionFontSize(Number(incoming.fontSize), incoming.fontFamily !== undefined ? incoming.fontFamily : safeCaptionConfig.fontFamily);
      }
      if (incoming.fontWeight !== undefined) {
        const fw = Math.round(Number(incoming.fontWeight) || 700);
        sanitized.fontWeight = [400, 500, 600, 700, 800, 900].includes(fw) ? fw : 700;
      }
      if (incoming.uppercase !== undefined) {
        sanitized.uppercase = Boolean(incoming.uppercase);
      }

      const hexRegex = /^#?([0-9a-fA-F]{6})$/;
      if (incoming.textColor && hexRegex.test(incoming.textColor)) {
        sanitized.textColor = incoming.textColor.startsWith('#') ? incoming.textColor : `#${incoming.textColor}`;
      } else if (incoming.primaryColor && hexRegex.test(incoming.primaryColor)) {
        sanitized.textColor = incoming.primaryColor.startsWith('#') ? incoming.primaryColor : `#${incoming.primaryColor}`;
      }

      if (incoming.activeWordColor && hexRegex.test(incoming.activeWordColor)) {
        sanitized.activeWordColor = incoming.activeWordColor.startsWith('#') ? incoming.activeWordColor : `#${incoming.activeWordColor}`;
      } else if (incoming.highlightColor && hexRegex.test(incoming.highlightColor)) {
        sanitized.activeWordColor = incoming.highlightColor.startsWith('#') ? incoming.highlightColor : `#${incoming.highlightColor}`;
      }

      if (incoming.strokeColor && hexRegex.test(incoming.strokeColor)) {
        sanitized.strokeColor = incoming.strokeColor.startsWith('#') ? incoming.strokeColor : `#${incoming.strokeColor}`;
      } else if (incoming.outlineColor && hexRegex.test(incoming.outlineColor)) {
        sanitized.strokeColor = incoming.outlineColor.startsWith('#') ? incoming.outlineColor : `#${incoming.outlineColor}`;
      }

      if (incoming.strokeWidth !== undefined || incoming.outlineWidth !== undefined) {
        const sw = Number(incoming.strokeWidth ?? incoming.outlineWidth);
        sanitized.strokeWidth = Math.min(8, Math.max(0, Number(sw.toFixed(1))));
      }

      if (incoming.shadowEnabled !== undefined) {
        sanitized.shadowEnabled = Boolean(incoming.shadowEnabled);
      }
      if (incoming.shadowOpacity !== undefined) {
        sanitized.shadowOpacity = Math.min(1.0, Math.max(0.0, Number(Number(incoming.shadowOpacity).toFixed(2))));
      }
      if (incoming.shadow !== undefined) {
        sanitized.shadow = Math.min(5, Math.max(0, Number(Number(incoming.shadow).toFixed(1))));
      }

      if (incoming.backgroundEnabled !== undefined) {
        sanitized.backgroundEnabled = Boolean(incoming.backgroundEnabled);
      }
      if (incoming.backgroundColor && hexRegex.test(incoming.backgroundColor)) {
        sanitized.backgroundColor = incoming.backgroundColor.startsWith('#') ? incoming.backgroundColor : `#${incoming.backgroundColor}`;
      }
      if (incoming.backgroundOpacity !== undefined) {
        sanitized.backgroundOpacity = Math.min(1.0, Math.max(0.0, Number(Number(incoming.backgroundOpacity).toFixed(2))));
      }

      if (incoming.position && ['top', 'center', 'bottom'].includes(incoming.position)) {
        sanitized.position = incoming.position as CaptionPosition;
      }
      if (incoming.positionY !== undefined) {
        sanitized.positionY = Math.min(1.0, Math.max(0.0, Number(Number(incoming.positionY).toFixed(3))));
      }
      if (incoming.positionX !== undefined) {
        sanitized.positionX = Math.min(1.0, Math.max(0.0, Number(Number(incoming.positionX).toFixed(3))));
      }
      if (incoming.textAlign && ['left', 'center', 'right'].includes(incoming.textAlign)) {
        sanitized.textAlign = incoming.textAlign as any;
      }

      if (incoming.maxWordsPerCue !== undefined) {
        sanitized.maxWordsPerCue = Math.min(15, Math.max(1, Math.round(Number(incoming.maxWordsPerCue))));
      }
      if (incoming.maxLines !== undefined) {
        sanitized.maxLines = Math.min(2, Math.max(1, Math.round(Number(incoming.maxLines))));
      }

      if (incoming.animation && ['none', 'fade', 'pop', 'word_pop'].includes(incoming.animation)) {
        sanitized.animation = incoming.animation as any;
      }
      if (incoming.kinetic !== undefined) {
        sanitized.kinetic = Boolean(incoming.kinetic);
      }
      if (incoming.activeWordScale !== undefined) {
        sanitized.activeWordScale = Math.min(1.25, Math.max(1.05, Number(Number(incoming.activeWordScale).toFixed(2))));
      }

      // Preset gallery: keep only a known preset ID; unknown IDs are dropped (render falls back safely)
      const hasPresetPayload = incoming.presetId !== undefined;
      if (hasPresetPayload) {
        if (isCaptionPresetId(incoming.presetId)) {
          sanitized.presetId = incoming.presetId;
        } else {
          logger.warn(`[ClipEditor] Ignoring unknown caption presetId for clip ${clipId}. Supported: ${CAPTION_PRESET_IDS.join(', ')}`);
        }
        sanitized.presetOverrides = sanitizePresetOverrides(incoming.presetOverrides, sanitized.presetId ? resolveCaptionPreset(sanitized.presetId as any).fontFamily : undefined);
      }

      if (Array.isArray(incoming.caption_overrides)) {
        sanitized.caption_overrides = incoming.caption_overrides
          .filter((o: any) => o && typeof o.cueId === 'string' && typeof o.text === 'string')
          .map((o: any) => ({
            cueId: String(o.cueId).slice(0, 50),
            text: CaptionService.sanitizeAssText(o.text).slice(0, 200),
          }));
      } else if (Array.isArray(clip.caption_config?.caption_overrides)) {
        sanitized.caption_overrides = clip.caption_config.caption_overrides;
      }

      if (hasPresetPayload) {
        // A preset payload is the complete preset selection: replace stale preset fields instead of
        // merging them, while keeping manual cue corrections and unrelated legacy settings.
        const { presetId: _oldPreset, presetOverrides: _oldOverrides, ...rest } = safeCaptionConfig;
        safeCaptionConfig = { ...rest, ...sanitized };
        if (!sanitized.presetId) delete safeCaptionConfig.presetId;
      } else {
        safeCaptionConfig = { ...safeCaptionConfig, ...sanitized };
      }
    }

    // Background Music config validation & sanitization
    let safeBackgroundMusic = clip.background_music;
    if (update.backgroundMusic !== undefined) {
      if (update.backgroundMusic === null) {
        safeBackgroundMusic = undefined;
      } else {
        const incoming = update.backgroundMusic;
        safeBackgroundMusic = {
          enabled: incoming.enabled !== undefined ? Boolean(incoming.enabled) : true,
          track_id: incoming.track_id ? String(incoming.track_id).slice(0, 100) : undefined,
          source_path: incoming.source_path ? String(incoming.source_path).slice(0, 500) : undefined,
          storage_path: incoming.storage_path ? String(incoming.storage_path).slice(0, 500) : undefined,
          volume: incoming.volume !== undefined ? Math.min(2.0, Math.max(0.0, Number(incoming.volume))) : 0.25,
          ducking_enabled: incoming.ducking_enabled !== undefined ? Boolean(incoming.ducking_enabled) : true,
          ducking_preset: incoming.ducking_preset && ['subtle', 'balanced', 'strong', 'custom'].includes(incoming.ducking_preset) ? incoming.ducking_preset : 'balanced',
          fade_in: incoming.fade_in !== undefined ? Math.min(5.0, Math.max(0.0, Number(incoming.fade_in))) : 0.2,
          fade_out: incoming.fade_out !== undefined ? Math.min(5.0, Math.max(0.0, Number(incoming.fade_out))) : 0.5,
          loop: incoming.loop !== undefined ? Boolean(incoming.loop) : true,
        };
      }
    }

    // Audio
    const safeVolume = update.volume !== undefined
      ? Math.min(2.0, Math.max(0.0, Number(update.volume)))
      : (clip.volume ?? 1.0);
    const safeMuted = update.muted !== undefined ? Boolean(update.muted) : Boolean(clip.muted);

    const nextEditorVersion = Number(clip.editor_version || 1) + 1;

    const payload: any = {
      trim_start_offset: trimStart,
      trim_end_offset: trimEnd,
      aspect_ratio: update.aspectRatio || clip.aspect_ratio,
      caption_enabled: update.captionEnabled !== undefined ? Boolean(update.captionEnabled) : (clip.caption_enabled ?? true),
      caption_style: update.captionStyle || clip.caption_style || 'clean',
      caption_position: update.captionPosition || clip.caption_position || 'bottom',
      caption_config: safeCaptionConfig,
      crop_config: safeCrop,
      ...(safeOverlay !== undefined ? { overlay_config: safeOverlay } : {}),
      volume: safeVolume,
      muted: safeMuted,
      background_music: safeBackgroundMusic,
      editor_version: nextEditorVersion,
      updated_at: new Date().toISOString(),
    };

    const { data: updated, error: updateErr } = await dataRepository
      .from('clips')
      .update(payload)
      .eq('id', clipId)
      .eq('user_id', userId)
      .select()
      .single();

    if (updateErr) {
      logger.error('Failed to update clip editor config in DB', { clipId, error: updateErr.message });
      throw new Error(`Failed to save editor changes: ${updateErr.message}`);
    }

    // Beyond-candidate extend backstop: when the tail grows, record the
    // pre-extend caption coverage on an editor project that predates the
    // marker, so the studio appends the newly exposed span on the FIRST
    // reopen. Marker only; existing cues are never mutated.
    const oldEffectiveEnd = Number((clip.end_seconds - Number(clip.trim_end_offset || 0)).toFixed(3));
    const newEffectiveEnd = Number((clip.end_seconds - trimEnd).toFixed(3));
    if (newEffectiveEnd > oldEffectiveEnd + 0.001) {
      try {

        const oldCovered = Number(
          (oldEffectiveEnd - Number(clip.start_seconds + Number(clip.trim_start_offset || 0))).toFixed(3)
        );
        const { data: ep } = await dataRepository
          .from('editor_projects')
          .select('*')
          .eq('clip_id', clipId)
          .maybeSingle();
        if (ep && Array.isArray(ep.tracks)) {
          let changed = false;
          const tracks = ep.tracks.map((t: any) => {
            if (t?.type !== 'CAPTION' || t.hidden || !Array.isArray(t.items)) return t;
            return {
              ...t,
              items: t.items.map((i: any) => {
                if (i.hidden || !i.caption || !Array.isArray(i.caption.cues) || i.caption.cues.length === 0) return i;
                if (i.caption.cues_covered_end != null) return i;
                changed = true;
                // Marker lives in the item's cue time base: items whose cues
                // are relative to timeline_start get coverage minus the offset.
                const startOff = Number(i.timeline_start || 0);
                const isRel = startOff > 0 && i.caption.cues[0].start < startOff - 0.05;
                const marker = isRel ? Number((oldCovered - startOff).toFixed(3)) : oldCovered;
                return { ...i, caption: { ...i.caption, cues_covered_end: Math.max(0, marker) } };
              }),
            };
          });
          if (changed) {
            await dataRepository
              .from('editor_projects')
              .update({ tracks, updated_at: new Date() })
              .eq('id', ep.id);
          }
        }
      } catch (markerErr: any) {
        logger.warn('Caption coverage marker backfill failed (non-fatal)', { clipId, error: markerErr?.message });
      }
    }

    return updated as ClipRecord;
  }

  /**
   * Resets clip editor configuration back to Phase 11 baseline defaults.
   */
  public static async resetClipEditorConfig(clipId: string, userId: string): Promise<ClipRecord> {
    const clip = await ClipRenderService.getClip(clipId, userId);

    const payload: any = {
      trim_start_offset: 0,
      trim_end_offset: 0,
      aspect_ratio: '9:16',
      caption_enabled: true,
      caption_style: 'clean',
      caption_position: 'bottom',
      caption_config: {},
      crop_config: { focusX: 0.5, focusY: 0.5 },
      overlay_config: { enabled: false, text: '' },
      volume: 1.0,
      muted: false,
      background_music: null,
      editor_version: Number(clip.editor_version || 1) + 1,
      updated_at: new Date().toISOString(),
    };

    const { data: resetClip, error } = await dataRepository
      .from('clips')
      .update(payload)
      .eq('id', clipId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to reset editor config: ${error.message}`);
    }

    return resetClip as ClipRecord;
  }

  /**
   * Fetches complete editor data bundle for frontend workspace
   */
  public static async getClipEditorData(clipId: string, userId: string): Promise<{
    clip: ClipRecord;
    timingMode: string;
    availablePresets: CaptionStyle[];
    previewUrl?: string;
    cleanSourceUrl?: string;
    renderedPreviewUrl?: string;
    editorProject?: any;
    watermarkRequired?: boolean;
  }> {
    const clip = await ClipRenderService.getClip(clipId, userId);

    // Get timing mode from transcript
    let timingMode = 'segment';
    try {
      const { data: trans } = await dataRepository
        .from('transcripts')
        .select('words')
        .eq('project_id', clip.project_id)
        .eq('user_id', userId)
        .maybeSingle();

      if (trans && Array.isArray(trans.words) && trans.words.length > 0) {
        timingMode = 'word';
      }
    } catch {}

    let cleanSourceUrl: string | undefined;
    try {
      if (clip.source_storage_path) {
        cleanSourceUrl = await signObjectGet('source', clip.source_storage_path);
      }
    } catch (e: any) {
      logger.warn(`Failed to sign clean source for clip ${clipId}: ${e.message}`);
    }

    let renderedPreviewUrl: string | undefined;
    if (clip.render_status === 'ready' && clip.output_storage_path) {
      try {
        const preview = await ClipRenderService.getSignedPreviewUrl(clipId, userId);
        renderedPreviewUrl = preview.signedUrl;
      } catch {}
    }

    let editorProject: any = null;
    try {
      editorProject = await ProEditorService.getOrCreateEditorProject(clipId, userId);
    } catch (e: any) {
      logger.warn(`Could not load or create EditorProject for clip ${clipId}: ${e.message}`);
    }

    const availablePresets: CaptionStyle[] = [
      'clean',
      'bold',
      'minimal',
      'podcast',
      'highlight',
      'karaoke',
    ];

    const previewUrl = renderedPreviewUrl || cleanSourceUrl;

    // Actual applicable entitlement: whether exports for this user carry the
    // watermark, so the studio preview can say so before they export.
    let watermarkRequired = false;
    try {
      watermarkRequired = await WatermarkService.shouldWatermark(userId);
    } catch {
      watermarkRequired = true; // fail closed: assume watermarked when unknown
    }

    return {
      clip,
      timingMode,
      availablePresets,
      previewUrl,
      cleanSourceUrl,
      renderedPreviewUrl,
      editorProject,
      watermarkRequired,
    };
  }

  /**
   * Resolves a local file path for background music from track_id, source_path, or storage_path.
   * Returns null if missing, inaccessible, or disabled.
   */
  public static async resolveBackgroundMusicPath(
    musicConfig?: QuickClipMusicConfig,
    userId?: string
  ): Promise<string | null> {
    if (!musicConfig || musicConfig.enabled === false) return null;

    if (musicConfig.source_path && typeof musicConfig.source_path === 'string' && fs.existsSync(musicConfig.source_path)) {
      return musicConfig.source_path;
    }
    if (musicConfig.storage_path && typeof musicConfig.storage_path === 'string' && fs.existsSync(musicConfig.storage_path)) {
      return musicConfig.storage_path;
    }
    if (musicConfig.track_id && typeof musicConfig.track_id === 'string') {
      try {
        let query = dataRepository.from('audio_assets').select('*').eq('id', musicConfig.track_id);
        if (userId) {
          query = query.eq('user_id', userId);
        }
        const { data: asset } = await query.maybeSingle();
        if (asset?.storage_path && fs.existsSync(asset.storage_path)) {
          return asset.storage_path;
        }
      } catch (err: any) {
        logger.warn(`[ClipRender] Error resolving audio asset ${musicConfig.track_id}: ${err.message}`);
      }
    }
    return null;
  }

  /**
   * Compiles the FFmpeg audio filter complex for Quick Clips with optional background music and dynamic ducking.
   */
  public static compileQuickClipAudioGraph(options: {
    durationSec: number;
    clipVolume?: number;
    backgroundMusic?: QuickClipMusicConfig;
    resolvedMusicPath?: string | null;
  }): QuickClipAudioGraph {
    const {
      durationSec,
      clipVolume = 1.0,
      backgroundMusic,
      resolvedMusicPath,
    } = options;

    const safeDuration = Math.max(0.1, Number(durationSec.toFixed(3)));
    const dialogueVol = Math.min(2.0, Math.max(0.0, Number(clipVolume ?? 1.0)));

    if (
      !backgroundMusic ||
      backgroundMusic.enabled === false ||
      !resolvedMusicPath ||
      !fs.existsSync(resolvedMusicPath)
    ) {
      return {
        hasBackgroundMusic: false,
        inputArgs: [],
        filterComplex: [],
        audioMap: '0:a',
      };
    }

    const musicVol = Math.min(2.0, Math.max(0.0, Number(backgroundMusic.volume ?? 0.25)));
    const fadeIn = Math.min(5.0, Math.max(0.0, Number(backgroundMusic.fade_in ?? 0.2)));
    const fadeOut = Math.min(5.0, Math.max(0.0, Number(backgroundMusic.fade_out ?? 0.5)));
    const fadeOutStart = Math.max(0.0, Number((safeDuration - fadeOut).toFixed(2)));
    const shouldLoop = backgroundMusic.loop !== false;

    const inputArgs: string[] = ['-i', resolvedMusicPath];

    const isDucking = backgroundMusic.ducking_enabled !== false;
    const filterComplex: string[] = [];

    // 1. Dialogue path
    if (isDucking) {
      filterComplex.push(`[0:a]volume=${dialogueVol.toFixed(2)},asplit=2[a_dialogue_mix][a_dialogue_sc]`);
    } else {
      filterComplex.push(`[0:a]volume=${dialogueVol.toFixed(2)}[a_dialogue_mix]`);
    }

    // 2. Music path: loop if requested, trim to clip duration, reset PTS, apply volume, fade in and out
    const musicPreFilters: string[] = [];
    if (shouldLoop) {
      musicPreFilters.push('aloop=loop=-1:size=2e+09');
    }
    musicPreFilters.push(
      `atrim=0:${safeDuration.toFixed(3)}`,
      'asetpts=PTS-STARTPTS',
      `volume=${musicVol.toFixed(2)}`,
      `afade=t=in:ss=0:d=${fadeIn.toFixed(2)}`,
      `afade=t=out:st=${fadeOutStart.toFixed(2)}:d=${fadeOut.toFixed(2)}`
    );
    filterComplex.push(`[1:a]${musicPreFilters.join(',')}[a_music_prep]`);

    // 3. Sidechain Ducking filter
    if (isDucking) {
      const duckingPreset = backgroundMusic.ducking_preset || 'balanced';
      const duckingConfig = AudioDuckingService.resolveDuckingConfig(
        backgroundMusic.ducking_config || duckingPreset
      );
      const duckFilters = AudioDuckingService.compileSidechainFilter(
        '[a_dialogue_sc]',
        '[a_music_prep]',
        '[a_music_ducked]',
        duckingConfig
      );
      filterComplex.push(...duckFilters);
    } else {
      filterComplex.push('[a_music_prep]anull[a_music_ducked]');
    }

    // 4. Mix dialogue + ducked music + master peak limiter
    filterComplex.push(
      '[a_dialogue_mix][a_music_ducked]amix=inputs=2:duration=first:dropout_transition=2,alimiter=limit=-1.0dB:attack=5:release=50:level=0[out_a]'
    );

    return {
      hasBackgroundMusic: true,
      musicPath: resolvedMusicPath,
      inputArgs,
      filterComplex,
      audioMap: '[out_a]',
    };
  }

  /**
   * Evaluates whether an EditorProject contains custom pro edits (cuts, splits, trims,
   * speed/volume changes, keyframes, effects, color grading, B-roll, audio, images, or overlays).
   */
  public static hasCustomProEdits(project: any, clip?: any): boolean {
    if (!project || !Array.isArray(project.tracks)) return false;

    const clipStart = Number(clip?.start_seconds || 0);
    const trimStart = Number(clip?.trim_start_offset || 0);
    const expectedBaseSourceStart = Number((clipStart + trimStart).toFixed(3));

    return project.tracks.some((t: any) => {
      if (t.type === 'VIDEO') {
        // Multi-slice from cuts or splits
        if (t.items && t.items.length > 1) return true;
        if (!t.items || t.items.length === 0) return false;

        return t.items.some((i: any) => {
          const hasKeyframes = Array.isArray(i.keyframes) && i.keyframes.length > 0;
          const hasEffects = Array.isArray(i.effects) && i.effects.length > 0;
          const hasColor = Boolean(i.color);
          const hasFilter = i.filter && i.filter.preset && i.filter.preset !== 'none';
          const hasCustomSpeed =
            i.speed !== undefined &&
            (typeof i.speed === 'number' ? i.speed !== 1 : i.speed?.speed !== 1);
          const hasCustomAudio =
            i.audio &&
            ((i.audio.volume !== undefined && i.audio.volume !== 1) ||
              i.audio.fade_in ||
              i.audio.fade_out);
          // Per-item crop state (fit / blur / custom mode, or any zoom) only
          // lands through the pro compiler's buildSliceCropFilter - the
          // clip-level reframe path never reads item.crop, so without this a
          // layout-toggle or wheel-zoom change on an otherwise plain clip
          // silently exported with the default fill.
          const cropMode = i.crop?.mode;
          const cropScale = Number(i.crop?.scale ?? 1);
          const hasCustomCrop = Boolean(
            i.crop && ((cropMode && cropMode !== 'fill') || Math.abs(cropScale - 1) > 0.001)
          );
          // A framing window (valid or not) only compiles in the Pro graph: force it, and let the compiler reject invalid ones.
          const hasFramingWindow = i.framing_window !== undefined;
          const hasModifiedTimelineStart = i.timeline_start !== 0;
          const hasModifiedSourceStart =
            clip &&
            i.source_start !== undefined &&
            Math.abs(i.source_start - expectedBaseSourceStart) > 0.05;

          return (
            hasKeyframes ||
            hasEffects ||
            hasColor ||
            hasFilter ||
            hasCustomSpeed ||
            hasCustomAudio ||
            hasCustomCrop ||
            hasFramingWindow ||
            hasModifiedTimelineStart ||
            hasModifiedSourceStart
          );
        });
      }

      if (t.type === 'TEXT' && t.items && t.items.length > 0) return true;
      if (t.type === 'AUDIO' && t.items && t.items.length > 0) return true;
      if (t.type === 'IMAGE' && t.items && t.items.length > 0) return true;
      if (t.name?.toLowerCase().includes('b-roll') && t.items && t.items.length > 0) return true;

      return false;
    });
  }
}
