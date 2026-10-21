import { createClipWithJob } from '../db/repositories/clipRepository.js';
import { isMongoConfigured, getMongoDb } from '../db/mongoClient.js';
import { dataRepository } from '../db/repositories/dataRepository.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { clipObjectPrefix, deletePrefix, downloadObjectToFile, renderObjectKey, signObjectGet, uploadFile } from './objectStorageService.js';
import { deleteClipRecords } from '../db/repositories/deletionRepository.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import {
  ClipRecord,
  RenderJobRecord,
  ClipAspectRatio,
  ClipCropMode,
  CaptionStyle,
  CaptionPosition,
  CropConfig,
  OverlayConfig,
  CaptionConfig,
  ClipEditorUpdateDTO,
  AppError,
  isValidUUID,
  ReframeKeyframe,
  QuickClipMusicConfig,
} from '../types/index.js';
import { CaptionService } from './captionService.js';
import { ALL_CAPTION_STYLES, CAPTION_PRESET_IDS, isCaptionPresetId, sanitizePresetOverrides } from '../shared/captionPresets.js';
import { SmartReframeService } from './smartReframeService.js';
import { JobReliabilityService } from './queue/jobReliabilityService.js';
import { ProEditorService } from './proEditorService.js';
import { AudioDuckingService } from './audioDuckingService.js';
import { FilterGraphBuilder } from './ffmpeg/filterGraphBuilder.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';

// Configure fluent-ffmpeg to use ffmpeg-static binary
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);
}

