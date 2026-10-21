/**
 * Frontend waveform helpers. The peak math is shared with the backend
 * (server/src/shared/waveformPeaks.ts) so render buckets line up with generated peaks.
 */
import { useEffect, useRef, useState } from 'react';
import {
  dequantizePeaks,
  resamplePeaksForRange,
  type WaveformData,
} from '../../server/src/shared/waveformPeaks';
import { clipRenderService } from '../services/clipRenderService';

export * from '../../server/src/shared/waveformPeaks';

export type WaveformStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

export interface WaveformState {
  status: WaveformStatus;
  data: WaveformData | null;
}

/**
 * Bounded module-level cache of fetched waveforms, keyed by clip id. Shared across every
 * clip component so peaks are fetched once per clip and reused while scrolling/zooming.
 */
const MAX_CACHE_ENTRIES = 24;
const cache = new Map<string, WaveformData>();
const inflight = new Map<string, Promise<WaveformData>>();

function remember(clipId: string, data: WaveformData) {
  cache.delete(clipId);
  cache.set(clipId, data);
  // Evict oldest entries to keep the cache bounded.
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** Drops a clip's cached peaks so the next request refetches (e.g. after a re-render). */
export function invalidateWaveform(clipId: string): void {
  cache.delete(clipId);
  inflight.delete(clipId);
}

async function fetchWaveform(clipId: string): Promise<WaveformData> {
  const cached = cache.get(clipId);
  if (cached) return cached;

  const existing = inflight.get(clipId);
  if (existing) return existing;

  const promise = clipRenderService
    .getClipWaveform(clipId)
    .then((res) => {
      const data: WaveformData = {
        peaks: Array.isArray(res.peaks) ? res.peaks : [],
        duration: Number(res.duration) || 0,
        resolution: Number(res.resolution) || 1,
        version: Number(res.version) || 1,
      };
      remember(clipId, data);
      return data;
    })
    .finally(() => {
      inflight.delete(clipId);
    });

  inflight.set(clipId, promise);
  return promise;
}

/**
 * Loads (and caches) a clip's waveform. `enabled` gates the fetch so waveforms are only
 * requested for clips that actually show one.
 */
export function useClipWaveform(clipId: string | null | undefined, enabled: boolean): WaveformState {
  const [state, setState] = useState<WaveformState>(() => {
    const cached = clipId ? cache.get(clipId) : null;
    return cached ? { status: cached.peaks.length ? 'ready' : 'empty', data: cached } : { status: 'idle', data: null };
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!clipId || !enabled) return;
    const cached = cache.get(clipId);
    if (cached) {
      setState({ status: cached.peaks.length ? 'ready' : 'empty', data: cached });
      return;
    }
    setState({ status: 'loading', data: null });
    fetchWaveform(clipId)
      .then((data) => {
        if (!mountedRef.current) return;
        setState({ status: data.peaks.length ? 'ready' : 'empty', data });
      })
      .catch(() => {
        if (!mountedRef.current) return;
        setState({ status: 'error', data: null });
      });
  }, [clipId, enabled]);

  return state;
}

// ── Uploaded audio assets (music / SFX) ─────────────────────────
const assetCache = new Map<string, WaveformData>();
const assetInflight = new Map<string, Promise<WaveformData>>();

async function fetchAssetWaveform(assetId: string): Promise<WaveformData> {
  const cached = assetCache.get(assetId);
  if (cached) return cached;
  const existing = assetInflight.get(assetId);
  if (existing) return existing;

  const promise = clipRenderService
    .getAssetWaveform(assetId)
    .then((res) => {
      const data: WaveformData = {
        peaks: Array.isArray(res.peaks) ? res.peaks : [],
        duration: Number(res.duration) || 0,
        resolution: Number(res.resolution) || 1,
        version: Number(res.version) || 1,
      };
      assetCache.set(assetId, data);
      if (assetCache.size > MAX_CACHE_ENTRIES) {
        const oldest = assetCache.keys().next().value as string | undefined;
        if (oldest !== undefined) assetCache.delete(oldest);
      }
      return data;
    })
    .finally(() => assetInflight.delete(assetId));

  assetInflight.set(assetId, promise);
  return promise;
}

/** Loads (and caches) an uploaded audio asset's waveform. `enabled` gates the fetch. */
export function useAssetWaveform(assetId: string | null | undefined, enabled: boolean): WaveformState {
  const [state, setState] = useState<WaveformState>({ status: 'idle', data: null });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!assetId || !enabled) return;
    const cached = assetCache.get(assetId);
    if (cached) {
      setState({ status: cached.peaks.length ? 'ready' : 'empty', data: cached });
      return;
    }
    setState({ status: 'loading', data: null });
    fetchAssetWaveform(assetId)
      .then((data) => {
        if (!mountedRef.current) return;
        setState({ status: data.peaks.length ? 'ready' : 'empty', data });
      })
      .catch(() => {
        if (!mountedRef.current) return;
        setState({ status: 'error', data: null });
      });
  }, [assetId, enabled]);

  return state;
}

/**
 * Render buckets (magnitudes in [0,1]) for the portion of the source a clip shows.
 * `sourceStart`/`sourceEnd` are clip-local offsets into the waveform window in seconds.
 */
export function getClipRenderPeaks(
  data: WaveformData,
  sourceStart: number,
  sourceEnd: number,
  targetBuckets: number
): number[] {
  if (!data || data.peaks.length === 0) return [];
  return resamplePeaksForRange(data.peaks, data.resolution, sourceStart, sourceEnd, targetBuckets);
}

export { dequantizePeaks };
