import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { ProEditorService } from '../services/proEditorService.js';
import { AudioEnhancementService } from '../services/audioEnhancementService.js';
import {
  LoudnormNormalizationError,
  LoudnormTwoPassService,
} from '../services/loudnormTwoPassService.js';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';

/**
 * Two-pass loudness normalization (audit follow-up, Nov 2026): one-pass loudnorm
 * buffers until EOF and stalled the muxer, accumulating ~740MB of queued decoded
 * frames on a 120s 1080p source (render OOM-killed at ~1.2GB RSS in sandbox).
 * These tests cover the measure-then-apply flow, the exact FFmpeg linear-mode
 * feasibility conditions, explicit failure on silence/infeasibility, and output
 * loudness/duration/sync preservation. Synthetic fixtures (testsrc2 + modulated
 * sine) prove pipeline mechanics only, not launch-asset quality.
 */

// Reduced input dimensions for memory-constrained functional runs. This does not
// qualify the 1080p memory stress case; normal runs retain full-size fixtures.
const SMALL_FIXTURES = process.env.LOUDNORM_SMALL_FIXTURES === '1';
const FIX_DIR = SMALL_FIXTURES ? '/tmp/loudnorm-2pass-small-fixtures' : '/tmp/loudnorm-2pass-fixtures';
const MODULATED_120S = path.join(FIX_DIR, 'modulated-120s.mp4');
const MODULATED_15S = path.join(FIX_DIR, 'modulated-15s.mp4');
const MODULATED_SMALL = path.join(FIX_DIR, 'modulated-small.mp4');
const BROLL_SMALL = path.join(FIX_DIR, 'broll-small.mp4');
const SILENT_10S = path.join(FIX_DIR, 'silent-10s.mp4');
const HOT_QUIET = path.join(FIX_DIR, 'hotquiet-10s.mp4');
const BROLL_RED = path.join(FIX_DIR, 'broll-red.mp4');

function gen(fix: string, args: string[]) {
  if (!fs.existsSync(fix)) {
    execFileSync(ffmpegBin, ['-y', '-v', 'error', '-filter_threads', '1', '-filter_complex_threads', '1', ...args.map(a => SMALL_FIXTURES ? a.replace('1920x1080', '480x270') : a), '-threads', '2', fix], { timeout: 120_000 });
  }
}

function ensureFixtures() {
  fs.mkdirSync(FIX_DIR, { recursive: true });
  gen(MODULATED_120S, [
    '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=120',
    '-f', 'lavfi', '-i', 'aevalsrc=sin(440*2*PI*t)*(0.5+0.45*sin(2*PI*0.25*t)):s=44100:d=120',
    '-shortest', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '30', '-c:a', 'aac',
  ]);
  gen(MODULATED_15S, [
    '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=15',
    '-f', 'lavfi', '-i', 'aevalsrc=sin(440*2*PI*t)*(0.5+0.45*sin(2*PI*0.25*t)):s=44100:d=15',
    '-shortest', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '30', '-c:a', 'aac',
  ]);
  gen(SILENT_10S, [
    '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=10',
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-shortest', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '30', '-c:a', 'aac',
  ]);
  // Quiet sine bed with loud clicks: integrated ~-31 LUFS, true peak ~0dBTP -
  // linear normalization to -16 is infeasible (peak overshoot), dynamic works.
  gen(HOT_QUIET, [
    '-f', 'lavfi', '-i', 'testsrc2=size=480x270:rate=30:duration=10',
    '-f', 'lavfi', '-i', 'aevalsrc=0.02*sin(440*2*PI*t)+0.9*lt(mod(t\\,2)\\,0.02):s=44100:d=10',
    '-shortest', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '30', '-c:a', 'aac',
  ]);
  gen(MODULATED_SMALL, [
    '-f', 'lavfi', '-i', 'testsrc2=size=480x270:rate=30:duration=15',
    '-f', 'lavfi', '-i', 'aevalsrc=sin(440*2*PI*t)*(0.5+0.45*sin(2*PI*0.25*t)):s=44100:d=15',
    '-shortest', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '30', '-c:a', 'aac',
  ]);
  gen(BROLL_SMALL, [
    '-f', 'lavfi', '-i', 'color=c=0xCC2222:s=480x270:r=30:d=15',
    '-f', 'lavfi', '-i', 'sine=frequency=880:duration=15',
    '-shortest', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '30', '-c:a', 'aac',
  ]);
  gen(BROLL_RED, [
    '-f', 'lavfi', '-i', 'color=c=0xCC2222:s=1920x1080:r=30:d=15',
    '-f', 'lavfi', '-i', 'sine=frequency=880:duration=15',
    '-shortest', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '30', '-c:a', 'aac',
  ]);
}

