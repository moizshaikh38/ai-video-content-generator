import { backendRequest } from './backendClient';

/** Lightweight pre-ingest metadata returned by POST /projects/probe-url (~1s, no media download). */
export interface UrlProbeMetadata {
  provider: 'youtube' | 'direct';
  normalizedUrl: string;
  title?: string;
  /** Duration in seconds (YouTube path). */
  duration?: number;
  thumbnail?: string;
  channel?: string;
  description?: string;
  categories?: string[];
  tags?: string[];
  chapters?: unknown;
  suggestedGenre?: string;
  genreConfidence?: number;
  /** Byte size hint (direct URL path, from HEAD when available). */
  contentLength?: number;
  contentType?: string;
}

export interface UrlProbeResult {
  status: 'ok' | 'soft-fail' | 'error';
  data?: UrlProbeMetadata;
  /** Human-readable classified failure reason when status === 'error'. */
  error?: string;
}

const YOUTUBE_ID_RE =
  /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;

export function extractYouTubeId(url: string): string | null {
  const match = url.match(YOUTUBE_ID_RE);
  return match && match[1] ? match[1] : null;
}

export function formatDuration(totalSeconds?: number): string {
  if (typeof totalSeconds !== 'number' || !Number.isFinite(totalSeconds) || totalSeconds <= 0) return '';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export const MAX_SOURCE_DURATION_SECONDS = 7200;

/**
 * Probes a video URL for metadata without downloading the media. Failures are classified:
 * hard errors (private video, unsupported platform, ...) are surfaced to the caller as
 * `status: 'error'` so the user is blocked before submit; transient/network failures are
 * `soft-fail` so the user can still attempt the import.
 */
export async function probeVideoUrl(url: string, signal?: AbortSignal): Promise<UrlProbeResult> {
  try {
    const data = await backendRequest<{ probe: UrlProbeMetadata }>('/projects/probe-url', {
      method: 'POST',
      body: JSON.stringify({ url }),
      signal,
    });
    if (!data?.probe) return { status: 'soft-fail' };
    return { status: 'ok', data: data.probe };
  } catch (err: any) {
    if (err.name === 'AbortError') throw err;
    const hardCodes = [
      'YOUTUBE_VIDEO_UNAVAILABLE',
      'YOUTUBE_AGE_RESTRICTED',
      'YOUTUBE_REGION_LOCKED',
      'YOUTUBE_MEMBERS_ONLY',
      'UNSUPPORTED_PLATFORM',
      'INVALID_URL',
      'YOUTUBE_DURATION_TOO_LONG',
    ];
    const isHard = hardCodes.includes(err.code) || err.status === 400;
    return isHard
      ? { status: 'error', error: err.message || 'This link cannot be imported.' }
      : { status: 'soft-fail', error: err.message };
  }
}
