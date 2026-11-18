import {test} from 'node:test';import assert from 'node:assert/strict';
import {applySceneLayout,applyWholeClipLayout,applyLayoutAtSourceTime,applyFramingStrategy} from '../../../src/lib/itemLayout.js';
import {expandSceneLayoutProject,resolveSceneLayoutItem,validateSceneLayoutOverrides} from '../shared/sceneLayoutOverrides.js';
const make=():any=>({canvas:{aspect_ratio:'9:16',width:1080,height:1920,duration:12},tracks:[{id:'v',type:'VIDEO',items:[{id:'item',source_start:40,source_end:64,timeline_start:0,timeline_end:12,speed:{speed:2},crop_config:{layout_mode_source:'auto'},transform:{scale:1.3},tracker:{enabled:false}}]}]});
const item=(p:any)=>p.tracks[0].items[0];
test('scene override persists one item, leaves base and other source scenes untouched',()=>{const p=make(),q=applySceneLayout(p,'item',48,56,'fill');assert.equal(q.tracks[0].items.length,1);assert.equal(item(q).crop,undefined);assert.equal(item(q).scene_layout_overrides.length,1);assert.equal(resolveSceneLayoutItem(item(q),50).crop.mode,'fill');assert.equal(resolveSceneLayoutItem(item(q),47).crop,undefined);assert.equal(resolveSceneLayoutItem(item(q),56).crop,undefined);assert.deepEqual(item(q).transform,item(p).transform);assert.deepEqual(item(q).tracker,item(p).tracker);});
test('render slices map source-clock bounds through2x speed without timeline cuts or transitions',()=>{const p=applySceneLayout(make(),'item',48,56,'fit'),expanded=expandSceneLayoutProject(p);assert.deepEqual(expanded.tracks[0].items.map((i:any)=>[i.source_start,i.source_end,i.timeline_start,i.timeline_end]),[[40,48,0,4],[48,56,4,8],[56,64,8,12]]);assert.equal(p.tracks[0].items.length,1);assert.equal(expanded.tracks[0].items[1].crop.choice,'fit');});
test('Auto releases only this scene and preserves base manual crop elsewhere',()=>{const p=make();item(p).crop={mode:'custom',focusX:.2};const q=applySceneLayout(p,'item',48,56,'auto');assert.equal(resolveSceneLayoutItem(item(q),49).crop,undefined);assert.equal(resolveSceneLayoutItem(item(q),42).crop.focusX,.2);});
test('whole clip is separate explicit replacement, locks survive',()=>{const p=applySceneLayout(make(),'item',48,56,'fill');const q=applyWholeClipLayout(p,'fit');assert.equal(item(q).scene_layout_overrides,undefined);assert.equal(item(q).crop.choice,'fit');p.tracks[0].locked=true;assert.equal(applySceneLayout(p,'item',48,56,'blur'),p);assert.equal(applyWholeClipLayout(p,'fill'),p);});
test('overlap replacements retain unaffected range fragments',()=>{const p=applySceneLayout(applySceneLayout(make(),'item',44,60,'fill'),'item',48,56,'fit');assert.deepEqual(item(p).scene_layout_overrides.map((o:any)=>[o.start,o.end,o.layout]),[[44,48,'fill'],[48,56,'fit'],[56,60,'fill']]);});
test('malformed/overlapping ranges fail before render',()=>{for(const overrides of [[{start:NaN,end:2,layout:'fill',patch:{}}],[{start:0,end:2,layout:'unknown',patch:{}}],[{start:0,end:2,layout:'fill',patch:{source_path:'bad'}}],[{start:0,end:3,layout:'fill',patch:{}},{start:2,end:4,layout:'fill',patch:{}}]]){assert.throws(()=>validateSceneLayoutOverrides({scene_layout_overrides:overrides}));}});
test('caption anchors follow effective scene windows without cutting persisted cues/items',async()=>{const {applySceneCaptionPlacement}=await import('../shared/sceneCaptionPlacement.js');const p=applySceneLayout(make(),'item',48,56,'split');const r=applySceneCaptionPlacement([{start:2,end:10,text:'Hello'}],{project:p});assert.equal(r.length,3);assert.equal(r[1].start,4);assert.equal(r[1].end,8);assert.equal(r[1].position_y,.5);assert.equal(p.tracks[0].items.length,1);});
test('scene crop edits seed from existing scene override without changing another scene',()=>{let p=applySceneLayout(make(),'item',48,56,'fill');item(p).scene_layout_overrides[0].patch.crop.focusX=.22;p=applySceneLayout(p,'item',48,56,'fit');assert.equal(item(p).scene_layout_overrides[0].patch.crop.focusX,.22);});
test('trim reuses only measured candidate windows on the same source/aspect',async()=>{const {storedScenePlanWindow}=await import('../shared/storedScenePlanWindow.js');const p=make(),clip={start_seconds:0,aspect_ratio:'9:16',source_storage_path:'same'},track={status:'ready',isStale:true,analyzed_aspect_ratio:'9:16',analyzed_trim_start:0,raw_samples:[{}],smoothed_keyframes:[{}],metadata:{shot_composition_candidate:true,analyzed_source_path:'same',analyzed_source_start:0,analyzed_source_end:70,clip_duration:70}};assert.equal(storedScenePlanWindow(p,clip,track)?.track.isStale,false);assert.equal(track.isStale,true);assert.equal(storedScenePlanWindow(p,{...clip,source_storage_path:'other'},track),null);assert.equal(storedScenePlanWindow(p,{...clip,aspect_ratio:'1:1'},track),null);assert.equal(storedScenePlanWindow(p,clip,{...track,metadata:{...track.metadata,clip_duration:50}}),null);});

