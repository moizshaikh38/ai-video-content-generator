import test from 'node:test';import assert from 'node:assert/strict';
import {previewBackdropBlurPx,PREVIEW_BACKDROP_COLOR_MATRIX} from '../shared/blurBackdropPreview.js';
test('preview backdrop blur uses design width and five-pass box variance',()=>{const r=previewBackdropBlurPx(1080);assert.equal(r,Math.sqrt(5*25*26/3));assert.equal(previewBackdropBlurPx(360),r/3);assert.equal(previewBackdropBlurPx(720),r*2/3);assert.ok(r>32&&r<34);});
test('invalid preview size has bounded fallback',()=>{for(const w of[NaN,Infinity,0,-1])assert.equal(previewBackdropBlurPx(w),previewBackdropBlurPx(360));});
test('color approximation is additive, keeps alpha unchanged',()=>{const a=PREVIEW_BACKDROP_COLOR_MATRIX.split(' ').map(Number);assert.equal(a.length,20);assert.equal(a[4],-.17);assert.equal(a[9],-.17);assert.equal(a[14],-.17);assert.equal(a[0]+a[1]+a[2],.95);assert.deepEqual(a.slice(15),[0,0,0,1,0]);});

test('decoded FFmpeg midtone color patches are approximated within three levels',()=>{
 const m=PREVIEW_BACKDROP_COLOR_MATRIX.split(' ').map(Number);
 const patches=[[[96,96,96],[48,48,48]],[[160,160,160],[109,109,109]],[[224,224,224],[170,170,170]],[[160,96,96],[111,47,46]],[[96,160,96],[46,111,46]],[[96,96,160],[47,48,111]],[[192,128,96],[141,78,45]],[[96,128,192],[45,78,142]]];
 for(const [rgb,expected] of patches)for(let c=0;c<3;c++){const result=rgb.reduce((s,v,i)=>s+m[c*5+i]*v,255*m[c*5+4]);assert.ok(Math.abs(result-expected[c])<3,`${rgb} channel ${c}: ${result}`);}
});
