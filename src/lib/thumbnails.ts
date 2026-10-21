/**
 * Frontend filmstrip helpers: fetch + bounded cache + a React hook, plus a shared <img>
 * element per sprite so the canvas renderer can draw cells without reloading.
 */
import { useEffect, useRef, useState } from 'react';
import { clipRenderService } from '../services/clipRenderService';
import type { ThumbnailStripData } from '../../server/src/shared/thumbnailStrip';

export * from '../../server/src/shared/thumbnailStrip';

export type ThumbnailStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

export interface ThumbnailState {
  status: ThumbnailStatus;
  data: ThumbnailStripData | null;
  /** Decoded sprite image, ready to draw, once loaded. */
  image: HTMLImageElement | null;
}

const MAX_CACHE_ENTRIES = 24;
const cache = new Map<string, { data: ThumbnailStripData; image: HTMLImageElement }>();
const inflight = new Map<string, Promise<{ data: ThumbnailStripData; image: HTMLImageElement }>>();

function remember(key: string, entry: { data: ThumbnailStripData; image: HTMLImageElement }) {
  cache.delete(key);
  cache.set(key, entry);
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export function invalidateThumbnails(clipId: string): void {
  for (const key of [...cache.keys()]) if (key.startsWith(`${clipId}:`)) cache.delete(key);
  for (const key of [...inflight.keys()]) if (key.startsWith(`${clipId}:`)) inflight.delete(key);
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('sprite decode failed'));
    img.src = dataUrl;
  });
}

async function fetchStrip(clipId: string, count: number): Promise<{ data: ThumbnailStripData; image: HTMLImageElement }> {
  const key = `${clipId}:${count}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = clipRenderService
    .getClipThumbnails(clipId, count)
    .then(async (res) => {
      const data: ThumbnailStripData = {
        dataUrl: res.dataUrl || '',
        frameCount: Number(res.frameCount) || 0,
        frameWidth: Number(res.frameWidth) || 0,
        frameHeight: Number(res.frameHeight) || 0,
        duration: Number(res.duration) || 0,
        version: Number(res.version) || 1,
      };
      if (!data.dataUrl || data.frameCount === 0) {
        const entry = { data, image: null as unknown as HTMLImageElement };
        return entry;
      }
      const image = await loadImage(data.dataUrl);
      const entry = { data, image };
      remember(key, entry);
      return entry;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}

/** Loads (and caches) a clip's filmstrip sprite. `enabled` gates the fetch. */
export function useClipThumbnails(clipId: string | null | undefined, enabled: boolean, count = 12): ThumbnailState {
  const [state, setState] = useState<ThumbnailState>({ status: 'idle', data: null, image: null });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!clipId || !enabled) return;
    const cached = cache.get(`${clipId}:${count}`);
    if (cached) {
      setState({ status: cached.data.frameCount ? 'ready' : 'empty', data: cached.data, image: cached.image });
      return;
    }
    setState({ status: 'loading', data: null, image: null });
    fetchStrip(clipId, count)
      .then((entry) => {
        if (!mountedRef.current) return;
        setState({
          status: entry.data.frameCount && entry.image ? 'ready' : 'empty',
          data: entry.data,
          image: entry.image,
        });
      })
      .catch(() => {
        if (!mountedRef.current) return;
        setState({ status: 'error', data: null, image: null });
      });
  }, [clipId, enabled, count]);

  return state;
}
