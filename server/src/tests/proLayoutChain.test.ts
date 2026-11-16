import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import { ProEditorService } from '../services/proEditorService.js';

const ffmpeg = ffmpegStatic as unknown as string;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pro-layout-regression-'));
const source = path.join(dir, 'source.mp4');
execFileSync(ffmpeg, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=10:d=1', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', source]);

for (const count of [1, 2]) {
  for (const layout of ['split', 'blur', 'split_stacked', 'circular_inset', 'rounded_card_inset']) {
    test(`Pro ${layout} layout executes FFmpeg with ${count} timeline slice(s)`, () => {
      const project = {
        canvas: { width: 1080, height: 1920, aspect_ratio: '9:16', fps: 10, duration: 0.6 },
        tracks: [{ type: 'VIDEO', name: 'Main', items: Array.from({ length: count }, (_, i) => ({
          // Shared long prefix must not collide when making internal filter labels.
          id: `shared-prefix-that-would-collide-${i}`,
          timeline_start: i * 0.6 / count, timeline_end: (i + 1) * 0.6 / count,
          source_start: i * 0.6 / count, source_end: (i + 1) * 0.6 / count,
        })) }],
      } as any;
      const reframe = {
        mode: 'smart', aspectRatio: '9:16', clipStartSec: 0,
        layoutMode: ['split', 'blur'].includes(layout) ? layout : 'screencast',
        cropConfig: { split: { speaker1X: 0.2, speaker2X: 0.8 }, screencast: { mode: layout, background: 'blur' } },
        track: { smoothed_keyframes: [{ time: 0, centerX: 0.3, centerY: 0.4 }, { time: 1, centerX: 0.7, centerY: 0.4 }], source_width: 640, source_height: 360 },
      } as any;
      const graph = ProEditorService.compileRenderGraph(project, source, path.join(dir, `${layout}-${count}.mp4`), dir, reframe, 'off');
      assert.ok(!graph.filterComplex.join(';').includes('[0:v][0:v]'));
      execFileSync(ffmpeg, ['-v', 'error', '-filter_complex_threads', '1', ...graph.inputArgs, '-filter_complex', graph.filterComplex.join(';'), '-map', graph.videoMap, '-map', graph.audioMap, '-t', '0.6', '-f', 'null', '-'], { timeout: 30000 });
    });
  }
}