function buildProject(sourcePath: string, duration: number, brollPath: string = BROLL_RED) {
  return {
    user_id: 'loudnorm-2pass-test',
    canvas: { width: 1080, height: 1920, aspect_ratio: '9:16', fps: 30, duration },
    tracks: [
      {
        type: 'VIDEO',
        name: 'Main',
        items: [
          {
            id: 'slice-1', name: 'slice-1',
            timeline_start: 0, timeline_end: 3.5, source_start: 0, source_end: 3.5,
            source_path: sourcePath,
            audio: { volume: 1.0, fade_in: 0.1, fade_out: 0.1, normalized: true, target_lufs: -16 },
          },
          {
            id: 'slice-2', name: 'slice-2',
            timeline_start: 3.5, timeline_end: 5.5, source_start: 5.0, source_end: 7.0,
            source_path: sourcePath,
            audio: { volume: 1.0, fade_in: 0.1, fade_out: 0.1, normalized: true, target_lufs: -16 },
          },
        ],
      },
      {
        type: 'OVERLAY',
        name: 'B-Roll',
        items: [
          {
            id: 'broll-1', name: 'broll-1',
            timeline_start: 1.0, timeline_end: 3.0, source_start: 5.0, source_end: 7.0,
            source_path: brollPath,
            audio: { volume: 0.0, fade_in: 0, fade_out: 0 },
          },
        ],
      },
    ],
  } as any;
}

async function renderGraph(graph: any, outPath: string, duration: number) {
  await execFileAsync(ffmpegBin, [
    '-y', '-v', 'error', '-filter_complex_threads', '1',
    ...graph.inputArgs,
    '-filter_complex', graph.filterComplex.join(';'),
    '-map', graph.videoMap, '-map', graph.audioMap,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-c:a', 'aac',
    '-threads', '2', '-threads', '2', '-t', String(duration), outPath,
  ], { timeout: 300_000, maxBuffer: 64 * 1024 * 1024 });
}

async function probeStreamDurations(file: string) {
  const { stdout } = await execFileAsync((ffprobeStatic as any).path || (ffprobeStatic as unknown as string), [
    '-v', 'error', '-show_entries', 'stream=codec_type,duration', '-of', 'json', file,
  ]);
  const streams = JSON.parse(stdout).streams as { codec_type: string; duration?: string }[];
  const v = streams.find((s) => s.codec_type === 'video');
  const a = streams.find((s) => s.codec_type === 'audio');
  return { video: Number(v?.duration), audio: Number(a?.duration) };
}

async function integratedLoudness(file: string): Promise<number> {
  const { stderr } = await execFileAsync(ffmpegBin, [
    '-hide_banner', '-nostats', '-i', file, '-af', 'ebur128', '-f', 'null', '-',
  ], { maxBuffer: 64 * 1024 * 1024 }).catch((e) => e);
  // ebur128 logs per-frame lines even with -nostats; the integrated value is the
  // one in the Summary block at end of stream.
  const m = /Summary:[\s\S]*?Integrated loudness:\s+I:\s+(-?\d+(?:\.\d+)?)\s+LUFS/.exec(stderr || '');
  assert.ok(m, 'ebur128 summary must report integrated loudness');
  return Number(m[1]);
}

