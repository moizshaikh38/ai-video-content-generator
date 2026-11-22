import test from 'node:test';
import assert from 'node:assert/strict';
import {SmartReframeService as S} from '../services/smartReframeService.js';
import {shotPlanOptions} from '../shared/shotPlanOptions.js';
const face={x:.49,y:.3,width:.08,height:.16,center_x:.53,center_y:.38,confidence:.9,track_id:'one',area:.0128};
const person={x:.1,y:.1,width:.8,height:.85,confidence:.95};
const rawSamples=Array.from({length:16},(_,i)=>({time:i/4,faces:[face],persons:[person]}));
const options={rawSamples,duration:4,sourceWidth:854,sourceHeight:480,windowScope:'shot' as const};
test('default Fit contains a measured wide person just as explicit4:3 does',()=>{
 const implicit=S.computeShotComposition(options),explicit=S.computeShotComposition({...options,automaticFitAspect:'4:3'});
 assert.deepEqual(implicit,explicit);
 for(const shot of implicit)for(const k of shot.keyframes){
  assert.ok(k.centerX-shot.windowW/2<=person.x);
  assert.ok(k.centerX+shot.windowW/2>=person.x+person.width);
  assert.ok(k.centerY-shot.windowH/2<=person.y);
  assert.ok(k.centerY+shot.windowH/2>=person.y+person.height);
 }
 assert.equal(implicit[0].presentationProtection?.reason,'measured-subject-conflict');
});
test('default static clip Fit also contains the measured wide person',()=>{
 const plan=S.computeShotComposition({...options,windowScope:'clip'});
 for(const shot of plan)for(const k of shot.keyframes){
  assert.ok(k.centerX-shot.windowW/2<=person.x);
  assert.ok(k.centerX+shot.windowW/2>=person.x+person.width);
  assert.ok(k.centerY-shot.windowH/2<=person.y);
  assert.ok(k.centerY+shot.windowH/2>=person.y+person.height);
 }
 assert.equal(plan[0].presentationProtection?.reason,'measured-context');
});
test('app options without saved aspect metadata retain measured body containment',()=>{
 const track={raw_samples:rawSamples,source_width:854,source_height:480,metadata:{}};
 const before=JSON.stringify(track);
 const input=shotPlanOptions({track,duration:4});
 assert.equal(input.automaticFitAspect,undefined);
 const plan=S.computeShotComposition(input);
 assert.equal(JSON.stringify(track),before);
 for(const shot of plan)for(const k of shot.keyframes){
  assert.ok(k.centerX-shot.windowW/2<=person.x);
  assert.ok(k.centerX+shot.windowW/2>=person.x+person.width);
 }
 assert.equal(plan[0].presentationProtection?.reason,'measured-context');
});
test('missing aspect metadata is not a blanket full-source fallback',()=>{
 const p=S.computeShotComposition({...options,rawSamples:rawSamples.map(s=>({...s,faces:[],persons:[]}))});
 assert.ok(Math.abs(p[0].windowW*854/(p[0].windowH*480)-4/3)<.001);
 assert.equal(p[0].contextStatus,'unresolved-review-required');
});
