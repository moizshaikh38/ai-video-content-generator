import {test} from 'node:test';import assert from 'node:assert/strict';
import {SmartReframeService as S} from '../services/smartReframeService.js';
// Synthetic geometry only: one dominant face/body (track a) plus a sparse second face (track b) far to the right.
const face=(id:string,cx:number,w:number,h:number,cy=.3)=>({track_id:id,x:cx-w/2,y:cy-h/2,width:w,height:h,center_x:cx,center_y:cy,confidence:.95});
const samples=(body:{x:number;width:number},withB:boolean|number=true,obj?:any)=>Array.from({length:16},(_,i)=>({time:i*.25,
  faces:[face('a',body.x+body.width/2,.1,.18),...(withB&&i<4?[face('b',typeof withB==='number'?withB:.95,.05,.09)]:[])],
  persons:[{x:body.x,y:.1,width:body.width,height:.5,confidence:.95}],...(obj?{objects:[obj]}:{})}));
const plan=(rawSamples:any[],regions:any[])=>S.computeShotComposition({rawSamples,sceneCuts:[],duration:4,sourceWidth:1920,sourceHeight:1080,
  windowScope:'shot',automaticFitAspect:'4:3',allowConversationSplit:false,protectedContentRegions:regions} as any);
const R=(o:any)=>({start:0,end:4,confidence:.9,...o});
const wide={x:.05,width:.4},narrow={x:.1,width:.14};
const fullConflict=(p:any[])=>p.length===1&&p[0].kind==='fit'&&p[0].windowW===1&&p[0].windowH===1&&p[0].presentationProtection?.reason==='measured-subject-conflict';
test('baseline without supplied regions: measured second face forces full-source subject-conflict Fit',()=>{
  assert.ok(fullConflict(plan(samples(wide),[])));
});
test('adding a tall protected region cannot discard the full-source subject-conflict decision',()=>{
  assert.ok(fullConflict(plan(samples(wide),[R({x:.1,y:.05,width:.1,height:.85})])));
});
test('a region that only changes window shape the other way (full-height strip) cannot unprotect either',()=>{
  assert.ok(fullConflict(plan(samples(wide),[R({x:.4,y:0,width:.1,height:1})])));
});
test('multiple regions, one tall: still full-source subject-conflict',()=>{
  assert.ok(fullConflict(plan(samples(wide),[R({x:.1,y:.05,width:.05,height:.1}),R({x:.15,y:.05,width:.1,height:.85})])));
});
test('small region that keeps the window wider than 4:3 is unchanged by the added region',()=>{
  assert.ok(fullConflict(plan(samples(wide),[R({x:.1,y:.05,width:.08,height:.2})])));
});
test('low-confidence or out-of-time regions are not supplied context and change nothing',()=>{
  const base=JSON.stringify(plan(samples(wide),[]));
  assert.equal(JSON.stringify(plan(samples(wide),[R({x:.1,y:.05,width:.1,height:.85,confidence:.5})])),base);
  assert.equal(JSON.stringify(plan(samples(wide),[R({x:.1,y:.05,width:.1,height:.85,start:10,end:12})])),base);
});
test('no conflicting measured subject: a tall region keeps the intentional solo window containing it',()=>{
  const p=plan(samples(wide,false),[R({x:.1,y:.05,width:.1,height:.85})]);
  assert.equal(p.length,1);assert.notEqual(p[0].presentationProtection?.reason,'measured-subject-conflict');
  const k=p[0].keyframes[0],l=k.centerX-p[0].windowW/2,r=k.centerX+p[0].windowW/2;
  assert.ok(.1>=l-1e-6&&.2<=r+1e-6);
});
test('narrow solo that already passed the aspect gate before regions is not newly tested (partial invariant)',()=>{
  const without=plan(samples(narrow),[]),withRegion=plan(samples(narrow),[R({x:.1,y:.05,width:.1,height:.85})]);
  assert.equal(without[0].kind,'solo');assert.equal(withRegion[0].kind,'solo');
});
test('user-owned layout is not planned by the automatic bridge',()=>{
  const track:any={status:'ready',source_width:1920,source_height:1080,sourceObjectVerified:true,isStale:false,metadata:{analyzed_source_sha256:'a'.repeat(64),scene_cuts:[],protected_content_regions:[R({x:.1,y:.05,width:.1,height:.85})]},raw_samples:samples(wide)};
  assert.equal(S.explicitAutoLayoutPlan(track,{layout_mode_source:'user'},4,'9:16'),undefined);
});

