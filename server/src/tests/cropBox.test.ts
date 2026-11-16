import { describe, it, expect } from 'vitest';
import { resolveFitMode, applyItemLayout } from '../../../src/lib/itemLayout';
import { boxFromCrop, cropFromBox, resizeBox, moveBox } from '../../../src/lib/cropBox';

const A = 9 / 16;
const inside = (b: { left: number; top: number; w: number; h: number }) => {
  expect(b.left).toBeGreaterThanOrEqual(-1e-9); expect(b.top).toBeGreaterThanOrEqual(-1e-9);
  expect(b.left + b.w).toBeLessThanOrEqual(1 + 1e-9); expect(b.top + b.h).toBeLessThanOrEqual(1 + 1e-9);
};
describe('cropBox', () => {
  it('round-trips crop <-> box for several sources', () => {
    for (const [w, h] of [[1920, 1080], [1080, 1920], [1000, 1000]]) {
      for (const c of [{ focusX: .5, focusY: .5, scale: 1 }, { focusX: .2, focusY: .7, scale: 2.5 }, { focusX: 1, focusY: 0, scale: 4 }]) {
        const r = cropFromBox(w, h, A, boxFromCrop(w, h, A, c));
        if (!(w === 1080 && h === 1920)) { expect(r.scale).toBeCloseTo(c.scale, 2); expect(r.focusX).toBeCloseTo(c.focusX, 2); expect(r.focusY).toBeCloseTo(c.focusY, 2); }
      }
    }
  });
  it('anchor near bottom-right edge stays inside the frame (reported bug)', () => {
    const b = resizeBox(1920, 1080, A, { x: .98, y: .98 }, { x: 1, y: 1 });
    inside(b);
    const back = boxFromCrop(1920, 1080, A, cropFromBox(1920, 1080, A, b));
    expect(back.w).toBeCloseTo(b.w, 3); expect(back.left).toBeCloseTo(b.left, 2); expect(back.top).toBeCloseTo(b.top, 2);
  });
  it('visible box equals applied box for random drags incl. crossing the anchor', () => {
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const [w, h] of [[1920, 1080], [1080, 1920], [1000, 1000]]) for (let i = 0; i < 300; i++) {
      const anchor = { x: rnd(), y: rnd() }; const p = { x: rnd(), y: rnd() };
      const b = resizeBox(w, h, A, anchor, p); inside(b);
      const back = boxFromCrop(w, h, A, cropFromBox(w, h, A, b));
      expect(back.w).toBeCloseTo(b.w, 2); expect(back.left).toBeCloseTo(b.left, 2); expect(back.top).toBeCloseTo(b.top, 2);
      expect(b.w * w / (b.h * h)).toBeCloseTo(A, 3);
    }
  });
  it('crossing the anchor flips to the other side', () => {
    const b = resizeBox(1920, 1080, A, { x: .6, y: .3 }, { x: .5, y: .1 });
    expect(b.left + b.w).toBeCloseTo(.6, 3); expect(b.top + b.h).toBeCloseTo(.3, 3);
  });
  it('move clamps inside', () => { inside(moveBox({ left: .3, top: .3, w: .3, h: .5 }, 5, 5)); });
});

describe('Fit default', () => {
  it('fit -> blur by default, explicit colour (incl. black) keeps plain fit', () => {
    expect(resolveFitMode(undefined)).toBe('blur');
    expect(resolveFitMode({})).toBe('blur');
    expect(resolveFitMode({ background_user_choice: 'blur' })).toBe('blur');
    expect(resolveFitMode({ background_user_choice: 'color' })).toBe('fit');
    const mk = (canvas: any): any => ({ canvas, tracks: [{ type: 'VIDEO', items: [{ id: 'a' }] }] });
    expect(applyItemLayout(mk({ background_color: '#000000', background_mode: 'color' }), 'a', 'fit').tracks[0].items[0].crop?.mode).toBe('blur');
    expect(applyItemLayout(mk({ background_color: '#000000', background_user_choice: 'color' }), 'a', 'fit').tracks[0].items[0].crop?.mode).toBe('fit');
  });
});

import { buildBackdropFitChain } from '../services/clipRenderService';
import { effectiveFitBand, fitBandApplies } from '../shared/fitBand';
describe('Fit band', () => {
  it('chain crops source to 4:3 and places an 810px band on a 1080x1920 canvas', () => {
    const c = buildBackdropFitChain('9:16', 1, { kind: 'blur', bandAspect: 4 / 3, focusX: .3 }, 'vcd');
    expect(c).toContain('scale=1080:810'); expect(c).toContain('(iw-ow)*0.3000');
    const c4k = buildBackdropFitChain('9:16', 1, { kind: 'blur', bandAspect: 4 / 3 }, 'vcd', 2);
    expect(c4k).toContain('scale=2160:1620');
  });
  it('legacy items without band stay full frame; canvas choice overrides; only 9:16 applies', () => {
    expect(effectiveFitBand({}, { crop: {} })).toBe('full');
    expect(effectiveFitBand({}, { crop: { band: '4:3' } })).toBe('4:3');
    expect(effectiveFitBand({ fit_band: 'full' }, { crop: { band: '4:3' } })).toBe('full');
    expect(fitBandApplies('9:16')).toBe(true); expect(fitBandApplies('16:9')).toBe(false);
  });
});
