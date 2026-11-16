import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
const close = (actual:number,expected:number,digits:number) => assert.ok(Math.abs(actual-expected)<.5*10**(-digits), `${actual} != ${expected} at ${digits} digits`);
import { resolveFitMode, applyItemLayout } from '../../../src/lib/itemLayout';
import { boxFromCrop, cropFromBox, resizeBox, moveBox } from '../../../src/lib/cropBox';

const A = 9 / 16;
const inside = (b: { left: number; top: number; w: number; h: number }) => {
  assert.ok((b.left) >= (-1e-9)); assert.ok((b.top) >= (-1e-9));
  assert.ok((b.left + b.w) <= (1 + 1e-9)); assert.ok((b.top + b.h) <= (1 + 1e-9));
};
describe('cropBox', () => {
  it('round-trips crop <-> box for several sources', () => {
    for (const [w, h] of [[1920, 1080], [1080, 1920], [1000, 1000]]) {
      for (const c of [{ focusX: .5, focusY: .5, scale: 1 }, { focusX: .2, focusY: .7, scale: 2.5 }, { focusX: 1, focusY: 0, scale: 4 }]) {
        const r = cropFromBox(w, h, A, boxFromCrop(w, h, A, c));
        if (!(w === 1080 && h === 1920)) { close(r.scale, c.scale, 2); close(r.focusX, c.focusX, 2); close(r.focusY, c.focusY, 2); }
      }
    }
  });
  it('anchor near bottom-right edge stays inside the frame (reported bug)', () => {
    const b = resizeBox(1920, 1080, A, { x: .98, y: .98 }, { x: 1, y: 1 });
    inside(b);
    const back = boxFromCrop(1920, 1080, A, cropFromBox(1920, 1080, A, b));
    close(back.w, b.w, 3); close(back.left, b.left, 2); close(back.top, b.top, 2);
  });
  it('visible box equals applied box for random drags incl. crossing the anchor', () => {
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const [w, h] of [[1920, 1080], [1080, 1920], [1000, 1000]]) for (let i = 0; i < 300; i++) {
      const anchor = { x: rnd(), y: rnd() }; const p = { x: rnd(), y: rnd() };
      const b = resizeBox(w, h, A, anchor, p); inside(b);
      const back = boxFromCrop(w, h, A, cropFromBox(w, h, A, b));
      close(back.w, b.w, 2); close(back.left, b.left, 2); close(back.top, b.top, 2);
      close(b.w * w / (b.h * h), A, 3);
    }
  });
  it('crossing the anchor flips to the other side', () => {
    const b = resizeBox(1920, 1080, A, { x: .6, y: .3 }, { x: .5, y: .1 });
    close(b.left + b.w, .6, 3); close(b.top + b.h, .3, 3);
  });
  it('move clamps inside', () => { inside(moveBox({ left: .3, top: .3, w: .3, h: .5 }, 5, 5)); });
});

describe('Fit default', () => {
  it('fit -> blur by default, explicit colour (incl. black) keeps plain fit', () => {
    assert.equal(resolveFitMode(undefined), 'blur');
    assert.equal(resolveFitMode({}), 'blur');
    assert.equal(resolveFitMode({ background_user_choice: 'blur' }), 'blur');
    assert.equal(resolveFitMode({ background_user_choice: 'color' }), 'fit');
    const mk = (canvas: any): any => ({ canvas, tracks: [{ type: 'VIDEO', items: [{ id: 'a' }] }] });
    assert.equal(applyItemLayout(mk({ background_color: '#000000', background_mode: 'color' }), 'a', 'fit').tracks[0].items[0].crop?.mode, 'blur');
    assert.equal(applyItemLayout(mk({ background_color: '#000000', background_user_choice: 'color' }), 'a', 'fit').tracks[0].items[0].crop?.mode, 'fit');
  });
});

import { buildBackdropFitChain } from '../services/clipRenderService';
import { effectiveFitBand, fitBandApplies } from '../shared/fitBand';
describe('Fit band', () => {
  it('chain crops source to 4:3 and places an 810px band on a 1080x1920 canvas', () => {
    const c = buildBackdropFitChain('9:16', 1, { kind: 'blur', bandAspect: 4 / 3, focusX: .3 }, 'vcd');
    assert.ok((c).includes('scale=1080:810')); assert.ok(c.includes('(iw-ow)*0.3000'));
    const c4k = buildBackdropFitChain('9:16', 1, { kind: 'blur', bandAspect: 4 / 3 }, 'vcd', 2);
    assert.ok((c4k).includes('scale=2160:1620'));
  });
  it('legacy items without band stay full frame; canvas choice overrides; only 9:16 applies', () => {
    assert.equal(effectiveFitBand({}, { crop: {} }), 'full');
    assert.equal(effectiveFitBand({}, { crop: { band: '4:3' } }), '4:3');
    assert.equal(effectiveFitBand({ fit_band: 'full' }, { crop: { band: '4:3' } }), 'full');
    assert.equal(fitBandApplies('9:16'), true); assert.equal(fitBandApplies('16:9'), false);
  });
});
