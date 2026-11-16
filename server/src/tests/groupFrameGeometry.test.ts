import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SmartReframeService } from '../services/smartReframeService.js';

const twoFaceSamples = (ax: number, bx: number, y = 0.3, n = 12) =>
  Array.from({ length: n }, (_, i) => ({
    time: i * 0.5,
    faces: [
      { center_x: ax, center_y: y, confidence: 0.9, track_id: 'a' },
      { center_x: bx, center_y: y + 0.02, confidence: 0.9, track_id: 'b' },
    ],
  }));

const oneFaceSamples = (x = 0.4, n = 12) =>
  Array.from({ length: n }, (_, i) => ({
    time: i * 0.5,
    faces: [{ center_x: x, center_y: 0.3, confidence: 0.9, track_id: 'a' }],
  }));

describe('computeGroupFrameGeometry', () => {
  test('engages for multi-person clips and covers the widest arrangement with margin', () => {
    const g = SmartReframeService.computeGroupFrameGeometry({
      rawSamples: twoFaceSamples(0.35, 0.6),
      sourceWidth: 1728,
      sourceHeight: 720,
    });
    assert.ok(g, 'group geometry expected');
    // span 0.25 -> 0.25*1.9+0.1 = 0.575
    assert.ok(Math.abs(g!.windowW - 0.575) < 1e-6, `windowW=${g!.windowW}`);
    // smoothed midpoint of 0.35/0.6 is 0.475
    const mid = g!.keyframes[Math.floor(g!.keyframes.length / 2)];
    assert.ok(Math.abs(mid.centerX - 0.475) < 0.02, `centerX=${mid.centerX}`);
    assert.equal(g!.keyframes[0].time, 0);
  });

  test('returns null for single-person clips (tight tracking preserved)', () => {
    const g = SmartReframeService.computeGroupFrameGeometry({
      rawSamples: oneFaceSamples(),
      sourceWidth: 1728,
      sourceHeight: 720,
    });
    assert.equal(g, null);
  });

  test('returns null with too few samples or bad inputs', () => {
    assert.equal(
      SmartReframeService.computeGroupFrameGeometry({ rawSamples: twoFaceSamples(0.3, 0.6, 0.3, 2), sourceWidth: 1728, sourceHeight: 720 }),
      null
    );
    assert.equal(SmartReframeService.computeGroupFrameGeometry({ rawSamples: null, sourceWidth: 1728, sourceHeight: 720 }), null);
    assert.equal(
      SmartReframeService.computeGroupFrameGeometry({ rawSamples: twoFaceSamples(0.3, 0.6), sourceWidth: 0, sourceHeight: 720 }),
      null
    );
  });

  test('window clamps to 0.92 for very wide arrangements', () => {
    const g = SmartReframeService.computeGroupFrameGeometry({
      rawSamples: twoFaceSamples(0.05, 0.9),
      sourceWidth: 1728,
      sourceHeight: 720,
    });
    assert.equal(g!.windowW, 0.92);
  });
});

describe('buildGroupFitFilter', () => {
  test('standalone form is a complete graph with blur backdrop, window crop and overlay', () => {
    const g = SmartReframeService.computeGroupFrameGeometry({
      rawSamples: twoFaceSamples(0.35, 0.6),
      sourceWidth: 1728,
      sourceHeight: 720,
    })!;
    const f = SmartReframeService.buildGroupFitFilter({
      keyframes: g.keyframes,
      windowW: g.windowW,
      sourceWidth: 1728,
      sourceHeight: 720,
    });
    assert.ok(f.startsWith('[0:v]split=2'), f);
    assert.ok(f.includes('boxblur=25:5'), f);
    assert.ok(f.includes('crop=994:720'), f, 'window crop dims: 4:3 window clamped to source height');
    assert.ok(f.includes('scale=1080:-2'), f);
    assert.ok(f.includes('overlay=(W-w)/2:(H-h)*0.42'), f);
    assert.ok(f.endsWith('[out]'), f);
    // commas inside the keyframe expressions must be escaped for filter parsing
    assert.ok(!/if\(lte\(t,/.test(f), 'unescaped commas in expressions');
  });

  test('tagged (Pro graph) variant stays chain-safe', () => {
    const g = SmartReframeService.computeGroupFrameGeometry({
      rawSamples: twoFaceSamples(0.35, 0.6),
      sourceWidth: 1728,
      sourceHeight: 720,
    })!;
    const f = SmartReframeService.buildGroupFitFilter({
      keyframes: g.keyframes,
      windowW: g.windowW,
      sourceWidth: 1728,
      sourceHeight: 720,
      tag: 'vc123',
    });
    assert.ok(!f.includes('[0:v]'), 'tagged form must not reference [0:v]');
    assert.ok(!f.includes('[out]'), 'tagged form must not emit [out]');
    assert.ok(f.startsWith('split=2[vc123_gbg_]'), f);
    assert.ok(f.includes('[vc123_gb_][vc123_gf_]overlay'), f);
  });

  test('buildLayoutCropFilter routes track layout with groupFrame to the group fit filter', () => {
    const g = SmartReframeService.computeGroupFrameGeometry({
      rawSamples: twoFaceSamples(0.35, 0.6),
      sourceWidth: 1728,
      sourceHeight: 720,
    })!;
    const f = SmartReframeService.buildLayoutCropFilter({
      layoutMode: 'track',
      aspectRatio: '9:16',
      keyframes: [{ time: 0, centerX: 0.4, centerY: 0.3 }],
      sourceWidth: 1728,
      sourceHeight: 720,
      duration: 9,
      groupFrame: g,
    });
    assert.ok(f.includes('boxblur=25:5'), 'group fit filter expected');
  });

  test('buildLayoutCropFilter without groupFrame keeps the tight tracker', () => {
    const f = SmartReframeService.buildLayoutCropFilter({
      layoutMode: 'track',
      aspectRatio: '9:16',
      keyframes: [
        { time: 0, centerX: 0.4, centerY: 0.3 },
        { time: 1, centerX: 0.6, centerY: 0.3 },
      ],
      sourceWidth: 1728,
      sourceHeight: 720,
      duration: 9,
    });
    assert.ok(f.includes('scale=1080:1920:force_original_aspect_ratio=increase'), f);
    assert.ok(!f.includes('boxblur'), f);
  });
});
