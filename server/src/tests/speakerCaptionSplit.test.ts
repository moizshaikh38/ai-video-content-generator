import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  attributeCueSpeaker,
  applySpeakerSplitToCues,
  SPEAKER1_POSITION_Y,
} from '../shared/speakerCaptionSplit.js';

// Split layout: speaker 1 (top half) sits at source x=0.25, speaker 2 (bottom) at x=0.75.
const ZONES = { speaker1X: 0.25, speaker2X: 0.75 };
// Followed subject alternates: 0-10s speaker1, 10-20s speaker2.
const KF = [
  { time: 1, centerX: 0.24 },
  { time: 5, centerX: 0.26 },
  { time: 11, centerX: 0.74 },
  { time: 15, centerX: 0.76 },
];

describe('Speaker-split caption attribution', () => {
  it('attributes cues to the nearest followed-subject zone', () => {
    assert.equal(attributeCueSpeaker(2, KF, ZONES), 'speaker1');
    assert.equal(attributeCueSpeaker(12, KF, ZONES), 'speaker2');
  });

  it('returns null without nearby keyframes (no fabrication)', () => {
    assert.equal(attributeCueSpeaker(30, KF, ZONES), null);
    assert.equal(attributeCueSpeaker(2, [], ZONES), null);
  });

  it('returns null when zones are indistinguishable or invalid', () => {
    assert.equal(attributeCueSpeaker(2, KF, { speaker1X: 0.5, speaker2X: 0.52 }), null);
    assert.equal(attributeCueSpeaker(2, KF, { speaker1X: Number.NaN, speaker2X: 0.75 }), null);
  });

  it('anchors only top-speaker cues; bottom speaker keeps the default band', () => {
    const cues = [
      { id: 'a', start: 2, end: 3, text: 'top speaker words' },
      { id: 'b', start: 12, end: 13, text: 'bottom speaker words' },
      { id: 'c', start: 30, end: 31, text: 'unattributed words' },
    ];
    const { cues: out, attributedTop } = applySpeakerSplitToCues(cues, KF, ZONES);
    assert.equal(attributedTop, 1);
    assert.equal(out[0].position_y, SPEAKER1_POSITION_Y);
    assert.equal(out[1].position_y, undefined, 'bottom speaker keeps default band');
    assert.equal(out[2].position_y, undefined, 'unattributed cue untouched');
    // input not mutated
    assert.equal((cues[0] as any).position_y, undefined);
  });

  it('never moves user/editor-positioned cues', () => {
    const cues = [{ id: 'a', start: 2, end: 3, text: 'placed', position_y: 0.8 }];
    const { cues: out, attributedTop } = applySpeakerSplitToCues(cues, KF, ZONES);
    assert.equal(attributedTop, 0);
    assert.equal(out[0].position_y, 0.8);
  });

  it('empty inputs are a no-op passthrough', () => {
    const cues = [{ id: 'a', start: 2, end: 3, text: 'x' }];
    const r = applySpeakerSplitToCues(cues, [], ZONES);
    assert.strictEqual(r.cues, cues);
    assert.equal(r.attributedTop, 0);
  });
});
