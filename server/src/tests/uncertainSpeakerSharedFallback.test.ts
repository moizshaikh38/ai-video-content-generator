import{test}from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
import{SmartReframeService as S}from'../services/smartReframeService.js';import{legacyFit43Plan}from'../shared/automaticLayoutPolicy.js';
const recorded=JSON.parse(fs.readFileSync(new URL('./fixtures/podcast-pair-normal-cv.json',import.meta.url),'utf8'));
const make=()=>({status:'ready',layout_mode:'track',dominant_track_id:'subject_2',source_width:recorded.provenance.sourceWidth,source_height:recorded.provenance.sourceHeight,metadata:{analyzed_source_sha256:recorded.provenance.sourceSha256,dominant_score:.668,clip_duration:12,scene_cuts:[],protected_content_regions:[]},raw_samples:structuredClone(recorded.samples)});
const resolve=(t:any)=>S.explicitAutoLayoutPlan(t,{layout_mode_source:'auto'},12)||legacyFit43Plan(t,12,S.computeGroupFrameGeometry({rawSamples:t.raw_samples,sourceWidth:t.source_width,sourceHeight:t.source_height}),S.isLowConfidenceTrack(t));
test('recorded pair keeps both panels with absent or alternating visual mouth heuristic',()=>{
 const baseline=resolve(make());assert.ok(baseline?.[0].split);assert.equal(baseline.length,1);assert.equal(baseline[0].keyframes.length,1);
 for(const mode of ['absent','alternating','left-only','right-only']){
  const t=make();t.raw_samples.forEach((s:any,i:number)=>s.faces.forEach((f:any,j:number)=>{if(mode==='absent')delete f.mouth_score;else f.mouth_score=mode==='alternating'?Number(i%2===j):Number(j===(mode==='left-only'?0:1))}));
  const before=JSON.stringify(t);assert.deepEqual(resolve(t),baseline,mode);assert.equal(JSON.stringify(t),before);
 }
});
test('missing body support or intermittent face observations fall back to one stable shared view',()=>{
 for(const mode of ['body-absent','quarter-face-missing']){
  const t=make();t.raw_samples.forEach((s:any,i:number)=>{if(mode==='body-absent')s.persons=[];else if(i%4===0)s.faces=s.faces.slice(0,1)});
  assert.equal(S.explicitAutoLayoutPlan(t,{layout_mode_source:'auto'},12),undefined,'No unsupported Split');
  const p=resolve(t);assert.equal(p?.length,1);const shot=p![0];assert.equal(shot.split,undefined);assert.equal(shot.contextStatus,'unresolved-review-required');
  assert.ok(shot.keyframes.every((k:any)=>Math.abs(k.centerX-shot.keyframes[0].centerX)<1e-8&&Math.abs(k.centerY-shot.keyframes[0].centerY)<1e-8),'No face-to-face motion from detector dropout');
  for(const row of t.raw_samples)for(const f of row.faces){const k=shot.keyframes[0];assert.ok(f.x>=k.centerX-shot.windowW/2-1e-8);assert.ok(f.x+f.width<=k.centerX+shot.windowW/2+1e-8);assert.ok(f.y>=k.centerY-shot.windowH/2-1e-8);assert.ok(f.y+f.height<=k.centerY+shot.windowH/2+1e-8)}
 }
});

test('Fit-only recorded pair uses the same constrained shared fallback without losing a repeated face',()=>{const t=make();assert.equal(S.explicitAutoLayoutPlan(t,{layout_mode_source:'auto',layoutPolicy:{allowed:['fit']}},12),undefined);const p=resolve({...t,layout_mode:'track'});assert(p?.[0].split);const g=S.computeGroupFrameGeometry({rawSamples:t.raw_samples,sourceWidth:t.source_width,sourceHeight:t.source_height});const shared=legacyFit43Plan(t,12,g,false)!;assert.equal(shared[0].windowW,1);assert.equal(shared[0].windowH,1);assert.equal(shared[0].presentationProtection.reason,'persistent-face-conflict');assert.equal(shared[0].split,undefined);assert.deepEqual(shared[0].keyframes.map((k:any)=>k.time),g!.keyframes.map(k=>k.time));});

test('legacy shared Fit keeps feasible4:3 size and excludes experimental or manual-layout families',()=>{const t=make();t.raw_samples.forEach((s:any)=>s.faces.forEach((f:any)=>{f.x=.3+(f.track_id==='subject_1'?.25:0);f.width=.08;f.center_x=f.x+.04}));const g={windowW:1,windowH:1,keyframes:[{time:0,centerX:.5,centerY:.5}]};const p=legacyFit43Plan(t,12,g,false)!;assert.equal(p[0].windowW,4/3*t.source_height/t.source_width);assert.equal(p[0].windowH,1);assert.equal(p[0].presentationProtection,undefined);for(const layout_mode of ['split','screencast'])assert.equal(legacyFit43Plan({...t,layout_mode},12,g,false),undefined);assert.equal(legacyFit43Plan({...t,metadata:{...t.metadata,shot_composition_candidate:true}},12,g,false),undefined)});
