import {test} from 'node:test';import assert from 'node:assert/strict';
import {associatedBodyEnvelope} from '../shared/bodyContext.js';
import {SmartReframeService as S} from '../services/smartReframeService.js';
const face={track_id:'a',x:.4,y:.2,width:.1,height:.12,center_x:.45,center_y:.26,confidence:.95};
const person={x:.3,y:.15,width:.3,height:.75,confidence:.9};
const samples=()=>Array.from({length:8},(_,i)=>({time:i*.25,faces:[{...face}],persons:[{...person}]}));
test('body evidence needs repeated face association, not body presence alone',()=>{
 const a=samples();assert.ok(associatedBodyEnvelope(a,['a']));
 assert.equal(associatedBodyEnvelope(a.map(s=>({...s,persons:[]})),['a']),null);
 assert.equal(associatedBodyEnvelope(a.map((s,i)=>({...s,persons:i<2?s.persons:[]})),['a']),null);
 assert.equal(associatedBodyEnvelope(a,['unknown']),null);
});
test('face-free regions, invalid boxes, weak scores, and two-face ambiguity cannot become body crop evidence',()=>{
 for(const p of [{...person,x:.8},{...person,confidence:.1},{...person,width:NaN},{...person,y:.3}]){
  assert.equal(associatedBodyEnvelope(samples().map(s=>({...s,persons:[p]})),['a']),null);
 }
 const a=samples().map(s=>({...s,faces:[...s.faces,{...face,track_id:'b',x:.52,center_x:.57}]}));
 assert.equal(associatedBodyEnvelope(a,['a']),null);
});
test('body context adds shoulders and torso and contains every associated face',()=>{
 const a=samples();const b=associatedBodyEnvelope(a,['a'])!;
 assert.ok(b.left<person.x&&b.right>person.x+person.width);
 assert.ok(b.top<face.y&&b.bottom>=.9);
 const plan=S.computeShotComposition({rawSamples:a,duration:2,sourceWidth:640,sourceHeight:360});
 assert.equal(plan[0].kind,'solo');assert.ok(plan[0].windowH>=.79);
 const empty=S.computeShotComposition({rawSamples:a.map(s=>({...s,persons:undefined})),duration:2,sourceWidth:640,sourceHeight:360});
 assert.notDeepEqual(plan,empty);
});
test('body evidence cannot reintroduce crop size changes at cuts',()=>{
 const a=samples();const all=[...a,...a.map(s=>({...s,time:s.time+2,persons:[]}))];
 const plan=S.computeShotComposition({rawSamples:all,sceneCuts:[2],duration:4,sourceWidth:640,sourceHeight:360});
 assert.equal(new Set(plan.map(s=>s.windowW)).size,1);assert.equal(new Set(plan.map(s=>s.windowH)).size,1);
});
