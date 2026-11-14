import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { ProEditorService } from '../services/proEditorService.js';
import { EditorProject, EditorTrackItem } from '../types/index.js';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';
const ffprobeBin = ffmpegBin.replace(/ffmpeg$/, 'ffprobe');

const makeItem = (
  over: Partial<EditorTrackItem> & { id: string; timeline_start: number; timeline_end: number; source_start: number; source_end: number }
): EditorTrackItem =>
  ({
    type: 'VIDEO',
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

const makeProject = (items: EditorTrackItem[], duration: number): EditorProject =>
  ({
    id: 'p1b',
    user_id: '11111111-1111-4111-8111-111111111111',
    project_id: 'p',
    clip_id: 'c',
    version: 1,
    status: 'editing',
    title: 'P1B',
    canvas: { width: 320, height: 568, fps: 30, aspect_ratio: '9:16', duration },
    tracks: [{ id: 'v1', type: 'VIDEO', name: 'V1', locked: false, muted: false, hidden: false, items }],
    playhead: 0,
    settings: { snapping: false, safe_guides: false, snap_tolerance_sec: 0.1 },
  }) as unknown as EditorProject;

const render = async (project: EditorProject, sourcePath: string, name: string): Promise<string> => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p1b-crop-'));
  const out = path.join(tmpDir, name);
  const graph = ProEditorService.compileRenderGraph(project, sourcePath, out, tmpDir);
  const args = [
    '-y',
    ...graph.inputArgs,
    '-filter_complex', graph.filterComplex.join(';'),
    '-map', graph.videoMap,
    '-map', graph.audioMap,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28',
    '-c:a', 'aac', '-b:a', '128k',
    out,
  ];
  await execFileAsync(ffmpegBin, args, { timeout: 120000 });
  return out;
};

describe('Phase 1b — crop focus override (compile + render)', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'p1b-media-'));
  const sourcePath = path.join(tmpRoot, 'src.mp4');
  let ready = false;

  it('prepares an asymmetric 4s source (left dark, right bright)', async () => {
    // Left half near-black, right half near-white, with motion so frames are not static.
    await execFileAsync(ffmpegBin, [
      '-y',
      '-f', 'lavfi', '-i', 'color=c=0x101010:size=320x240:rate=30:duration=4',
      '-f', 'lavfi', '-i', 'color=c=0xF0F0F0:size=320x240:rate=30:duration=4',
      '-f', 'lavfi', '-i', 'sine=frequency=330:duration=4',
      '-filter_complex', '[0:v][1:v]hstack[v]',
      '-map', '[v]', '-map', '2:a',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-shortest', sourcePath,
    ], { timeout: 120000 });
    ready = true;
  });

  it('clamps out-of-range focus values in the compiled crop filter', () => {
    const item = makeItem({
      id: 'a', timeline_start: 0, timeline_end: 2, source_start: 0, source_end: 2,
      crop: { mode: 'custom', focusX: 1.7, focusY: -0.4 } as any,
    });
    const graph = ProEditorService.compileRenderGraph(makeProject([item], 2), '/tmp/s.mp4');
    const text = graph.filterComplex.join('\n');
    const cropLine = text.split('\n').find((l) => /crop=/.test(l));
    assert.ok(cropLine, 'expected a crop filter in the graph');
    // focus 1.7 must clamp to 1.0 and -0.4 to 0.0: the crop x/y expressions must not
    // reference unclamped raw values.
    assert.doesNotMatch(cropLine!, /1\.7/);
    assert.doesNotMatch(cropLine!, /-0\.4/);
  });

  it('focus left vs right shifts the rendered window measurably; no override is stable', async () => {
    if (!ready) return;
    const base = { id: 'a', timeline_start: 0, timeline_end: 2, source_start: 0, source_end: 2 };
    const leftFile = await render(makeProject([makeItem({ ...base, crop: { mode: 'custom', focusX: 0.05, focusY: 0.5 } as any })], 2), sourcePath, 'left.mp4');
    const rightFile = await render(makeProject([makeItem({ ...base, crop: { mode: 'custom', focusX: 0.95, focusY: 0.5 } as any })], 2), sourcePath, 'right.mp4');
    const none1 = await render(makeProject([makeItem({ ...base })], 2), sourcePath, 'none1.mp4');
    const none2 = await render(makeProject([makeItem({ ...base })], 2), sourcePath, 'none2.mp4');

    // Different bytes between override extremes.
    assert.notDeepEqual(fs.readFileSync(leftFile), fs.readFileSync(rightFile), 'override extremes must differ');

    // Left-focus render should be darker overall (more of the dark half), right-focus brighter.
    const avg = async (f: string): Promise<number> => {
      const r = await execFileAsync(
        ffmpegBin,
        ['-i', f, '-vf', 'signalstats,metadata=print', '-f', 'null', '-'],
        { timeout: 60000, maxBuffer: 64 * 1024 * 1024 }
      ).catch((err) => err);
      const ys = [...String(r.stderr || '').matchAll(/signalstats\.YAVG=([\d.]+)/g)].map((m) => Number(m[1]));
      return ys.reduce((a, b) => a + b, 0) / ys.length;
    };
    const leftLuma = await avg(leftFile);
    const rightLuma = await avg(rightFile);
    assert.ok(rightLuma - leftLuma > 40, `expected right-focus much brighter (left=${leftLuma}, right=${rightLuma})`);

    // No override: two renders of the same graph are byte-identical (deterministic encoder input).
    assert.deepEqual(fs.readFileSync(none1), fs.readFileSync(none2), 'no-override renders must be byte-identical');
  });
});