test('retained scene window cannot infer historical source anchor from a changed clip start',async()=>{
 const {storedScenePlanWindow}=await import('../shared/storedScenePlanWindow.js');
 const p=make(),clip={start_seconds:100,aspect_ratio:'9:16',source_storage_path:'same'};
 const track={status:'ready',isStale:true,analyzed_aspect_ratio:'9:16',raw_samples:[{}],smoothed_keyframes:[{}],metadata:{shot_composition_candidate:true,analyzed_source_path:'same',analyzed_source_start:0,analyzed_source_end:70,clip_duration:70}};
 assert.equal(storedScenePlanWindow(p,clip,track)?.sourceAnchor,0);
 const missing=structuredClone(track);delete (missing.metadata as any).analyzed_source_start;
 assert.equal(storedScenePlanWindow(p,clip,missing),null);
 const moved=structuredClone(p);moved.tracks[0].items[0].source_start=140;moved.tracks[0].items[0].source_end=164;
 assert.equal(storedScenePlanWindow(moved,clip,track),null);
});

test('render cannot revive a stored scene plan whose actual source bytes mismatch',async()=>{const {storedScenePlanWindow}=await import('../shared/storedScenePlanWindow.js');const sha='a'.repeat(64),p=make(),clip={aspect_ratio:'9:16',source_storage_path:'same'},track={status:'ready',isStale:true,analyzed_aspect_ratio:'9:16',raw_samples:[{}],smoothed_keyframes:[{}],metadata:{shot_composition_candidate:true,analyzed_source_path:'same',analyzed_source_start:0,analyzed_source_end:70,clip_duration:70,analyzed_source_sha256:sha}};assert.ok(storedScenePlanWindow(p,clip,track,sha));assert.equal(storedScenePlanWindow(p,clip,track,'b'.repeat(64)),null);});

for (const mode of ['fit','blur','center','smart'] as const) {
 test('clip-wide '+mode+' replaces scene Auto overrides consistently in preview/render',()=>{
  let p=applySceneLayout(make(),'item',40,64,'auto');
  p={...p,canvas:{...p.canvas,background_user_choice:'color'}};
  const before=structuredClone(p),q=applyFramingStrategy(p,mode),i=item(q);
  assert.equal(i.scene_layout_overrides,undefined);
  const preview=resolveSceneLayoutItem(i,50),exportItem=expandSceneLayoutProject(q).tracks[0].items[0];
  assert.deepEqual(preview.crop,exportItem.crop);
  assert.equal(preview.crop?.mode,mode==='smart'?undefined:mode==='center'?'fill':mode);
  assert.deepEqual(i.transform,item(before).transform);assert.deepEqual(p,before);
 });
}
test('Color then Blur keeps the later explicit choice in expanded scene export',()=>{
 const p=applySceneLayout(make(),'item',40,64,'auto');
 const color=applyFramingStrategy({...p,canvas:{...p.canvas,background_user_choice:'color'}},'fit');
 const blur=applyFramingStrategy({...color,canvas:{...color.canvas,background_user_choice:'blur'}},'blur');
 assert.equal(expandSceneLayoutProject(color).tracks[0].items[0].crop.mode,'fit');
 assert.equal(expandSceneLayoutProject(blur).tracks[0].items[0].crop.mode,'blur');
 assert.equal(blur.canvas.background_user_choice,'blur');
});

test('manual scene re-selection stays scene-local when automatic preview is bypassed',()=>{let p=applySceneLayout(make(),'item',48,56,'fill');p=applySceneLayout(p,'item',56,64,'blur');const next=applyLayoutAtSourceTime(p,'item',50,'fit');assert.deepEqual(item(next).scene_layout_overrides.map((o:any)=>[o.start,o.end,o.layout]),[[48,56,'fit'],[56,64,'blur']]);assert.equal(resolveSceneLayoutItem(item(next),42).crop,undefined);assert.equal(resolveSceneLayoutItem(item(next),60).crop.mode,'blur');assert.equal(item(next).crop,undefined);});
test('implicit gap and2xsourceclock preserve adjacent saved scenes despite a broad current analysis shot',()=>{let p=applySceneLayout(make(),'item',48,56,'fill');const next=applyLayoutAtSourceTime(p,'item',45,'fit',{start:40,end:64});assert.deepEqual(item(next).scene_layout_overrides.map((o:any)=>[o.start,o.end,o.layout]),[[40,48,'fit'],[48,56,'fill']]);assert.equal(resolveSceneLayoutItem(item(next),60).crop,undefined);assert.equal(applyLayoutAtSourceTime(p,'item',30,'fit'),p);});
