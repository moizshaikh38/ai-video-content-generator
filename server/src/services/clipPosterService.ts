import { dataRepository } from '../db/repositories/dataRepository.js';
import { logger } from '../utils/logger.js';
import { clipObjectPrefix, signObjectGet } from './objectStorageService.js';
import { ProjectPosterService } from './projectPosterService.js';

export interface PosterClip {
  id: string;
  user_id: string;
  project_id: string;
  start_seconds: number;
  end_seconds: number;
  render_status?: string | null;
  render_version?: number | null;
  output_storage_path?: string | null;
  source_storage_path?: string | null;
  poster_key?: string | null;
}

const inFlight = new Map<string, Promise<string | null>>();

const isRendered = (clip: PosterClip) =>
  Boolean(clip.output_storage_path) && (clip.render_status === 'ready' || clip.render_status === 'completed');

/**
 * Poster frames for clips (Media Library cards, My Clips, timeline placeholder). Taken from the
 * rendered 9:16 output when there is one so the card matches the clip; otherwise from the source
 * window. Keys live under the clip's prefix, so deleting the clip removes them, and the rendered
 * poster is versioned so a re-render gets a fresh frame.
 */
export class ClipPosterService {
  static posterKey(clip: Pick<PosterClip, 'id' | 'user_id' | 'project_id' | 'render_version'>, rendered: boolean): string {
    const prefix = clipObjectPrefix(clip.user_id, clip.project_id, clip.id);
    return rendered ? `${prefix}poster/render-v${Number(clip.render_version || 1)}.jpg` : `${prefix}poster/source.jpg`;
  }

  static expectedKey(clip: PosterClip): string {
    return this.posterKey(clip, isRendered(clip));
  }

  /** Frame times to try: the rendered file starts at 0, the source window at start_seconds. */
  static frameTimes(clip: PosterClip, rendered: boolean): number[] {
    const duration = Math.max(0, Number(clip.end_seconds) - Number(clip.start_seconds));
    const offset = rendered ? 0 : Number(clip.start_seconds) || 0;
    return [offset + ProjectPosterService.frameTime(duration), offset];
  }

  private static async store(clip: PosterClip, input: string, rendered: boolean): Promise<string | null> {
    const key = this.posterKey(clip, rendered);
    const ok = await ProjectPosterService.extractAndUpload(input, this.frameTimes(clip, rendered), key, `clip ${clip.id}`);
    if (!ok) return null;
    await dataRepository.from('clips').update({ poster_key: key }).eq('id', clip.id).eq('user_id', clip.user_id);
    return key;
  }

  /** Best-effort right after a render, from the local output file. Never throws. */
  static async generateFromRenderedFile(clip: PosterClip, outputPath: string): Promise<void> {
    try {
      await this.store({ ...clip, render_status: 'ready', output_storage_path: clip.output_storage_path || 'local' }, outputPath, true);
    } catch (err: any) {
      logger.warn(`[Poster] Could not create poster for clip ${clip.id}: ${err?.message}`);
    }
  }

  /** Signed URL of an up-to-date poster, or null if none exists yet (no generation). */
  static async signedUrlIfReady(clip: PosterClip): Promise<string | null> {
    if (!clip.poster_key || clip.poster_key !== this.expectedKey(clip)) return null;
    try {
      return await signObjectGet('clips', clip.poster_key);
    } catch {
      return null;
    }
  }

  /** Signed URL of the clip's poster, generating it from storage on first request. */
  static async getPosterUrl(clip: PosterClip): Promise<string | null> {
    const ready = await this.signedUrlIfReady(clip);
    if (ready) return ready;

    const rendered = isRendered(clip);
    const sourceKey = rendered ? clip.output_storage_path : clip.source_storage_path;
    if (!sourceKey) return null;

    let job = inFlight.get(clip.id);
    if (!job) {
      job = (async () => {
        const input = await signObjectGet(rendered ? 'clips' : 'source', sourceKey);
        return this.store(clip, input, rendered);
      })().finally(() => inFlight.delete(clip.id));
      inFlight.set(clip.id, job);
    }
    const key = await job;
    return key ? signObjectGet('clips', key) : null;
  }
}
