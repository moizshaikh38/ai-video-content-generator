import {test} from 'node:test';import assert from 'node:assert/strict';
import {SmartReframeService as S} from '../services/smartReframeService.js';
import {presentFit43} from '../shared/automaticLayoutPolicy.js';
const samples=Array.from({length:8},(_,i)=>({time:i*.25,faces:[{track_id:'a',x:.4,y:.2,width:.1,height:.12,center_x:.45,center_y:.26,confidence:.95}],persons:[{x:.3,y:.15,width:.3,height:.65,confidence:.9}]}));
const opts={rawSamples:samples,duration:2,sourceWidth:640,sourceHeight:360};
const region={start:0,end:2,x:.15,y:.9,width:.65,height:.05,confidence:.9};
test('measured lower third constrains the subject crop including a margin',()=>{
 const base=S.computeShotComposition(opts)[0];const p=S.computeShotComposition({...opts,protectedContentRegions:[region]})[0];
 const k=p.keyframes[0];assert.ok(k.centerY+p.windowH/2>=.975-1e-9);assert.ok(k.centerX-p.windowW/2<=.125+1e-9);assert.ok(p.windowH>base.windowH);
});
test('absent, invalid, weak, and nonoverlapping regions do not change a crop',()=>{
 const base=S.computeShotComposition(opts);
 for(const r of [{...region,width:NaN},{...region,end:0},{...region,x:-.1},{...region,width:1},{...region,confidence:.5},{...region,start:2,end:3}])assert.deepEqual(S.computeShotComposition({...opts,protectedContentRegions:[r]}),base);
});
test('content constraints preserve one clip-wide window size across cuts',()=>{
 const rawSamples=[...samples,...samples.map(s=>({...s,time:s.time+2}))];
 const p=S.computeShotComposition({...opts,duration:4,rawSamples,sceneCuts:[2],protectedContentRegions:[region]});
 assert.equal(p.length,2);assert.equal(p[0].windowW,p[1].windowW);assert.equal(p[0].windowH,p[1].windowH);
});
test('unknown-shot content must not be discarded by the subject-window review policy',()=>{
 const rawSamples=[...samples,...samples.map(s=>({time:s.time+2,faces:[],persons:[]}))];
 const p=S.computeShotComposition({...opts,duration:4,rawSamples,sceneCuts:[2],unresolvedContextPolicy:'shared-subject-window',protectedContentRegions:[{...region,start:2,end:4}]});
 assert.equal(p[0].windowW,1);assert.equal(p[0].windowH,1);assert.equal(p[1].contextStatus,'unresolved-preserved');
});
test('clip-wide protected region with omitted start/end protects all shots across cuts', () => {
  const rawSamples = [...samples, ...samples.map(s => ({ ...s, time: s.time + 2 }))];
  const clipWideRegion = { x: .1, y: .85, width: .3, height: .1, confidence: .95 };
  const p = S.computeShotComposition({ ...opts, duration: 4, rawSamples, sceneCuts: [2], protectedContentRegions: [clipWideRegion as any] });
  assert.equal(p.length, 2);
  for (const shot of p) {
    const k = shot.keyframes[0];
    assert.ok(k.centerX - shot.windowW / 2 <= .1 + 1e-4);
    assert.ok(k.centerY + shot.windowH / 2 >= .95 - 1e-4);
  }
});
test('extreme left protected region is preserved without clipping', () => {
  const leftRegion = { start: 0, end: 2, x: .01, y: .2, width: .15, height: .2, confidence: .95 };
  const p = S.computeShotComposition({ ...opts, protectedContentRegions: [leftRegion] })[0];
  const k = p.keyframes[0];
  assert.ok(k.centerX - p.windowW / 2 <= .01 + 1e-4, 'Crop left boundary must cover extreme left region');
});
test('extreme right protected region is preserved without clipping', () => {
  const rightRegion = { start: 0, end: 2, x: .88, y: .2, width: .11, height: .2, confidence: .95 };
  const p = S.computeShotComposition({ ...opts, protectedContentRegions: [rightRegion] })[0];
  const k = p.keyframes[0];
  assert.ok(k.centerX + p.windowW / 2 >= .99 - 1e-4, 'Crop right boundary must cover extreme right region');
});
test('multiple regions spanning wider than 4:3 fall back to full source with review state', () => {
  const leftReg = { start: 0, end: 2, x: .02, y: .4, width: .1, height: .2, confidence: .95 };
  const rightReg = { start: 0, end: 2, x: .88, y: .4, width: .1, height: .2, confidence: .95 };
  const p = S.computeShotComposition({ ...opts, windowScope: 'shot', automaticFitAspect: '4:3', protectedContentRegions: [leftReg, rightReg] })[0];
  assert.equal(p.windowW, 1, 'Opposing regions exceeding 4:3 must preserve full source width');
  assert.equal(p.contextStatus, 'unresolved-review-required');
  assert.match(p.uncertainty!, /Safe full-source Fit/);
});
test('protected regions survive across 1:1 and 9:16 source aspect ratios', () => {
  const squareOpts = { ...opts, sourceWidth: 720, sourceHeight: 720 };
  const pSquare = S.computeShotComposition({ ...squareOpts, protectedContentRegions: [region] })[0];
  const kSq = pSquare.keyframes[0];
  assert.ok(kSq.centerY + pSquare.windowH / 2 >= .95);

  const portraitOpts = { ...opts, sourceWidth: 360, sourceHeight: 640 };
  const pPortrait = S.computeShotComposition({ ...portraitOpts, protectedContentRegions: [region] })[0];
  const kPort = pPortrait.keyframes[0];
  assert.ok(kPort.centerX - pPortrait.windowW / 2 <= .15 + 1e-4);
  assert.ok(kPort.centerX + pPortrait.windowW / 2 >= .80 - 1e-4);
});
test('rendered shot composition filter output covers protected content region', () => {
  const parseCrop = (filter: string, srcW: number, srcH: number, shot: any) => {
    const m = filter.match(/crop=(\d+):(\d+):'([^']+)':([0-9a-zA-Z_()\\,*+-.]+)/);
    assert.ok(m, 'Must find crop expression in filter: ' + filter);
    const winW = Number(m[1]), winH = Number(m[2]);
    const cx = shot.keyframes[0].centerX;
    const cy = shot.keyframes[0].centerY;
    assert.ok(m[3].includes(cx.toFixed(4)), `cropX expression must contain keyframe centerX ${cx.toFixed(4)}`);
    assert.ok(m[4].includes(cy.toFixed(4)), `cropY expression must contain keyframe centerY ${cy.toFixed(4)}`);
    const cropX = Math.min(Math.max(srcW * cx - winW / 2, 0), srcW - winW);
    const cropY = Math.min(Math.max(srcH * cy - winH / 2, 0), srcH - winH);
    return { winW, winH, cropX, cropY, left: cropX, right: cropX + winW, top: cropY, bottom: cropY + winH };
  };

  // 1. Extreme left region (x = 0.01)
  const leftReg = { start: 0, end: 2, x: .01, y: .2, width: .15, height: .2, confidence: .95 };
  const planL = S.computeShotComposition({ ...opts, protectedContentRegions: [leftReg] });
  const filterL = S.buildShotCompositionFilter({ plan: planL, duration: 2, sourceWidth: 640, sourceHeight: 360 });
  const cropL = parseCrop(filterL, 640, 360, planL[0]);
  const pLeftBoundary = Math.max(0, leftReg.x - .025) * 640;
  const pRightBoundaryL = Math.min(1, leftReg.x + leftReg.width + .025) * 640;
  assert.ok(cropL.left <= pLeftBoundary + 1.0, `Left boundary (${cropL.left}) must cover protected left (${pLeftBoundary})`);
  assert.ok(cropL.right >= pRightBoundaryL - 1.0, `Right boundary (${cropL.right}) must cover protected right (${pRightBoundaryL})`);

  // 2. Extreme right region (x = 0.88, x + w = 0.99)
  const rightReg = { start: 0, end: 2, x: .88, y: .2, width: .11, height: .2, confidence: .95 };
  const planR = S.computeShotComposition({ ...opts, protectedContentRegions: [rightReg] });
  const filterR = S.buildShotCompositionFilter({ plan: planR, duration: 2, sourceWidth: 640, sourceHeight: 360 });
  const cropR = parseCrop(filterR, 640, 360, planR[0]);
  const pRightBoundary = Math.min(1, rightReg.x + rightReg.width + .025) * 640;
  const pLeftBoundaryR = Math.max(0, rightReg.x - .025) * 640;
  assert.ok(cropR.right >= pRightBoundary - 1.0, `Right boundary (${cropR.right}) must cover protected right (${pRightBoundary})`);
  assert.ok(cropR.left <= pLeftBoundaryR + 1.0, `Left boundary (${cropR.left}) must cover protected left (${pLeftBoundaryR})`);

  // 3. Extreme top and bottom regions (margin checks)
  const topReg = { start: 0, end: 2, x: .3, y: .01, width: .4, height: .08, confidence: .95 };
  const botReg = { start: 0, end: 2, x: .3, y: .91, width: .4, height: .08, confidence: .95 };
  const planTB = S.computeShotComposition({ ...opts, protectedContentRegions: [topReg, botReg] });
  const filterTB = S.buildShotCompositionFilter({ plan: planTB, duration: 2, sourceWidth: 640, sourceHeight: 360 });
  const cropTB = parseCrop(filterTB, 640, 360, planTB[0]);
  const pTopBoundary = Math.max(0, topReg.y - .025) * 360;
  const pBotBoundary = Math.min(1, botReg.y + botReg.height + .025) * 360;
  assert.ok(cropTB.top <= pTopBoundary + 1.0, `Top boundary (${cropTB.top}) must cover protected top (${pTopBoundary})`);
  assert.ok(cropTB.bottom >= pBotBoundary - 1.0, `Bottom boundary (${cropTB.bottom}) must cover protected bottom (${pBotBoundary})`);
});
test('missing or invalid confidence does not become trusted automatically', () => {
  const base = S.computeShotComposition(opts)[0];
  const missingConf = { start: 0, end: 2, x: .01, y: .85, width: .3, height: .1 };
  const nanConf = { ...missingConf, confidence: NaN };
  const lowConf = { ...missingConf, confidence: 0.69 };
  const nullConf = { ...missingConf, confidence: null as any };
  for (const r of [missingConf as any, nanConf, lowConf, nullConf]) {
    const res = S.computeShotComposition({ ...opts, protectedContentRegions: [r] })[0];
    assert.deepEqual(res.windowW, base.windowW, 'Untrusted confidence must not resize window');
    assert.deepEqual(res.keyframes, base.keyframes, 'Untrusted confidence must not alter keyframe centering');
  }

  // Also verify conversation split is not blocked by missing/untrusted confidence
  const splitSamples = Array.from({ length: 8 }, (_, i) => ({
    time: i * .25,
    faces: [
      { track_id: 'a', x: .1, y: .2, width: .1, height: .15, center_x: .15, center_y: .27, confidence: .95 },
      { track_id: 'b', x: .7, y: .2, width: .1, height: .15, center_x: .75, center_y: .27, confidence: .95 },
    ],
    persons: [
      { x: .05, y: .15, width: .25, height: .7, confidence: .9 },
      { x: .65, y: .15, width: .25, height: .7, confidence: .9 },
    ],
  }));
  const splitOpts = { rawSamples: splitSamples, duration: 2, sourceWidth: 640, sourceHeight: 360, windowScope: 'shot' as const, allowConversationSplit: true };
  const splitPlanBase = S.computeShotComposition(splitOpts)[0];
  assert.ok(splitPlanBase.split, 'Baseline should select split');
  const splitPlanUntrusted = S.computeShotComposition({ ...splitOpts, protectedContentRegions: [missingConf as any] })[0];
  assert.ok(splitPlanUntrusted.split, 'Missing confidence must not block conversation split');
});
test('Safe full-source Fit returns windowW 1, windowH 1, centered keyframe, and explicit review state', () => {
  const leftReg = { start: 0, end: 2, x: .02, y: .4, width: .1, height: .2, confidence: .95 };
  const rightReg = { start: 0, end: 2, x: .88, y: .4, width: .1, height: .2, confidence: .95 };
  const shot = S.computeShotComposition({ ...opts, windowScope: 'shot', automaticFitAspect: '4:3', protectedContentRegions: [leftReg, rightReg] })[0];
  assert.equal(shot.windowW, 1, 'Full-source fallback must return windowW = 1');
  assert.equal(shot.windowH, 1, 'Full-source fallback must return windowH = 1');
  assert.equal(shot.kind, 'fit', 'Full-source fallback must be kind = fit');
  assert.equal(shot.contextStatus, 'unresolved-review-required', 'Must expose explicit review state');
  assert.match(shot.uncertainty!, /Safe full-source Fit/);
  assert.equal(shot.keyframes.length, 1);
  assert.equal(shot.keyframes[0].centerX, 0.5, 'Keyframe must be centered at X = 0.5');
  assert.equal(shot.keyframes[0].centerY, 0.5, 'Keyframe must be centered at Y = 0.5');
});
test('subject near left edge and protected content near right edge: 4:3 preserves union or falls back to full-source Fit', () => {
  // 1. Subject on left and protected content on right that FIT within 4:3
  const leftSubjectSamples = Array.from({ length: 8 }, (_, i) => ({
    time: i * .25,
    faces: [{ track_id: 'sub', x: .15, y: .2, width: .08, height: .10, center_x: .19, center_y: .25, confidence: .95 }],
    persons: [{ x: .12, y: .15, width: .14, height: .65, confidence: .9 }],
  }));
  const rightText = { start: 0, end: 2, x: .65, y: .4, width: .10, height: .15, confidence: .95 };
  const fitPlan = S.computeShotComposition({
    rawSamples: leftSubjectSamples,
    duration: 2,
    sourceWidth: 640,
    sourceHeight: 360,
    windowScope: 'shot',
    automaticFitAspect: '4:3',
    protectedContentRegions: [rightText],
  })[0];

  const kFit = fitPlan.keyframes[0];
  const fitCropLeft = kFit.centerX - fitPlan.windowW / 2;
  const fitCropRight = kFit.centerX + fitPlan.windowW / 2;
  // Subject left bound is 0.12, text right bound with margin is 0.65 + 0.10 + 0.025 = 0.775
  assert.ok(fitCropLeft <= 0.12 + 1e-4, `4:3 crop left (${fitCropLeft}) must cover subject left (0.12)`);
  assert.ok(fitCropRight >= 0.775 - 1e-4, `4:3 crop right (${fitCropRight}) must cover protected right (0.775)`);
  assert.notEqual(fitPlan.windowW, 1, 'Should adapt to 4:3 without needing full-source fallback');
  assert.equal(fitPlan.contextStatus, undefined, 'Clean preservation without conflict must not set unresolved review status');

  // Also check FFmpeg filter bounds for the safe fit
  const fitFilter = S.buildShotCompositionFilter({ plan: [fitPlan], duration: 2, sourceWidth: 640, sourceHeight: 360 });
  const m = fitFilter.match(/crop=(\d+):(\d+):'([^']+)':([0-9a-zA-Z_()\\,*+-.]+)/);
  assert.ok(m, 'Must produce crop filter');
  const winW = Number(m[1]);
  const cropX = Math.min(Math.max(640 * kFit.centerX - winW / 2, 0), 640 - winW);
  assert.ok(cropX <= 0.12 * 640 + 1.0, 'FFmpeg crop left must cover subject left');
  assert.ok(cropX + winW >= 0.775 * 640 - 1.0, 'FFmpeg crop right must cover protected right');

  // 2. Subject on extreme left and protected content on extreme right that CANNOT fit in 4:3
  const farLeftSubjectSamples = Array.from({ length: 8 }, (_, i) => ({
    time: i * .25,
    faces: [{ track_id: 'sub2', x: .05, y: .2, width: .08, height: .10, center_x: .09, center_y: .25, confidence: .95 }],
    persons: [{ x: .04, y: .15, width: .14, height: .65, confidence: .9 }],
  }));
  const farRightText = { start: 0, end: 2, x: .86, y: .4, width: .10, height: .15, confidence: .95 };
  const fallbackShot = S.computeShotComposition({
    rawSamples: farLeftSubjectSamples,
    duration: 2,
    sourceWidth: 640,
    sourceHeight: 360,
    windowScope: 'shot',
    automaticFitAspect: '4:3',
    protectedContentRegions: [farRightText],
  })[0];

  assert.equal(fallbackShot.windowW, 1, 'Union exceeding 4:3 must return windowW = 1');
  assert.equal(fallbackShot.windowH, 1, 'Union exceeding 4:3 must return windowH = 1');
  assert.equal(fallbackShot.kind, 'fit', 'Must be kind fit');
  assert.equal(fallbackShot.contextStatus, 'unresolved-review-required', 'Must require review');
  assert.match(fallbackShot.uncertainty!, /Safe full-source Fit/);
  assert.equal(fallbackShot.keyframes[0].centerX, 0.5);
  assert.equal(fallbackShot.keyframes[0].centerY, 0.5);
});
test('presentFit43 preserves contextStatus when contentConstrained fits safely, and sets review when conflicting', () => {
  // Safe fit: union bounds fit within 4:3
  const safeShot: any = {
    start: 0,
    windowW: 0.5,
    windowH: 0.6,
    keyframes: [{ time: 0, centerX: 0.45, centerY: 0.5 }],
    contentConstrained: true,
    protectedBounds: { left: 0.2, right: 0.7, top: 0.2, bottom: 0.8 },
  };
  const [safeRes] = presentFit43([safeShot], 640, 360);
  assert.equal(safeRes.contextStatus, undefined, 'Successful preservation must not introduce review-required status');
  assert.ok(safeRes.windowW * 640 / (safeRes.windowH * 360) - 4/3 < 1e-4, 'Must adapt to 4:3 aspect');

  // Conflict: union bounds cannot fit in 4:3
  const conflictShot: any = {
    start: 0,
    windowW: 0.9,
    windowH: 0.8,
    keyframes: [{ time: 0, centerX: 0.5, centerY: 0.5 }],
    contentConstrained: true,
    protectedBounds: { left: 0.05, right: 0.95, top: 0.1, bottom: 0.9 },
  };
  const [conflictRes] = presentFit43([conflictShot], 640, 360);
  assert.equal(conflictRes.contextStatus, 'unresolved-review-required', 'Conflict must require review');
  assert.equal(conflictRes.windowW, 1, 'Conflict must fall back to full source width');
  assert.equal(conflictRes.windowH, 1, 'Conflict must fall back to full source height');
  assert.match(conflictRes.uncertainty!, /Safe full-source Fit/);
});