describe('LoudnormTwoPassService - unit', () => {
  // Verbatim shape of an ebur128=peak=true stderr tail (periodic lines + Summary).
  const validStderr = `noise\n[Parsed_ebur128_0 @ 0x0] t: 1.0    TARGET:-23 LUFS    M: -9.5 S:-120.7     I:  -9.4 LUFS      LRA:   2.7 LU  FTPK:  -9.1 dBFS  TPK:  -3.5 dBFS\n[Parsed_ebur128_0 @ 0x0] Summary:\n\n  Integrated loudness:\n    I:          -9.2 LUFS\n    Threshold: -20.4 LUFS\n\n  Loudness range:\n    LRA:         2.6 LU\n    Threshold: -30.4 LUFS\n    LRA low:   -10.5 LUFS\n    LRA high:   -7.9 LUFS\n\n  True peak:\n    Peak:       -3.5 dBFS`;

  it('parses a valid measurement block', () => {
    const m = LoudnormTwoPassService.parseMeasurement(validStderr);
    assert.equal(m.inputI, -9.2);
    assert.equal(m.inputTP, -3.5);
    assert.equal(m.inputLRA, 2.6);
  });

  it('takes the last summary when several are present', () => {
    const second = validStderr.replace('I:          -9.2 LUFS', 'I:         -20.5 LUFS');
    const m = LoudnormTwoPassService.parseMeasurement(validStderr + '\n' + second);
    assert.equal(m.inputI, -20.5);
  });

  it('fails clearly when no measurement block exists', () => {
    assert.throws(
      () => LoudnormTwoPassService.parseMeasurement('no summary here'),
      (e: any) => e instanceof LoudnormNormalizationError && /no loudness statistics/.test(e.message)
    );
  });

  it('fails clearly on silence (gated I and -inf peak)', () => {
    // Real ebur128 summary on digital silence: I pinned at -70.0 LUFS, Peak=-inf.
    const silent = validStderr
      .replace('I:          -9.2 LUFS', 'I:         -70.0 LUFS')
      .replace('Peak:       -3.5 dBFS', 'Peak:       -inf dBFS');
    assert.throws(
      () => LoudnormTwoPassService.parseMeasurement(silent),
      (e: any) => e instanceof LoudnormNormalizationError && /silent or below the loudness measurement gate/.test(e.message)
    );
  });

  it('feasibility accepts the real measured case', () => {
    const m = { inputI: -9.2, inputTP: -3.5, inputLRA: 2.6 };
    assert.deepEqual(LoudnormTwoPassService.assessLinearFeasibility(m, -16, -1.5, 11), { ok: true });
  });

  it('feasibility rejects true-peak overflow as dynamic-prerender eligible', () => {
    const m = { inputI: -40, inputTP: -3.5, inputLRA: 2.6 };
    const r = LoudnormTwoPassService.assessLinearFeasibility(m, -16, -1.5, 11);
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.match(r.reason, /true peak/);
      assert.equal(r.fallback, 'dynamic-prerender');
    }
  });

  it('feasibility rejects LRA above target as dynamic-prerender eligible', () => {
    const m = { inputI: -9.2, inputTP: -3.5, inputLRA: 20 };
    const r = LoudnormTwoPassService.assessLinearFeasibility(m, -16, -1.5, 11);
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.match(r.reason, /loudness range/);
      assert.equal(r.fallback, 'dynamic-prerender');
    }
  });

  it('feasibility rejects LRA=0 constant audio as dynamic-prerender eligible', () => {
    const m = { inputI: -9.2, inputTP: -3.5, inputLRA: 0 };
    const r = LoudnormTwoPassService.assessLinearFeasibility(m, -16, -1.5, 11);
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.match(r.reason, /constant-level/);
      assert.equal(r.fallback, 'dynamic-prerender');
    }
  });

  it('feasibility rejects non-finite measurements with no fallback', () => {
    for (const m of [
      { inputI: -Infinity, inputTP: -3.5, inputLRA: 2.6 },
      { inputI: -9.2, inputTP: -Infinity, inputLRA: 2.6 },
      { inputI: -9.2, inputTP: -3.5, inputLRA: NaN },
    ]) {
      const r = LoudnormTwoPassService.assessLinearFeasibility(m, -16, -1.5, 11);
      assert.equal(r.ok, false, `expected infeasible: ${JSON.stringify(m)}`);
      if (!r.ok) {
        assert.match(r.reason, /degenerate/);
        assert.equal(r.fallback, null);
      }
    }
  });

  it('builds linear gain and measure filter strings', () => {
    const m = { inputI: -9.2, inputTP: -3.5, inputLRA: 2.6 };
    const lin = LoudnormTwoPassService.buildLinearGainFilter(-16, m);
    // Constant gain on the ebur128 basis: target - measured = -6.8dB.
    assert.equal(lin, 'volume=-6.80dB');
    const meas = LoudnormTwoPassService.buildMeasureFilter(-16, -1.5, 11);
    assert.equal(meas, 'ebur128=peak=true');
  });
});

