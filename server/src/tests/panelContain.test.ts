import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePanels,panelSourceWindow,buildPanelsFilter,unassignedPanelViews,PANEL_RECTS,defaultPanelSlots} from '../shared/panelLayouts.js';
import {resizeRegionBox} from '../../../src/lib/cropBox.js';
for (const layout of Object.keys(PANEL_RECTS) as Array<keyof typeof PANEL_RECTS>) test(layout+' contain is opt-in, roundtrips region and preserves review gate',()=>{
 const slots=defaultPanelSlots(layout).map(s=>({...s,fit:'contain' as const,sourceRect:{x:.5,y:0,w:.5,h:1}}));
 const p=normalizePanels({layout,slots})!;assert.deepEqual(normalizePanels(p),p);
 assert.equal(unassignedPanelViews({tracks:[{type:'VIDEO',items:[{id:'v',panels:p}]}]}).length,slots.length);
 for(const s of p.slots){assert.deepEqual(panelSourceWindow(s,1280,720,.5),{x:640,y:0,w:640,h:720});assert.deepEqual(panelSourceWindow({...s,scale:4,focusX:0},1280,720,2),{x:640,y:0,w:640,h:720});}
 const f=buildPanelsFilter(p,720,1280);assert.ok(f.includes('force_original_aspect_ratio=decrease'));assert.ok(f.includes(':color=black'));assert.ok(!f.includes("crop=w='min(iw,ih*"));
});
test('invalid contain value cannot enable contain, full-source explicit fit has no region crop',()=>{
 const p=normalizePanels({layout:'screenshare',slots:[{focusX:.5,focusY:.5,scale:1,fit:'contain'}, {focusX:.5,focusY:.5,scale:1,fit:'fill' as any}]})!;
 assert.equal(p.slots[1].fit,undefined);assert.deepEqual(panelSourceWindow(p.slots[0],1280,720,.5),{x:0,y:0,w:1280,h:720});
});
test('free region resize never escapes or collapses even when pointer crosses or coincides with anchor',()=>{
 for(const a of [0,.005,.5,.995,1])for(const p of [0,.005,.5,.995,1]){
 const b=resizeRegionBox({x:a,y:a},{x:p,y:p});assert.ok(b.left>=0&&b.top>=0&&b.left+b.w<=1.000001&&b.top+b.h<=1.000001);assert.ok(b.w>=.0099999&&b.h>=.0099999);
 }
});