const obj={class_id:5,x:.1,y:.05,width:.1,height:.85,confidence:.9};
const json=(p:any[])=>JSON.stringify(p);
test('object-only change: ignored supplied records (weak, outside time, non-finite, out of bounds) do not alter the plan',()=>{
  const objOnly=json(plan(samples(wide,true,obj),[]));
  for(const bad of [R({x:.1,y:.05,width:.1,height:.85,confidence:.5}),R({x:.1,y:.05,width:.1,height:.85,start:10,end:12}),R({x:NaN,y:0,width:.1,height:.9}),R({x:.95,y:0,width:.2,height:.9})])
    assert.equal(json(plan(samples(wide,true,obj),[bad])),objOnly);
});
test('no supplied regions or only ignored ones: exact same plan',()=>{
  const none=json(plan(samples(wide),[]));
  assert.equal(json(plan(samples(wide),[R({x:.1,y:.05,width:.1,height:.85,confidence:.5})])),none);
  assert.equal(json(plan(samples(wide),[R({x:NaN,y:0,width:.1,height:.9})])),none);
});
test('compatible new region: window keeps the original body and contains the region',()=>{
  const p=plan(samples(wide,false),[R({x:.55,y:.05,width:.1,height:.3})]);
  const k=p[0].keyframes[0],l=k.centerX-p[0].windowW/2,r=k.centerX+p[0].windowW/2;
  assert.ok(.05>=l-1e-6&&.45<=r+1e-6&&.55>=l-1e-6&&.65<=r+1e-6);
});
test('PARTIAL SCOPE (documented limitation): when the no-region plan was a recovered 4:3 window, the region path is not restored',()=>{
  const none=plan(samples(wide,.7),[]);
  assert.equal(none[0].presentationProtection?.reason,'measured-context');
  const withRegion=plan(samples(wide,.7),[R({x:.1,y:.05,width:.1,height:.85})]);
  // Current (baseline and candidate) behavior: narrower solo that no longer contains the second face at x=.7.
  assert.equal(withRegion[0].kind,'solo');
  const k=withRegion[0].keyframes[0],l=k.centerX-withRegion[0].windowW/2,r=k.centerX+withRegion[0].windowW/2;
  assert.ok(.7<l-1e-6||.7>r+1e-6,'second face (x=.7) is excluded by the narrowed window: documented limitation');
});

const full2D=(p:any[])=>p.every(s=>s.windowW===1&&s.windowH===1&&s.keyframes.length>0&&s.keyframes.every((k:any)=>Math.abs(k.centerX-.5)<1e-6&&Math.abs(k.centerY-.5)<1e-6));
test('repaired full-source plan is full 2D on every keyframe (not horizontal only)',()=>{
  const p=plan(samples(wide),[R({x:.1,y:.05,width:.1,height:.85})]);
  assert.ok(fullConflict(p));assert.ok(full2D(p));
  const geo=(x:any[])=>JSON.stringify(x.map(({uncertainty,...r}:any)=>r));
  assert.equal(geo(p),geo(plan(samples(wide),[])));
});
test('compatible region: every keyframe window contains body and region in both axes',()=>{
  const p=plan(samples(wide,false),[R({x:.55,y:.05,width:.1,height:.3})]);
  assert.ok(p.length>=1);
  for(const s of p)for(const k of s.keyframes){const l=k.centerX-s.windowW/2,r=k.centerX+s.windowW/2,t=k.centerY-s.windowH/2,b=k.centerY+s.windowH/2;
    assert.ok(.05>=l-1e-6&&.65<=r+1e-6&&.05>=t-1e-6&&.6<=b+1e-6,'body (y .1-.6) and region (y .05-.35) both fully contained');}
});
test('valid supplied region + sample-derived object: pre-window must include the object union (parity with object-only)',()=>{
  const objOnly=plan(samples(wide,true,obj),[]);
  assert.equal(objOnly[0].kind,'solo');
  const both=plan(samples(wide,true,obj),[R({x:.1,y:.05,width:.1,height:.85})]);
  assert.equal(json(both),json(objOnly));
  const bothSmall=plan(samples(wide,true,obj),[R({x:.1,y:.05,width:.08,height:.2})]);
  assert.equal(json(bothSmall),json(objOnly));
});

