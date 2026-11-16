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

describe('group fit ghost-face filtering', () => {
  const face = (x: number, y: number, w: number, h: number, id: string) => ({
    center_x: x, center_y: y, width: w, height: h, confidence: 0.9, track_id: id,
  });
  test('ignores tiny false-positive faces far from the subject (no group zoom-out)', () => {
    // single speaker + small ghosts (hand / lamp / top-edge artifact)
    const samples = Array.from({ length: 12 }, (_, i) => ({
      time: i * 0.5,
      faces: [
        face(0.28, 0.31, 0.22, 0.23, 'speaker'),
        face(0.52, 0.06, 0.07, 0.08, 'ghost-top'),
        face(0.37, 0.79, 0.06, 0.07, 'ghost-hand'),
      ],
    }));
    const g = SmartReframeService.computeGroupFrameGeometry({
      rawSamples: samples,
      sourceWidth: 1920,
      sourceHeight: 1080,
    });
    assert.equal(g, null, 'ghost faces must not force group fit');
  });

  test('keeps real two-person groups when faces are person-scale', () => {
    const samples = Array.from({ length: 12 }, (_, i) => ({
      time: i * 0.5,
      faces: [
        face(0.2, 0.3, 0.2, 0.22, 'a'),
        face(0.75, 0.32, 0.19, 0.21, 'b'),
        face(0.5, 0.05, 0.05, 0.05, 'ghost'),
      ],
    }));
    const g = SmartReframeService.computeGroupFrameGeometry({
      rawSamples: samples,
      sourceWidth: 1920,
      sourceHeight: 1080,
    });
    assert.ok(g, 'real group expected');
    // span between real faces: 0.55 * 1.9 + 0.1 = 1.145 -> clamped 0.95; ghost must not widen
    assert.ok(g!.windowW <= 0.95 + 1e-9);
    const mid = g!.keyframes[Math.floor(g!.keyframes.length / 2)];
    assert.ok(Math.abs(mid.centerX - 0.475) < 0.03, `centerX=${mid.centerX} should sit between the two real faces`);
  });
});

describe('computeGroupFrameGeometry adaptive composition (face sizes present)', () => {
  const sizedTwoShot = (n = 12) =>
    Array.from({ length: n }, (_, i) => ({
      time: i * 0.5,
      faces: [
        { center_x: 0.21, center_y: 0.28, width: 0.05, height: 0.12, confidence: 0.9, track_id: 'a' },
        { center_x: 0.63, center_y: 0.3, width: 0.05, height: 0.12, confidence: 0.9, track_id: 'b' },
      ],
    }));

  test('returns an adaptive windowH tighter than the legacy 4:3 window', () => {
    const g = SmartReframeService.computeGroupFrameGeometry({
      rawSamples: sizedTwoShot(),
      sourceWidth: 1728,
      sourceHeight: 720,
    });
    assert.ok(g, 'group geometry expected');
    assert.ok(g!.windowH !== undefined, 'adaptive windowH expected when face sizes exist');
    // Wider body/context safety is intentional. For a distant pair the
    // source's height is the hard limit: do not shrink their context merely
    // to meet an aesthetic band-height target.
    assert.ok(g!.windowW >= 0.42 + 6 * 0.05 - 1e-6, `windowW=${g!.windowW}`);
    const bandFraction = ((g!.windowH! * 720) / (g!.windowW * 1728)) * (1080 / 1920);
    const physicalMax = (720 / (g!.windowW * 1728)) * (1080 / 1920);
    assert.ok(bandFraction >= Math.min(0.38, physicalMax) - 1e-6 && bandFraction <= 0.48, `band=${bandFraction}`);
  });

  test('headroom bias: window top sits above the highest face, eyes in upper band', () => {
    const g = SmartReframeService.computeGroupFrameGeometry({
      rawSamples: sizedTwoShot(),
      sourceWidth: 1728,
      sourceHeight: 720,
    });
    assert.ok(g && g.windowH !== undefined);
    const mid = g!.keyframes[Math.floor(g!.keyframes.length / 2)];
    const top = mid.centerY - g!.windowH! / 2;
    const highestFaceTop = 0.28 - 0.12 / 2; // 0.22
    assert.ok(top < highestFaceTop, `window top ${top} must be above highest face top ${highestFaceTop}`);
    const faceCenterRelWindow = (0.28 - top) / g!.windowH!;
    assert.ok(faceCenterRelWindow < 0.45, `face center sits at ${faceCenterRelWindow} of window height`);
  });

  test('samples without face sizes keep the legacy 4:3 path and no windowH', () => {
    const g = SmartReframeService.computeGroupFrameGeometry({
      rawSamples: twoFaceSamples(0.35, 0.6),
      sourceWidth: 1728,
      sourceHeight: 720,
    });
    assert.ok(g);
    assert.equal(g!.windowH, undefined);
    assert.ok(Math.abs(g!.windowW - 0.575) < 1e-6, `windowW=${g!.windowW}`);
  });

  test('person-scale outlier far below the group does not drag the window down', () => {
    const samples = sizedTwoShot().map((s) => ({
      ...s,
      faces: [
        ...s.faces,
        // hand closeup: area >= real faces but 2.5x taller than median face height
        { center_x: 0.4, center_y: 0.82, width: 0.12, height: 0.42, confidence: 0.9, track_id: 'hand' },
      ],
    }));
    const g = SmartReframeService.computeGroupFrameGeometry({
      rawSamples: samples,
      sourceWidth: 1728,
      sourceHeight: 720,
    });
    assert.ok(g, 'real two-person group still expected');
    const mid = g!.keyframes[Math.floor(g!.keyframes.length / 2)];
    assert.ok(mid.centerY < 0.55, `centerY=${mid.centerY} dragged down by hand outlier`);
  });
});

