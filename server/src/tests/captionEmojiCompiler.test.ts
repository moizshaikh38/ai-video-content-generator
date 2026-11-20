import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProEditorService } from '../services/proEditorService.js';
import { sparseEmojiProjectInput } from '../shared/sparseCaptionEmojiProject.js';

function project() {
  const p: any = {
    id: 'emoji-compiler-test', user_id: 'test-owner',
    canvas: { width: 1080, height: 1920, aspect_ratio: '9:16', duration: 5, fps: 30 },
    tracks: [{ id: 'caption', name: 'Captions', type: 'CAPTION', hidden: false, items: [{
      id: 'cue-item', type: 'CAPTION', timeline_start: 0, timeline_end: 5,
      source_start: 0, source_end: 5, speed: { speed: 1 },
      caption: { cues: [{ id: 'cue', start: 1, end: 2, text: 'great idea', words: [{text: 'idea', start: 1.2, end: 1.8}] }] }
    }] }]
  };
  const input = sparseEmojiProjectInput(p);
  assert.equal(input.status, 'ready');
  if (input.status !== 'ready') throw new Error('Fixture timing invalid');
  p.tracks.push({ id: 'emoji', name: 'Sparse emoji', type: 'IMAGE', hidden: false,
    caption_emoji: { version: 1, sourceSignature: input.signature }, items: [{
      id: 'bulb', type: 'IMAGE', source_path: '/caption-emojis/1f4a1.png',
      timeline_start: 1.1, timeline_end: 1.8, source_start: 0, source_end: .7,
      transform: {position_space: 'design_center', position_x: 0, position_y: 160, scale: .14, rotation: 0, opacity: 1},
      speed: {speed: 1}, effects: [], keyframes: [], hidden: false
    }]
  });
  return p;
}

test('canonical saved emoji URL compiles to a bundled file without preload or network', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'emoji-compiler-'));
  try {
    const p = project();
    const g = ProEditorService.compileRenderGraph(p, '/tmp/test-source.mp4', '/tmp/test-out.mp4', dir);
    assert(g.inputArgs.includes(path.join(dir, 'bundled-caption-emoji-1f4a1.png')));
    assert(g.filterComplex.some(s => s.includes("between(t,1.10,1.80)")));
    assert.equal(p.tracks[1].items[0].source_path, '/caption-emojis/1f4a1.png');
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('compiler omits stale or caption-hidden decorations without deleting persisted items', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'emoji-stale-'));
  try {
    for (const edit of [(p: any) => p.tracks[0].hidden = true, (p: any) => p.tracks[0].items[0].caption.cues[0].text = 'changed']) {
      const p = project(); edit(p);
      const g = ProEditorService.compileRenderGraph(p, '/tmp/test-source.mp4', '/tmp/test-out.mp4', dir);
      assert(!g.inputArgs.some(s => s.includes('bundled-caption-emoji')));
      assert.equal(p.tracks[1].hidden, false);
    }
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});