// Cache mechanics with a SYNTHETIC v9-stamped snapshot (fabricated stale plan; not a historical production output). Inputs are built once and never mutated between eligibility checks (only
// metadata.automatic_scene_plan changes, which the input digest excludes).
import {snapshotAutomaticScenePlan,readAutomaticScenePlan,AUTOMATIC_SCENE_PLANNER_VERSION} from '../shared/automaticScenePlan.js';
test('synthetic v9-stamped full-input snapshot: v9 code accepts it unchanged; candidate rejects it, recomputes, and a v10 snapshot replays the full plan',()=>{
  const cutSamples=Array.from({length:16},(_,i)=>samples(wide)[i]);
  const track:any={status:'ready',source_width:1920,source_height:1080,sourceObjectVerified:true,isStale:false,analyzed_aspect_ratio:'9:16',
    metadata:{analyzed_source_sha256:'a'.repeat(64),analyzed_source_start:0,analyzed_source_end:4,scene_cuts:[2],protected_content_regions:[R({x:.1,y:.05,width:.1,height:.85})]},raw_samples:cutSamples};
  const cfg={mode:'smart',layout_mode_source:'auto'};
  const fresh=S.explicitAutoLayoutPlan(track,cfg,4,'9:16');
  assert.ok(fresh&&fresh.length>=1,'producer must yield a plan for this synthetic track');
  assert.ok(fresh.every(s=>s.kind==='fit'));
  const stale:any=[{start:0,end:4,kind:'solo',windowW:.4,windowH:1,keyframes:[{time:0,centerX:.3,centerY:.5}]}];
  const snap:any=snapshotAutomaticScenePlan(track,cfg,4,stale);
  assert.ok(snap,'snapshot must be eligible (full-input bound)');
  // A synthetic stand-in for a v9 snapshot of exactly this input (fabricated stale plan, not recorded history).
  track.metadata.automatic_scene_plan={...snap,plannerVersion:'normal-auto-balanced-split-v9'};
  assert.notEqual(AUTOMATIC_SCENE_PLANNER_VERSION,'normal-auto-balanced-split-v9','planner version must change when geometry changes');
  assert.equal(readAutomaticScenePlan(track,cfg,4),undefined);
  assert.equal(JSON.stringify(S.explicitAutoLayoutPlan(track,cfg,4,'9:16')),JSON.stringify(fresh));
  const next:any=snapshotAutomaticScenePlan(track,cfg,4,fresh);assert.ok(next);
  assert.equal(next.plannerVersion,AUTOMATIC_SCENE_PLANNER_VERSION);
  track.metadata.automatic_scene_plan=next;
  assert.deepEqual(readAutomaticScenePlan(track,cfg,4),JSON.parse(JSON.stringify(fresh)));
  assert.deepEqual(JSON.parse(JSON.stringify(S.explicitAutoLayoutPlan(track,cfg,4,'9:16'))),JSON.parse(JSON.stringify(fresh)));
});

// Helper-chain boundary test (NOT an actual Pro render and NOT an HTTP endpoint test): the shared helpers that Pro export and the
// preview call (explicitAutoLayoutPlan, freezeAutomaticPlan, buildShotCompositionFilter, a JSON round-trip standing in for the
// preview response, previewLayoutForResolvedShot, nonPortraitAutoFullSourceFit) on the same immutable synthetic input.
import {freezeAutomaticPlan} from '../shared/automaticFraming.js';
import {previewLayoutForResolvedShot} from '../shared/automaticPreviewFallback.js';
import {nonPortraitAutoFullSourceFit} from '../shared/nonPortraitAutoFit.js';
const mkTrack=(regions:any[]):any=>({status:'ready',source_width:1920,source_height:1080,sourceObjectVerified:true,isStale:false,analyzed_aspect_ratio:'9:16',
  metadata:{analyzed_source_sha256:'a'.repeat(64),analyzed_source_start:0,analyzed_source_end:4,scene_cuts:[2],protected_content_regions:regions},raw_samples:samples(wide)});
