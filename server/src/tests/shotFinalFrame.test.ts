import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { SmartReframeService as S } from '../services/smartReframeService.js';

const ff = (args: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-threads', '1', '-filter_threads', '1', '-filter_complex_threads', '1', ...args], { timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
for (const fps of [24, 25, 30]) for (const shotCount of [1, 2]) {
  test(`shot composition retains each unique final source frame at ${fps}fps across ${shotCount} shot(s) without changing duration`, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shot-final-frame-'));
    try {
      const source = path.join(dir, 'source.mp4');
      const output = path.join(dir, 'render.mkv');
      ff(['-f', 'lavfi', '-i', `color=black:size=160x90:rate=${fps}:duration=${shotCount},drawbox=color=white:t=fill:enable='eq(mod(n+1,${fps}),0)'`, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '0', '-y', source]);
      const plan: any = Array.from({ length: shotCount }, (_, i) => ({ start: i, end: i + 1, windowW: 1, windowH: 1, keyframes: [{ time: i, centerX: 0.5, centerY: 0.5 }, { time: i + 1, centerX: 0.5, centerY: 0.5 }] }));
      const graph = S.buildShotCompositionFilter({ plan, sourceWidth: 160, sourceHeight: 90, duration: shotCount, canvasScale: 1 / 3 });
      ff(['-i', source, '-filter_complex', graph, '-map', '[out]', '-c:v', 'ffv1', '-y', output]);
      const pixels = ff(['-i', output, '-vf', 'format=rgb24,crop=1:1:180:240', '-vsync', '0', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-']);
      assert.equal(pixels.length / 3, 30 * shotCount, 'duration must retain the exact output frame count');
      for (let i = 0; i < shotCount; i++) {
        assert([...pixels.subarray(i * 30 * 3, i * 30 * 3 + 3)].every(v => v < 5), 'each shot must start black without a padded frame leaking from the prior shot');
        assert([...pixels.subarray(((i + 1) * 30 - 1) * 3, (i + 1) * 30 * 3)].every(v => v > 245), 'each shot must end on its unique white source tail, not a cloned prior black frame');
      }
      const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', output], { encoding: 'utf8' }));
      assert(Math.abs(Number(probe.format.duration) - shotCount) < 0.002, 'tail retention must not extend the clip');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}
