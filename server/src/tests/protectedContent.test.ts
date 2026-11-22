import {test} from 'node:test';import assert from 'node:assert/strict';
import {SmartReframeService as S} from '../services/smartReframeService.js';
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
 const retained={...region,start:2,end:4};
 const p=S.computeShotComposition({...opts,duration:4,rawSamples,sceneCuts:[2],unresolvedContextPolicy:'shared-subject-window',protectedContentRegions:[retained]});
 // Default4:3 may crop irrelevant sides, but not this measured lower third.
 assert.equal(p[0].windowW,.75);assert.equal(p[0].windowH,1);
 assert.equal(p[1].windowW,p[0].windowW);assert.equal(p[1].windowH,p[0].windowH);
 for(const shot of p)for(const k of shot.keyframes){
  assert.ok(k.centerX-shot.windowW/2<=retained.x-.025+1e-9);
  assert.ok(k.centerX+shot.windowW/2>=retained.x+retained.width+.025-1e-9);
  assert.ok(k.centerY-shot.windowH/2<=retained.y-.025+1e-9);
  assert.ok(k.centerY+shot.windowH/2>=retained.y+retained.height+.025-1e-9);
 }
 assert.equal(p[1].contextStatus,'unresolved-review-required');
 assert.match(p[1].uncertainty!,/Review/);
});
