import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProEditorService } from '../services/proEditorService.js';

// Versioned overlay semantics: transform.position_space='design_center' items
// use center-origin 360x640 design space in BOTH channels; unmarked legacy
// items keep the historical raw-canvas-px export interpretation.

const tmpAsset = path.join(os.tmpdir(), `overlay-position-space-test-${process.pid}.png`);
// 1x1 transparent PNG
fs.writeFileSync(
  tmpAsset,
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64'
  )
);

function projectWithOverlay(transform: any, canvasW: number, canvasH: number): any {
  return {
    user_id: 'u1',
    canvas: { width: canvasW, height: canvasH, duration: 5, fps: 30, aspect_ratio: canvasH > canvasW ? '9:16' : '16:9', background_color: '#000000' },
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
          id: 'o1', track_id: 'ov', type: 'OVERLAY', name: 'sticker', timeline_start: 0, timeline_end: 3,
          source_start: 0, source_end: 3, source_path: tmpAsset,
          transform,
          speed: { speed: 1, pitch_preserved: true }, effects: [], keyframes: [],
          locked: false, muted: false, hidden: false, z_index: 25,
        }],
      },
    ],
  };
}

function overlayChain(project: any): string {
  const compiled = ProEditorService.compileRenderGraph(project, '/tmp/realmedia/tos-twoshot.mp4', '/tmp/ov-out.mp4');
  const chain = compiled.filterComplex.find((f) => f.includes('overlay=x='));
  assert.ok(chain, 'overlay chain emitted');
  return chain;
}

test('design_center: 9:16 maps design px through the canvas ratio, 280px size base', () => {
  const chain = overlayChain(projectWithOverlay(
    { position_x: 36, position_y: 64, scale: 1, rotation: 0, opacity: 1, position_space: 'design_center' },
    1080, 1920
  ));
  assert.match(chain, /overlay=x='\(W-w\)\/2\+108':y='\(H-h\)\/2\+192'/);
});

test('design_center: size base is 280 design px (x unit), clamped to canvas share', () => {
  const compiled = ProEditorService.compileRenderGraph(
    projectWithOverlay({ position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1, position_space: 'design_center' }, 1080, 1920),
    '/tmp/realmedia/tos-twoshot.mp4', '/tmp/ov-out.mp4'
  );
  const scaleFilter = compiled.filterComplex.find((f) => f.includes('scale=840'));
  assert.ok(scaleFilter, `expected scale=840 (280 * 1080/360), got: ${compiled.filterComplex.filter((f) => f.includes('scale=')).join(' | ')}`);
});

test('legacy unmarked: raw canvas px and 360px size base, unchanged', () => {
  const chain = overlayChain(projectWithOverlay(
    { position_x: 36, position_y: 64, scale: 1, rotation: 0, opacity: 1 },
    1080, 1920
  ));
  assert.match(chain, /overlay=x='\(W-w\)\/2\+36':y='\(H-h\)\/2\+64'/);
  const compiled = ProEditorService.compileRenderGraph(
    projectWithOverlay({ position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 }, 1080, 1920),
    '/tmp/realmedia/tos-twoshot.mp4', '/tmp/ov-out.mp4'
  );
  assert.ok(compiled.filterComplex.some((f) => f.includes('scale=360')));
});

test('design_center: 16:9 uses the landscape design table (640x360)', () => {
  const chain = overlayChain(projectWithOverlay(
    { position_x: 32, position_y: 36, scale: 1, rotation: 0, opacity: 1, position_space: 'design_center' },
    1920, 1080
  ));
  assert.match(chain, /overlay=x='\(W-w\)\/2\+96':y='\(H-h\)\/2\+108'/);
});

test('design_center: item scale multiplies size, not position', () => {
  const compiled = ProEditorService.compileRenderGraph(
    projectWithOverlay({ position_x: 10, position_y: 10, scale: 0.5, rotation: 0, opacity: 1, position_space: 'design_center' }, 1080, 1920),
    '/tmp/realmedia/tos-twoshot.mp4', '/tmp/ov-out.mp4'
  );
  assert.ok(compiled.filterComplex.some((f) => f.includes('scale=420')), '280*0.5*3=420');
  const chain = compiled.filterComplex.find((f) => f.includes('overlay=x='))!;
  assert.match(chain, /overlay=x='\(W-w\)\/2\+30':y='\(H-h\)\/2\+30'/, 'position scales by unit only');
});
