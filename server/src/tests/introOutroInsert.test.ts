/**
 * Intro/outro insertion: ripple shift, canvas extension, and title-card construction.
 * Imports the frontend pure util directly (same cross-tree pattern as the caption/waveform
 * shared modules) and runs under the backend test runner.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTitleCardItem,
  insertIntroOutro,
  DEFAULT_TITLE_CARD_DURATION,
} from '../../../src/utils/introOutro.js';

function project(): any {
  return {
    canvas: { duration: 10, aspect_ratio: '9:16', width: 1080, height: 1920, fps: 30 },
    tracks: [
      {
        id: 'tv',
        type: 'VIDEO',
        name: 'Main Video',
        items: [{ id: 'v1', track_id: 'tv', type: 'VIDEO', timeline_start: 0, timeline_end: 10, source_start: 0, source_end: 10 }],
      },
      {
        id: 'tc',
        type: 'CAPTION',
        name: 'Subtitles',
        items: [{ id: 'cap1', track_id: 'tc', type: 'CAPTION', timeline_start: 2, timeline_end: 8, source_start: 2, source_end: 8 }],
      },
    ],
  };
}

describe('Title card construction', () => {
  it('builds a full-frame title card item for the given position', () => {
    const intro = createTitleCardItem('tv', 'intro', 0);
    assert.equal(intro.is_title_card, true);
    assert.equal(intro.type, 'IMAGE');
    assert.equal(intro.title_card_text, 'Intro');
    assert.equal(intro.source_path, null);
    assert.equal(intro.timeline_end - intro.timeline_start, DEFAULT_TITLE_CARD_DURATION);
    assert.equal(createTitleCardItem('tv', 'outro', 0).title_card_text, 'Outro');
  });
});

describe('insertIntroOutro: intro (prepend + ripple)', () => {
  it('places the item at 0 and shifts every existing item right by its duration', () => {
    const card = createTitleCardItem('tv', 'intro', 0, 3);
    const { project: next, item } = insertIntroOutro(project(), 'intro', 'tv', card);

    assert.equal(item.timeline_start, 0);
    assert.equal(item.timeline_end, 3);
    assert.equal(next.canvas.duration, 13, 'canvas extended by the intro duration');

    const video = next.tracks.find((t: any) => t.id === 'tv');
    assert.equal(video.items[0].id, item.id, 'intro is first on the video track');
    const v1 = video.items.find((i: any) => i.id === 'v1');
    assert.deepEqual([v1.timeline_start, v1.timeline_end], [3, 13], 'main video shifted right by 3');

    const cap = next.tracks.find((t: any) => t.id === 'tc').items[0];
    assert.deepEqual([cap.timeline_start, cap.timeline_end], [5, 11], 'caption on another track also shifted');
  });
});

describe('insertIntroOutro: outro (append)', () => {
  it('appends at the current end and extends the canvas, leaving existing items unchanged', () => {
    const card = createTitleCardItem('tv', 'outro', 0, 4);
    const base = project();
    const { project: next, item } = insertIntroOutro(base, 'outro', 'tv', card);

    assert.deepEqual([item.timeline_start, item.timeline_end], [10, 14]);
    assert.equal(next.canvas.duration, 14);

    const video = next.tracks.find((t: any) => t.id === 'tv');
    const v1 = video.items.find((i: any) => i.id === 'v1');
    assert.deepEqual([v1.timeline_start, v1.timeline_end], [0, 10], 'existing items untouched for an outro');
    assert.equal(video.items[video.items.length - 1].id, item.id, 'outro is last on the video track');
  });

  it('is pure: the input project is not mutated', () => {
    const base = project();
    const snapshot = JSON.stringify(base);
    insertIntroOutro(base, 'intro', 'tv', createTitleCardItem('tv', 'intro', 0, 3));
    assert.equal(JSON.stringify(base), snapshot, 'input project unchanged');
  });
});
