import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {SmartReframeService as S} from '../services/smartReframeService.js';
const e=JSON.parse(fs.readFileSync(new URL('./fixtures/maganda-motion-detections.json',import.meta.url),'utf8'));
const options={rawSamples:e.samples,sceneCuts:e.scene_cuts,duration:e.duration,sourceWidth:e.source_width,sourceHeight:e.source_height};
test('small and occluded multi-person group bodies constrain the old92percent cap',()=>{
 assert.equal(S.isCrowdScene(e.samples),false,'this is below the crowd-face-majority guard, not a crowd-rule test');
 const before=S.computeShotComposition({...options,rawSamples:e.samples.map((s:any)=>({...s,persons:[]}))});
 const after=S.computeShotComposition(options);
 assert.equal(before[0].kind,'group');assert.equal(before[0].windowW,.92);
 assert.equal(after[0].kind,'group');assert.equal(after[0].windowW,1);assert.equal(after[0].windowH,1);
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
