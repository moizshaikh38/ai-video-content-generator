import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveMeasuredItemPlan,measuredPlanConfigurationFingerprint} from '../services/itemShotPlanService.js';
import {syntheticMeasuredContext} from './fixtures/syntheticMeasuredContext.js';
import {ProEditorService as P} from '../services/proEditorService.js';
const item=()=>({id:'scene-a',source_start:11,source_end:14,source_asset_id:'synthetic-test-clip',source_path:'synthetic-test/source.mp4'});
const context=()=>syntheticMeasuredContext({mode:'smart',aspectRatio:'9:16',clipStartSec:10,layoutMode:'track',track:{source_width:854,source_height:480,smoothed_keyframes:[{time:0,centerX:.5,centerY:.5}],raw_samples:[{time:0,faces:[]}],metadata:{clip_duration:6,shot_composition_candidate:true}}});
const compute=()=>[{start:0,end:6,kind:'fit' as const,windowW:.75,windowH:1,keyframes:[{time:0,centerX:.5,centerY:.5}]}];
test('normal measured item resolution binds the effective scene, bytes, analysis and actual options',()=>{
 const i=item(),ctx=context(),before=JSON.stringify({i,ctx});const result=resolveMeasuredItemPlan(i,ctx,compute);assert.equal(result.status,'ready');if(result.status==='ready'){
  assert.equal(result.identity.itemId,'scene-a');assert.equal(result.identity.sourceVersion,ctx.sourceSha256);assert.equal(result.identity.sourceStart,11);assert.equal(result.identity.analysisSourceStart,10);assert.match(result.identity.configurationFingerprint,/^[a-f0-9]{64}$/);
 }assert.equal(JSON.stringify({i,ctx}),before);
});
test('wrong or missing source evidence blocks computation, not just later consumption',()=>{
 const mutations:Array<(c:any)=>void>=[c=>delete c.sourceSha256,c=>c.sourceSha256='b'.repeat(64),c=>c.sourceStoragePath='other',c=>c.sourceAssetId='other',c=>c.track.isStale=true,c=>c.track.status='failed',c=>c.track.analysis_version=0,c=>c.track.analyzed_aspect_ratio='1:1',c=>c.clipStartSec=9,c=>c.track.metadata.analyzed_source_end=19,c=>c.decodedSource.width=1920,c=>delete c.decodedSource];
 for(const mutate of mutations){const c=context();mutate(c);let called=0;assert.equal(resolveMeasuredItemPlan(item(),c,()=>{called++;return compute()}).status,'unavailable');assert.equal(called,0);}
});
test('per-item alternate source, out-of-range trim and empty ID cannot consume clip measurements',()=>{
 for(const patch of[{source_asset_id:'other'},{source_path:'other'},{source_start:9},{source_end:17},{id:''}]){let called=0;assert.equal(resolveMeasuredItemPlan({...item(),...patch},context(),()=>{called++;return compute()}).status,'unavailable');assert.equal(called,0);}
});
test('manual and accepted scene intent bypasses missing automatic provenance without edits',()=>{
 for(const patch of[{crop:{mode:'fit'}},{panels:{layout:'three'}},{framing_window:{}},{tracker:{enabled:true}},{crop_config:{layout_mode_source:'user'}}]){const i={...item(),...patch};const before=JSON.stringify(i);let called=0;assert.equal(resolveMeasuredItemPlan(i,{...context(),sourceSha256:undefined},()=>{called++;return compute()}).status,'bypassed');assert.equal(called,0);assert.equal(JSON.stringify(i),before);}
});
test('options fingerprint changes for candidate policy geometry samples cuts and output range',()=>{
 const a:any={sourceWidth:854,sourceHeight:480,duration:6,rawSamples:[{time:0,faces:[]}],sceneCuts:[2]};const hash=measuredPlanConfigurationFingerprint(a);
 for(const patch of[{sourceWidth:1920},{duration:7},{rawSamples:[{time:1,faces:[]}]},{sceneCuts:[3]},{pairFocusReview:true},{windowScope:'shot'},{layoutPolicy:{defaultLayout:'auto',allowed:['fit']}}])assert.notEqual(measuredPlanConfigurationFingerprint({...a,...patch}),hash);
 assert.equal(measuredPlanConfigurationFingerprint({duration:6,sceneCuts:[2],rawSamples:[{faces:[],time:0}],sourceHeight:480,sourceWidth:854}),hash);
});
test('effective candidate selection changes computed identity but speed and freeze do not',()=>{
 const a=resolveMeasuredItemPlan(item(),context(),compute),b=resolveMeasuredItemPlan({...item(),crop_config:{automaticLayoutCandidate:'review-v1'}},context(),compute),c=resolveMeasuredItemPlan({...item(),speed:{speed:2},automatic_framing:{enabled:false}},context(),compute);
 assert(a.status==='ready'&&b.status==='ready'&&c.status==='ready');assert.notEqual(a.identity.configurationFingerprint,b.identity.configurationFingerprint);assert.deepEqual(a.identity,c.identity);
});
test('normal Pro composition rejects unverified automatic item before returning a graph',()=>{
 const c=context();delete c.sourceSha256;assert.throws(()=>(P as any).buildSliceCropFilter(item(),c,1,3),(e:any)=>e.code==='AUTOMATIC_PLAN_REVIEW_REQUIRED');
 const filter=(P as any).buildSliceCropFilter({...item(),crop:{mode:'fit'}},c,1,3);assert.match(filter,/scale=/);
});
test('normal Pro composition computes and executes only the exact effective scene configuration',()=>{
 const c=context(),i=item();const filter=(P as any).buildSliceCropFilter(i,c,1,3);assert.match(filter,/crop=/);
 for(const patch of[{source_asset_id:'other'},{source_path:'other'},{source_end:20}])assert.throws(()=>(P as any).buildSliceCropFilter({...i,...patch},c,1,3),(e:any)=>e.code==='AUTOMATIC_PLAN_REVIEW_REQUIRED');
});

