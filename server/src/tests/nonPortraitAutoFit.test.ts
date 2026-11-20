import {test} from 'node:test';import assert from 'node:assert/strict';
import {nonPortraitAutoFullSourceFit as eligible} from '../shared/nonPortraitAutoFit.js';
import {ProEditorService as P} from '../services/proEditorService.js';
import {quickCaptionWindows,applySceneCaptionPlacement as place} from '../shared/sceneCaptionPlacement.js';
const plan=()=>[{kind:'fit',start:0,end:4,windowW:1,windowH:1,keyframes:[{time:0,centerX:.5,centerY:.5}]}];
const track=():any=>({status:'ready',layout_mode:'split',source_width:1280,source_height:720,sourceObjectVerified:true,metadata:{analyzed_source_sha256:'a'.repeat(64),clip_duration:4},smoothed_keyframes:[{time:0,center_x:.5,center_y:.5}],raw_samples:Array.from({length:16},(_,i)=>({time:i*.25,faces:[{track_id:'solo',center_x:.5,center_y:.4,width:.1,height:.2}]}))});
const project=(aspect:string):any=>({canvas:{aspect_ratio:aspect,duration:4},tracks:[{type:'VIDEO',items:[{id:'v',source_start:100,source_end:104,timeline_start:0,timeline_end:4,crop_config:{layout_mode_source:'auto'}}]},{type:'CAPTION',items:[{timeline_start:0,timeline_end:4,caption:{position:'bottom'},transform:{position_y:500}}]}]});
test('nonportrait eligibility requires an already selected static whole-source Fit',()=>{for(const a of ['1:1','16:9'])assert(eligible(plan(),a));assert(!eligible(plan(),'9:16'));for(const patch of [{kind:'solo'},{split:{}},{windowW:.75},{windowH:.8},{keyframes:[]},{keyframes:[{centerX:.6,centerY:.5}]},{end:NaN}])assert(!eligible([{...plan()[0],...patch}],'1:1'));assert(!eligible(undefined,'1:1'));assert(!eligible([],'1:1'));});
for(const aspect of ['1:1','16:9'])test(`${aspect} captions derive from whole-source picture rather than rejected Split`,()=>{const p=project(aspect),t=track(),before=JSON.stringify({p,t});const w=P.captionSceneWindows(p,{mode:'smart',track:t,layoutMode:'track',clipStartSec:100} as any);assert.equal(w.length,1);assert.equal(w[0].layout,aspect==='1:1'?'fit':'fill');const c=place([{start:0,end:1,text:'TEST'}],{project:p,automaticWindows:w,fallbackLayout:'split'})[0];assert.equal(c.position_y,aspect==='1:1'?.78125:.8125);assert.equal(JSON.stringify({p,t}),before);assert.deepEqual(quickCaptionWindows(plan(),4,1280,720,aspect).map(x=>[x.layout,x.anchorY]),w.map(x=>[x.layout,x.anchorY]));});
test('nonportrait windows preserve manual pictures and explicit caption coordinates',()=>{for(const aspect of ['1:1','16:9']){const t=track();for(const patch of [{crop_config:{layout_mode_source:'user'},layout_mode:'split'},{crop:{mode:'fit'}},{tracker:{enabled:true,keyframes:[{time:100,centerX:.5,centerY:.5},{time:104,centerX:.5,centerY:.5}]}},{is_freeze:true},{panels:{layout:'three',slots:[]}}]){const p=project(aspect);Object.assign(p.tracks[0].items[0],patch);assert.deepEqual(P.captionSceneWindows(p,{mode:'smart',track:t,clipStartSec:100} as any),[],JSON.stringify(patch));}const p=project(aspect),c={start:0,end:1,text:'TEST',position_y:.23};assert.deepEqual(place([c],{project:p,automaticWindows:P.captionSceneWindows(p,{mode:'smart',track:t,clipStartSec:100} as any)}),[c]);}});

test('Quick resolver consumes full-source safety plan for both nonportrait canvases, never manual',async()=>{
 const {SmartReframeService:S}=await import('../services/smartReframeService.js');const {ClipRenderService:C}=await import('../services/clipRenderService.js');const original=S.getReframeTrack;
 try{S.getReframeTrack=async()=>({...track(),dominant_track_id:'solo',detected_face_count:1}) as any;
  for(const aspect_ratio of ['1:1','16:9']){const clip:any={id:'fixture',user_id:'fixture',aspect_ratio,crop_config:{mode:'smart',layout_mode_source:'auto'}};
   const d=await C.resolveReframeDecision(clip,4,2/3);assert.equal(d.metadata?.reason,'automatic_full_source_fit');assert.match(d.cropFilter,/force_original_aspect_ratio=decrease/);assert.equal(d.metadata?.caption_windows[0].layout,aspect_ratio==='1:1'?'fit':'fill');
   const manual=await C.resolveReframeDecision({...clip,crop_config:{mode:'manual',layout_mode_source:'user'}},4,2/3);assert.equal(manual.mode,'manual');assert.notEqual(manual.metadata?.reason,'automatic_full_source_fit');
  }
 }finally{S.getReframeTrack=original;}
});


test('malformed retained whole-source Fit rows decline eligibility without crashing preview or export routing',()=>{
 for(const aspect of ['1:1','16:9']){
  for(const value of [null,undefined,false,0,'fit',[]]){
   assert.doesNotThrow(()=>eligible([value] as any,aspect));
   assert.equal(eligible([value] as any,aspect),false);
   assert.equal(eligible([{...plan()[0],keyframes:[value]}] as any,aspect),false);
   assert.equal(eligible([...plan(),value] as any,aspect),false);
  }
  assert.equal(eligible(plan(),aspect),true);
 }
});


test('Quick export decision falls back rather than throwing for malformed explicit Fit rows',async()=>{
 const {SmartReframeService:S}=await import('../services/smartReframeService.js');
 const {ClipRenderService:C}=await import('../services/clipRenderService.js');
 const get=S.getReframeTrack,resolve=S.explicitAutoLayoutPlan;
 try{
  S.getReframeTrack=async()=>({...track(),dominant_track_id:'solo',detected_face_count:1}) as any;
  for(const aspect_ratio of ['1:1','16:9'])for(const malformed of [[null],[{...plan()[0],keyframes:[null]}]]){
   S.explicitAutoLayoutPlan=(()=>malformed) as any;
   const d=await C.resolveReframeDecision({id:'fixture',user_id:'fixture',aspect_ratio,crop_config:{mode:'smart',layout_mode_source:'auto'}} as any,4,2/3);
   assert.notEqual(d.metadata?.reason,'automatic_full_source_fit');
   assert.equal(typeof d.cropFilter,'string');
  }
 }finally{S.getReframeTrack=get;S.explicitAutoLayoutPlan=resolve;}
});
