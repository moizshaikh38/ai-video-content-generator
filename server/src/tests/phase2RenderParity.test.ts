import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

import { ProEditorService } from '../services/proEditorService.js';
import { ClipRenderService, buildCropFilter } from '../services/clipRenderService.js';
import { renderObjectKey } from '../services/objectStorageService.js';
import { ClipRecord, EditorProject, EditorTrackItem, ReframeKeyframe } from '../types/index.js';
import ffmpegStatic from 'ffmpeg-static';

/**
 * Phase 2 — render-path parity and output validation (audit findings H-1, M-1).
 */

const makeVideoItem = (over: Partial<EditorTrackItem> & { id: string; source_start: number; source_end: number }): EditorTrackItem =>
  ({
    type: 'VIDEO',
    timeline_start: over.source_start,
    timeline_end: over.source_end,
    transform: { position_x: 0, position_y: 0, scale: 1.0, rotation: 0, opacity: 1.0 },
    speed: { speed: 1.0, pitch_preserved: true },
    effects: [],
    keyframes: [],
    locked: false,
    muted: false,
    hidden: false,
    z_index: 0,
    ...over,
  }) as EditorTrackItem;

const makeProject = (items: EditorTrackItem[]): EditorProject =>
  ({
    id: 'proj-1',
    user_id: '11111111-1111-4111-8111-111111111111',
    project_id: 'p',
    clip_id: 'c',
    version: 1,
    status: 'editing',
    title: 'parity test',
    canvas: { width: 1080, height: 1920, fps: 30, aspect_ratio: '9:16', duration: 4 },
    tracks: [{ id: 'v1', type: 'VIDEO', name: 'V1', locked: false, muted: false, hidden: false, items }],
    playhead: 0,
    settings: { snapping: false, safe_guides: false, snap_tolerance_sec: 0.1 },
  }) as unknown as EditorProject;

const reframeContext = (over: Record<string, unknown> = {}) =>
  ({
    aspectRatio: '9:16',
    cropConfig: null,
    clipStartSec: 0,
    mode: 'fallback_center',
    layoutMode: 'track',
    track: null,
    ...over,
  }) as any;

