import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPresetToEditorCaption } from '../../../src/lib/captionPresets.js';

const prev: any = {
  cues: [{ id: 'c1', start: 0, end: 2, text: 'HI' }],
  cues_covered_end: 39.658,
  style: 'soft_cut', position: 'bottom', primary_color: '#F0E6B5', highlight_color: '#F0E6B5',
};

test('choosing a caption preset keeps the saved-cue coverage marker', () => {
  const r: any = applyPresetToEditorCaption(prev, 'word_cut');
  assert.equal(r.style, 'word_cut');
  assert.equal(r.cues_covered_end, 39.658);
  assert.equal(r.cues.length, 1);
});

test('a deliberately empty caption keeps its marker through a preset change', () => {
  const r: any = applyPresetToEditorCaption({ ...prev, cues: [] }, 'word_cut');
  assert.deepEqual(r.cues, []);
  assert.equal(r.cues_covered_end, 39.658);
});

test('no marker stays absent (no invented coverage)', () => {
  const { cues_covered_end: _m, ...noMarker } = prev;
  const r: any = applyPresetToEditorCaption(noMarker, 'word_cut');
  assert.equal('cues_covered_end' in r, false);
});

test('invalid markers (negative, NaN, Infinity) are not carried, matching the load-side finite and >= 0 check', () => {
  for (const bad of [-1, NaN, Infinity]) {
    const r: any = applyPresetToEditorCaption({ ...prev, cues_covered_end: bad }, 'word_cut');
    assert.equal('cues_covered_end' in r, false, String(bad));
  }
  assert.equal((applyPresetToEditorCaption({ ...prev, cues_covered_end: 0 }, 'word_cut') as any).cues_covered_end, 0);
});