describe('LoudnormTwoPassService - integration (synthetic fixtures)', () => {
  before(() => ensureFixtures());

  it('two-pass render completes on a 120s source with correct duration, sync and loudness', { timeout: 300_000 }, async () => {
    const project = buildProject(MODULATED_120S, 3.5);
    const graph = await ProEditorService.compileRenderGraphWithNormalization(
      project, MODULATED_120S, path.join(FIX_DIR, 'out-2pass.mp4'), FIX_DIR
    );
    const fc = graph.filterComplex.join(';');
    assert.match(fc, /volume=-?[\d.]+dB/, 'final graph must apply the measured linear gain');
    assert.doesNotMatch(fc, /measured_I=/, 'final graph must not carry loudnorm measured values');
    assert.equal(graph.normalizationMode, 'linear');
    assert.equal(graph.measurement, null, 'final compile is not a measurement probe');

    const outPath = path.join(FIX_DIR, 'out-2pass.mp4');
    await renderGraph(graph, outPath, 3.5);
    assert.ok(fs.existsSync(outPath));

    const d = await probeStreamDurations(outPath);
    assert.ok(Math.abs(d.video - 3.5) < 0.2, `video duration ${d.video} != 3.5`);
    assert.ok(Math.abs(d.audio - 3.5) < 0.2, `audio duration ${d.audio} != 3.5 (sync drift)`);

    // The render truncates to the first 3.5s of the 5.5s measured program; that
    // head is ~0.4 LU louder than the window average, so ebur128 lands ~-15.6,
    // not exactly -16. The same-window parity suite below asserts tight target
    // attainment where measurement and render windows match.
    const loud = await integratedLoudness(outPath);
    assert.ok(loud > -16.3 && loud < -15.0, `integrated loudness ${loud} LUFS outside [-16.3,-15.0]`);
  });

  it('two-pass loudness matches one-pass on a short source where both complete', { timeout: 300_000 }, async () => {
    // Small-resolution sources: one-pass loudnorm's whole-input buffering stalls the
    // muxer and queues decoded frames; at 1920x1080 even a 15s source can OOM under
    // the sandbox cap (observed). 480x270 keeps the one-pass reference renderable so
    // the loudness comparison tests semantics, not memory headroom.
    const project = buildProject(MODULATED_SMALL, 3.5, BROLL_SMALL);
    const onePassGraph = ProEditorService.compileRenderGraph(project, MODULATED_SMALL, path.join(FIX_DIR, 'out-1pass.mp4'), FIX_DIR);
    assert.ok(onePassGraph.filterComplex.join(';').includes('loudnorm=I=-16:TP=-2.0:LRA=11,'), 'legacy compile keeps one-pass loudnorm');
    assert.equal(onePassGraph.measurement, null, 'legacy compile has no measurement probe');
    const twoPassGraph = await ProEditorService.compileRenderGraphWithNormalization(
      project, MODULATED_SMALL, path.join(FIX_DIR, 'out-2pass-short.mp4'), FIX_DIR
    );
    const out1 = path.join(FIX_DIR, 'out-1pass.mp4');
    const out2 = path.join(FIX_DIR, 'out-2pass-short.mp4');
    await renderGraph(onePassGraph, out1, 3.5);
    await renderGraph(twoPassGraph, out2, 3.5);
    const l1 = await integratedLoudness(out1);
    const l2 = await integratedLoudness(out2);
    // Dynamic (one-pass) and linear (two-pass) normalization legitimately differ;
    // they must still land close on steady program material.
    assert.ok(Math.abs(l1 - l2) <= 2.0, `one-pass ${l1} vs two-pass ${l2} differ by >2 LU`);
  });

  it('silent dialogue renders without normalization instead of aborting export', { timeout: 120_000 }, async () => {
    const project = buildProject(SILENT_10S, 3.5);
    const out = path.join(FIX_DIR, 'out-silent.mp4');
    const graph = await ProEditorService.compileRenderGraphWithNormalization(project, SILENT_10S, out, FIX_DIR);
    assert.equal(graph.normalizationMode, 'skipped-silent');
    assert.ok(!graph.filterComplex.join(';').includes('loudnorm='));
    await renderGraph(graph, out, 3.5);
    assert.ok(fs.statSync(out).size > 0);
  });

  it('hot quiet dialogue (linear-infeasible) renders via pre-rendered dynamic fallback', { timeout: 300_000 }, async () => {
    // Quiet program with loud clicks: measured TP ~0dBTP, so linear gain to -16
    // would overshoot the -2.0dBTP pre-encode ceiling. Legacy one-pass handled this class
    // via dynamic limiting; the fallback must reproduce it without an in-graph
    // one-pass loudnorm (which stalls the muxer and OOMs long renders).
    const project = {
      user_id: 'loudnorm-2pass-test',
      canvas: { width: 1080, height: 1920, aspect_ratio: '9:16', fps: 30, duration: 4 },
      tracks: [
        {
          type: 'VIDEO', name: 'Main',
          items: [
            { id: 's1', name: 's1', timeline_start: 0, timeline_end: 4, source_start: 0, source_end: 4, source_path: HOT_QUIET,
              audio: { volume: 1.0, fade_in: 0.1, fade_out: 0.1, normalized: true, target_lufs: -16 } },
          ],
        },
      ],
    } as any;

    const legacy = ProEditorService.compileRenderGraph(project, HOT_QUIET, path.join(FIX_DIR, 'out-hotquiet-1pass.mp4'), FIX_DIR);
    const graph = await ProEditorService.compileRenderGraphWithNormalization(
      project, HOT_QUIET, path.join(FIX_DIR, 'out-hotquiet-2pass.mp4'), FIX_DIR
    );
    assert.equal(graph.normalizationMode, 'dynamic-prerendered');
    assert.ok(
      graph.filterComplex.some((s) => /\[\d+:a\]anull\[dialogue_proc\]/.test(s)),
      'dialogue must come from the pre-rendered WAV input'
    );

    const out1 = path.join(FIX_DIR, 'out-hotquiet-1pass.mp4');
    const out2 = path.join(FIX_DIR, 'out-hotquiet-2pass.mp4');
    await renderGraph(legacy, out1, 4);
    await renderGraph(graph, out2, 4);

    const d = await probeStreamDurations(out2);
    assert.ok(Math.abs(d.video - 4) < 0.2, `video duration ${d.video} != 4`);
    assert.ok(Math.abs(d.audio - 4) < 0.2, `audio duration ${d.audio} != 4 (sync drift)`);

    const l1 = await integratedLoudness(out1);
    const l2 = await integratedLoudness(out2);
    assert.ok(Math.abs(l1 - l2) <= 1.0, `fallback ${l2} LUFS must match legacy one-pass ${l1} LUFS within 1 LU`);
  });

  it('single-slice projects measure through the caller input-seek window', { timeout: 120_000 }, async () => {
    const project = buildProject(MODULATED_SMALL, 3.5, BROLL_SMALL);
    project.tracks = [project.tracks[0]];
    project.tracks[0].items = [project.tracks[0].items[0]];
    const graph = await ProEditorService.compileRenderGraphWithNormalization(
      project, MODULATED_SMALL, path.join(FIX_DIR, 'out-single.mp4'), FIX_DIR, undefined,
      ['-ss', '0', '-t', '3.5']
    );
    assert.match(graph.filterComplex.join(';'), /volume=-?[\d.]+dB/);
    const outPath = path.join(FIX_DIR, 'out-single.mp4');
    await execFileAsync(ffmpegBin, [
      '-y', '-v', 'error', '-ss', '0', '-t', '3.5',
      ...graph.inputArgs,
      '-filter_complex', graph.filterComplex.join(';'),
      '-map', graph.videoMap, '-map', graph.audioMap,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-c:a', 'aac',
      '-t', '3.5', outPath,
    ], { timeout: 120_000, maxBuffer: 64 * 1024 * 1024 });
    const d = await probeStreamDurations(outPath);
    assert.ok(Math.abs(d.video - 3.5) < 0.2 && Math.abs(d.audio - 3.5) < 0.2, 'single-slice durations must match the seek window');
  });
});

