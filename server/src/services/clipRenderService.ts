import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { supabaseAuthClient, isServerSupabaseConfigured } from '../utils/supabase.js';
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
  isValidUUID,
} from '../types/index.js';
import { CaptionService } from './captionService.js';

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
    if (!isServerSupabaseConfigured) {
      const err = new Error('Database service is not configured.');
      (err as any).code = 'SERVICE_UNAVAILABLE';
      throw err;
    }

    if (!isValidUUID(projectId) || !isValidUUID(candidateId)) {
      const err = new Error('Valid UUIDs required for project and candidate.');
      (err as any).code = 'INVALID_UUID';
      throw err;
    }

    // 1. Verify project ownership and fetch source file
    const { data: project, error: projErr } = await supabaseAuthClient
      .from('projects')
      .select('id, user_id, source_url, title')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (projErr || !project) {
      const err = new Error('Project not found or access denied.');
      (err as any).code = 'PROJECT_NOT_FOUND';
      throw err;
    }

    if (!project.source_url) {
      const err = new Error('Project does not have an uploaded video source file.');
      (err as any).code = 'SOURCE_VIDEO_NOT_FOUND';
      throw err;
    }

    // 2. Verify candidate ownership and that it belongs to this project
    const { data: candidate, error: candErr } = await supabaseAuthClient
      .from('clip_candidates')
      .select('*')
      .eq('id', candidateId)
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (candErr || !candidate) {
      const err = new Error('Clip candidate not found or does not belong to this project.');
      (err as any).code = 'CANDIDATE_NOT_FOUND';
      throw err;
    }

    // 3. Derive timestamps strictly from candidate (CRITICAL SECURITY RULE)
    const startSeconds = Number(candidate.start_seconds);
    const endSeconds = Number(candidate.end_seconds);
    const durationSeconds = Number(
      candidate.duration_seconds || (endSeconds - startSeconds).toFixed(3)
    );

    if (isNaN(startSeconds) || isNaN(endSeconds) || endSeconds <= startSeconds) {
      const err = new Error('Candidate contains invalid timestamp boundaries.');
      (err as any).code = 'INVALID_TIMESTAMPS';
      throw err;
    }

    // Validate aspect ratio
    const validRatios: ClipAspectRatio[] = ['9:16', '1:1', '16:9'];
    const validAspectRatio = validRatios.includes(aspectRatio) ? aspectRatio : '9:16';
    const cleanSourcePath = project.source_url.replace(/^videos\//, '');

    // 4. Insert clip row into public.clips
    const { data: clip, error: clipErr } = await supabaseAuthClient
      .from('clips')
      .insert({
        project_id: projectId,
        candidate_id: candidateId,
        user_id: userId,
        start_seconds: startSeconds,
        end_seconds: endSeconds,
        duration_seconds: durationSeconds,
        aspect_ratio: validAspectRatio,
        crop_mode: cropMode,
        render_status: 'queued',
        source_storage_path: cleanSourcePath,
      })
      .select()
      .single();

    if (clipErr || !clip) {
      logger.error('Failed to insert clip record', { error: clipErr?.message, projectId, candidateId });
      const err = new Error(`Failed to create clip record: ${clipErr?.message || 'DB error'}`);
      (err as any).code = 'DB_ERROR';
      throw err;
    }

    // 5. Insert initial render job
    const { data: renderJob, error: jobErr } = await supabaseAuthClient
      .from('render_jobs')
      .insert({
        clip_id: clip.id,
        user_id: userId,
        status: 'queued',
        progress: 0,
        stage: 'queued',
        attempts: 1,
      })
      .select()
      .single();

    if (jobErr || !renderJob) {
      logger.error('Failed to create render job', { error: jobErr?.message, clipId: clip.id });
      // Rollback clip if job fails
      await supabaseAuthClient.from('clips').delete().eq('id', clip.id);
      const err = new Error(`Failed to create render job: ${jobErr?.message || 'DB error'}`);
      (err as any).code = 'DB_ERROR';
      throw err;
    }

    // Auto-mark candidate as 'selected' in database if it was 'suggested'
    if (candidate.status === 'suggested') {
      try {
        await supabaseAuthClient
          .from('clip_candidates')
          .update({ status: 'selected', updated_at: new Date().toISOString() })
          .eq('id', candidateId);
      } catch {}
    }

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
    const { data: clip, error: clipErr } = await supabaseAuthClient
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

    activeRenderSet.add(clipId);

    // Ensure a render job exists
    let jobId = existingJobId;
    if (!jobId) {
      const { data: newJob } = await supabaseAuthClient
        .from('render_jobs')
        .insert({
          clip_id: clipId,
          user_id: userId,
          status: 'queued',
          progress: 0,
          stage: 'queued',
          attempts: 1,
        })
        .select()
        .single();
      jobId = newJob?.id;
    }

    const uniqueTag = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const tempDir = path.join(os.tmpdir(), `vireo-render-${clipId}-${uniqueTag}`);

    try {
      fs.mkdirSync(tempDir, { recursive: true });

      // Update stage: downloading (5%)
      await ClipRenderService.updateJobStage(jobId, clipId, 'downloading', 5, 'rendering');

      // 1. Download private source video
      const sourcePath = path.join(tempDir, 'source.mp4');
      const outputPath = path.join(tempDir, 'rendered.mp4');

      logger.info(`[ClipRender] Downloading source video from Storage: ${clip.source_storage_path}`, {
        clipId,
        sourcePath: clip.source_storage_path,
      });

      const { data: sourceBlob, error: downloadError } = await supabaseAuthClient.storage
        .from('videos')
        .download(clip.source_storage_path);

      if (downloadError || !sourceBlob) {
        const err = new Error(downloadError?.message || 'Failed to download source video from storage.');
        (err as any).code = 'SOURCE_VIDEO_NOT_FOUND';
        throw err;
      }

      const sourceBuffer = Buffer.from(await sourceBlob.arrayBuffer());
      fs.writeFileSync(sourcePath, sourceBuffer);

      // 2. FFmpeg cut, manual framing, ASS subtitles, text overlay, and MP4 encode
      await ClipRenderService.updateJobStage(jobId, clipId, 'cutting', 10, 'rendering');

      const trimStart = Number(clip.trim_start_offset || 0);
      const trimEnd = Number(clip.trim_end_offset || 0);
      const startSec = Number(clip.start_seconds) + trimStart;
      const originalDuration = Number(clip.duration_seconds || (clip.end_seconds - clip.start_seconds));
      const durationSec = Math.max(0.1, Number((originalDuration - trimStart - trimEnd).toFixed(3)));
      const timeoutMs = config.clipRenderTimeoutMs || 300000;

      const cropFilter = buildCropFilter(clip.aspect_ratio as ClipAspectRatio, clip.crop_config);
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
            const safeAss = assPath.replace(/\\/g, '/');
            videoFilters.push(`ass='${safeAss}'`);
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
        `[ClipRender] Executing FFmpeg for clip ${clipId}: start=${startSec}s, dur=${durationSec}s, filters=${videoFilters.length}`
      );

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

        cmd.outputOptions([
          '-pix_fmt yuv420p',
          '-preset fast',
          '-crf 22',
          '-b:a 128k',
          '-movflags +faststart',
        ])
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

      // Verify output file exists and has size
      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
        const err = new Error('Rendered output file was not generated or is empty.');
        (err as any).code = 'FFMPEG_FAILED';
        throw err;
      }

      // 3. Upload rendered MP4 to storage with revision versioning
      await ClipRenderService.updateJobStage(jobId, clipId, 'uploading', 90, 'uploading');

      const renderedBuffer = fs.readFileSync(outputPath);
      const renderVersion = Number(clip.render_version || 1);
      const outputStoragePath = `${clip.user_id}/${clip.project_id}/${clip.id}/v${renderVersion}/render.mp4`;

      logger.info(
        `[ClipRender] Uploading rendered MP4 v${renderVersion} (${(renderedBuffer.length / (1024 * 1024)).toFixed(2)} MB) to path: ${outputStoragePath}`
      );

      // Try uploading to 'clips' bucket first; fallback to 'videos' bucket if needed
      let uploadBucket = 'clips';
      let finalStoragePath = outputStoragePath;

      const { error: clipsUploadErr } = await supabaseAuthClient.storage
        .from('clips')
        .upload(outputStoragePath, renderedBuffer, {
          contentType: 'video/mp4',
          upsert: true,
        });

      if (clipsUploadErr) {
        logger.warn(`Failed to upload to 'clips' bucket (${clipsUploadErr.message}). Falling back to 'videos' bucket.`);
        uploadBucket = 'videos';
        finalStoragePath = `clips/${outputStoragePath}`;

        const { error: videosUploadErr } = await supabaseAuthClient.storage
          .from('videos')
          .upload(finalStoragePath, renderedBuffer, {
            contentType: 'video/mp4',
            upsert: true,
          });

        if (videosUploadErr) {
          const err = new Error(`Failed to upload rendered clip: ${videosUploadErr.message}`);
          (err as any).code = 'OUTPUT_UPLOAD_FAILED';
          throw err;
        }
      }

      // Safely clean up previous version if it differs from finalStoragePath
      if (clip.output_storage_path && clip.output_storage_path !== finalStoragePath) {
        try {
          const oldIsFallback = clip.output_storage_path.startsWith('clips/');
          const oldBucket = oldIsFallback ? 'videos' : 'clips';
          await supabaseAuthClient.storage.from(oldBucket).remove([clip.output_storage_path]);
          logger.info(`[ClipRender] Cleaned up previous render revision: ${clip.output_storage_path}`);
        } catch (rmErr: any) {
          logger.warn(`Could not remove old render revision ${clip.output_storage_path}: ${rmErr.message}`);
        }
      }

      // 4. Update clip status -> 'ready'
      await supabaseAuthClient
        .from('clips')
        .update({
          render_status: 'ready',
          output_storage_path: finalStoragePath,
          render_error_code: null,
          render_error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', clipId);

      // 5. Update render job -> 'completed' (100%)
      if (jobId) {
        await supabaseAuthClient
          .from('render_jobs')
          .update({
            status: 'completed',
            progress: 100,
            stage: 'completed',
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId);
      }

      logger.info(`[ClipRender] Successfully rendered and published clip ${clipId} to ${finalStoragePath}`);
    } catch (err: any) {
      const code = err.code || 'RENDER_FAILED';
      const message = err.message || 'Video rendering failed.';

      logger.error(`[ClipRender] Clip rendering failed for clip ${clipId}`, {
        clipId,
        code,
        message,
      });

      // Update clip to failed
      try {
        await supabaseAuthClient
          .from('clips')
          .update({
            render_status: 'failed',
            render_error_code: code,
            render_error_message: message.substring(0, 500),
            updated_at: new Date().toISOString(),
          })
          .eq('id', clipId);
      } catch {}

      // Update render job to failed
      if (jobId) {
        try {
          await supabaseAuthClient
            .from('render_jobs')
            .update({
              status: 'failed',
              error_code: code,
              error_message: message.substring(0, 500),
              updated_at: new Date().toISOString(),
            })
            .eq('id', jobId);
        } catch {}
      }
    } finally {
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
      await supabaseAuthClient
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
  private static async updateJobStage(
    jobId: string | undefined,
    clipId: string,
    stage: string,
    progress: number,
    clipStatus: string
  ): Promise<void> {
    if (jobId) {
      try {
        await supabaseAuthClient
          .from('render_jobs')
          .update({
            stage,
            progress,
            status: 'processing',
            started_at: stage === 'cutting' ? new Date().toISOString() : undefined,
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId);
      } catch {}
    }

    try {
      await supabaseAuthClient
        .from('clips')
        .update({
          render_status: clipStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', clipId);
    } catch {}
  }

  /**
   * Fetches all clips belonging to a project and user, attaching the latest render job.
   */
  public static async getProjectClips(projectId: string, userId: string): Promise<ClipRecord[]> {
    if (!isServerSupabaseConfigured) return [];

    const { data: clips, error } = await supabaseAuthClient
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
      clips.map(async (clip) => {
        const { data: job } = await supabaseAuthClient
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
    if (!isServerSupabaseConfigured) {
      const err = new Error('Database service is not configured.');
      (err as any).code = 'SERVICE_UNAVAILABLE';
      throw err;
    }

    const { data: clip, error } = await supabaseAuthClient
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

    const { data: job } = await supabaseAuthClient
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

    const isVideosFallback = clip.output_storage_path.startsWith('clips/');
    const bucket = isVideosFallback ? 'videos' : 'clips';
    const storagePath = clip.output_storage_path;
    const expiresIn = 3600; // 1 hour

    const { data, error } = await supabaseAuthClient.storage
      .from(bucket)
      .createSignedUrl(storagePath, expiresIn);

    if (error || !data?.signedUrl) {
      logger.error('Failed to create signed preview URL', { error: error?.message, clipId });
      const err = new Error(`Failed to generate preview URL: ${error?.message || 'Storage error'}`);
      (err as any).code = 'STORAGE_ERROR';
      throw err;
    }

    return {
      signedUrl: data.signedUrl,
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
    const { data: project } = await supabaseAuthClient
      .from('projects')
      .select('title')
      .eq('id', clip.project_id)
      .maybeSingle();

    let candidateTitle = 'clip';
    if (clip.candidate_id) {
      const { data: cand } = await supabaseAuthClient
        .from('clip_candidates')
        .select('title')
        .eq('id', clip.candidate_id)
        .maybeSingle();
      if (cand?.title) candidateTitle = cand.title;
    }

    const safeProj = sanitizeFilename(project?.title || 'vireo');
    const safeTitle = sanitizeFilename(candidateTitle);
    const downloadFilename = `vireo-${safeProj}-${safeTitle}.mp4`;

    const isVideosFallback = clip.output_storage_path.startsWith('clips/');
    const bucket = isVideosFallback ? 'videos' : 'clips';
    const storagePath = clip.output_storage_path;
    const expiresIn = 3600; // 1 hour

    const { data, error } = await supabaseAuthClient.storage
      .from(bucket)
      .createSignedUrl(storagePath, expiresIn, {
        download: downloadFilename,
      });

    if (error || !data?.signedUrl) {
      logger.error('Failed to create signed download URL', { error: error?.message, clipId });
      const err = new Error(`Failed to generate download URL: ${error?.message || 'Storage error'}`);
      (err as any).code = 'STORAGE_ERROR';
      throw err;
    }

    return {
      signedUrl: data.signedUrl,
      filename: downloadFilename,
      expiresInSeconds: expiresIn,
    };
  }

  /**
   * Deletes a clip record, cleans up all rendered video revisions from Storage, and cascades to render_jobs.
   */
  public static async deleteClip(clipId: string, userId: string): Promise<void> {
    const clip = await ClipRenderService.getClip(clipId, userId);

    // Clean up storage files (both direct and versioned revisions)
    const folderPrefix = `${clip.user_id}/${clip.project_id}/${clip.id}`;
    for (const bucket of ['clips', 'videos']) {
      try {
        const { data: files } = await supabaseAuthClient.storage.from(bucket).list(folderPrefix);
        if (files && files.length > 0) {
          const filePaths = files.map((f) => `${folderPrefix}/${f.name}`);
          await supabaseAuthClient.storage.from(bucket).remove(filePaths);
          logger.info(`[ClipRender] Removed ${filePaths.length} revision files from ${bucket} for clip ${clipId}`);
        }
      } catch (listErr) {
        // Fallback: remove direct output_storage_path if set
        if (clip.output_storage_path) {
          try {
            await supabaseAuthClient.storage.from(bucket).remove([clip.output_storage_path]);
          } catch {}
        }
      }
    }

    // Delete row from DB (CASCADE handles render_jobs)
    const { error } = await supabaseAuthClient
      .from('clips')
      .delete()
      .eq('id', clipId)
      .eq('user_id', userId);

    if (error) {
      logger.error('Failed to delete clip record from DB', { error: error.message, clipId });
      const err = new Error(`Failed to delete clip: ${error.message}`);
      (err as any).code = 'DB_ERROR';
      throw err;
    }
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

    const validStyles: CaptionStyle[] = ['clean', 'bold', 'minimal', 'podcast', 'highlight', 'karaoke'];
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
    let safeCrop = clip.crop_config || { focusX: 0.5, focusY: 0.5 };
    if (update.cropConfig) {
      safeCrop = {
        focusX: Math.min(1.0, Math.max(0.0, Number(update.cropConfig.focusX ?? 0.5))),
        focusY: Math.min(1.0, Math.max(0.0, Number(update.cropConfig.focusY ?? 0.5))),
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

    // Caption config
    const safeCaptionConfig = update.captionConfig || clip.caption_config || {};

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
      editor_version: nextEditorVersion,
      updated_at: new Date().toISOString(),
    };

    const { data: updated, error: updateErr } = await supabaseAuthClient
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
      editor_version: Number(clip.editor_version || 1) + 1,
      updated_at: new Date().toISOString(),
    };

    const { data: resetClip, error } = await supabaseAuthClient
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
  }> {
    const clip = await ClipRenderService.getClip(clipId, userId);

    // Get timing mode from transcript
    let timingMode = 'segment';
    try {
      const { data: trans } = await supabaseAuthClient
        .from('transcripts')
        .select('words')
        .eq('project_id', clip.project_id)
        .eq('user_id', userId)
        .maybeSingle();

      if (trans && Array.isArray(trans.words) && trans.words.length > 0) {
        timingMode = 'word';
      }
    } catch {}

    let previewUrl: string | undefined;
    if (clip.render_status === 'ready') {
      try {
        const preview = await ClipRenderService.getSignedPreviewUrl(clipId, userId);
        previewUrl = preview.signedUrl;
      } catch {}
    }

    const availablePresets: CaptionStyle[] = [
      'clean',
      'bold',
      'minimal',
      'podcast',
      'highlight',
      'karaoke',
    ];

    return {
      clip,
      timingMode,
      availablePresets,
      previewUrl,
    };
  }
}
