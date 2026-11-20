import {editorCachePath} from '../utils/editorCachePath.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { roundedCardPng } from '../utils/roundedCardPng.js';
import { ProEditorService } from '../services/proEditorService.js';

// Social card chrome export path: synthesized rounded-card PNGs feed the
// overlay channel so export matches the preview's CSS borderRadius rendering.

test('roundedCardPng: valid PNG with exact IHDR dimensions', () => {
  const png = roundedCardPng(200, 100, 18, '#112233');
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(png.readUInt32BE(16), 200); // IHDR width
  assert.equal(png.readUInt32BE(20), 100); // IHDR height
  assert.equal(png[25], 6); // color type RGBA
  assert.ok(png.length > 100, 'has compressed image data');
});

test('roundedCardPng: radius clamps to half the smaller dimension', () => {
  const png = roundedCardPng(40, 20, 500, '#000000');
  assert.equal(png.readUInt32BE(16), 40);
  assert.equal(png.readUInt32BE(20), 20);
});

test('roundedCardPng: rejects a malformed color', () => {
  assert.throws(() => roundedCardPng(10, 10, 2, 'not-a-color'));
});

function projectWithCard(): any {
  return {
    user_id: 'u1',
    canvas: { width: 1080, height: 1920, duration: 5, fps: 30, aspect_ratio: '9:16', background_color: '#000000' },
    tracks: [
      {
        id: 'vt', name: 'Main Video', type: 'VIDEO', locked: false, hidden: false, muted: false,
        items: [{
          id: 'v1', track_id: 'vt', type: 'VIDEO', name: 'v', timeline_start: 0, timeline_end: 5,
          source_start: 0, source_end: 5, source_path: '/tmp/realmedia/tos-twoshot.mp4',
          transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
          speed: { speed: 1, pitch_preserved: true }, effects: [], keyframes: [],
          locked: false, muted: false, hidden: false, z_index: 1,
        }],
      },
      {
        id: 'ov', name: 'Elements & Stickers', type: 'OVERLAY', locked: false, hidden: false, muted: false,
        items: [{
          id: 'card1', track_id: 'ov', type: 'OVERLAY', name: 'Social card background', timeline_start: 0, timeline_end: 5,
          source_start: 0, source_end: 5,
          card: { width: 200, height: 120, radius: 18, color: '#000000' },
          transform: { position_x: -96, position_y: -250, scale: 1, rotation: 0, opacity: 0.55, position_space: 'design_center' },
          speed: { speed: 1, pitch_preserved: true }, effects: [], keyframes: [],
          locked: false, muted: false, hidden: false, z_index: 23,
        }],
      },
    ],
  };
}

test('compile: card item synthesizes its PNG and overlays it at design_center geometry', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cardtest-'));
  const compiled = ProEditorService.compileRenderGraph(projectWithCard(), '/tmp/realmedia/tos-twoshot.mp4', path.join(tmpDir, 'out.mp4'), tmpDir);
  const cardPath = editorCachePath(tmpDir, 'card', 'card1', '.png');
  assert.ok(fs.existsSync(cardPath), 'synthesized card PNG written to tmpDir');
  assert.ok(compiled.inputArgs.includes(cardPath), 'card PNG is an ffmpeg input');
  // width 200 design px * unitX 3 = 600
  const scaleFilter = compiled.filterComplex.find((f) => f.includes('scale=600:-1'));
  assert.ok(scaleFilter, `expected scale=600:-1, got: ${compiled.filterComplex.filter((f) => f.includes('scale=')).join(' | ')}`);
  // position -96 * 3 = -288, -250 * 3 = -750; opacity 0.55 mixed into alpha
  const chain = compiled.filterComplex.find((f) => f.includes('card') || f.includes('overlay=x='));
  assert.match(chain!, /overlay=x='\(W-w\)\/2\+-288':y='\(H-h\)\/2\+-750'/);
  assert.ok(compiled.filterComplex.some((f) => f.includes('colorchannelmixer=aa=0.55')), 'opacity applied');
});
