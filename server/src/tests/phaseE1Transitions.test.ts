import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
import ffmpegStatic from 'ffmpeg-static';

import { ProEditorService } from '../services/proEditorService.js';
import {
  TRANSITION_PRESETS,
  TRANSITION_PRESET_IDS,
  getTransitionPreset,
  resolveXfadeName,
  clampTransitionDuration,
} from '../shared/transitionPresets.js';
import { EditorProject, EditorTrackItem } from '../types/index.js';

/**
 * Platform Quality Roadmap E-1 — the editor must render what it previews:
 * transitions (xfade/acrossfade), per-slice playback speed, and timeline gaps.
 * Graph-level assertions cover every preset; real FFmpeg renders prove
 * executability per family plus speed and gap semantics.
 */

const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';

const makeItem = (over: Partial<EditorTrackItem> & { id: string; timeline_start: number; timeline_end: number; source_start: number; source_end: number }): EditorTrackItem =>
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
    id: 'e1',
    user_id: '11111111-1111-4111-8111-111111111111',
    project_id: 'p',
    clip_id: 'c',
    version: 1,
    status: 'editing',
    title: 'E1',
    canvas: { width: 320, height: 568, fps: 30, aspect_ratio: '9:16', duration },
    tracks: [{ id: 'v1', type: 'VIDEO', name: 'V1', locked: false, muted: false, hidden: false, items }],
    playhead: 0,
    settings: { snapping: false, safe_guides: false, snap_tolerance_sec: 0.1 },
  }) as unknown as EditorProject;

const render = async (project: EditorProject, sourcePath: string, name: string, expectedDuration: number): Promise<{ file: string; duration: number }> => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e1-transitions-'));
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
    '-t', expectedDuration.toFixed(2),
    out,
  ];
  await execFileAsync(ffmpegBin, args, { timeout: 120000 });
  const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', out], { timeout: 30000 });
  return { file: out, duration: Number.parseFloat(JSON.parse(stdout).format.duration) };
};

