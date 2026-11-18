/**
 * Pure helpers for the timeline video filmstrip, shared by the backend (sprite generation)
 * and the frontend (mapping clip time → sprite cell). Dependency-free so it imports into
 * both the Vite bundle and the backend test runner.
 *
 * A filmstrip is a single horizontal sprite sheet: `frameCount` frames of equal size tiled
 * left-to-right, sampled evenly across the clip's source window. The frontend tiles the
 * sprite across the clip and picks a cell per on-screen position.
 */

/** Sprite cell height in px; width follows the source aspect. */
export const THUMBNAIL_HEIGHT = 72;
export const DEFAULT_THUMBNAIL_COUNT = 12;
export const MAX_THUMBNAIL_COUNT = 40;
export const MIN_THUMBNAIL_COUNT = 2;
/** Bump to invalidate every cached filmstrip. */
export const THUMBNAIL_FORMAT_VERSION = 1;

export interface ThumbnailStripData {
  /** `data:image/jpeg;base64,...` sprite sheet, or '' when unavailable. */
  dataUrl: string;
  frameCount: number;
  frameWidth: number;
  frameHeight: number;
  duration: number;
  version: number;
}

export function clampThumbnailCount(count: unknown): number {
  const n = typeof count === 'number' ? count : typeof count === 'string' ? parseInt(count, 10) : NaN;
  if (!Number.isFinite(n)) return DEFAULT_THUMBNAIL_COUNT;
  return Math.min(MAX_THUMBNAIL_COUNT, Math.max(MIN_THUMBNAIL_COUNT, Math.round(n)));
}

/**
 * ffmpeg args that sample `count` frames across [startSec, startSec+durationSec] and tile
 * them into one horizontal sprite written to `outPath`. `fps=count/duration` yields exactly
 * `count` evenly spaced frames; `tile=countx1` lays them in a single row.
 */
export function buildThumbnailArgs(
  sourcePath: string,
  startSec: number,
  durationSec: number,
  count: number,
  height: number,
  outPath: string
): string[] {
  const safeDur = Math.max(0.1, durationSec);
  return [
    '-nostdin',
    '-y',
    '-ss', Math.max(0, startSec).toFixed(3),
    '-t', safeDur.toFixed(3),
    '-i', sourcePath,
    '-an',
    '-sn',
    '-threads', '2',
    '-frames:v', '1',
    '-vf', `fps=${count}/${safeDur.toFixed(3)},scale=-1:${height},tile=${count}x1`,
    '-q:v', '7',
    outPath,
  ];
}

/** Stable cache key for a clip's filmstrip: identity + window + frame count + format. */
export function thumbnailCacheKey(
  sourceStoragePath: string | null | undefined,
  startSeconds: number,
  endSeconds: number,
  count: number
): string {
  return [
    sourceStoragePath || 'local',
    Number(startSeconds || 0).toFixed(3),
    Number(endSeconds || 0).toFixed(3),
    `n${count}`,
    `v${THUMBNAIL_FORMAT_VERSION}`,
  ].join('|');
}

/** True when a cached filmstrip row is usable (current version + a data URL + frame count). */
export function isFreshThumbnailRow(row: unknown): row is ThumbnailStripData {
  if (!row || typeof row !== 'object') return false;
  const r = row as Record<string, unknown>;
  return (
    typeof r.dataUrl === 'string' &&
    r.dataUrl.startsWith('data:image') &&
    r.version === THUMBNAIL_FORMAT_VERSION &&
    typeof r.frameCount === 'number' &&
    r.frameCount > 0
  );
}

/**
 * Sprite cell index for a clip-local time (seconds into the sampled window). Frame i is
 * centered at (i + 0.5) * duration / frameCount, so this inverts that mapping and clamps.
 */
export function frameIndexForTime(timeSec: number, duration: number, frameCount: number): number {
  if (frameCount <= 0 || duration <= 0) return 0;
  const idx = Math.floor((timeSec / duration) * frameCount);
  return Math.min(frameCount - 1, Math.max(0, idx));
}
