import {ClipRenderService as C} from '../services/clipRenderService.js';
import {reviewSplitSubjectEvidence} from '../shared/splitSubjectEvidenceReview.js';
import fs from'node:fs';
import{test}from'node:test';import assert from'node:assert/strict';
import{automaticSplitReviewPlan as resolve}from'../shared/automaticSplitEvidence.js';
import{SmartReframeService as S}from'../services/smartReframeService.js';
const face=(id:string,x:number)=>({track_id:id,center_x:x,center_y:.4,width:.12,height:.2});
const pair=()=>({faces:[face('left',.25),face('right',.75)]});
const make=()=>({status:'ready',layout_mode:'split',metadata:{analyzed_source_sha256:'a'.repeat(64)},raw_samples:Array.from({length:20},pair)});
test('stable repeated pair keeps legacy automatic split, with detector dropout tolerance',()=>{
 for(const n of [0,1,4]){const t=make();for(let i=0;i<n;i++)t.raw_samples[i].faces=[];assert.equal(resolve(t,{layout_mode_source:'auto'},10),undefined)}
});
test('shot-fragmented tracks and intermittent pairs cannot fabricate a clip-wide split',()=>{
 for(const mode of ['fragments','single-shot','same-side','duplicate-id','absent','minority']){
  const t=make();t.raw_samples.forEach((s,i)=>{if(mode==='fragments')s.faces=[face('left'+Math.floor(i/5),.25),face('right'+Math.floor(i/5),.75)];if(mode==='single-shot'&&i>4)s.faces=[face('left',.5)];if(mode==='same-side')s.faces=[face('left',.24),face('other',.32)];if(mode==='duplicate-id')s.faces=[face('left',.25),face('left',.75)];if(mode==='absent')s.faces=[];if(mode==='minority'&&i>=15)s.faces=[]});
  const before=JSON.stringify(t);const p=S.explicitAutoLayoutPlan(t,{layout_mode_source:'genre_recommendation'},10)!;assert.equal(p.length,1,mode);assert.equal(p[0].split,undefined);assert.equal(p[0].windowW,1);assert.equal(p[0].windowH,1);assert.equal(p[0].presentationProtection?.preserveWindow,true);assert.equal(p[0].contextStatus,'unresolved-review-required');assert.equal(JSON.stringify(t),before);
 }
});
test('manual, legacy ownership, non-split and experimental plans are not changed',()=>{
 const t=make();t.raw_samples=[];for(const layout_mode_source of ['user','legacy_unknown',undefined])assert.equal(resolve(t,{layout_mode_source},10),undefined);
 for(const layout_mode of ['track','blur','screencast'])assert.equal(resolve({...t,layout_mode},{layout_mode_source:'auto'},10),undefined);
 assert.equal(resolve({...t,metadata:{shot_composition_candidate:true}},{layout_mode_source:'auto'},10),undefined);
});

test('actual fresh interview CV rejects fragmented clip-wide Split but retained stable pair stays eligible',()=>{
 const bad=JSON.parse(fs.readFileSync(new URL('./fixtures/long-interview-fragmented-pair.json',import.meta.url),'utf8'));
 const good=JSON.parse(fs.readFileSync(new URL('./fixtures/podcast-pair-normal-cv.json',import.meta.url),'utf8'));
 const t=make();assert(resolve({...t,raw_samples:bad.samples},{layout_mode_source:'genre_recommendation'},23.129)?.[0].presentationProtection.preserveWindow);
 assert.equal(resolve({...t,raw_samples:good.samples},{layout_mode_source:'genre_recommendation'},12),undefined);
});
test('normal reframe controller forwards genre provenance instead of dropping the safety plan',()=>{
 const source=fs.readFileSync(new URL('../controllers/clipController.ts',import.meta.url),'utf8');
 assert.match(source,/layout_mode_source:'auto'}:policyClip\?\.crop_config;/);
});

