import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';
import { dataRepository } from '../db/repositories/dataRepository.js';
import { logger } from '../utils/logger.js';
import { projectObjectPrefix, signObjectGet, uploadFile } from './objectStorageService.js';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';

/** Bump when the poster recipe changes so old posters are regenerated. */
const POSTER_VERSION = 1;
const POSTER_MAX_WIDTH = 1280; // HD; never upscales smaller sources
const EXTRACT_TIMEOUT_MS = 25_000;

export interface PosterProject {
  id: string;
  user_id: string;
  source_type?: string | null;
  source_url?: string | null;
  video_status?: string | null;
  duration_seconds?: number | null;
  poster_key?: string | null;
}

/** In-flight generations, so concurrent dashboard loads extract each poster once. */
const inFlight = new Map<string, Promise<string | null>>();

/**
 * HD poster frames for uploaded-video projects (URL projects already have a YouTube
 * thumbnail). A poster is one JPEG per project in the clips bucket under the project's
 * prefix, so deleting the project removes it too.
 */
export class ProjectPosterService {
  static posterKey(userId: string, projectId: string): string {
    return `${projectObjectPrefix(userId, projectId)}poster/poster-v${POSTER_VERSION}.jpg`;
  }

  /** A frame a little way in, so we skip black intros; unknown duration → 1.5s. */
  static frameTime(durationSeconds?: number | null): number {
    const d = Number(durationSeconds);
    if (!Number.isFinite(d) || d <= 0) return 1.5;
    const t = Math.min(8, Math.max(1, d * 0.1));
    return t < d - 0.25 ? t : d / 2;
  }

  static buildArgs(input: string, atSeconds: number, outPath: string): string[] {
    return [
      '-hide_banner', '-loglevel', 'error',
      '-ss', atSeconds.toFixed(3), // before -i: fast keyframe seek (HTTP range for remote inputs)
      '-i', input,
      '-frames:v', '1',
      '-vf', `scale='min(${POSTER_MAX_WIDTH},iw)':-2`,
      '-q:v', '3',
      '-y', outPath,
    ];
  }

  /**
   * Extracts one HD frame from a local path or signed URL (trying each time in order until a
   * frame comes out) and uploads it to the clips bucket under `key`. True when uploaded.
   */
  static async extractAndUpload(input: string, times: number[], key: string, label: string): Promise<boolean> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-poster-'));
    const outPath = path.join(tmpDir, `${crypto.randomUUID()}.jpg`);
    try {
      for (const at of times) {
        try {
          await execFileAsync(ffmpegBin, this.buildArgs(input, at, outPath), { timeout: EXTRACT_TIMEOUT_MS });
        } catch (err: any) {
          logger.warn(`[Poster] ffmpeg failed for ${label} at ${at}s: ${err?.message}`);
        }
        if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) break;
      }
      if (!fs.existsSync(outPath) || fs.statSync(outPath).size === 0) return false;
      await uploadFile('clips', key, outPath, fs.statSync(outPath).size, 'image/jpeg');
      return true;
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  /** Extracts a project poster from a local path or a signed URL and uploads it. Returns the key or null. */
  static async generate(userId: string, projectId: string, input: string, durationSeconds?: number | null): Promise<string | null> {
    const key = this.posterKey(userId, projectId);
    const ok = await this.extractAndUpload(input, [this.frameTime(durationSeconds), 0], key, `project ${projectId}`);
    if (!ok) return null;
    await dataRepository.from('projects').update({ poster_key: key }).eq('id', projectId).eq('user_id', userId);
    return key;
  }

  /** Best-effort during processing, from the already-downloaded source file. Never throws. */
  static async generateFromLocalFile(userId: string, projectId: string, videoPath: string, durationSeconds?: number | null): Promise<void> {
    try {
      await this.generate(userId, projectId, videoPath, durationSeconds);
    } catch (err: any) {
      logger.warn(`[Poster] Could not create poster for project ${projectId}: ${err?.message}`);
    }
  }

  /**
   * Signed URL for the project's poster, generating it from storage on first request.
   * Returns null when there is nothing to show yet (no source, still uploading, or not an upload).
   */
  static async getPosterUrl(project: PosterProject): Promise<string | null> {
    const expectedKey = this.posterKey(project.user_id, project.id);
    if (project.poster_key === expectedKey) return signObjectGet('clips', expectedKey);

    if (project.source_type !== 'upload' || !project.source_url || project.video_status === 'uploading') return null;

    let job = inFlight.get(project.id);
    if (!job) {
      job = (async () => {
        const sourceUrl = await signObjectGet('source', project.source_url as string);
        return this.generate(project.user_id, project.id, sourceUrl, project.duration_seconds);
      })().finally(() => inFlight.delete(project.id));
      inFlight.set(project.id, job);
    }
    const key = await job;
    return key ? signObjectGet('clips', key) : null;
  }
}
