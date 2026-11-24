import{test}from'node:test';import assert from'node:assert/strict';import{snapshotAutomaticScenePlan,readAutomaticScenePlan,AUTOMATIC_SCENE_PLANNER_VERSION}from'../shared/automaticScenePlan.js';
test('cut-local Auto invalidates old whole-clip Fit snapshots without changing manual ownership',()=>{
 const track:any={status:'ready',sourceObjectVerified:true,analyzed_aspect_ratio:'9:16',source_width:1280,source_height:720,raw_samples:[{time:0,faces:[]}],metadata:{analyzed_source_sha256:'a'.repeat(64),analyzed_source_start:5,analyzed_source_end:15}};
 const config={mode:'smart',layout_mode_source:'auto'},segments=[{start:0,end:10,kind:'fit',windowW:1,windowH:1,keyframes:[{time:0,centerX:.5,centerY:.5}]}];
 const snap=snapshotAutomaticScenePlan(track,config,10,segments);assert(snap);assert.equal(AUTOMATIC_SCENE_PLANNER_VERSION,'normal-auto-pair-bracketed-gap-v8');track.metadata.automatic_scene_plan=snap;assert.deepEqual(readAutomaticScenePlan(track,config,10),segments);
 track.metadata.automatic_scene_plan={...snap,plannerVersion:'normal-auto-refined-pair-bounded-v7'};assert.equal(readAutomaticScenePlan(track,config,10),undefined);
 track.metadata.automatic_scene_plan={...snap,plannerVersion:'normal-auto-baseline-v3'};assert.equal(readAutomaticScenePlan(track,config,10),undefined);assert.equal(snapshotAutomaticScenePlan(track,{...config,layout_mode_source:'user'},10,segments),undefined);
});
