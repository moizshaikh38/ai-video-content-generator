import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  adaptPunchInToWordTimings,
  buildPunchInZoompan,
} from '../utils/punchInTiming.js';

// Words: "the BIG reveal happens now" with a gap before "now"
const WORDS = [
  { start: 2.0, end: 2.3 },  // the
  { start: 2.3, end: 2.7 },  // BIG
  { start: 2.7, end: 3.2 },  // reveal
  { start: 3.2, end: 3.7 },  // happens
  { start: 4.2, end: 4.6 },  // now (after 0.5s gap)
];

describe('Punch-in word-timing adaptation (OpenShorts #1)', () => {
  it('snaps the start to the nearest word boundary', () => {
    const r = adaptPunchInToWordTimings({ startSec: 2.15, durationSec: 1.5, scale: 1.1 }, WORDS);
    assert.equal(r.suppressed, false);
    if (!r.suppressed) {
      assert.equal(r.startSec, 2.0, 'snapped to word start');
      assert.equal(r.reason, 'word_adapted');
    }
  });

  it('extends the end to a word boundary so the revert never lands mid-word', () => {
    // natural end 2.0+1.25 = 3.25 lands inside "happens" (3.2-3.7)
    const r = adaptPunchInToWordTimings({ startSec: 2.0, durationSec: 1.25, scale: 1.1 }, WORDS);
    assert.equal(r.suppressed, false);
    if (!r.suppressed) assert.equal(r.startSec + r.durationSec, 3.7);
  });

  it('suppresses when no word boundary is near the start (never punch mid-word)', () => {
    // 3.75 sits in the 3.7-4.2 gap, >0.4s from any word start
    const r = adaptPunchInToWordTimings({ startSec: 3.75, durationSec: 1.5, scale: 1.1 }, WORDS);
    assert.equal(r.suppressed, true);
    if (r.suppressed) assert.equal(r.reason, 'no_word_boundary');
  });

  it('suppresses imperceptible zooms', () => {
    const r = adaptPunchInToWordTimings({ startSec: 2.0, durationSec: 1.5, scale: 1.02 }, WORDS);
    assert.equal(r.suppressed, true);
    if (r.suppressed) assert.equal(r.reason, 'subtle_scale');
  });

  it('caps runaway durations and rejects degenerate windows', () => {
    const r = adaptPunchInToWordTimings({ startSec: 2.0, durationSec: 30, scale: 1.1 }, WORDS);
    assert.equal(r.suppressed, false);
    if (!r.suppressed) assert.ok(r.durationSec <= 4.0);
    const d = adaptPunchInToWordTimings({ startSec: 2.0, durationSec: 0, scale: 1.1 }, WORDS);
    assert.equal(d.suppressed, true);
  });

  it('passes the plan window through (clamped) when no word timings exist', () => {
    const r = adaptPunchInToWordTimings({ startSec: 5.5, durationSec: 2.5, scale: 1.1 }, []);
    assert.equal(r.suppressed, false);
    if (!r.suppressed) {
      assert.equal(r.startSec, 5.5);
      assert.equal(r.reason, 'no_word_timings');
    }
  });

  it('zoompan curve ramps up, holds, and ramps down (no step edges)', () => {
    const f = buildPunchInZoompan({ startSec: 2.0, durationSec: 2.0, scale: 1.1, targetW: 1080, targetH: 1920 });
    assert.ok(f.includes('zoompan='), 'zoompan filter');
    assert.ok(!f.includes('between(on'), 'old step expression gone');
    const on0 = 60, on1 = Math.round(2.25 * 30), on2 = Math.round((4.0 - 0.35) * 30), on3 = 120;
    assert.ok(f.includes(`lt(on,${on0})`), 'pre-window zoom = 1');
    assert.ok(f.includes(`(on-${on0})/${on1 - on0}`), 'ramp-in term');
    assert.ok(f.includes(`(${on3}-on)/${on3 - on2}`), 'ramp-out term');
    assert.ok(f.includes('s=1080x1920:fps=30'));
  });

  it('clamps ramps to half the window for very short punches', () => {
    const f = buildPunchInZoompan({ startSec: 1.0, durationSec: 0.4, scale: 1.1, targetW: 1080, targetH: 1920 });
    // rampIn = rampOut = 0.2 -> on1 = 36, on2 = 36 (hold collapses safely)
    assert.ok(f.includes('lt(on,36'), 'clamped ramp boundary present');
  });
});