function cutBoundTrack(){
 const raw_samples=Array.from({length:40},(_,i)=>({time:.01+i*.25,faces:[{...face(i<20?'one':'two',.5),x:.44,y:.3}],persons:[]}));
 return {...make(),sourceObjectVerified:true,source_width:1280,source_height:720,raw_samples,
 metadata:{cut_local_split_recovery_review_enabled:true,analyzed_source_sha256:'a'.repeat(64),analyzed_source_start:50,analyzed_source_end:60,scene_cuts:[5],protected_content_regions:[],source_subtitle_review:{status:'not-observed',sourceSha256:'a'.repeat(64),sourceStart:50,sourceEnd:60,analyzedFrames:5}}};
}
test('source-bound cut-local recovery rejects fabricated split but uses measured single views',()=>{
 const t=cutBoundTrack(),before=JSON.stringify(t),p=S.explicitAutoLayoutPlan(t,{layout_mode_source:'auto'},10)!;
 assert.equal(p.length,2);assert.deepEqual(p.map(v=>[v.start,v.end]),[[0,5],[5,10]]);
 assert(p.every(v=>!v.split&&v.windowW<1&&v.contextStatus==='unresolved-review-required'));
 assert.equal(JSON.stringify(t),before);
});
test('cut-local recovery keeps measured side context and does not narrow prohibited or stale inputs',()=>{
 const t=cutBoundTrack();
 t.metadata.protected_content_regions=[{start:0,end:5,x:0,y:0,width:1,height:1,confidence:1}] as any;
 const p=S.explicitAutoLayoutPlan(t,{layout_mode_source:'auto'},10)!;
 assert.equal(p[0].windowW,1);assert.equal(p[0].windowH,1);assert(p[1].windowW<1);
 for(const patch of [{sourceObjectVerified:false},{isStale:true},{metadata:{...t.metadata,analyzed_source_end:61}},{metadata:{...t.metadata,scene_cuts:[NaN]}},{metadata:{...t.metadata,scene_cuts:[6,5]}},{raw_samples:[]}]){
  const next=S.explicitAutoLayoutPlan({...t,...patch},{layout_mode_source:'auto'},10)!;assert.equal(next.length,1);assert.equal(next[0].windowW,1);
 }
 const prohibited=S.explicitAutoLayoutPlan(t,{layout_mode_source:'auto',layoutPolicy:{defaultLayout:'auto',allowed:['split']}},10)!;
 assert.equal(prohibited.length,1);assert.equal(prohibited[0].windowW,1);
});

test('positive, missing, unknown or wrong-version source-text evidence cannot narrow old full-source fallback',()=>{
 const t=cutBoundTrack();
 for(const review of [undefined,{...t.metadata.source_subtitle_review,status:'suspected-source-text'}, {...t.metadata.source_subtitle_review,status:'unavailable'}, {...t.metadata.source_subtitle_review,sourceSha256:'b'.repeat(64)}, {...t.metadata.source_subtitle_review,sourceStart:51}, {...t.metadata.source_subtitle_review,analyzedFrames:0}]){
  const p=S.explicitAutoLayoutPlan({...t,metadata:{...t.metadata,source_subtitle_review:review}},{layout_mode_source:'auto'},10)!;assert.equal(p.length,1);assert.equal(p[0].windowW,1);
 }
});

test('ordinary Auto stays full source on sparse OCR misses and unmeasured wide lower-thirds across cuts',()=>{
 const t=cutBoundTrack();
 for(const review of [{...t.metadata.source_subtitle_review},{...t.metadata.source_subtitle_review,status:'not-observed',analyzedFrames:2}]){
  const p=S.explicitAutoLayoutPlan({...t,metadata:{...t.metadata,cut_local_split_recovery_review_enabled:false,source_subtitle_review:review}},{layout_mode_source:'auto'},10)!;
  assert.equal(p.length,1);assert.equal(p[0].windowW,1);assert.equal(p[0].windowH,1);
 }
 // A measured wide title appearing only after a source cut remains full Fit
 // even in the explicit local candidate. No OCR miss clears that geometry.
 t.metadata.protected_content_regions=[{start:5,end:10,x:0,y:.8,width:1,height:.15,confidence:1}] as any;
 const p=S.explicitAutoLayoutPlan(t,{layout_mode_source:'auto'},10)!;assert.equal(p[1].windowW,1);
});


test('positive solo, crowd, changed pair and same-side evidence cannot be outvoted by a95percent pair majority',()=>{
 for(const conflict of [[face('left',.5)],[face('left',.25),face('right',.75),face('third',.5)],[face('new-left',.25),face('new-right',.75)],[face('left',.2),face('right',.35)]]){
  const t=make();t.raw_samples[19].faces=conflict;const before=JSON.stringify(t);
  for(const layout_mode_source of ['auto','genre_recommendation']){const p=resolve(t,{layout_mode_source},10)!;assert.equal(p[0].split,undefined);assert.equal(p[0].windowW,1);assert.equal(p[0].presentationProtection.reason,'persistent-face-conflict');}
  assert.equal(JSON.stringify(t),before);assert.equal(resolve(t,{layout_mode_source:'user'},10),undefined);
 }
});
test('measured source-bound pair-to-closeup interval is not a detector dropout',()=>{
 const real=JSON.parse(fs.readFileSync(new URL('./fixtures/interview-pair-to-closeup-cv.json',import.meta.url),'utf8'));
 const t={...make(),raw_samples:real.samples};const pairSamples=t.raw_samples.filter((s:any)=>s.faces.length===2).length;
 assert(pairSamples/t.raw_samples.length>.8,'old majority rule would admit this interval');
 const p=resolve(t,{layout_mode_source:'auto'},real.provenance.duration)!;assert.equal(p[0].windowW,1);assert.equal(p[0].windowH,1);
});


