import{test}from'node:test';import assert from'node:assert/strict';
import{SmartReframeService as S}from'../services/smartReframeService.js';
import{freezeAutomaticPlan}from'../shared/automaticFraming.js';
import{captionCompositionWindows}from'../shared/sceneCaptionPlacement.js';
const samples=()=>Array.from({length:8},(_,i)=>({time:i*.25,faces:[.3,.65].map((x,j)=>({x,y:.2,width:.05,height:.1,center_x:x+.025,center_y:.25,confidence:.95,track_id:String(j)}))}));
const opts=()=>({rawSamples:samples(),duration:2,sourceWidth:1920,sourceHeight:1080,windowScope:'shot' as const,automaticFitAspect:'4:3' as const});
test('pair focus is opt in, review tagged, compiler uses exact measured source regions',()=>{
 const baseline=S.computeShotComposition(opts());assert.ok(!baseline[0].split?.focusPanels);
 const p=S.computeShotComposition({...opts(),pairFocusReview:true});assert.ok(p[0].split?.focusPanels);assert.equal(p[0].contextStatus,'unresolved-review-required');
 const f=S.buildShotCompositionFilter({plan:p,start:0,duration:2,sourceWidth:1920,sourceHeight:1080,tag:'proof'});assert.match(f,/proof_0_focus/);assert.match(f,/vstack/);assert.match(f,/round\(iw\*/);
 const off=freezeAutomaticPlan(p,{enabled:false,freeze_source_time:1},0);assert.deepEqual(off[0].split?.focusPanels,p[0].split?.focusPanels);
 const context:any={canvas:{aspect_ratio:'9:16'},tracks:[{type:'VIDEO',items:[{id:'v',timeline_start:0,timeline_end:2,source_start:0,source_end:2}]}]};assert.deepEqual(captionCompositionWindows(context,p,0,1920,1080).map(v=>v.layout),['split']);
});
test('allowed policy still rejects Split and absentpaired evidence abstains',()=>{
 const p=S.computeShotComposition({...opts(),pairFocusReview:true,layoutPolicy:{defaultLayout:'auto',allowed:['fit']}});assert.ok(!p[0].split);
 const single=samples().map(s=>({...s,faces:s.faces.slice(0,1)}));const q=S.computeShotComposition({...opts(),rawSamples:single,pairFocusReview:true});assert.ok(!q[0].split?.focusPanels);
});

test('off-center edge-limited pair focus falls back without forcing all bodies into union',()=>{
 const o=opts();o.rawSamples=o.rawSamples.map(s=>({...s,faces:s.faces.map((f,i)=>i?f:{...f,x:.005,center_x:.03})}));
 const base=S.computeShotComposition(o),review=S.computeShotComposition({...o,pairFocusReview:true});assert.ok(!review[0].split?.focusPanels);assert.deepEqual(review,base);
});

test('final presentation cannot discard explicit context after focus or policy fallback',()=>{
 const region={start:0,end:2,x:0,y:.8,width:.15,height:.15,confidence:.95};
 for(const policy of[undefined,{defaultLayout:'auto' as const,allowed:['fit' as const]}]){
  const p=S.computeShotComposition({...opts(),pairFocusReview:true,protectedContentRegions:[region],layoutPolicy:policy})[0];
  assert.ok(!p.split);const k=p.keyframes[0];assert.ok(k.centerX-p.windowW/2<=region.x);assert.ok(k.centerY+p.windowH/2>=region.y+region.height);assert.match(p.uncertainty!,/protected context/);
 }
});
test('weak or out-of-shot context does not change accepted focus geometry',()=>{
 const base=S.computeShotComposition({...opts(),pairFocusReview:true});
 for(const region of[{start:0,end:2,x:0,y:.8,width:.15,height:.15,confidence:.5},{start:3,end:4,x:0,y:.8,width:.15,height:.15,confidence:.95}])assert.deepEqual(S.computeShotComposition({...opts(),pairFocusReview:true,protectedContentRegions:[region]}),base);
});