describe('E1 — transition preset registry', () => {
  it('defines the CapCut-style preset set with renderable xfade mappings', () => {
    assert.equal(TRANSITION_PRESETS.length >= 17, true);
    for (const preset of TRANSITION_PRESETS) {
      if (preset.id === 'cut') {
        assert.equal(resolveXfadeName(preset.id), null);
      } else {
        const resolved = resolveXfadeName(preset.id, preset.supportsDirection ? 'right' : undefined);
        assert.ok(resolved, `${preset.id} must resolve an xfade name`);
        assert.doesNotMatch(resolved, /\{/);
      }
    }
  });

  it('directional presets resolve per direction and non-directional ignore it', () => {
    assert.equal(resolveXfadeName('slide', 'right'), 'slideright');
    assert.equal(resolveXfadeName('slide', 'up'), 'slideup');
    assert.equal(resolveXfadeName('smooth_slide', 'down'), 'smoothdown');
    assert.equal(resolveXfadeName('wipe', 'left'), 'wipeleft');
    assert.equal(resolveXfadeName('blur', 'up'), 'hblur');
  });

  it('duration clamping enforces the shared bounds', () => {
    assert.equal(clampTransitionDuration(0.01), 0.2);
    assert.equal(clampTransitionDuration(9), 2.0);
    assert.equal(clampTransitionDuration(0.75), 0.75);
    assert.equal(clampTransitionDuration('garbage', 0.6), 0.6);
  });

  it('frontend re-exports the same registry (no preview/export preset drift)', async () => {
    const feSource = fs.readFileSync(path.resolve(process.cwd(), '../src/lib/transitionPresets.ts'), 'utf8');
    assert.match(feSource, /server\/src\/shared\/transitionPresets/);
    const feTypes = fs.readFileSync(path.resolve(process.cwd(), '../src/types/index.ts'), 'utf8');
    for (const id of TRANSITION_PRESET_IDS) {
      assert.ok(feTypes.includes(`'${id}'`), `frontend type union must include '${id}'`);
    }
  });
});

describe('E1 — compile graph emits xfade chains', () => {
  const items = (transitionIn: Partial<EditorTrackItem> | undefined): EditorTrackItem[] => [
    makeItem({ id: 'a', timeline_start: 0, timeline_end: 2, source_start: 0, source_end: 2 }),
    makeItem({
      id: 'b',
      timeline_start: 2,
      timeline_end: 4,
      source_start: 2,
      source_end: 4,
      ...(transitionIn ? { transition_in: { type: 'cross_dissolve', duration: 0.5 } as any, ...transitionIn } : {}),
    }),
  ];

  it('emits xfade + acrossfade only when a real transition exists', () => {
    const withTr = ProEditorService.compileRenderGraph(makeProject(items(undefined), 4), '/tmp/s.mp4');
    const text = withTr.filterComplex.join('\n');
    assert.doesNotMatch(text, /xfade=/);
    assert.match(text, /concat=n=2/);

    const without = ProEditorService.compileRenderGraph(
      makeProject([items({})[0], { ...items({})[1], transition_in: { type: 'dip_to_black', duration: 0.5 } as any }], 4),
      '/tmp/s.mp4'
    );
    const text2 = without.filterComplex.join('\n');
    assert.match(text2, /xfade=transition=fadeblack:duration=0\.500:offset=1\.500/);
    assert.match(text2, /acrossfade=d=0\.500/);
    assert.doesNotMatch(text2, /concat=n=2/);
  });

  it('hard-cut boundaries inside a transition timeline become single-frame crossfades', () => {
    const mixed = [
      makeItem({ id: 'a', timeline_start: 0, timeline_end: 2, source_start: 0, source_end: 2 }),
      makeItem({ id: 'b', timeline_start: 2, timeline_end: 4, source_start: 2, source_end: 4 }),
      makeItem({ id: 'c', timeline_start: 4, timeline_end: 6, source_start: 4, source_end: 6, transition_in: { type: 'zoom_lite', duration: 0.4 } as any }),
    ];
    const graph = ProEditorService.compileRenderGraph(makeProject(mixed, 6), '/tmp/s.mp4');
    const text = graph.filterComplex.join('\n');
    assert.match(text, /xfade=transition=zoomin/);
    // The cut boundary a→b: duration clamps to 1/fps ≈ 0.033.
    assert.match(text, /xfade=transition=fade:duration=0\.033/);
  });

  it('every non-cut preset produces its concrete xfade name in the graph', () => {
    for (const preset of TRANSITION_PRESETS) {
      if (preset.id === 'cut') continue;
      const project = makeProject([
        makeItem({ id: 'a', timeline_start: 0, timeline_end: 2, source_start: 0, source_end: 2 }),
        makeItem({
          id: 'b',
          timeline_start: 2,
          timeline_end: 4,
          source_start: 2,
          source_end: 4,
          transition_in: { type: preset.id as any, duration: 0.4, ...(preset.supportsDirection ? { direction: 'left' } : {}) } as any,
        }),
      ], 4);
      const graph = ProEditorService.compileRenderGraph(project, '/tmp/s.mp4');
      const expected = resolveXfadeName(preset.id, preset.supportsDirection ? 'left' : undefined)!;
      assert.match(
        graph.filterComplex.join('\n'),
        new RegExp(`xfade=transition=${expected}:`),
        `${preset.id} must emit xfade=${expected}`
      );
    }
  });
});

describe('E1 — speed and gap semantics in the graph', () => {
  it('applies setpts/atempo per slice for speed≠1 and chains out-of-range atempo', () => {
    const fast = [
      makeItem({ id: 'a', timeline_start: 0, timeline_end: 2, source_start: 0, source_end: 4, speed: { speed: 2.0, pitch_preserved: true } as any }),
      makeItem({ id: 'b', timeline_start: 2, timeline_end: 3, source_start: 4, source_end: 6, speed: { speed: 4.0, pitch_preserved: true } as any }),
    ];
    const graph = ProEditorService.compileRenderGraph(makeProject(fast, 3), '/tmp/s.mp4');
    const text = graph.filterComplex.join('\n');
    assert.match(text, /setpts=PTS\/2/);
    assert.match(text, /setpts=PTS\/4/);
    assert.match(text, /atempo=2/);
    assert.match(text, /atempo=2,atempo=2/); // 4x chained in-range stages
  });

  it('pads deliberate timeline gaps with black video and silence (cut path)', () => {
    const gapped = [
      makeItem({ id: 'a', timeline_start: 0, timeline_end: 2, source_start: 0, source_end: 2 }),
      makeItem({ id: 'b', timeline_start: 2.6, timeline_end: 4.6, source_start: 2, source_end: 4 }),
    ];
    const graph = ProEditorService.compileRenderGraph(makeProject(gapped, 4.6), '/tmp/s.mp4');
    const text = graph.filterComplex.join('\n');
    assert.match(text, /tpad=stop_duration=0\.600:color=black/);
    assert.match(text, /apad=pad_dur=0\.600/);
    // Gap-free timelines stay unpadded.
    const flush = [
      makeItem({ id: 'a', timeline_start: 0, timeline_end: 2, source_start: 0, source_end: 2 }),
      makeItem({ id: 'b', timeline_start: 2, timeline_end: 4, source_start: 2, source_end: 4 }),
    ];
    const text2 = ProEditorService.compileRenderGraph(makeProject(flush, 4), '/tmp/s.mp4').filterComplex.join('\n');
    assert.doesNotMatch(text2, /tpad=/);
  });
});

describe('E1 — real FFmpeg renders (executability)', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'e1-media-'));
  const sourcePath = path.join(tmpRoot, 'src.mp4');
  let ready = false;

  it('prepares a 6s audio+video source', async () => {
    await execFileAsync(ffmpegBin, [
      '-y', '-f', 'lavfi', '-i', 'testsrc=duration=6:size=320x568:rate=30',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-shortest', sourcePath,
    ], { timeout: 120000 });
    ready = true;
  });

  const caseItems = (): EditorTrackItem[] => [
    makeItem({ id: 'a', timeline_start: 0, timeline_end: 2, source_start: 0, source_end: 2 }),
    makeItem({ id: 'b', timeline_start: 2, timeline_end: 4, source_start: 2, source_end: 4, transition_in: { type: 'cross_dissolve', duration: 0.5 } as any }),
    makeItem({ id: 'c', timeline_start: 4, timeline_end: 6, source_start: 4, source_end: 6, transition_in: { type: 'circle_open', duration: 0.5 } as any }),
  ];

  it('renders an xfade chain (fade + circleopen) with audio, duration 6 − 2×0.5 = 5s', async () => {
    if (!ready) return;
    const { duration } = await render(makeProject(caseItems(), 6), sourcePath, 'xfade.mp4', 5.5);
    assert.ok(Math.abs(duration - 5.0) <= 0.3, `expected ≈5s, got ${duration}`);
  });

  it('renders speed=2 slices: 2s+2s windows at double speed ≈ 2s total', async () => {
    if (!ready) return;
    const items = [
      makeItem({ id: 'a', timeline_start: 0, timeline_end: 2, source_start: 0, source_end: 2, speed: { speed: 2.0, pitch_preserved: true } as any }),
      makeItem({ id: 'b', timeline_start: 2, timeline_end: 4, source_start: 2, source_end: 4, speed: { speed: 2.0, pitch_preserved: true } as any, transition_in: { type: 'dip_to_black', duration: 0.4 } as any }),
    ];
    const { duration } = await render(makeProject(items, 4), sourcePath, 'speed.mp4', 3.0);
    assert.ok(Math.abs(duration - 1.6) <= 0.35, `expected ≈1.6s, got ${duration}`);
  });

  it('renders a deliberate 0.6s gap: total ≈ 2 + 0.6 + 2 − transition', async () => {
    if (!ready) return;
    const items = [
      makeItem({ id: 'a', timeline_start: 0, timeline_end: 2, source_start: 0, source_end: 2 }),
      makeItem({ id: 'b', timeline_start: 2.6, timeline_end: 4.6, source_start: 2, source_end: 4, transition_in: { type: 'wipe', direction: 'left', duration: 0.4 } as any }),
    ];
    const { duration } = await render(makeProject(items, 4.6), sourcePath, 'gap.mp4', 5.0);
    // 2 + 0.6 + 2 − 0.4 = 4.2s
    assert.ok(Math.abs(duration - 4.2) <= 0.35, `expected ≈4.2s, got ${duration}`);
  });

  it('renders one representative per remaining family (slide/zoom/blur/pixelize/radial/squeeze)', async () => {
    if (!ready) return;
    const families: Array<[string, string]> = [
      ['slide', 'slideleft'],
      ['zoom_lite', 'zoomin'],
      ['blur', 'hblur'],
      ['pixelate', 'pixelize'],
      ['radial', 'radial'],
      ['squeeze_h', 'squeezeh'],
      ['smooth_slide', 'smoothleft'],
      ['dip_to_white', 'fadewhite'],
      ['circle_crop', 'circlecrop'],
      ['push', 'slideleft'],
    ];
    for (const [presetId, expectedXfade] of families) {
      const preset = getTransitionPreset(presetId)!;
      const items = [
        makeItem({ id: 'a', timeline_start: 0, timeline_end: 2, source_start: 0, source_end: 2 }),
        makeItem({
          id: 'b', timeline_start: 2, timeline_end: 4, source_start: 2, source_end: 4,
          transition_in: { type: presetId as any, duration: 0.4, ...(preset.supportsDirection ? { direction: 'left' } : {}) } as any,
        }),
      ];
      const { duration } = await render(makeProject(items, 4), sourcePath, `f-${presetId}.mp4`, 4.0);
      assert.ok(Math.abs(duration - 3.6) <= 0.35, `${presetId}: expected ≈3.6s, got ${duration}`);
      void expectedXfade;
    }
  });
});