// In-memory set to prevent duplicate simultaneous render jobs for the same clip
export const activeRenderSet = new Set<string>();

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
  return activeRenderSet.has(clipId);
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
export function buildCropFilter(
  aspectRatio: ClipAspectRatio = '9:16',
  cropConfig?: { focusX?: number; focusY?: number }
): string {
  const fx = Math.min(1.0, Math.max(0.0, Number(cropConfig?.focusX ?? 0.5)));
  const fy = Math.min(1.0, Math.max(0.0, Number(cropConfig?.focusY ?? 0.5)));

  // If focus is default center (0.5, 0.5), return the canonical center-crop filter
  if (fx === 0.5 && fy === 0.5) {
    switch (aspectRatio) {
      case '9:16':
        return 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920';
      case '1:1':
        return 'scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080';
      case '16:9':
        return 'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080';
      default:
        return 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920';
    }
  }

  // Manual framing crop using exact clamped focus offsets
  switch (aspectRatio) {
    case '9:16':
      return `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(in_w-out_w)*${fx}:(in_h-out_h)*${fy}`;
    case '1:1':
      return `scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080:(in_w-out_w)*${fx}:(in_h-out_h)*${fy}`;
    case '16:9':
      return `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080:(in_w-out_w)*${fx}:(in_h-out_h)*${fy}`;
    default:
      return `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(in_w-out_w)*${fx}:(in_h-out_h)*${fy}`;
  }
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
    cropMode: ClipCropMode = 'center'
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
    const { clip, renderJob } = await createClipWithJob(projectId, candidateId, userId, validAspectRatio, cropMode);

    // 6. Launch in-process background rendering
    ClipRenderService.renderClipJob(clip.id, userId, renderJob.id).catch((renderErr) => {
      logger.error('Background clip rendering caught top-level error', {
        clipId: clip.id,
        error: renderErr instanceof Error ? renderErr.message : String(renderErr),
      });
    });

    return {
      clip: clip as ClipRecord,
      renderJob: renderJob as RenderJobRecord,
    };
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
          fs.copyFileSync(p, targetLocalPath);
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
        fs.copyFileSync(cachedFile, targetLocalPath);
        return 'cache_hit';
      }
    } catch {}

    // 3. Strict Download from R2 with Timeout and Atomic Cache Placement
    const downloadTimeout = Math.min(options.timeoutMs || 60000, 120000);
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

      fs.copyFileSync(cachedFile, targetLocalPath);
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
        timeoutMs: Math.min(timeoutMs, 60000),
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

      let cropFilter = buildCropFilter(clip.aspect_ratio as ClipAspectRatio, clip.crop_config);

      let actualReframeMode: 'smart' | 'fallback_center' | 'manual' = 
        clip.crop_config?.mode === 'manual' ? 'manual' : 'fallback_center';
      let reframeMetadata: Record<string, any> | undefined = undefined;

      // Phase 13: Dynamic Smart Auto-Reframe
      if (clip.crop_config?.mode === 'smart') {
        try {
          const track = await SmartReframeService.getReframeTrack(clipId, clip.user_id);
          if (
            track &&
            track.status === 'ready' &&
            Array.isArray(track.smoothed_keyframes) &&
            track.smoothed_keyframes.length > 0
          ) {
            if (track.isStale) {
              logger.warn(`[ClipRender] Smart reframe track is stale for clip ${clipId}. Falling back to center crop.`);
              actualReframeMode = 'fallback_center';
              reframeMetadata = {
                reason: 'stale_track',
                detected_face_count: track.detected_face_count || 0,
              };
              cropFilter = buildCropFilter(clip.aspect_ratio as ClipAspectRatio, { focusX: 0.5, focusY: 0.5 });
            } else if ((track.detected_face_count || 0) === 0 || !track.dominant_track_id) {
              const targetLayout = clip.crop_config?.layout_mode || 'blur';
              if (targetLayout === 'blur' && (clip.aspect_ratio === '9:16' || !clip.aspect_ratio)) {
                logger.info(`[ClipRender] No subject detected in smart reframe track for clip ${clipId}. Using modern blurred background layout.`);
                cropFilter = SmartReframeService.buildBlurBackgroundFilter({ canvasWidth: 1080, canvasHeight: 1920 });
                actualReframeMode = 'smart';
                reframeMetadata = {
                  layout_mode: 'blur',
                  reason: 'broll_or_no_face',
                  detected_face_count: 0,
                };
              } else {
                logger.info(`[ClipRender] No subject detected in smart reframe track for clip ${clipId}. Using fallback center.`);
                actualReframeMode = 'fallback_center';
                reframeMetadata = {
                  reason: 'no_subject_detected',
                  detected_face_count: 0,
                };
                cropFilter = buildCropFilter(clip.aspect_ratio as ClipAspectRatio, { focusX: 0.5, focusY: 0.5 });
              }
            } else {
              const targetLayout = clip.crop_config?.layout_mode || track.layout_mode || 'track';
              cropFilter = SmartReframeService.buildLayoutCropFilter({
                layoutMode: targetLayout,
                aspectRatio: clip.aspect_ratio as ClipAspectRatio,
                keyframes: track.smoothed_keyframes,
                sourceWidth: track.source_width || 1920,
                sourceHeight: track.source_height || 1080,
                duration: durationSec,
                speaker1X: clip.crop_config?.split?.speaker1X,
                speaker2X: clip.crop_config?.split?.speaker2X,
                screencastMode: clip.crop_config?.screencast?.mode,
              });
              actualReframeMode = 'smart';
              reframeMetadata = {
                layout_mode: targetLayout,
                dominant_track_id: track.dominant_track_id,
                detected_face_count: track.detected_face_count,
                keyframe_count: track.smoothed_keyframes.length,
                dominant_score: track.metadata?.dominant_score,
              };
              logger.info(`[ClipRender] Applied dynamic smart reframe filter (${targetLayout}) with ${track.smoothed_keyframes.length} keyframes for clip ${clipId}`);
            }
          } else {
            logger.warn(`[ClipRender] No ready smart reframe track found for clip ${clipId}. Falling back to center crop.`);
            actualReframeMode = 'fallback_center';
            reframeMetadata = {
              reason: 'no_ready_track',
            };
            cropFilter = buildCropFilter(clip.aspect_ratio as ClipAspectRatio, { focusX: 0.5, focusY: 0.5 });
          }
        } catch (reframeErr: any) {
          logger.warn(`[ClipRender] Smart reframe resolution error for clip ${clipId}: ${reframeErr.message}. Falling back to center crop.`);
          actualReframeMode = 'fallback_center';
          reframeMetadata = {
            reason: 'error',
            error: reframeErr.message,
          };
          cropFilter = buildCropFilter(clip.aspect_ratio as ClipAspectRatio, { focusX: 0.5, focusY: 0.5 });
        }
      }

      const videoFilters: string[] = [cropFilter];


      // ASS Subtitles burn-in
      if (clip.caption_enabled !== false) {
        await ClipRenderService.updateJobStage(jobId, clipId, 'preparing_captions', 12, 'rendering');
        const assPath = path.join(tempDir, 'subtitles.ass');
        try {
          const captionResult = await CaptionService.generateCaptionsForClip({
            clip,
            targetAspectRatio: clip.aspect_ratio as ClipAspectRatio,
            outputPath: assPath,
          });

          if (captionResult.cues.length > 0 && fs.existsSync(assPath)) {
            const safeAss = assPath.replace(/\\/g, '/').replace(/:/g, '\\\\:');
            videoFilters.push(`ass=${safeAss}`);
            logger.info(`[ClipRender] Burning ${captionResult.cues.length} caption cues using style "${clip.caption_style || 'clean'}"`);
          }
        } catch (capErr: any) {
          logger.warn(`Failed to generate ASS subtitles for clip ${clipId}: ${capErr.message}. Rendering without subtitles.`);
        }
      }

      // Text Overlay burn-in
      if (clip.overlay_config?.enabled && clip.overlay_config?.text) {
        const rawText = String(clip.overlay_config.text);
        const safeText = rawText.replace(/[\r\n]+/g, ' ').replace(/['\\]/g, '').slice(0, 120).trim();
        if (safeText) {
          const pos = clip.overlay_config.position || 'top';
          const size = clip.overlay_config.size || 'md';
          const fontSize = size === 'sm' ? 36 : size === 'lg' ? 60 : 46;
          let yExpr = '120';
          if (pos === 'center') yExpr = '(h-text_h)/2';
          else if (pos === 'bottom') yExpr = 'h-text_h-260';

          videoFilters.push(
            `drawtext=text='${safeText}':fontcolor=white:fontsize=${fontSize}:box=1:boxcolor=black@0.65:boxborderw=10:x=(w-text_w)/2:y=${yExpr}`
          );
        }
      }

      logger.info(
        `[ClipRender] Preparing FFmpeg for clip ${clipId}: start=${startSec}s, dur=${durationSec}s, filters=${videoFilters.length}`
      );

      // Check if a multi-track EditorProject exists with custom pro edits (splits, cuts, B-roll, secondary audio, keyframes, text layers)
      let hasCustomProTracks = false;
      let editorProject: any = null;
      try {
        const { data: proj } = await dataRepository
          .from('editor_projects')
          .select('*')
          .eq('clip_id', clipId)
          .eq('user_id', userId)
          .maybeSingle();

        if (proj && Array.isArray(proj.tracks)) {
          hasCustomProTracks = ClipRenderService.hasCustomProEdits(proj, clip);
          if (hasCustomProTracks) {
            editorProject = proj;
          }
        }
      } catch (err: any) {
        logger.warn(`[ClipRender] Error checking EditorProject for clip ${clipId}: ${err.message}`);
      }

      // Resolve optional background music for Quick Clips
      let resolvedMusicPath: string | null = null;
      if (clip.background_music && clip.background_music.enabled !== false && !clip.muted) {
        resolvedMusicPath = await ClipRenderService.resolveBackgroundMusicPath(clip.background_music, userId);
        if (!resolvedMusicPath) {
          logger.warn(`[ClipRender] Background music configured for clip ${clipId} but file could not be resolved. Falling back to dialogue-only audio.`);
        }
      }

      if (hasCustomProTracks && editorProject) {
        logger.info(`[ClipRender] Compiling and executing multi-track EditorProject graph for clip ${clipId}`);
        await ProEditorService.preloadRemoteOverlayAssets(editorProject, tempDir);
        const graph = ProEditorService.compileRenderGraph(editorProject, sourcePath, outputPath, tempDir);
        const videoTrackItems = editorProject.tracks
          ?.filter((t: any) => t.type === 'VIDEO' && !t.hidden)
          ?.flatMap((t: any) => t.items || []) || [];
        const isMultiSlice = videoTrackItems.length > 1;
        const renderDuration = Number((editorProject.canvas?.duration || durationSec).toFixed(3));

        const filterBuilder = new FilterGraphBuilder(graph.filterComplex);
        const scriptExec = await filterBuilder.compileForExecution(tempDir);

        try {
          const ffmpegArgs = [
            '-y',
            ...(!isMultiSlice
              ? ['-ss', startSec.toFixed(3), '-t', durationSec.toFixed(3)]
              : []),
            ...graph.inputArgs,
            ...scriptExec.args,
            '-map', graph.videoMap,
            '-map', graph.audioMap,
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '22',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            '-t', renderDuration.toFixed(3),
            outputPath,
          ];

          await execFileAsync(ffmpegBin, ffmpegArgs, { timeout: timeoutMs });
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
            `[0:v]${videoFilters.join(',')}[out_v]`,
            ...audioGraph.filterComplex,
          ];

          const ffmpegArgs = [
            '-nostdin',
            '-y',
            '-ss', startSec.toFixed(3),
            '-t', durationSec.toFixed(3),
            '-i', sourcePath,
            ...audioGraph.inputArgs,
            '-filter_complex', fullFilterComplex.join(';'),
            '-map', '[out_v]',
            '-map', audioGraph.audioMap,
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '22',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            '-t', durationSec.toFixed(3),
            outputPath,
          ];

          await execFileAsync(ffmpegBin, ffmpegArgs, { timeout: timeoutMs });
          await ClipRenderService.updateJobProgress(jobId, 85, 'encoding');
        } else {
          await new Promise<void>((resolve, reject) => {
          let isResolved = false;
          let lastProgressUpdate = 0;

          const cmd = ffmpeg(sourcePath)
            .setStartTime(startSec)
            .setDuration(durationSec)
            .videoFilters(videoFilters)
            .videoCodec('libx264');

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
            '-preset fast',
            '-crf', '22',
            '-movflags +faststart',
          ];
          if (!clip.muted) {
            outputOpts.push('-b:a 128k');
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

          cmd.on('error', (err) => {
            if (!isResolved) {
              isResolved = true;
              clearTimeout(timer);
              const wrappedErr = new Error(`FFmpeg processing failed: ${err.message}`);
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
          render_error_code: null,
          render_error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', clipId);

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

    // 2. Claim next due job
    const dueJob = await db.collection('render_jobs').findOne(
      {
        status: 'queued',
        attempts: { $lt: 3 },
        $or: [{ next_retry_at: null }, { next_retry_at: { $lte: now } }],
      },
      { sort: { created_at: 1 } }
    );

    if (!dueJob) return 0;

    try {
      await this.renderClipJob(dueJob.clip_id, dueJob.user_id, dueJob.id);
      return 1;
    } catch (err: any) {
      logger.warn(`[ClipRender] Error processing due render job ${dueJob.id}: ${err.message}`);
      return 1;
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

    // Trim validation: cannot exceed original candidate boundaries; effective duration >= 3s
    const originalDuration = Number(clip.end_seconds - clip.start_seconds);
    const trimStart = update.trimStartOffset !== undefined
      ? Math.max(0, Number(update.trimStartOffset))
      : Number(clip.trim_start_offset || 0);

    const trimEnd = update.trimEndOffset !== undefined
      ? Math.max(0, Number(update.trimEndOffset))
      : Number(clip.trim_end_offset || 0);

    if (isNaN(trimStart) || isNaN(trimEnd) || trimStart < 0 || trimEnd < 0) {
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

    // Crop config
    let safeCrop = clip.crop_config || { mode: 'center', focusX: 0.5, focusY: 0.5 };
    if (update.cropConfig) {
      const mode = update.cropConfig.mode === 'smart' ? 'smart' : update.cropConfig.mode === 'manual' ? 'manual' : 'center';
      safeCrop = {
        mode,
        focusX: Math.min(1.0, Math.max(0.0, Number(update.cropConfig.focusX ?? 0.5))),
        focusY: Math.min(1.0, Math.max(0.0, Number(update.cropConfig.focusY ?? 0.5))),
        smart: update.cropConfig.smart ? {
          trackId: update.cropConfig.smart.trackId ? String(update.cropConfig.smart.trackId) : undefined,
          strength: Math.min(1.0, Math.max(0.0, Number(update.cropConfig.smart.strength ?? 1.0))),
        } : undefined,
      };
    }


    // Overlay config
    let safeOverlay = clip.overlay_config || { enabled: false, text: '' };
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
        sanitized.fontSize = Math.min(110, Math.max(32, Math.round(Number(incoming.fontSize) || 64)));
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
        sanitized.maxWordsPerCue = Math.min(6, Math.max(2, Math.round(Number(incoming.maxWordsPerCue))));
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
        sanitized.presetOverrides = sanitizePresetOverrides(incoming.presetOverrides);
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
      overlay_config: safeOverlay,
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

    return {
      clip,
      timingMode,
      availablePresets,
      previewUrl,
      cleanSourceUrl,
      renderedPreviewUrl,
      editorProject,
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
      '[a_dialogue_mix][a_music_ducked]amix=inputs=2:duration=first:dropout_transition=2,alimiter=limit=-1.0dB:attack=5:release=50[out_a]'
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