test('manual Split review locates sampled conflicts without changing manual layout or claiming continuous coverage',()=>{
 const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/interview-pair-to-closeup-cv.json',import.meta.url),'utf8'));
 const sha=fixture.provenance.sourceSha256;
 const clip={source_storage_path:'fixture.mp4',start_seconds:106.8,end_seconds:112.8,aspect_ratio:'9:16',crop_config:{mode:'smart',layout_mode:'split',layout_mode_source:'user'}};
 const track={...make(),analyzed_aspect_ratio:'9:16',raw_samples:fixture.samples,metadata:{analyzed_source_path:clip.source_storage_path,analyzed_source_start:106.8,analyzed_source_end:112.8,analyzed_source_sha256:sha}};
 const before=JSON.stringify({clip,track});const review=reviewSplitSubjectEvidence(clip,track,sha);
 assert.equal(review.status,'sampled-conflict');assert.equal(review.sampleCount,25);assert.equal(review.pairSamples,23);assert.equal(review.conflictCount,2);assert.deepEqual(review.conflicts.map(v=>v.time),[5.52,5.76]);assert(review.conflicts.every(v=>v.reason==='single-observed-subject'));assert.equal(review.coverage,'sampled-only');assert.equal(review.manualLayoutChanged,false);assert.equal(JSON.stringify({clip,track}),before);
 for(const changed of [{...clip,start_seconds:107},{...clip,source_storage_path:'other.mp4'},{...clip,aspect_ratio:'1:1'}])assert.equal(reviewSplitSubjectEvidence(changed,track,sha).status,'unavailable');
 for(const changed of [{...track,isStale:true},{...track,sourceObjectVerified:false},{...track,raw_samples:[{time:NaN,faces:[]}]},{...track,raw_samples:[{time:7,faces:[]}]}])assert.equal(reviewSplitSubjectEvidence(clip,changed,sha).status,'unavailable');
 assert.equal(reviewSplitSubjectEvidence(clip,track,'b'.repeat(64)).status,'unavailable');
});
test('manual Split review separates sparse consistent pair, dropout and invalid geometry',()=>{
 const clip={source_storage_path:'fixture.mp4',start_seconds:0,end_seconds:10,aspect_ratio:'9:16'};const sha='a'.repeat(64);
 const track={...make(),analyzed_aspect_ratio:'9:16',metadata:{analyzed_source_path:clip.source_storage_path,analyzed_source_start:0,analyzed_source_end:10,analyzed_source_sha256:sha},raw_samples:Array.from({length:20},(_,i)=>({time:i*.4,...pair()}))};
 assert.equal(reviewSplitSubjectEvidence(clip,track,sha).status,'sampled-pair-consistent');
 track.raw_samples[19].faces=[];const dropout=reviewSplitSubjectEvidence(clip,track,sha);assert.equal(dropout.status,'sampled-pair-consistent');assert.equal(dropout.dropoutSamples,1);assert.equal(dropout.conflictCount,0);
 track.raw_samples[18].faces[0].width=-.1;assert.equal(reviewSplitSubjectEvidence(clip,track,sha).conflicts[0].reason,'invalid-subject-geometry');
 track.raw_samples[18].faces=[null] as any;assert.equal(reviewSplitSubjectEvidence(clip,track,sha).conflicts[0].reason,'invalid-subject-geometry');
 track.raw_samples.forEach(s=>s.faces=[]);assert.equal(reviewSplitSubjectEvidence(clip,track,sha).status,'insufficient-samples');
});

test('explicit Auto Split and fallback Fit do not claim the legacy4:3Fit metadata reason',async()=>{
 const stable=JSON.parse(fs.readFileSync(new URL('./fixtures/podcast-pair-normal-cv.json',import.meta.url),'utf8'));
 const bad=JSON.parse(fs.readFileSync(new URL('./fixtures/interview-pair-to-closeup-cv.json',import.meta.url),'utf8'));
 const original=S.getReframeTrack;
 try{
  for(const [fixture,duration] of [[stable,12],[bad,6]] as const){
   const track={...make(),source_width:fixture.provenance.sourceWidth,source_height:fixture.provenance.sourceHeight,raw_samples:fixture.samples,smoothed_keyframes:[{time:0,center_x:.5,center_y:.5}],dominant_track_id:'subject_1',detected_face_count:2,metadata:{analyzed_source_sha256:fixture.provenance.sourceSha256,shot_composition_candidate:false,clip_duration:duration}};
   S.getReframeTrack=async()=>track as any;
   const clip:any={id:'fixture',user_id:'fixture',aspect_ratio:'9:16',start_seconds:0,end_seconds:duration,crop_config:{mode:'smart',layout_mode:'track',layout_mode_source:'auto'}};
   const result=await C.resolveReframeDecision(clip,duration,1,fixture.provenance.sourceSha256,{width:track.source_width,height:track.source_height});assert.equal(result.metadata?.reason,'automatic_layout_plan');assert.equal(result.metadata?.caption_windows[0].layout,fixture===stable?'split':'fit');
  }
 }finally{S.getReframeTrack=original;}
});
