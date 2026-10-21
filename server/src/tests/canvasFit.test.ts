/**
 * Responsive preview-canvas fit math. Imports the frontend pure module directly (same cross-tree
 * pattern as the other shared modules) and runs under the backend test runner.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeCanvasFitScale } from '../../../src/lib/canvasFit.js';

// 9:16 design canvas.
const BASE = { baseW: 360, baseH: 640 };

describe('computeCanvasFitScale', () => {
  it('is height-constrained for a tall 9:16 canvas in a landscape stage', () => {
    // availH 672 -> usableH 640 -> 640/640 = 1.0 ; width (986/360=2.74) is not the limit
    const s = computeCanvasFitScale({ ...BASE, availW: 1018, availH: 672 });
    assert.ok(Math.abs(s - 1.0) < 0.001, `expected ~1.0, got ${s}`);
  });

  it('grows the canvas when the stage is taller (fills reclaimed vertical space)', () => {
    const s = computeCanvasFitScale({ ...BASE, availW: 1018, availH: 900 });
    // usableH 868 -> 868/640 = 1.356, width 986/360=2.74 -> min 1.356
    assert.ok(s > 1.3 && s < 1.4, `expected ~1.35, got ${s}`);
  });

  it('is width-constrained for a 16:9 canvas', () => {
    const s = computeCanvasFitScale({ baseW: 640, baseH: 360, availW: 760, availH: 900 });
    // usableW 728 -> 728/640=1.1375 ; usableH 868/360=2.41 -> min 1.1375
    assert.ok(Math.abs(s - 1.1375) < 0.001, `got ${s}`);
  });

  it('never exceeds the max clamp', () => {
    const s = computeCanvasFitScale({ ...BASE, availW: 5000, availH: 5000 });
    assert.equal(s, 2.5);
  });

  it('never drops below the min clamp', () => {
    const s = computeCanvasFitScale({ ...BASE, availW: 40, availH: 40 });
    assert.equal(s, 0.2);
  });

  it('returns 1 when space cannot be measured yet (zero/negative usable)', () => {
    assert.equal(computeCanvasFitScale({ ...BASE, availW: 20, availH: 400 }), 1); // usableW <= 0
    assert.equal(computeCanvasFitScale({ ...BASE, availW: 400, availH: 10 }), 1); // usableH <= 0
  });

  it('preserves aspect ratio: scaled dims keep the base ratio', () => {
    const s = computeCanvasFitScale({ ...BASE, availW: 1018, availH: 900 });
    const ratioBase = BASE.baseW / BASE.baseH;
    const ratioScaled = (BASE.baseW * s) / (BASE.baseH * s);
    assert.ok(Math.abs(ratioBase - ratioScaled) < 1e-9);
  });

  it('is deterministic', () => {
    const input = { ...BASE, availW: 1018, availH: 777 };
    assert.equal(computeCanvasFitScale(input), computeCanvasFitScale(input));
  });
});
