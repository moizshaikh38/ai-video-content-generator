/**
 * Pure waveform-peak math shared by the backend (peak generation from PCM) and the
 * frontend (zoom-aware downsampling for canvas rendering). Dependency-free so it can be
 * imported from the Vite bundle and the NodeNext server alike, and unit-tested via the
 * backend test runner.
 *
 * A "peak" is a normalized magnitude in [0, 1] for a short slice of audio. Peaks are
 * stored at a fixed temporal resolution (PEAKS_PER_SECOND) so a clip can index into them
 * by time regardless of the current timeline zoom. For transport they are quantized to
 * integers 0..PEAK_QUANT.
 */

/** Peaks generated per second of source audio. 40 → 25ms buckets, smooth at any zoom. */
export const PEAKS_PER_SECOND = 40;

/** Quantization range for transport (0..100 keeps the JSON small and lossless enough). */
export const PEAK_QUANT = 100;

/** Current peak format version; bump to invalidate every cached waveform. */
export const WAVEFORM_FORMAT_VERSION = 1;

export interface WaveformData {
  /** Quantized peaks (0..PEAK_QUANT), one per 1/PEAKS_PER_SECOND of audio. */
  peaks: number[];
  /** Seconds of source audio the peaks cover. */
  duration: number;
  /** Peaks per second (= PEAKS_PER_SECOND at generation time). */
  resolution: number;
  version: number;
}

/**
 * Builds normalized magnitude peaks from mono 16-bit little-endian PCM samples.
 * Each output bucket is the peak (max |sample|) over its window, normalized to the
 * loudest bucket so quiet clips still show a readable waveform.
 */
export function buildPeaksFromPcm(
  samples: Int16Array,
  sampleRate: number,
  peaksPerSecond = PEAKS_PER_SECOND
): { peaks: number[]; duration: number } {
  if (!samples || samples.length === 0 || sampleRate <= 0) {
    return { peaks: [], duration: 0 };
  }
  const duration = samples.length / sampleRate;
  const bucketCount = Math.max(1, Math.round(duration * peaksPerSecond));
  const samplesPerBucket = samples.length / bucketCount;

  const raw = new Array<number>(bucketCount);
  let max = 1; // avoid divide-by-zero; also the normalization reference
  for (let b = 0; b < bucketCount; b++) {
    const startIdx = Math.floor(b * samplesPerBucket);
    const endIdx = Math.min(samples.length, Math.floor((b + 1) * samplesPerBucket));
    let peak = 0;
    for (let i = startIdx; i < endIdx; i++) {
      const v = samples[i] < 0 ? -samples[i] : samples[i];
      if (v > peak) peak = v;
    }
    raw[b] = peak;
    if (peak > max) max = peak;
  }

  const peaks = raw.map((v) => Math.round((v / max) * PEAK_QUANT));
  return { peaks, duration: Number(duration.toFixed(3)) };
}

/**
 * True when a stored cache row is usable: current format version, a peaks array, and a
 * numeric resolution. Anything else (older version, malformed) is treated as a miss so the
 * waveform is regenerated.
 */
export function isFreshWaveformRow(row: unknown): row is WaveformData {
  if (!row || typeof row !== 'object') return false;
  const r = row as Record<string, unknown>;
  return Array.isArray(r.peaks) && r.version === WAVEFORM_FORMAT_VERSION && typeof r.resolution === 'number';
}

/** Converts quantized transport peaks (0..PEAK_QUANT) to magnitudes in [0, 1]. */
export function dequantizePeaks(peaks: number[]): number[] {
  return (peaks || []).map((p) => Math.min(1, Math.max(0, p / PEAK_QUANT)));
}

/**
 * Selects and downsamples the peaks for a time sub-range of the source audio into exactly
 * `targetBuckets` render buckets (max-pooled). Used by the canvas renderer: `startSec`..
 * `endSec` is the portion of the source the clip shows, and `targetBuckets` ≈ clip width
 * in px / px-per-bar. No audio is decoded here — it only reshapes the stored peaks.
 */
export function resamplePeaksForRange(
  peaks: number[],
  resolution: number,
  startSec: number,
  endSec: number,
  targetBuckets: number
): number[] {
  const n = peaks?.length ?? 0;
  if (n === 0 || targetBuckets <= 0 || resolution <= 0) return [];

  const startIdx = Math.max(0, Math.min(n, startSec * resolution));
  const endIdx = Math.max(startIdx, Math.min(n, endSec * resolution));
  const span = endIdx - startIdx;
  if (span <= 0) return new Array(Math.floor(targetBuckets)).fill(0);

  const out = new Array<number>(Math.floor(targetBuckets));
  const per = span / out.length;
  for (let i = 0; i < out.length; i++) {
    const a = startIdx + i * per;
    const b = startIdx + (i + 1) * per;
    const lo = Math.floor(a);
    const hi = Math.min(n - 1, Math.max(lo, Math.ceil(b) - 1));
    let peak = 0;
    for (let j = lo; j <= hi; j++) {
      const v = peaks[j] / PEAK_QUANT;
      if (v > peak) peak = v;
    }
    out[i] = peak;
  }
  return out;
}

/**
 * Builds the ffmpeg args that decode a source window to mono 16-bit PCM on stdout.
 * Kept here (pure) so the exact decode parameters are covered by a test.
 */
export function buildPcmDecodeArgs(
  sourcePath: string,
  startSec: number,
  durationSec: number,
  sampleRate: number
): string[] {
  return [
    '-nostdin',
    '-ss', Math.max(0, startSec).toFixed(3),
    '-t', Math.max(0, durationSec).toFixed(3),
    '-i', sourcePath,
    '-vn',
    '-ac', '1',
    '-ar', String(sampleRate),
    '-f', 's16le',
    '-acodec', 'pcm_s16le',
    '-',
  ];
}

/** Stable cache key for a clip's source-audio waveform: identity + window + format. */
export function waveformCacheKey(
  sourceStoragePath: string | null | undefined,
  startSeconds: number,
  endSeconds: number
): string {
  return [
    sourceStoragePath || 'local',
    Number(startSeconds || 0).toFixed(3),
    Number(endSeconds || 0).toFixed(3),
    `v${WAVEFORM_FORMAT_VERSION}`,
  ].join('|');
}
