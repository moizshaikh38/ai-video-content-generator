/**
 * Timeline Pro & Audio Waveforms — waveform peak math, coordinate/snapping helpers,
 * waveform cache reuse/invalidation, real FFmpeg peak generation, and audio↔export mapping.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';
import {
  buildPcmDecodeArgs,
  buildPeaksFromPcm,
  dequantizePeaks,
  resamplePeaksForRange,
  waveformCacheKey,
  PEAK_QUANT,
  PEAKS_PER_SECOND,
  WAVEFORM_FORMAT_VERSION,
} from '../shared/waveformPeaks.js';
import {
  clampTime,
  collectSnapPoints,
  pxToTime,
  rulerXToTime,
  snapToPoints,
  timeToPx,
} from '../shared/timelineCoords.js';
import { isFreshWaveformRow } from '../shared/waveformPeaks.js';
import { WaveformService } from '../services/waveformService.js';
import { ClipRenderService } from '../services/clipRenderService.js';
import { ProEditorService } from '../services/proEditorService.js';
import type { WaveformData } from '../shared/waveformPeaks.js';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';

const SAMPLE_VIDEO = path.resolve(
  process.cwd(),
  '..',
  'public/demo/landing/clips/mrbeast-clip-01.mp4'
);

describe('Waveform peaks: PCM → normalized peaks', () => {
  it('produces one peak per 1/resolution second, normalized to the loudest bucket', () => {
    const sr = 8000;
    // 2 seconds: a quiet half then a loud half.
    const samples = new Int16Array(sr * 2);
    for (let i = 0; i < samples.length; i++) {
      const amp = i < sr ? 1000 : 16000;
      samples[i] = Math.round(Math.sin(i / 4) * amp);
    }
    const { peaks, duration } = buildPeaksFromPcm(samples, sr, PEAKS_PER_SECOND);
    assert.equal(peaks.length, 2 * PEAKS_PER_SECOND);
    assert.equal(duration, 2);
    assert.equal(Math.max(...peaks), PEAK_QUANT, 'loudest bucket hits the quant ceiling');
    const quietAvg = peaks.slice(0, PEAKS_PER_SECOND).reduce((a, b) => a + b, 0) / PEAKS_PER_SECOND;
    const loudAvg = peaks.slice(PEAKS_PER_SECOND).reduce((a, b) => a + b, 0) / PEAKS_PER_SECOND;
    assert.ok(loudAvg > quietAvg * 3, `loud (${loudAvg}) should dwarf quiet (${quietAvg})`);
  });

  it('handles empty / invalid PCM gracefully', () => {
    assert.deepEqual(buildPeaksFromPcm(new Int16Array(0), 8000), { peaks: [], duration: 0 });
    assert.deepEqual(buildPeaksFromPcm(new Int16Array(10), 0), { peaks: [], duration: 0 });
  });

  it('dequantizes to [0,1]', () => {
    assert.deepEqual(dequantizePeaks([0, 50, 100]), [0, 0.5, 1]);
    assert.deepEqual(dequantizePeaks([150, -5]), [1, 0], 'clamped');
  });
});

describe('Waveform peaks: zoom-aware resampling', () => {
  const peaks = Array.from({ length: 400 }, (_, i) => (i % 40 < 20 ? 100 : 0)); // 10s @ 40/s
  const resolution = 40;

  it('selects the requested source sub-range and max-pools into target buckets', () => {
    const full = resamplePeaksForRange(peaks, resolution, 0, 10, 100);
    assert.equal(full.length, 100);
    assert.ok(Math.max(...full) <= 1 && Math.min(...full) >= 0);

    // Seconds 0..0.5 are all loud (indices 0..19 = 100) → every bucket is 1.
    const loud = resamplePeaksForRange(peaks, resolution, 0, 0.5, 10);
    assert.ok(loud.every((v) => v === 1), `expected all-loud, got ${loud.join(',')}`);
  });

  it('returns zero-filled buckets for an empty or inverted range', () => {
    assert.deepEqual(resamplePeaksForRange(peaks, resolution, 5, 5, 4), [0, 0, 0, 0]);
    assert.deepEqual(resamplePeaksForRange([], resolution, 0, 1, 4), []);
  });

  it('upsampling never drops signal (downsample is max-pooled)', () => {
    const sparse = [0, 100, 0, 0]; // 0.1s @ 40/s
    const up = resamplePeaksForRange(sparse, 40, 0, 0.1, 8);
    assert.equal(Math.max(...up), 1, 'the single loud sample survives upsampling');
  });
});

describe('Waveform: decode args + cache key', () => {
  it('builds mono s16le decode args for the clip window', () => {
    const args = buildPcmDecodeArgs('/src.mp4', 12.5, 10, 8000);
    assert.deepEqual(args.slice(0, 8), ['-nostdin', '-ss', '12.500', '-t', '10.000', '-i', '/src.mp4', '-vn']);
    assert.ok(args.includes('s16le') && args.includes('pcm_s16le'));
    assert.equal(args[args.indexOf('-ar') + 1], '8000');
    assert.equal(args[args.length - 1], '-', 'decodes to stdout by default');
  });

  it('cache key is stable per source window and changes with format version', () => {
    const a = waveformCacheKey('user/p/src.mp4', 2, 12);
    assert.equal(a, waveformCacheKey('user/p/src.mp4', 2, 12));
    assert.notEqual(a, waveformCacheKey('user/p/src.mp4', 2, 13));
    assert.ok(a.endsWith(`v${WAVEFORM_FORMAT_VERSION}`));
  });
});

describe('Timeline coordinate + snapping helpers', () => {
  it('px↔time is inverse and clamps safely', () => {
    assert.equal(pxToTime(120, 60), 2);
    assert.equal(timeToPx(2, 60), 120);
    assert.equal(pxToTime(100, 0), 0, 'guards divide-by-zero');
    assert.equal(clampTime(-5, 0, 10), 0);
    assert.equal(clampTime(99, 0, 10), 10);
  });

  it('ruler x maps to a clamped time regardless of zoom (no scroll double-count)', () => {
    // contentX already includes horizontal scroll, so the same contentX maps the same way.
    assert.equal(rulerXToTime(300, 60, 10), 5);
    assert.equal(rulerXToTime(3000, 60, 10), 10, 'clamped to duration');
    assert.equal(rulerXToTime(-50, 60, 10), 0);
    // Zoomed in: 120 px/s, same content x → half the time.
    assert.equal(rulerXToTime(300, 120, 10), 2.5);
  });

  it('collects distinct snap points excluding the dragged item', () => {
    const tracks = [
      { items: [{ id: 'a', timeline_start: 0, timeline_end: 2 }, { id: 'b', timeline_start: 2, timeline_end: 5 }] },
    ];
    const pts = collectSnapPoints(tracks, 3.3, 'a');
    assert.deepEqual(pts, [0, 2, 3.3, 5], 'item a edges excluded, 0 + playhead + b edges kept, sorted/deduped');
  });

  it('snaps to the NEAREST point within tolerance, or not at all', () => {
    const pts = [0, 2, 5];
    assert.deepEqual(snapToPoints(2.1, pts, 0.15), { time: 2, snapped: true });
    assert.deepEqual(snapToPoints(2.4, pts, 0.15), { time: 2.4, snapped: false });
    // 1.93 is closer to 1.9 (0.03) than to 2 (0.07) → nearest wins.
    assert.deepEqual(snapToPoints(1.93, [2, 1.9], 0.2), { time: 1.9, snapped: true }, 'nearest wins');
    assert.deepEqual(snapToPoints(2.1, pts, 0.15, false), { time: 2.1, snapped: false }, 'disabled passes through');
  });
});

describe('WaveformService: cache reuse, refresh and invalidation', () => {
  const clip: any = {
    id: '00000000-0000-4000-8000-0000000000aa',
    user_id: 'u1',
    project_id: 'p1',
    source_storage_path: 'user/p/src.mp4',
    start_seconds: 2,
    end_seconds: 12,
  };
  const sampleData: WaveformData = { peaks: [10, 50, 90], duration: 10, resolution: PEAKS_PER_SECOND, version: WAVEFORM_FORMAT_VERSION };

  const originalGetClip = ClipRenderService.getClip;
  const originalDecode = WaveformService.decodeClipWaveform;
  // The service gates Mongo on `isMongoConfigured` (a const binding we can't toggle), so we
  // stub the cache read/write directly with an in-memory store, keyed by the real cache key,
  // and let the real readCache freshness gate run through isFreshWaveformRow (tested below).
  const originalRead = (WaveformService as any).readCache;
  const originalWrite = (WaveformService as any).writeCache;

  let store: Record<string, any> = {};
  let decodeCount = 0;

  before(() => {
    (ClipRenderService as any).getClip = async () => clip;
    (WaveformService as any).decodeClipWaveform = async () => {
      decodeCount++;
      return sampleData;
    };
    (WaveformService as any).readCache = async (_clipId: string, _userId: string, cacheKey: string) => {
      const row = store[cacheKey];
      return isFreshWaveformRow(row)
        ? { peaks: row.peaks, duration: row.duration, resolution: row.resolution, version: row.version }
        : null;
    };
    (WaveformService as any).writeCache = async (_clipId: string, _userId: string, cacheKey: string, data: WaveformData) => {
      store[cacheKey] = { ...data, cache_key: cacheKey };
    };
  });

  after(() => {
    (ClipRenderService as any).getClip = originalGetClip;
    (WaveformService as any).decodeClipWaveform = originalDecode;
    (WaveformService as any).readCache = originalRead;
    (WaveformService as any).writeCache = originalWrite;
  });

  it('the freshness predicate rejects stale/malformed rows', () => {
    assert.equal(isFreshWaveformRow(sampleData), true);
    assert.equal(isFreshWaveformRow({ ...sampleData, version: WAVEFORM_FORMAT_VERSION - 1 }), false);
    assert.equal(isFreshWaveformRow({ duration: 10, resolution: 40, version: WAVEFORM_FORMAT_VERSION }), false);
    assert.equal(isFreshWaveformRow(null), false);
  });

  it('decodes once, then serves subsequent calls from cache', async () => {
    store = {};
    decodeCount = 0;
    const first = await WaveformService.getWaveformForClip(clip.id, 'u1');
    assert.equal(first.cached, false);
    assert.deepEqual(first.peaks, sampleData.peaks);
    assert.equal(decodeCount, 1);

    const second = await WaveformService.getWaveformForClip(clip.id, 'u1');
    assert.equal(second.cached, true);
    assert.equal(decodeCount, 1, 'no second decode');
  });

  it('forceRefresh bypasses the cache and re-decodes', async () => {
    store = {};
    decodeCount = 0;
    await WaveformService.getWaveformForClip(clip.id, 'u1');
    const refreshed = await WaveformService.getWaveformForClip(clip.id, 'u1', { forceRefresh: true });
    assert.equal(refreshed.cached, false);
    assert.equal(decodeCount, 2);
  });

  it('a stale cached version is ignored (invalidation) and re-decoded', async () => {
    store = {};
    decodeCount = 0;
    // Seed a cache row with an old format version under the current key.
    const key = waveformCacheKey(clip.source_storage_path, clip.start_seconds, clip.end_seconds);
    store[key] = { peaks: [1, 2, 3], duration: 10, resolution: PEAKS_PER_SECOND, version: WAVEFORM_FORMAT_VERSION - 1, cache_key: key };
    const res = await WaveformService.getWaveformForClip(clip.id, 'u1');
    assert.equal(res.cached, false, 'old-version row is not served');
    assert.equal(decodeCount, 1);
    assert.equal(res.version, WAVEFORM_FORMAT_VERSION);
  });
});

describe('WaveformService: real FFmpeg peak generation', () => {
  const hasSample = fs.existsSync(SAMPLE_VIDEO);

  it('generates normalized peaks from a real clip window', { skip: hasSample ? false : 'sample video missing' }, async () => {
    const clip: any = {
      id: 'real-wave', project_id: 'p', user_id: 'u',
      source_storage_path: SAMPLE_VIDEO, start_seconds: 1, end_seconds: 6,
    };
    const data = await WaveformService.decodeClipWaveform(clip);
    assert.equal(data.resolution, PEAKS_PER_SECOND);
    assert.ok(Math.abs(data.duration - 5) < 0.3, `~5s window, got ${data.duration}`);
    assert.ok(data.peaks.length >= 180, `expected ~200 peaks, got ${data.peaks.length}`);
    assert.equal(Math.max(...data.peaks), PEAK_QUANT, 'normalized to ceiling');
    assert.ok(data.peaks.some((p) => p > 0 && p < PEAK_QUANT), 'has real dynamic range');
  });
});

describe('Audio clip controls map to the export render graph', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-audio-'));
  let wav = '';

  before(async () => {
    wav = path.join(tmp, 'music.wav');
    await execFileAsync(ffmpegBin, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', wav]);
  });
  after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  function projectWith(audioItem: any) {
    return {
      canvas: { duration: 5, aspect_ratio: '9:16', width: 1080, height: 1920, fps: 30 },
      tracks: [
        { id: 'tv', type: 'VIDEO', name: 'Main Video', hidden: false, muted: false, items: [
          { id: 'v', type: 'VIDEO', timeline_start: 0, timeline_end: 5, source_start: 0, source_end: 5, transform: {}, keyframes: [], effects: [] },
        ] },
        { id: 'ta', type: 'AUDIO', name: 'Music', hidden: false, muted: false, items: [audioItem] },
      ],
    } as any;
  }

  it('applies per-clip volume and fades for an audible audio item', () => {
    const graph = ProEditorService.compileRenderGraph(
      projectWith({
        id: 'a', type: 'AUDIO', timeline_start: 1, timeline_end: 5, source_start: 0, source_end: 4,
        source_path: wav, muted: false, transform: {}, keyframes: [], effects: [],
        audio: { volume: 0.3, fade_in: 0.7, fade_out: 0.9, normalized: false, target_lufs: -16 },
      }),
      '/src.mp4',
      path.join(tmp, 'out.mp4'),
      tmp
    );
    const fc = graph.filterComplex.join('\n');
    assert.ok(fc.includes('volume=0.30'), `expected volume=0.30 in:\n${fc}`);
    assert.ok(fc.includes('afade=t=in:ss=0:d=0.70'), 'fade in applied');
    assert.ok(/afade=t=out:st=[0-9.]+:d=0.90/.test(fc), 'fade out applied');
    assert.ok(graph.inputArgs.includes(wav), 'audio file is an input');
  });

  it('excludes a muted audio item from the mix', () => {
    const graph = ProEditorService.compileRenderGraph(
      projectWith({
        id: 'a', type: 'AUDIO', timeline_start: 1, timeline_end: 5, source_start: 0, source_end: 4,
        source_path: wav, muted: true, transform: {}, keyframes: [], effects: [],
        audio: { volume: 0.9, fade_in: 0.2, fade_out: 0.2, normalized: false, target_lufs: -16 },
      }),
      '/src.mp4',
      path.join(tmp, 'out.mp4'),
      tmp
    );
    assert.ok(!graph.inputArgs.includes(wav), 'muted audio is not added as an input');
    assert.ok(!graph.filterComplex.join('\n').includes('volume=0.90'), 'muted audio contributes no filters');
  });
});
