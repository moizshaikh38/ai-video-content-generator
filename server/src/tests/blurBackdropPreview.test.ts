import test from 'node:test';import assert from 'node:assert/strict';
import {previewBackdropBlurPx,PREVIEW_BACKDROP_COLOR_MATRIX} from '../shared/blurBackdropPreview.js';
test('preview backdrop blur uses design width and five-pass box variance',()=>{const r=previewBackdropBlurPx(1080);assert.equal(r,Math.sqrt(5*25*26/3));assert.equal(previewBackdropBlurPx(360),r/3);assert.equal(previewBackdropBlurPx(720),r*2/3);assert.ok(r>32&&r<34);});
test('invalid preview size has bounded fallback',()=>{for(const w of[NaN,Infinity,0,-1])assert.equal(previewBackdropBlurPx(w),previewBackdropBlurPx(360));});
test('color approximation is additive, keeps alpha unchanged',()=>{const a=PREVIEW_BACKDROP_COLOR_MATRIX.split(' ').map(Number);assert.equal(a.length,20);assert.equal(a[4],-.125);assert.equal(a[9],-.125);assert.equal(a[14],-.125);assert.deepEqual(a.slice(15),[0,0,0,1,0]);});
