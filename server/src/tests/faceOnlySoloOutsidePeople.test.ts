import {test} from 'node:test';import assert from 'node:assert/strict';
import {SmartReframeService as S} from '../services/smartReframeService.js';
// Synthetic geometry only (no source-derived media or coordinates). One tracked face; person boxes are the variable.
const face=(cx:number,id='a')=>({track_id:id,x:cx-.02,y:.2,width:.04,height:.07,center_x:cx,center_y:.235,confidence:.95});
const person=(x:number,w=.1,y=.3,h=.4,confidence=.9)=>({x,y,width:w,height:h,confidence});
const plan=(persons:(i:number)=>any[],n=16,faces:(i:number)=>any[]=()=>[face(.25)])=>S.computeShotComposition({rawSamples:Array.from({length:n},(_,i)=>({time:i*.25,faces:faces(i),persons:persons(i)})),
  sceneCuts:[],duration:n*.25,sourceWidth:1920,sourceHeight:1080,windowScope:'shot',automaticFitAspect:'4:3',allowConversationSplit:false} as any);
// With the 4:3 presentation bridge the no-anchor path ends as a centered EXACT 4:3 review Fit (width .75 of a 16:9 source). It crops source sides.
const centered43=(p:any[])=>p.length===1&&p[0].kind==='fit'&&p[0].windowH===1&&Math.abs(p[0].windowW-.75)<1e-9&&p[0].keyframes.every((k:any)=>k.centerX===.5&&k.centerY===.5);
test('baseline contract: face-only solo with no person boxes keeps the face-envelope solo',()=>{
  const p=plan(()=>[]);assert.equal(p[0].kind,'solo');assert.ok(p[0].windowW<1);
});
test('valid people outside the face-only window in most samples: centered exact 4:3 review Fit instead of the solo',()=>{
  assert.ok(centered43(plan(()=>[person(.7),person(.85,.08)])));
});
test('edge-person non-containment disclosed: the centered 4:3 Fit can still crop a far-edge person',()=>{
  const p=plan(()=>[person(.9,.09)]);assert.ok(centered43(p));
  const l=p[0].keyframes[0].centerX-p[0].windowW/2,r=p[0].keyframes[0].centerX+p[0].windowW/2;
  assert.ok(.9+.09>r+1e-9,'person box right edge (.99) is outside the 4:3 window (.125-.875): not retained');
  assert.ok(l>=0);
});
test('minority, exactly half and fewer-than-3 outside samples keep the solo',()=>{
  assert.equal(plan(i=>i<5?[person(.75)]:[])[0].kind,'solo');
  assert.equal(plan(i=>i<8?[person(.75)]:[])[0].kind,'solo');
  assert.equal(plan(i=>i<2?[person(.75)]:[],3)[0].kind,'solo');
});
test('person boxes failing the existing person-evidence contract are not evidence: NaN, zero size, weak, negative, out of bounds',()=>{
  const bad=[{x:NaN,y:.3,width:.1,height:.4,confidence:.9},person(.7,0),person(.7,.1,.3,.4,.39),person(-.2,.1),person(.95,.2),person(.7,.1,.8,.4)];
  for(const b of bad)assert.equal(plan(()=>[b])[0].kind,'solo',JSON.stringify(b));
  assert.ok(centered43(plan(()=>[person(.7,.1,.3,.4,.4)])),'confidence exactly .4 is valid, matching shared/bodyContext');
});
test('LIMITATION: different valid outside people in different samples count like one persistent person (identity-free, as persistentObjectRegions)',()=>{
  assert.ok(centered43(plan(i=>[person(i%2?.7:.8)])));
});
test('legitimate single speaker with an associated body plus background people stays on the body path, not this fallback',()=>{
  const p=plan(()=>[{x:.15,y:.15,width:.2,height:.8,confidence:.95},person(.7),person(.85,.08)],16,()=>[{track_id:'a',x:.23,y:.2,width:.04,height:.07,center_x:.25,center_y:.235,confidence:.95}]);
  assert.equal(p.length,1);assert.ok(!centered43(p)||p[0].kind!=='fit','speaker body keeps its own window');
  assert.equal(p[0].kind,'solo');
});
