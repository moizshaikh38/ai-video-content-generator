/**
 * Export resolution tiers (720p..4K): tier math, source-capability gating, and
 * real ffmpeg executions of every geometry builder at the 4K canvas scale to
 * prove the filter graphs produce the requested frame size from a native 4K
 * source (not a post-hoc stretch).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  canvasForResolution,
  canvasDims,
  parseRenderResolution,
  parseRenderResolutionStrict,
  renderScale,
  resolveEffectiveResolution,
} from '../shared/renderResolution.js';
import { ClipRenderService, buildCropFilter, buildFitFilter, buildBlurFitChain, composeQuickVideoGraph } from '../services/clipRenderService.js';
import { SmartReframeService } from '../services/smartReframeService.js';

test('tier dimensions per aspect', () => {
  assert.deepEqual(canvasForResolution('9:16', '2160p'), { width: 2160, height: 3840 });
  assert.deepEqual(canvasForResolution('9:16', '1440p'), { width: 1440, height: 2560 });
  assert.deepEqual(canvasForResolution('9:16', '1080p'), { width: 1080, height: 1920 });
  assert.deepEqual(canvasForResolution('9:16', '720p'), { width: 720, height: 1280 });
  assert.deepEqual(canvasForResolution('16:9', '2160p'), { width: 3840, height: 2160 });
  assert.deepEqual(canvasForResolution('1:1', '2160p'), { width: 2160, height: 2160 });
  assert.equal(renderScale('2160p'), 2);
});

test('parsing: aliases, default, strict rejection', () => {
  assert.equal(parseRenderResolution('4K'), '2160p');
  assert.equal(parseRenderResolution(undefined), '1080p');
  assert.equal(parseRenderResolution('garbage'), '1080p');
  assert.equal(parseRenderResolutionStrict('garbage'), null);
  assert.equal(parseRenderResolutionStrict('2160p'), '2160p');
});

test('legacy 1080p scale-1 filters are unchanged', () => {
  assert.equal(buildCropFilter('9:16'), 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920');
  assert.equal(
    buildCropFilter('16:9', { focusX: 0.3, focusY: 0.5 }),
    'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080:(in_w-out_w)*0.3:(in_h-out_h)*0.5'
  );
  assert.equal(
    buildFitFilter('9:16'),
    'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black'
  );
});

test('requested tier is always honored; interpolation is reported, not hidden', () => {
  const fourK = resolveEffectiveResolution('2160p', '9:16', 3840, 2160);
  assert.equal(fourK.effective, '2160p');
  assert.equal(fourK.height, 3840);
  assert.equal(fourK.upscaleFactor, 1.778);
  assert.match(fourK.warning || '', /interpolated about 1\.78x/);
  const hd = resolveEffectiveResolution('2160p', '9:16', 1920, 1080);
  assert.equal(hd.effective, '2160p');
  assert.equal(hd.width, 2160);
  assert.equal(hd.upscaleFactor, 3.556);
  assert.match(hd.warning || '', /1920x1080/);
  // landscape 4K from 4K source is fully native
  const native = resolveEffectiveResolution('2160p', '16:9', 3840, 2160);
  assert.equal(native.upscaleFactor, 1);
  assert.equal(native.warning, undefined);
  // 1080p from a 4K source is a downscale: no warning
  assert.equal(resolveEffectiveResolution('1080p', '9:16', 3840, 2160).warning, undefined);
  // unknown source keeps the request, no claim either way
  const unk = resolveEffectiveResolution('2160p', '9:16', null, null);
  assert.equal(unk.effective, '2160p');
  assert.equal(unk.upscaleFactor, null);
});

const ffmpegOk = spawnSync('ffmpeg', ['-version']).status === 0;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'res-'));
const src = path.join(tmp, 'src4k.mp4');

function probe(file: string): { w: number; h: number } {
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', file]).toString().trim();
  const [w, h] = out.split('x').map(Number);
  return { w, h };
}

function run(name: string, chain: string[], expect: { w: number; h: number }) {
  const g = composeQuickVideoGraph(chain);
  const out = path.join(tmp, `${name}.mp4`);
  const r = spawnSync('ffmpeg', ['-nostdin', '-y', '-i', src, '-filter_complex', g.graph, '-map', '[out_v]', '-frames:v', '2', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', out], { encoding: 'utf8' });
  assert.equal(r.status, 0, `${name} failed: ${(r.stderr || '').slice(-600)}`);
  assert.deepEqual(probe(out), expect, name);
}

test('4K graphs execute and yield 2160x3840 for every geometry builder', { skip: !ffmpegOk, timeout: 180000 }, () => {
  execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc2=size=3840x2160:rate=5:duration=1', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', src]);
  const S = 2;
  const want = { w: 2160, h: 3840 };
  const kfs = [
    { time: 0, centerX: 0.3, centerY: 0.5 },
    { time: 0.5, centerX: 0.6, centerY: 0.5 },
    { time: 1, centerX: 0.5, centerY: 0.5 },
  ];
  run('center', [buildCropFilter('9:16', undefined, S)], want);
  run('manual', [buildCropFilter('9:16', { focusX: 0.2, focusY: 0.4 }, S)], want);
  run('zoom', [buildCropFilter('9:16', { focusX: 0.5, focusY: 0.5, scale: 1.5 }, S)], want);
  run('fit', [buildFitFilter('9:16', 1, 0.5, 0.5, S)], want);
  run('fitzoom', [buildFitFilter('9:16', 1.4, 0.5, 0.5, S)], want);
  run('blurfit', [buildBlurFitChain('9:16', 1, 'vcb', S)], want);
  run('track', [SmartReframeService.buildLayoutCropFilter({ layoutMode: 'track', aspectRatio: '9:16', keyframes: kfs, sourceWidth: 3840, sourceHeight: 2160, duration: 1, canvasScale: S })], want);
  run('blurlayout', [SmartReframeService.buildLayoutCropFilter({ layoutMode: 'blur', aspectRatio: '9:16', keyframes: kfs, sourceWidth: 3840, sourceHeight: 2160, duration: 1, canvasScale: S })], want);
  run('split', [SmartReframeService.buildLayoutCropFilter({ layoutMode: 'split', aspectRatio: '9:16', keyframes: kfs, sourceWidth: 3840, sourceHeight: 2160, duration: 1, speaker1X: 0.25, speaker2X: 0.75, canvasScale: S })], want);
  for (const mode of ['split_stacked', 'circular_inset', 'rounded_card_inset'] as const) {
    for (const background of ['black', 'blur'] as const) {
      run(`screencast_${mode}_${background}`, [SmartReframeService.buildLayoutCropFilter({ layoutMode: 'screencast', aspectRatio: '9:16', keyframes: kfs, sourceWidth: 3840, sourceHeight: 2160, duration: 1, screencastMode: mode, screencastBackground: background, canvasScale: S })], want);
    }
  }
  run('group', [SmartReframeService.buildLayoutCropFilter({ layoutMode: 'track', aspectRatio: '9:16', keyframes: kfs, sourceWidth: 3840, sourceHeight: 2160, duration: 1, groupFrame: { keyframes: kfs, windowW: 0.6 }, canvasScale: S })], want);
  // 16:9 and 1:1 at 4K
  run('wide', [buildCropFilter('16:9', undefined, S)], { w: 3840, h: 2160 });
  run('square', [buildCropFilter('1:1', { focusX: 0.4, focusY: 0.5 }, S)], { w: 2160, h: 2160 });
  assert.deepEqual(canvasDims('9:16', 1.5), { width: 1620, height: 2880 });
});

test('pro editor graph compiles at 4K and renders 2160x3840 end to end', { skip: !ffmpegOk, timeout: 240000 }, async () => {
  const { ProEditorService } = await import('../services/proEditorService.js');
  const av = path.join(tmp, 'src4k_av.mp4');
  execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc2=size=3840x2160:rate=10:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-shortest', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', av]);
  const item = (id: string, a: number, b: number, extra: any = {}): any => ({
    id, type: 'VIDEO', source_start: a, source_end: b, timeline_start: a, timeline_end: b,
    transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
    speed: { speed: 1, pitch_preserved: true }, effects: [], keyframes: [], locked: false, muted: false, hidden: false, z_index: 0, ...extra,
  });
  const project: any = {
    id: 'p', user_id: 'u', project_id: 'p', clip_id: 'c', version: 1, status: 'editing', title: 't',
    canvas: { width: 1080, height: 1920, fps: 10, aspect_ratio: '9:16', duration: 2 },
    tracks: [{ id: 'v1', type: 'VIDEO', name: 'V1', locked: false, muted: false, hidden: false, items: [item('a', 0, 1), item('b', 1, 2, { crop: { mode: 'blur', scale: 1 } })] }],
    playhead: 0, settings: { snapping: false, safe_guides: false, snap_tolerance_sec: 0.1 },
  };
  const track: any = {
    status: 'ready', layout_mode: 'track', source_width: 3840, source_height: 2160, detected_face_count: 1, dominant_track_id: 'f', isStale: false,
    smoothed_keyframes: [{ time: 0, centerX: 0.3, centerY: 0.4 }, { time: 1, centerX: 0.6, centerY: 0.4 }, { time: 2, centerX: 0.4, centerY: 0.4 }],
  };
  for (const [scale, w, h] of [[1, 1080, 1920], [2, 2160, 3840]] as const) {
    const graph = ProEditorService.compileRenderGraph(project, av, path.join(tmp, 'p.mp4'), tmp, {
      aspectRatio: '9:16', cropConfig: null, clipStartSec: 0, mode: 'smart', layoutMode: 'track', track, canvasScale: scale,
    } as any);
    assert.deepEqual(graph.canvas, { width: w, height: h });
    const out = path.join(tmp, `pro${scale}.mp4`);
    const r = spawnSync('ffmpeg', ['-nostdin', '-y', ...graph.inputArgs, '-filter_complex', graph.filterComplex.join(';'), '-map', graph.videoMap, '-map', graph.audioMap, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-t', '2', out], { encoding: 'utf8' });
    assert.equal(r.status, 0, (r.stderr || '').slice(-800));
    assert.deepEqual(probe(out), { w, h });
  }
});

// Regression: stream_side_data is not a valid show_entries section on the
// deployed ffprobe build. A swallowed probe error hid all source dimensions.
test('actual source dimension probe returns decoded frame size', async () => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vc-source-probe-'));
 const file=path.join(dir,'tiny.mp4');
 try {
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=s=854x480:d=0.1','-frames:v','1','-c:v','libx264','-threads','1','-y',file],{timeout:10000});
  assert.deepEqual(await ClipRenderService.probeSourceDimensions(file),{width:854,height:480});
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
