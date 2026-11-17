import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {SmartReframeService as S} from '../services/smartReframeService.js';
import {associatedBodyEnvelope} from '../shared/bodyContext.js';
const e=JSON.parse(fs.readFileSync(new URL('./fixtures/maganda-motion-detections.json',import.meta.url),'utf8'));
const options={rawSamples:e.samples,sceneCuts:e.scene_cuts,duration:e.duration,sourceWidth:e.source_width,sourceHeight:e.source_height};
test('small group body evidence covers the source, but explicit4:3 presentation warns about side loss',()=>{
 assert.equal(S.isCrowdScene(e.samples),false,'this is below the crowd-face-majority guard, not a crowd-rule test');
 const before=S.computeShotComposition({...options,rawSamples:e.samples.map((s:any)=>({...s,persons:[]}))});
 const after=S.computeShotComposition(options);
 // The measurement must not silently shrink merely to satisfy presentation.
 const ids=[...new Set(e.samples.flatMap((s:any)=>s.faces.map((f:any)=>f.track_id)))] as string[];
 const bodies=ids.map(id=>associatedBodyEnvelope(e.samples,[id])).filter(Boolean);
 assert.ok(bodies.some(b=>b!.left===0));assert.ok(bodies.some(b=>b!.right===1));
 for(const plan of [before,after]){
  assert.equal(plan[0].kind,'group');assert.equal(plan[0].windowW,(4/3)*e.source_height/e.source_width);
  assert.equal(plan[0].windowH,1);assert.equal(plan[0].contextStatus,'unresolved-review-required');
  assert.match(plan[0].uncertainty!,/crops source context/);
 }
});
test('missing and unsupported bodies preserve the existing group result',()=>{
 const none=e.samples.map((s:any)=>({...s,persons:[]}));
 const weak=e.samples.map((s:any)=>({...s,persons:s.persons.map((p:any)=>({...p,confidence:.1}))}));
 assert.deepEqual(S.computeShotComposition({...options,rawSamples:none}),S.computeShotComposition({...options,rawSamples:weak}));
});
test('body constraints do not force every group to full source',()=>{
 const faces=[.43,.57].map((x,i)=>({track_id:String(i),x:x-.03,y:.2,width:.06,height:.1,center_x:x,center_y:.25,confidence:.95}));
 const rawSamples=Array.from({length:12},(_,i)=>({time:i*.25,faces,persons:faces.map(f=>({x:f.x-.03,y:.18,width:.12,height:.55,confidence:.9}))}));
 const p=S.computeShotComposition({...options,rawSamples,duration:3});
 assert.equal(p[0].kind,'group');assert.ok(p[0].windowW<1);
});
