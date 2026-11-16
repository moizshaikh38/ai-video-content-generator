import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpolateReframeCenter, sanitizeReframeKeyframes } from '../shared/reframeInterpolation.js';

// Preview/export parity helper for smart-reframe panning. The preview
// (PreviewCanvas) converts the interpolated center into a CSS object-position;
// the export (SmartReframeService.buildSmartCropFilter) burns the same center
// into the crop window expression. These tests pin the shared interpolation
// semantics both sides rely on.

test('sanitize sorts by time, clamps centers to 0..1 and drops non-finite', () => {
  const out = sanitizeReframeKeyframes([
    { time: 2, centerX: 1.4, centerY: -0.2 },
    { time: Number.NaN, centerX: 0.5 },
    { time: 0, centerX: 0.25, centerY: 0.75 },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].time, 0);
  assert.equal(out[0].centerX, 0.25);
  assert.equal(out[0].centerY, 0.75);
  assert.equal(out[1].centerX, 1);
  assert.equal(out[1].centerY, 0);
});

test('single keyframe is static at its center', () => {
  const c = interpolateReframeCenter([{ time: 3, centerX: 0.4, centerY: 0.6 }], 5);
  assert.equal(c.isStatic, true);
  assert.ok(Math.abs(c.centerX - 0.4) < 1e-9);
  assert.ok(Math.abs(c.centerY - 0.6) < 1e-9);
});

test('near-identical keyframes collapse to static (export threshold 0.015/0.02)', () => {
  const c = interpolateReframeCenter(
    [
      { time: 0, centerX: 0.5, centerY: 0.4 },
      { time: 1, centerX: 0.51, centerY: 0.415 },
      { time: 2, centerX: 0.505, centerY: 0.41 },
    ],
    1
  );
  assert.equal(c.isStatic, true);
  assert.ok(Math.abs(c.centerX - 0.5) < 1e-9);
});

test('interpolates linearly between keyframes and clamps outside the range', () => {
  const kfs = [
    { time: 1, centerX: 0.3, centerY: 0.2 },
    { time: 3, centerX: 0.7, centerY: 0.8 },
  ];
  const mid = interpolateReframeCenter(kfs, 2);
  assert.equal(mid.isStatic, false);
  assert.ok(Math.abs(mid.centerX - 0.5) < 1e-9);
  assert.ok(Math.abs(mid.centerY - 0.5) < 1e-9);
  const before = interpolateReframeCenter(kfs, 0);
  assert.ok(Math.abs(before.centerX - 0.3) < 1e-9);
  const after = interpolateReframeCenter(kfs, 9);
  assert.ok(Math.abs(after.centerX - 0.7) < 1e-9);
  assert.ok(Math.abs(after.centerY - 0.8) < 1e-9);
});

test('piecewise segments pick the correct interval', () => {
  const kfs = [
    { time: 0, centerX: 0.47, centerY: 0.22 },
    { time: 1, centerX: 0.44, centerY: 0.23 },
    { time: 2, centerX: 0.42, centerY: 0.27 },
    { time: 3, centerX: 0.27, centerY: 0.30 },
  ];
  const c = interpolateReframeCenter(kfs, 2.5);
  assert.ok(Math.abs(c.centerX - 0.345) < 1e-9);
  assert.ok(Math.abs(c.centerY - 0.285) < 1e-9);
});

test('missing centerY defaults to 0.38 (mirrors the export default)', () => {
  const c = interpolateReframeCenter(
    [
      { time: 0, centerX: 0.2 },
      { time: 2, centerX: 0.6 },
    ],
    1
  );
  assert.ok(Math.abs(c.centerX - 0.4) < 1e-9);
  assert.ok(Math.abs(c.centerY - 0.38) < 1e-9);
});