const autoCfg={mode:'smart',layout_mode_source:'auto'};
const tallRegion=R({x:.1,y:.05,width:.1,height:.85});
// Compare filters with the tag removed; a full-source shot never emits a crop narrower than the source.
const filterOf=(plan:any[])=>S.buildShotCompositionFilter({plan,sourceWidth:1920,sourceHeight:1080,duration:4,tag:'t'});
test('helper chain: repaired shot-1 full-source protection survives enabled, frozen and preview JSON representation',()=>{
  const track=mkTrack([tallRegion]);
  const plan:any[]=S.explicitAutoLayoutPlan(track,autoCfg,4,'9:16') as any;
  assert.ok(plan&&plan.length===2);
  assert.equal(plan[0].windowW,1);assert.equal(plan[0].windowH,1);assert.equal(plan[0].presentationProtection?.reason,'measured-subject-conflict');
  // same plan with no regions at all: first shot identical in geometry (baseline behavior preserved by the repair)
  const noReg:any[]=S.explicitAutoLayoutPlan(mkTrack([]),autoCfg,4,'9:16') as any;
  assert.equal(noReg[0].windowW,1);assert.equal(noReg[0].presentationProtection?.reason,'measured-subject-conflict');
  const enabled=freezeAutomaticPlan(plan,{enabled:true},0);assert.deepEqual(enabled,plan);
  for(const ft of [0,1,3.5]){
    const frozen=freezeAutomaticPlan(plan,{enabled:false,freeze_source_time:ft},0);
    assert.equal(frozen.length,plan.length);
    frozen.forEach((sh:any,i:number)=>{assert.equal(sh.windowW,plan[i].windowW);assert.equal(sh.windowH,plan[i].windowH);assert.equal(sh.kind,plan[i].kind);assert.deepEqual(sh.presentationProtection,plan[i].presentationProtection);assert.equal(sh.keyframes.length,1);});
    assert.deepEqual(frozen[0].keyframes[0],{time:0,centerX:.5,centerY:.5});
  }
  // compiled filters: enabled vs frozen differ only in the other shot's motion, never the protected shot's crop
  const fe=filterOf(enabled as any),ff=filterOf(freezeAutomaticPlan(plan,{enabled:false,freeze_source_time:1},0) as any);
  assert.ok(fe.length>0&&ff.length>0);
  assert.equal(fe,ff);
  // preview representation (helper-level JSON round-trip, not the HTTP endpoint): keeps the same plan, and the layout route is the shared track geometry
  assert.deepEqual(JSON.parse(JSON.stringify(plan)),plan);
  assert.equal(previewLayoutForResolvedShot('auto',plan[0],false,false),'track');
});
test('helper chain: nonportrait gate and manual/user layout keep their contracts',()=>{
  const full:any[]=[{start:0,end:4,kind:'fit',windowW:1,windowH:1,keyframes:[{time:0,centerX:.5,centerY:.5}]}];
  const single=plan(samples(wide),[tallRegion]);
  assert.ok(nonPortraitAutoFullSourceFit(single,'16:9'));assert.ok(nonPortraitAutoFullSourceFit(single,'1:1'));assert.equal(nonPortraitAutoFullSourceFit(single,'9:16'),false);
  assert.ok(nonPortraitAutoFullSourceFit(full,'16:9'));
  const mixed:any[]=S.explicitAutoLayoutPlan(mkTrack([tallRegion]),autoCfg,4,'9:16') as any;
  assert.equal(nonPortraitAutoFullSourceFit(mixed,'16:9'),false);
  assert.equal(S.explicitAutoLayoutPlan(mkTrack([tallRegion]),{...autoCfg,layout_mode_source:'user'},4,'9:16'),undefined);
  assert.equal(previewLayoutForResolvedShot('manual' as any,mixed[0],false,true),'manual');
});
