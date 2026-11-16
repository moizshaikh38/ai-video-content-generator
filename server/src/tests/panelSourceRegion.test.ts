import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePanels,normalizeSourceRect,panelSourceWindow,buildPanelsFilter,defaultPanelSlots} from '../shared/panelLayouts.js';
test('source region roundtrips independently of placeholder/review state',()=>{
 const p=normalizePanels({layout:'gameplay',slots:[{focusX:.5,focusY:.47,scale:1,set:true,sourceRect:{x:0,y:0,w:.22,h:.38}},defaultPanelSlots('gameplay')[1]]})!;
 assert.deepEqual(p.slots[0].sourceRect,{x:0,y:0,w:.22,h:.38});assert.equal(p.slots[0].set,true);assert.equal(p.slots[1].set,undefined);
 assert.deepEqual(normalizePanels(p),p);
});
test('invalid region never silently clamps into a different valid region',()=>{
 for(const r of [{x:-.1,y:0,w:.5,h:.5},{x:.7,y:0,w:.5,h:.5},{x:0,y:0,w:NaN,h:.5},{x:0,y:0,w:.001,h:.5},{x:0,y:0,w:.5,h:Infinity}])assert.equal(normalizeSourceRect(r),null);
});
test('all panel layouts keep old cover view unchanged without region',()=>{
 for(const layout of ['three','four','screenshare','gameplay'] as const){
  const q=normalizePanels({layout,slots:defaultPanelSlots(layout)})!;
  for(const s of q.slots){const v=panelSourceWindow(s,960,540,1.875);const k=Math.max(720/960,384/540)*s.scale;assert.ok(Math.abs(v.x-(960-720/k)*s.focusX)<1e-8);assert.ok(Math.abs(v.y-(540-384/k)*s.focusY)<1e-8);}
 }
});
test('measured region restricts crop to camera, preserving face-safe focus in region',()=>{
 const s={focusX:.5,focusY:.47,scale:1,sourceRect:{x:0,y:0,w:212/960,h:205/540}};
 const v=panelSourceWindow(s,960,540,1.875);assert.ok(v.x>=0&&v.y>=0&&v.x+v.w<=212.0001&&v.y+v.h<=205.0001);assert.ok(v.y<=58&&v.y+v.h>=139);
 const f=buildPanelsFilter({layout:'gameplay',slots:[{...s,set:true},{focusX:.5,focusY:.5,scale:1,set:true}]},720,1280);
 assert.ok(f.includes('round(iw*0.22083333/2)*2'));assert.ok(f.includes('round(ih*0.37962963/2)*2'));assert.equal((f.match(/iw\*/g)||[]).length,2);
});
