import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { buildBlurFitChain, ClipRenderService } from '../services/clipRenderService.js';
import { ProEditorService } from '../services/proEditorService.js';
const render = (focus: number, zoom = 1) => {
  const source = 'color=red:s=180x320:r=1:d=1,drawbox=x=0:y=106:w=iw:h=108:color=green:t=fill,drawbox=x=0:y=214:w=iw:h=106:color=blue:t=fill';
  const chain = buildBlurFitChain('16:9', zoom, 'f', .25, focus, .5);
  const r = spawnSync('ffmpeg', ['-v','error','-threads','1','-filter_threads','1','-f','lavfi','-i',source,'-vf',chain,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','-'], { maxBuffer: 480*270*3+1, timeout: 10000 });
  assert.equal(r.status, 0, String(r.stderr));
  return r.stdout;
};
const redAt = (b: Buffer, x: number, y: number) => { const i=(y*480+x)*3; return b[i]>240&&b[i+1]<10&&b[i+2]<10; };
for (const f of [0,.25,.75,1]) test(`blur foreground respects saved focus ${f}`, () => {
  const b=render(f), width=152, left=Math.round((480-width)*f);
  assert(redAt(b,left+10,25), 'foreground is at CSS object-position focus');
  if(left>20)assert(!redAt(b,10,25), 'not left-aligned');
  if(left+width<460)assert(!redAt(b,470,25), 'not right-aligned');
});
test('center defaults retain exact centered overlay', () => { assert(buildBlurFitChain().endsWith('overlay=(W-w)/2:(H-h)/2')); });
test('nonfinite and out-of-range focus are safe', () => { assert(buildBlurFitChain('16:9',1,'f',1,NaN,Infinity).endsWith('overlay=(W-w)/2:(H-h)/2')); assert(buildBlurFitChain('16:9',1,'f',1,-1,2).endsWith('overlay=(W-w)*0:(H-h)*1')); });
test('manual editor crop and quick clip paths pass focus to blur graph', async () => {
  const quick=await ClipRenderService.resolveReframeDecision({crop_config:{mode:'fit_blur',focusX:.8,focusY:.2},aspect_ratio:'16:9'} as any,1,.25);
  assert(quick.cropFilter.endsWith('overlay=(W-w)*0.8:(H-h)*0.2'));
  const editor=(ProEditorService as any).buildSliceCropFilter({id:'f',crop:{mode:'blur',focusX:.8,focusY:.2}}, {aspectRatio:'16:9',canvasScale:.25},0,1,{});
  assert(editor.endsWith('overlay=(W-w)*0.8:(H-h)*0.2'));
});
test('zoom retains same focus anchor', () => { const b=render(.8,1.1); assert(redAt(b,260,25)); assert(!redAt(b,200,25)); });