test('group keyframes smooth jitter: velocity capped, no per-sample sign flips', () => {
  // Raw centers zigzagging like real detector noise (±0.03 fraction = ±50px at 1728w).
  const rawSamples = [];
  for (let i = 0; i <= 16; i++) {
    const jitter = (i % 2 === 0 ? 1 : -1) * 0.03;
    rawSamples.push({
      time: i * 0.25,
      faces: [
        { center_x: 0.40 + jitter, center_y: 0.5, confidence: 0.9, track_id: 'a' },
        { center_x: 0.70 + jitter, center_y: 0.5, confidence: 0.9, track_id: 'b' },
      ],
    });
  }
  const g = SmartReframeService.computeGroupFrameGeometry({ rawSamples, sourceWidth: 1728, sourceHeight: 720 });
  const kf = g.keyframes;
  let prevSign = 0;
  let flips = 0;
  // No perceptual threshold: even tiny spline reversals must be counted.
  const NUMERIC_EPSILON = 1e-8;
  for (let i = 1; i < kf.length; i++) {
    const dt = kf[i].time - kf[i - 1].time;
    const vx = (kf[i].centerX - kf[i - 1].centerX) / dt;
    assert.ok(Math.abs(vx) <= 0.120001, `velocity ${vx} exceeds cap at t=${kf[i].time}`);
    const sign = Math.abs(vx) < NUMERIC_EPSILON ? 0 : Math.sign(vx);
    if (sign !== 0 && prevSign !== 0 && sign !== prevSign) flips++;
    if (sign !== 0) prevSign = sign;
  }
  assert.ok(flips <= 1, `smoothed camera reverses direction ${flips} times`);
});


test('stationary two-shot ignores transient extra boxes and locks camera with body margin', () => {
  const rawSamples = Array.from({length: 24}, (_, i) => ({time: i / 4, faces: [
    {center_x: .35 + Math.sin(i)*.004, center_y: .23, width: .05, height: .12, track_id:'left'},
    {center_x: .56 + Math.cos(i)*.004, center_y: .23, width: .05, height: .12, track_id:'right'},
    ...(i % 6 === 0 ? [{center_x:.12,center_y:.32,width:.055,height:.13,track_id:'fleeting-'+i}] : []),
  ]}));
  const g = SmartReframeService.computeGroupFrameGeometry({rawSamples,sourceWidth:1728,sourceHeight:720})!;
  assert.equal(new Set(g.keyframes.map(k => k.centerX)).size,1);
  assert.ok(g.windowW >= .51, 'six face-widths of total body/context margin');
  assert.ok(g.windowW < .65, 'fleeting extra boxes must not set composition width');
});

test('alternating single-person scenes are not mistaken for simultaneous group', () => {
 const rawSamples=Array.from({length:24},(_,i)=>({time:i/4,faces:[{center_x:i<12?.25:.75,center_y:.3,width:.1,height:.2,track_id:i<12?'sceneA':'sceneB'}]}));
 assert.equal(SmartReframeService.computeGroupFrameGeometry({rawSamples,sourceWidth:1280,sourceHeight:720}),null);
});

test('sustained group translation retains motion rather than locking the camera', () => {
 const rawSamples=Array.from({length:24},(_,i)=>({time:i/4,faces:[{center_x:.15+i*.02,center_y:.3,width:.04,height:.12,track_id:'a'},{center_x:.35+i*.02,center_y:.3,width:.04,height:.12,track_id:'b'}]}));
 const g=SmartReframeService.computeGroupFrameGeometry({rawSamples,sourceWidth:1280,sourceHeight:720})!;
 assert.ok(new Set(g.keyframes.map(k=>k.centerX)).size>5);
});


test('one persistent face plus intermittent person-scale hands is not a group',()=>{
 const rawSamples=Array.from({length:50},(_,i)=>({time:i/4,faces:[{track_id:'speaker',center_x:.27,center_y:.31,width:.14,height:.33},...(i<13?[{track_id:'hand',center_x:.32,center_y:.73,width:.14,height:.33}]:[])]}));
 assert.equal(SmartReframeService.computeGroupFrameGeometry({rawSamples,sourceWidth:1920,sourceHeight:1080}),null);
});