describe('Phase 2 — per-slice crop parity in compileRenderGraph', () => {
  const dynamicTrack = {
    status: 'ready',
    layout_mode: 'track',
    source_width: 1920,
    source_height: 1080,
    detected_face_count: 2,
    dominant_track_id: 'face-1',
    isStale: false,
    smoothed_keyframes: [
      { time: 0, centerX: 0.3, centerY: 0.38 },
      { time: 1, centerX: 0.7, centerY: 0.38 },
      { time: 2, centerX: 0.3, centerY: 0.38 },
      { time: 3, centerX: 0.7, centerY: 0.38 },
      { time: 4, centerX: 0.3, centerY: 0.38 },
    ],
  } as any;

  it('applies per-item manual crop instead of a canvas-wide static crop', () => {
    const project = makeProject([
      makeVideoItem({ id: 'a', source_start: 0, source_end: 2, crop: { mode: 'custom', focusX: 0.2, focusY: 0.5 } }),
      makeVideoItem({ id: 'b', source_start: 2, source_end: 4 }),
    ]);
    const graph = ProEditorService.compileRenderGraph(project, '/tmp/src.mp4', '/tmp/out.mp4', os.tmpdir(), reframeContext());

    const sliceA = graph.filterComplex.find((l) => l.includes('[v_slice_0]'))!;
    const sliceB = graph.filterComplex.find((l) => l.includes('[v_slice_1]'))!;
    assert.match(sliceA, /\(in_w-out_w\)\*0\.2/);
    assert.doesNotMatch(sliceB, /\(in_w-out_w\)\*0\.2/);
    assert.match(sliceB, /crop=1080:1920/);
  });

  it('applies per-item styling so the second item is not styled by the first', () => {
    const project = makeProject([
      makeVideoItem({ id: 'a', source_start: 0, source_end: 2, filter: { preset: 'warm' } as any }),
      makeVideoItem({ id: 'b', source_start: 2, source_end: 4 }),
    ]);
    const graph = ProEditorService.compileRenderGraph(project, '/tmp/src.mp4', '/tmp/out.mp4', os.tmpdir(), reframeContext());

    const sliceA = graph.filterComplex.find((l) => l.includes('[v_slice_0]'))!;
    const sliceB = graph.filterComplex.find((l) => l.includes('[v_slice_1]'))!;
    assert.match(sliceA, /colorbalance/);
    assert.doesNotMatch(sliceB, /colorbalance/);
  });

  it('rebases clip-relative reframe keyframes into slice-local time per slice', () => {
    const project = makeProject([
      makeVideoItem({ id: 'a', source_start: 0, source_end: 2 }),
      makeVideoItem({ id: 'b', source_start: 2, source_end: 4 }),
    ]);
    const graph = ProEditorService.compileRenderGraph(
      project,
      '/tmp/src.mp4',
      '/tmp/out.mp4',
      os.tmpdir(),
      reframeContext({ mode: 'smart', layoutMode: 'track', track: dynamicTrack })
    );

    const sliceA = graph.filterComplex.find((l) => l.includes('[v_slice_0]'))!;
    const sliceB = graph.filterComplex.find((l) => l.includes('[v_slice_1]'))!;
    // Both slices carry a dynamic camera expression (piecewise if/lte form) rather
    // than one static crop. Slice B (source 2..4s) must START at the position of the
    // last keyframe before its window (kf t=1, centerX 0.7) — the rebase proof.
    assert.match(sliceA, /lte\(t/);
    assert.match(sliceB, /lte\(t/);
    assert.match(sliceA, /0\.3000\+\(0\.4000\)/);
    assert.match(sliceB, /0\.7000\+\(-0\.4000\)/);
  });

  it('extends boundary keyframes so slice windows are fully covered without duplicate times', () => {
    const sparseTrack = {
      ...dynamicTrack,
      smoothed_keyframes: [
        { time: 1, centerX: 0.4, centerY: 0.38 },
        { time: 3, centerX: 0.6, centerY: 0.38 },
      ],
    } as any;
    const project = makeProject([
      makeVideoItem({ id: 'a', source_start: 0, source_end: 2 }),
      makeVideoItem({ id: 'b', source_start: 2, source_end: 4 }),
    ]);
    const graph = ProEditorService.compileRenderGraph(
      project,
      '/tmp/src.mp4',
      '/tmp/out.mp4',
      os.tmpdir(),
      reframeContext({ mode: 'smart', layoutMode: 'track', track: sparseTrack })
    );

    // No duplicate keyframe times: a time 0 kf appears once per slice expression.
    for (const line of graph.filterComplex.filter((l) => l.includes('[v_slice_'))) {
      const times = [...line.matchAll(/between\(t,([0-9.]+)/g)].map((m) => m[1]);
      assert.equal(new Set(times).size, times.length, `duplicate keyframe times in slice line: ${line}`);
    }
  });

  it('title cards carry no crop and single-slice renders use the clip-level reframe decision', () => {
    const card = makeVideoItem({ id: 'card', source_start: 0, source_end: 1, is_title_card: true } as any);
    const video = makeVideoItem({ id: 'v', source_start: 0, source_end: 2 });
    const project = makeProject([card, video]);
    const graph = ProEditorService.compileRenderGraph(
      project,
      '/tmp/src.mp4',
      '/tmp/out.mp4',
      os.tmpdir(),
      reframeContext({ mode: 'smart', layoutMode: 'track', track: dynamicTrack })
    );

    const cardLine = graph.filterComplex.find((l) => l.includes('[tc_v_0]'))!;
    assert.doesNotMatch(cardLine, /crop=/);
    // Single-slice branch: whole-clip framing from the shared decision.
    const single = makeProject([makeVideoItem({ id: 'only', source_start: 0, source_end: 4 })]);
    const singleGraph = ProEditorService.compileRenderGraph(
      single,
      '/tmp/src.mp4',
      '/tmp/out.mp4',
      os.tmpdir(),
      reframeContext({ mode: 'smart', layoutMode: 'track', track: dynamicTrack })
    );
    assert.ok(singleGraph.filterComplex.some((l) => /lte\(t/.test(l)));
  });

  it('falls back to center crop when no reframe context is provided (legacy behavior)', () => {
    const project = makeProject([makeVideoItem({ id: 'a', source_start: 0, source_end: 4 })]);
    const graph = ProEditorService.compileRenderGraph(project, '/tmp/src.mp4', '/tmp/out.mp4', os.tmpdir());
    assert.match(graph.filterComplex.join('\n'), /crop=1080:1920/);
  });

  it('quick and pro center-crop derivation agree on the canonical filter', () => {
    assert.equal(buildCropFilter('9:16', { focusX: 0.5, focusY: 0.5 }), buildCropFilter('9:16', { focusX: 0.5, focusY: 0.5 }));
  });
});

describe('Phase 2 — post-render output validation gate', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase2-validate-'));
  const renderClip = async (args: string[], name: string): Promise<string> => {
    const out = path.join(tmpDir, name);
    await execFileAsync(ffmpegStatic as unknown as string, ['-y', ...args, out], { timeout: 60000 });
    return out;
  };
  const AV = ['-f', 'lavfi', '-i', 'testsrc=duration=0.5:size=320x240:rate=15', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.5', '-shortest'];
  const VIDEO_ONLY = ['-f', 'lavfi', '-i', 'testsrc=duration=0.5:size=320x240:rate=15', '-an'];

  it('accepts a valid render with matching streams and duration', async () => {
    const file = await renderClip([...AV, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac'], 'ok.mp4');
    await assert.doesNotReject(() => ClipRenderService.validateRenderedOutput(file, 0.5, { expectAudio: true }));
  });

  it('rejects output missing the expected audio stream', async () => {
    const file = await renderClip([...VIDEO_ONLY, '-c:v', 'libx264', '-pix_fmt', 'yuv420p'], 'silent.mp4');
    await assert.rejects(
      () => ClipRenderService.validateRenderedOutput(file, 0.5, { expectAudio: true }),
      (err: any) => err.code === 'OUTPUT_VALIDATION_FAILED' && /audio/.test(err.message)
    );
  });

  it('rejects output whose duration drifts beyond 0.5s of the requested render duration', async () => {
    const file = await renderClip([...AV, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac'], 'short.mp4');
    await assert.rejects(
      () => ClipRenderService.validateRenderedOutput(file, 5, { expectAudio: true }),
      (err: any) => err.code === 'OUTPUT_VALIDATION_FAILED' && /duration/.test(err.message)
    );
  });

  it('tolerates muted clips (no audio expected) and unavailable probes', async () => {
    const file = await renderClip([...VIDEO_ONLY, '-c:v', 'libx264', '-pix_fmt', 'yuv420p'], 'muted.mp4');
    await assert.doesNotReject(() => ClipRenderService.validateRenderedOutput(file, 0.5, { expectAudio: false }));
    // Missing file: probe fails, gate degrades to a warning instead of throwing.
    await assert.doesNotReject(() => ClipRenderService.validateRenderedOutput(path.join(tmpDir, 'missing.mp4'), 0.5, { expectAudio: true }));
  });
});

describe('Phase 2 — output key idempotency on retry', () => {
  it('derives the output key from the clip render version, not the job attempt', () => {
    const key = renderObjectKey('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 3);
    assert.equal(key, renderObjectKey('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 3));
    assert.match(key, /v3\/render\.mp4$/);
  });

  it('renderClipJob keys the upload off clip.render_version (stable across job retries)', () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), 'src/services/clipRenderService.ts'), 'utf8');
    assert.match(src, /renderObjectKey\(clip\.user_id, clip\.project_id, clip\.id, renderVersion\)/);
    assert.match(src, /const renderVersion = Number\(clip\.render_version \|\| 1\)/);
  });
});

describe('Phase 2 — service wiring guards', () => {
  const renderSource = fs.readFileSync(path.resolve(process.cwd(), 'src/services/clipRenderService.ts'), 'utf8');

  it('both render paths share one reframing decision', () => {
    assert.match(renderSource, /resolveReframeDecision\(clip, durationSec\)/);
    assert.match(renderSource, /clipStartSec: startSec/);
  });

  it('the output gate runs before the upload stage', () => {
    const gateIdx = renderSource.indexOf('validateRenderedOutput(outputPath, expectedDurationSec');
    const uploadIdx = renderSource.indexOf("updateJobStage(jobId, clipId, 'uploading'");
    assert.ok(gateIdx > 0 && uploadIdx > gateIdx, 'validation gate must precede upload');
  });
});
