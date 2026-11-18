import{test}from'node:test';import assert from'node:assert/strict';import{usesAutomaticSourceClock,automaticSourceWindow,singleItemSourceWindow}from'../shared/automaticSourceClock.js';import{ProEditorService as P}from'../services/proEditorService.js';import{syntheticMeasuredContext}from'./fixtures/syntheticMeasuredContext.js';
const face=(track_id:string,x:number)=>({track_id,x:x-.05,y:.2,width:.1,height:.15,center_x:x,center_y:.275,confidence:.95});
function fixture(){
 const track:any={source_width:1920,source_height:1080,smoothed_keyframes:[{time:0,centerX:.5,centerY:.5}],metadata:{clip_duration:4,scene_cuts:[2],protected_content_regions:[]},raw_samples:Array.from({length:16},(_,i)=>({time:i*.25,faces:i<8?[]:[face('a',.2),face('b',.8)],persons:i<8?[{x:.3,y:.2,width:.12,height:.6,confidence:.95}]:[{x:.02,y:.14,width:.31,height:.84,confidence:.95},{x:.67,y:.14,width:.31,height:.84,confidence:.95}]}))};
 const reframe=syntheticMeasuredContext({mode:'smart',aspectRatio:'9:16',clipStartSec:10,layoutMode:'track',track});
 const item:any={id:'auto-speed',source_start:11,source_end:13,timeline_start:0,timeline_end:1,speed:{speed:2},crop_config:{mode:'smart',layout_mode_source:'auto'}};
 const project:any={canvas:{width:1080,height:1920,aspect_ratio:'9:16',fps:30,duration:1},tracks:[{type:'VIDEO',name:'main',items:[item]}]};return{project,reframe,item};
}
test('ordinary Auto uses source clock without a candidate flag; manual ownership does not gain it',()=>{assert.ok(usesAutomaticSourceClock({crop_config:{layout_mode_source:'auto'}},false));for(const item of[undefined,{}, {crop_config:{layout_mode_source:'user'}},{crop_config:{layout_mode_source:'genre_recommendation'}}])assert.equal(usesAutomaticSourceClock(item,false),false);assert.ok(usesAutomaticSourceClock({},true));});
test('ordinary single-item2x trim straddles the real source cut and retains both layouts',()=>{const{project,reframe}=fixture();const g=P.compileRenderGraph(project,'synthetic.mp4','/tmp/out.mp4','/tmp',reframe,'off');const f=g.filterComplex.join(';');assert.ok(f.includes('concat=n=2:v=1:a=0'));assert.ok(f.includes('vstack'));assert.ok(f.includes('trim=start=0.000000:duration=1.000000'));assert.ok(f.includes('trim=start=1.000000:duration=1.000000'));assert.ok(f.includes('setpts=PTS/2'));assert.ok(!reframe.track.metadata.shot_composition_candidate);});
test('ordinary multi-item2x trim uses source duration before speed instead of timeline duration',()=>{const{project,reframe,item}=fixture();project.canvas.duration=2;project.tracks[0].items.push({...item,id:'manual-next',source_start:13,source_end:14,timeline_start:1,timeline_end:2,speed:{speed:1},crop_config:{layout_mode_source:'user'},crop:{mode:'fit'}});const f=P.compileRenderGraph(project,'synthetic.mp4','/tmp/out.mp4','/tmp',reframe,'off').filterComplex.join(';');assert.ok(f.includes('concat=n=2:v=1:a=0'));assert.ok(f.includes('vstack'));assert.ok(f.includes('trim=start=1.000000:duration=1.000000'));assert.ok(f.includes('trim=start=11.000000:end=13.000000'));});

test('single-item input/output bounds honor both fast and slow playback and reject stale canvas overrun',()=>{assert.deepEqual(automaticSourceWindow({source_start:6,source_end:18,speed:{speed:2}},0,6),{sourceStart:6,sourceDuration:12,outputDuration:6});assert.deepEqual(automaticSourceWindow({source_start:6,source_end:18,speed:{speed:.5}},0,24),{sourceStart:6,sourceDuration:12,outputDuration:24});assert.deepEqual(automaticSourceWindow({source_start:6,source_end:18,speed:{speed:.5}},0,36),{sourceStart:6,sourceDuration:12,outputDuration:24});});

test('scene-local manual Fit wins only inside its source interval after2x trim',async()=>{
 const{applySceneLayout}=await import('../../../src/lib/itemLayout.js');const{expandSceneLayoutProject,resolveSceneLayoutItem}=await import('../shared/sceneLayoutOverrides.js');
 const{project,reframe,item}=fixture();const before=JSON.stringify(project);
 const next=applySceneLayout(project,item.id,12,12.5,'fit');const expanded=expandSceneLayoutProject(next).tracks[0].items;
 assert.equal(JSON.stringify(project),before);assert.equal(next.tracks[0].items.length,1);
 assert.deepEqual(expanded.map((i:any)=>[i.source_start,i.source_end,i.timeline_start,i.timeline_end]),[[11,12,0,.5],[12,12.5,.5,.75],[12.5,13,.75,1]]);
 assert.equal(resolveSceneLayoutItem(next.tracks[0].items[0],12.25).crop?.choice,'fit');assert.equal(resolveSceneLayoutItem(next.tracks[0].items[0],12.5).crop_config?.layout_mode_source,'auto');
 for(const [n,i]of expanded.entries()){
  const f=(P as any).buildSliceCropFilter(i,reframe,i.source_start-10,i.source_end-i.source_start,project.canvas);
  assert.equal(f.includes('vstack'),n===2,'only the resumed Auto pair scene gets measured Split');
 }
 const f=P.compileRenderGraph(next,'synthetic.mp4','/tmp/out.mp4','/tmp',reframe,'off').filterComplex.join(';');
 assert.ok(f.includes('trim=start=11.000000:end=12.000000'));assert.ok(f.includes('trim=start=12.000000:end=12.500000'));assert.ok(f.includes('trim=start=12.500000:end=13.000000'));
 assert.equal(next.tracks[0].items.length,1,'render expansion must not split the saved edit');
});

test('single normal item input content ignores layout ownership, freeze/title remain separate',()=>{
 for(const config of [undefined,{layout_mode_source:'auto'},{layout_mode_source:'user'},{layout_mode_source:'genre_recommendation'}])for(const layout of ['fit','fill','split','screenshare','gameplay']){
  const i:any={source_start:6,source_end:18,speed:{speed:2},crop_config:config,layout_mode:layout};assert.deepEqual(singleItemSourceWindow(i,0,6),{sourceStart:6,sourceDuration:12,outputDuration:6});
  assert.deepEqual(singleItemSourceWindow({...i,speed:{speed:.5}},0,24),{sourceStart:6,sourceDuration:12,outputDuration:24});
 }
 assert.equal(singleItemSourceWindow(undefined,0,6),undefined);for(const flag of ['is_freeze','is_title_card'])assert.equal(singleItemSourceWindow({source_start:6,source_end:18,[flag]:true},0,6),undefined);
});
