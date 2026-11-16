import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { buildBackdropFitChain, normalizeBackdropHex } from '../services/clipRenderService.js';

function render(chain: string): Buffer {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=10:d=0.5', '-vf', `${chain}`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1080 * 1920 * 3 + 1 << 0 });
  assert.equal(r.status, 0, String(r.stderr));
  return r.stdout as Buffer;
}
const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) <= 6);
const px = (b: Buffer, w: number, x: number, y: number) => [b[(y * w + x) * 3], b[(y * w + x) * 3 + 1], b[(y * w + x) * 3 + 2]];

test('normalizeBackdropHex rejects junk', () => {
  assert.equal(normalizeBackdropHex('#ff00aa'), 'FF00AA');
  assert.equal(normalizeBackdropHex('red; rm'), '000000');
});

test('solid colour backdrop reaches the exported pixels', () => {
  const b = render(buildBackdropFitChain('9:16', 1, { kind: 'color', color: '#FF0000', spacingPct: 5 }, 'vt'));
  assert.equal(b.length, 1080 * 1920 * 3);
  assert.ok(near(px(b, 1080, 10, 10), [255, 0, 0]), JSON.stringify(px(b, 1080, 10, 10)));
  assert.ok(near(px(b, 1080, 10, 1900), [255, 0, 0]), JSON.stringify(px(b, 1080, 10, 1900)));
});

test('corner radius clears the video corner, spacing keeps an edge margin (blur backdrop)', () => {
  const sq = render(buildBackdropFitChain('1:1', 1, { kind: 'color', color: '#00FF00', spacingPct: 10, cornerRadius: 80 }, 'vt'));
  // 1:1 canvas, 16:9 source fits width 864 -> inner video box top-left at x=108; corner pixel stays backdrop green
  const corner = px(sq, 1080, 108 + 2, 270 + 2);
  assert.ok(near(corner, [0, 255, 0]), JSON.stringify(corner));
  assert.ok(near(px(sq, 1080, 5, 5), [0, 255, 0]), JSON.stringify(px(sq, 1080, 5, 5)));
  const centre = px(sq, 1080, 540, 540);
  assert.ok(!near(centre, [0, 255, 0]));
});

test('blur backdrop renders and differs from black', () => {
  const b = render(buildBackdropFitChain('9:16', 1, { kind: 'blur', spacingPct: 4, cornerRadius: 30 }, 'vt'));
  assert.equal(b.length, 1080 * 1920 * 3);
});

import { ProEditorService } from '../services/proEditorService.js';
test('pro editor slice filter uses canvas backdrop settings and keeps legacy output at defaults', () => {
  const build = (item: any, canvas: any) => (ProEditorService as any).buildSliceCropFilter(item, undefined, 0, 5, canvas);
  const fit = { id: 'a', crop: { mode: 'fit', focusX: .5, focusY: .5, scale: 1 } };
  const blur = { id: 'b', crop: { mode: 'blur', focusX: .5, focusY: .5, scale: 1 } };
  assert.match(build(fit, { background_color: '#FF0000' }), /drawbox=.*0xFF0000/);
  assert.match(build(blur, { background_spacing: 5, background_corner_radius: 40 }), /geq=/);
  assert.match(build(fit, { background_color: '#000000' }), /pad=1080:1920/);
  assert.match(build(blur, {}), /boxblur=25:5/);
  assert.doesNotMatch(build(blur, {}), /geq=/);
});

test('per-scene user layout overrides the clip-level layout for that slice only', () => {
  const build = (item: any, layoutMode: string) => (ProEditorService as any).buildSliceCropFilter(item, {
    aspectRatio: '9:16', cropConfig: null, clipStartSec: 0, mode: 'smart', layoutMode,
    track: { source_width: 1920, source_height: 1080, smoothed_keyframes: [{ time: 0, centerX: .5, centerY: .5 }, { time: 5, centerX: .6, centerY: .5 }], metadata: {}, isStale: false, raw_samples: [] },
  }, 0, 5);
  const plain: any = { id: 's1' };
  const splitUser: any = { id: 's2', layout_mode: 'split', crop_config: { layout_mode: 'split', layout_mode_source: 'user', split: { speaker1X: .3, speaker2X: .7 } } };
  const blurUser: any = { id: 's3', layout_mode: 'blur', crop_config: { layout_mode: 'blur', layout_mode_source: 'user' } };
  const clipTrack = build(plain, 'track');
  const asSplit = build(splitUser, 'track');
  const asBlur = build(blurUser, 'track');
  assert.notEqual(clipTrack, asSplit);
  assert.notEqual(clipTrack, asBlur);
  assert.match(asBlur, /boxblur/);
  assert.equal(build(plain, 'track'), clipTrack);
});