describe('LoudnormTwoPassService - same-window preview/final parity (codified)', () => {
  before(() => ensureFixtures());

  async function truePeakDb(file: string): Promise<number> {
    const r = await execFileAsync(
      ffmpegBin,
      ['-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
      { maxBuffer: 64 * 1024 * 1024 }
    ).catch((e) => e);
    const summary = (r.stderr as string).slice((r.stderr as string).lastIndexOf('Summary:'));
    const m = /True peak:\s*\n\s*Peak:\s+(-?(?:\d+(?:\.\d+)?|inf))\s+dBFS/.exec(summary);
    assert.ok(m, 'ebur128 summary must report true peak');
    return Number(m[1]);
  }

  const parityProject = (src: string, dur: number, preset: any) =>
    ({
      user_id: 'loudnorm-parity-test',
      canvas: { width: 1080, height: 1920, aspect_ratio: '9:16', fps: 30, duration: dur },
      tracks: [
        {
          type: 'VIDEO',
          name: 'Main',
          items: [
            {
              id: 's1', name: 's1', timeline_start: 0, timeline_end: dur,
              source_start: 0, source_end: dur, source_path: src,
              audio: { volume: 1.0, fade_in: 0.1, fade_out: 0.1, enhancement: preset },
            },
          ],
        },
      ],
    }) as any;

  it('linear-feasible program: final attains the target on the ebur128 basis and preview matches', { timeout: 300_000 }, async () => {
    const preset = AudioEnhancementService.getPresetConfig('clean');
    const targetI = AudioEnhancementService.resolveTargetLufs(preset);
    const dur = 4;
    const outPath = path.join(FIX_DIR, 'parity-codified-feasible.mp4');
    const graph = await ProEditorService.compileRenderGraphWithNormalization(
      parityProject(MODULATED_SMALL, dur, preset), MODULATED_SMALL, outPath, FIX_DIR
    );
    assert.equal(graph.normalizationMode, 'linear');
    await renderGraph(graph, outPath, dur);
    const preview = await AudioEnhancementService.generatePreviewSnippet(MODULATED_SMALL, preset, 0, dur);

    // Both outputs are exactly `dur` seconds of the same program: whole-file
    // ebur128 metering is a same-window comparison, so target attainment is
    // asserted tightly (gain rounding <=0.005dB + AAC + 0.1s edge fades).
    const finalI = await integratedLoudness(outPath);
    const previewI = await integratedLoudness(preview.preview_audio_path);
    assert.ok(
      Math.abs(finalI - targetI) <= 0.4,
      `final ${finalI} LUFS must attain ${targetI} within 0.4 LU on the ebur128 basis`
    );
    assert.ok(
      Math.abs(previewI - targetI) <= 0.4,
      `preview ${previewI} LUFS must attain ${targetI} within 0.4 LU on the ebur128 basis`
    );
    assert.ok(
      Math.abs(finalI - previewI) <= 0.5,
      `final ${finalI} vs preview ${previewI} differ by >0.5 LU`
    );
  });

  it('linear-infeasible program: both paths take the dynamic fallback, stay consistent, never clip', { timeout: 300_000 }, async () => {
    const preset = AudioEnhancementService.getPresetConfig('clean');
    const dur = 4;
    const outPath = path.join(FIX_DIR, 'parity-codified-infeasible.mp4');
    const graph = await ProEditorService.compileRenderGraphWithNormalization(
      parityProject(HOT_QUIET, dur, preset), HOT_QUIET, outPath, FIX_DIR
    );
    assert.equal(graph.normalizationMode, 'dynamic-prerendered');
    await renderGraph(graph, outPath, dur);
    const preview = await AudioEnhancementService.generatePreviewSnippet(HOT_QUIET, preset, 0, dur);

    // Preview and final now share the exact same bounded one-pass pre-render
    // (renderNormalizedDialogue with identical window args and chain). Measured
    // delta on this fixture: 0.20 LU (was 1.2-1.3 when the preview kept its own
    // differently-bounded one-pass loudnorm). The residual's cause is not
    // isolated; AAC container differences are a candidate, not proven.
    // 0.5 LU tolerance catches a regression to path divergence without being
    // loose enough to mask one. True-peak ceiling: normalization holds
    // <= -2.0dBTP pre-encode (fallback loudnorm TP=-2.0; linear feasibility
    // bounds gained TP to <= -2.0), so with up to 0.5dB upward AAC encode
    // overshoot the delivered output stays <= -1.5dBTP. (-2.0 + 0.5 = -1.5;
    // upward overshoot demands MORE negative pre-encode headroom, not less.)
    const finalI = await integratedLoudness(outPath);
    const previewI = await integratedLoudness(preview.preview_audio_path);
    console.log(`[parity] dynamic fallback final=${finalI.toFixed(2)} preview=${previewI.toFixed(2)} delta=${Math.abs(finalI - previewI).toFixed(3)} LU`);
    assert.ok(
      Math.abs(finalI - previewI) <= 0.5,
      `final ${finalI} vs preview ${previewI} differ by >0.5 LU on dynamic fallback (paths diverged again?)`
    );
    assert.ok(
      (await truePeakDb(outPath)) <= -1.5,
      'dynamic fallback must hold the -1.5dBTP post-encode ceiling (-2.0dBTP pre-encode + 0.5dB codec overshoot)'
    );
  });
});