test('normal Quick composition binds current source/config and never swallows its review error',async()=>{
 const {SmartReframeService:S}=await import('../services/smartReframeService.js');
 const {ClipRenderService:R}=await import('../services/clipRenderService.js');
 const old=S.getReframeTrack,c=context();c.track.detected_face_count=1;c.track.dominant_track_id='fixture-person';c.track.layout_mode='track';
 (S as any).getReframeTrack=async()=>c.track;
 const clip:any={id:c.sourceAssetId,user_id:'fixture-owner',source_storage_path:c.sourceStoragePath,start_seconds:10,end_seconds:16,aspect_ratio:'9:16',crop_config:{mode:'smart',layout_mode:'track'}};
 try{
  const a=await R.resolveReframeDecision(clip,6,2/3,c.sourceSha256,c.decodedSource);assert.equal(a.mode,'smart');assert.equal(a.metadata?.automatic_plan_identity.sourceVersion,c.sourceSha256);
  const b=await R.resolveReframeDecision({...clip,crop_config:{...clip.crop_config,automaticLayoutCandidate:'review-v1'}},6,2/3,c.sourceSha256,c.decodedSource);assert.notEqual(a.metadata?.automatic_plan_identity.configurationFingerprint,b.metadata?.automatic_plan_identity.configurationFingerprint);
  await assert.rejects(()=>R.resolveReframeDecision(clip,6,2/3,'b'.repeat(64),c.decodedSource),(e:any)=>e.code==='AUTOMATIC_PLAN_REVIEW_REQUIRED');
  await assert.rejects(()=>R.resolveReframeDecision(clip,6,2/3,c.sourceSha256,{width:1920,height:1080}),(e:any)=>e.code==='AUTOMATIC_PLAN_REVIEW_REQUIRED');
  const manual=await R.resolveReframeDecision({...clip,crop_config:{mode:'manual',focusX:.3,focusY:.4}},6);assert.equal(manual.mode,'manual');
 }finally{S.getReframeTrack=old;}
});

test('recorded millisecond analyzer duration remains separate from exact source bounds',async()=>{
 const {acceptItemAutomaticPlan}=await import('../shared/itemAutomaticPlan.js');
 const c=context();c.track.metadata.analyzed_source_end=16.0004;
 const r=resolveMeasuredItemPlan({...item(),source_end:16.0004},c,compute);assert.equal(r.status,'ready');
 if(r.status==='ready'){assert.equal(r.identity.analysisSourceEnd,16.0004);assert.equal(r.identity.sourceEnd,16.0004);assert.equal(r.identity.analysisDuration,6);assert.ok(acceptItemAutomaticPlan(r,r.identity));assert.equal(acceptItemAutomaticPlan(r,{...r.identity,analysisDuration:6.0001}),null);}
 const wrong=context();wrong.track.metadata.analyzed_source_end=16.002;assert.equal(resolveMeasuredItemPlan(item(),wrong,compute).status,'unavailable');
 // Duration precision never permits an item beyond the actual analyzed bound.
 assert.equal(resolveMeasuredItemPlan({...item(),source_end:16.0008},c,compute).status,'unavailable');
});
