import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProEditorService } from '../services/proEditorService.js';

// Rounded background card for text blocks: one synthesized rounded underlay
// behind the whole block (matching the preview's single rounded card) instead
// of ffmpeg's per-line square boxes. Sized by exact drawtext probe, not estimate.

function projectWithHook(animation: string): any {
  return {
    user_id: 'u1',
    canvas: { width: 1080, height: 1920, duration: 9, fps: 30, aspect_ratio: '9:16', background_color: '#000000' },
    tracks: [
      {
        id: 'vt', name: 'Main Video', type: 'VIDEO', locked: false, hidden: false, muted: false,
        items: [{
          id: 'v1', track_id: 'vt', type: 'VIDEO', name: 'v', timeline_start: 0, timeline_end: 9,
          source_start: 0, source_end: 9, source_path: '/tmp/realmedia/tos-twoshot.mp4',
          transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
          speed: { speed: 1, pitch_preserved: true }, effects: [], keyframes: [],
          locked: false, muted: false, hidden: false, z_index: 1,
        }],
      },
      {
        id: 'tt', name: 'Text', type: 'TEXT', locked: false, hidden: false, muted: false,
        items: [{
          id: 'hook1', track_id: 'tt', type: 'TEXT', name: 'Hook', timeline_start: 0, timeline_end: 3,
          source_start: 0, source_end: 3,
          transform: { position_x: 0, position_y: -240, scale: 1, rotation: 0, opacity: 1 },
          text: {
            text: 'BREAKING UPDATE', font_family: 'Montserrat', font_size: 46, font_weight: 'black',
            italic: false, alignment: 'center', color: '#FFFFFF',
            background_color: '#000000D9', background_padding: 12, background_corner_radius: 8,
            animation, animation_duration: 0.45,
          },
          speed: { speed: 1, pitch_preserved: true }, effects: [], keyframes: [],
          locked: false, muted: false, hidden: false, z_index: 10,
        }],
      },
    ],
  };
}

test('rounded card: pop-animated hook gets one underlay + box=0 lines', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'textcard-'));
  const compiled = ProEditorService.compileRenderGraph(projectWithHook('pop'), '/tmp/realmedia/tos-twoshot.mp4', path.join(tmpDir, 'out.mp4'), tmpDir);
  const cardPath = path.join(tmpDir, 'textcard_hook1.png');
  assert.ok(fs.existsSync(cardPath), 'card PNG synthesized');
  assert.ok(compiled.inputArgs.includes(cardPath), 'card PNG is an input');
  const png = fs.readFileSync(cardPath);
  const w = png.readUInt32BE(16);
  const h = png.readUInt32BE(20);
  // Montserrat Black 46 * 3 = 138px lines; 'BREAKING' is the longest line
  assert.ok(w > 600 && w < 1000, `card width ${w} plausible for the wrapped hook`);
  assert.ok(h > 200 && h < 500, `card height ${h} plausible for two lines`);
  const cardChain = compiled.filterComplex.find((f) => f.includes('[textcard_'));
  assert.ok(cardChain, 'card chain emitted');
  assert.match(compiled.filterComplex.find((f) => f.includes('overlay=x='))!, /format=auto/);
  const joined = compiled.filterComplex.join('\n');
  const drawtextCount = (joined.match(/drawtext=/g) || []).length;
  const box0Count = (joined.match(/box=0/g) || []).length;
  assert.equal(drawtextCount, 2, `two wrapped lines, got: ${joined}`);
  assert.equal(box0Count, 2, 'both lines boxless');
  assert.ok(!joined.includes('box=1'), 'no legacy boxes');
});

test('rounded card: slide_up keeps legacy per-line boxes (animation moves the block)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'textcard-'));
  const compiled = ProEditorService.compileRenderGraph(projectWithHook('slide_up'), '/tmp/realmedia/tos-twoshot.mp4', path.join(tmpDir, 'out.mp4'), tmpDir);
  assert.ok(!fs.existsSync(path.join(tmpDir, 'textcard_hook1.png')), 'no card for moving blocks');
  const drawtexts = compiled.filterComplex.filter((f) => f.includes('drawtext='));
  assert.ok(drawtexts.every((f) => f.includes('box=1')), 'legacy boxes preserved');
});

test('rounded card: no background_corner_radius keeps legacy boxes', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'textcard-'));
  const p = projectWithHook('none');
  delete p.tracks[1].items[0].text.background_corner_radius;
  const compiled = ProEditorService.compileRenderGraph(p, '/tmp/realmedia/tos-twoshot.mp4', path.join(tmpDir, 'out.mp4'), tmpDir);
  const drawtexts = compiled.filterComplex.filter((f) => f.includes('drawtext='));
  assert.ok(drawtexts.every((f) => f.includes('box=1')));
});
