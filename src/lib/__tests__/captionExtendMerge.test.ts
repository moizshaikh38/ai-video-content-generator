import test from 'node:test';
import assert from 'node:assert/strict';
import { initCoveredEnd, mergeExtendedCues } from '../captionExtendMerge.js';

const cue = (id: string, start: number, end: number, text: string, words?: any[]) => ({
  id, start, end, text, words,
});

test('init marker is the saved cues max end; no cues appended on init', () => {
  const saved = [cue('cue-1', 0, 2, 'HELLO'), cue('cue-2', 2, 4.5, 'WORLD')];
  assert.equal(initCoveredEnd(saved), 4.5);
  assert.equal(initCoveredEnd([]), 0);
});

test('appends only cues beyond the coverage marker; existing cues untouched', () => {
  const saved = [cue('cue-1', 0, 2, 'USER EDITED TEXT'), cue('cue-2', 2, 51.3, 'LAST OLD')];
  const fresh = [
    cue('cue-1', 0, 2, 'HELLO ORIGINAL'), // would clobber the edit if merged blindly
    cue('cue-2', 2, 51.3, 'LAST OLD'),
    cue('cue-3', 51.3, 53.8, 'NEW SPAN'),
    cue('cue-4', 53.8, 61.3, 'MORE NEW'),
  ];
  const r = mergeExtendedCues(saved, fresh, 51.3);
  assert.equal(r.appended, 2);
  assert.equal(r.cues[0].text, 'USER EDITED TEXT');
  assert.deepEqual(r.cues.map((c) => c.id), ['cue-1', 'cue-2', 'cue-3', 'cue-4']);
  assert.equal(r.coveredEnd, 61.3);
});

test('intentional deletion inside covered region is not resurrected', () => {
  // User deleted cue-2 (2..4); fresh extraction still contains it.
  const saved = [cue('cue-1', 0, 2, 'A'), cue('cue-3', 4, 6, 'B')];
  const fresh = [cue('cue-1', 0, 2, 'A'), cue('cue-2', 2, 4, 'DELETED'), cue('cue-3', 4, 6, 'B')];
  const r = mergeExtendedCues(saved, fresh, 6);
  assert.equal(r.appended, 0);
  assert.deepEqual(r.cues.map((c) => c.id), ['cue-1', 'cue-3']);
});

test('deleting an appended cue does not resurrect it (marker advanced past it)', () => {
  const saved = [cue('cue-1', 0, 2, 'A')]; // user deleted appended cue-2 after marker moved to 6
  const fresh = [cue('cue-1', 0, 2, 'A'), cue('cue-2', 2, 6, 'DELETED APPEND')];
  const r = mergeExtendedCues(saved, fresh, 6);
  assert.equal(r.appended, 0);
  assert.equal(r.cues.length, 1);
});

test('straddling cue contributes only words inside the newly exposed span', () => {
  const saved = [cue('cue-1', 50, 51.3, 'OLD TAIL', [
    { start: 50, end: 50.6, text: 'OLD' },
    { start: 50.6, end: 51.3, text: 'TAIL' },
  ])];
  const fresh = [
    cue('cue-1', 50, 52.2, 'OLD TAIL GROWS', [
      { start: 50, end: 50.6, text: 'OLD' },
      { start: 50.6, end: 51.6, text: 'TAIL' },
      { start: 51.6, end: 52.2, text: 'GROWS' },
    ]),
  ];
  const r = mergeExtendedCues(saved, fresh, 51.3);
  assert.equal(r.appended, 1);
  const added = r.cues[1];
  // 'TAIL' starts before the boundary and already exists in the saved cue -
  // only the newly exposed word is appended.
  assert.deepEqual(added.words!.map((w) => w.text), ['GROWS']);
  assert.equal(added.start, 51.6);
  assert.equal(added.end, 52.2);
  assert.equal(r.coveredEnd, 52.2);
  // Original cue untouched
  assert.equal(r.cues[0].end, 51.3);
});

test('idempotent: re-merging the same fresh cues adds nothing', () => {
  const saved = [cue('cue-1', 0, 51.3, 'OLD')];
  const fresh = [cue('cue-1', 0, 51.3, 'OLD'), cue('cue-2', 51.3, 61.3, 'NEW')];
  const first = mergeExtendedCues(saved, fresh, 51.3);
  const second = mergeExtendedCues(first.cues, fresh, first.coveredEnd);
  assert.equal(second.appended, 0);
  assert.equal(second.cues.length, 2);
});
