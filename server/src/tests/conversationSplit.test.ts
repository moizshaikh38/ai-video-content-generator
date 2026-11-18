import {syntheticMeasuredContext} from './fixtures/syntheticMeasuredContext.js';
import {test} from 'node:test';import assert from 'node:assert/strict';
import {applyPlanSceneToProject} from '../shared/framingWindow.js';
import {SmartReframeService as S} from '../services/smartReframeService.js';
const face=(track_id:string,cx:number)=>({track_id,x:cx-.05,y:.2,width:.1,height:.15,center_x:cx,center_y:.275,confidence:.95});
const samples=()=>Array.from({length:16},(_,i)=>({time:i*.25,faces:[face('a',.2),face('b',.8)],persons:[{x:.02,y:.14,width:.31,height:.84,confidence:.95},{x:.67,y:.14,width:.31,height:.84,confidence:.95}]}));
const opts=()=>({rawSamples:samples(),duration:4,sourceWidth:910,sourceHeight:480,allowConversationSplit:true,windowScope:'shot' as const,automaticFitAspect:'4:3' as const});
test('opt-in stable interview pair chooses a body-safe whole-source split',()=>{
 const p=S.computeShotComposition(opts());assert.ok(p[0].split);assert.equal(p[0].windowW,1);assert.equal(p[0].windowH,1);assert.equal(p[0].split!.dividerX,.5);
 const graph=S.buildShotCompositionFilter({plan:p,sourceWidth:910,sourceHeight:480,duration:4});assert.ok(graph.includes('vstack'));assert.ok(graph.includes('pad=1080:960'));assert.ok(graph.includes('trim=end_frame=120'));
});
test('default and clip-wide policies cannot silently select the new split',()=>{
 assert.ok(!S.computeShotComposition({...opts(),allowConversationSplit:false})[0].split);
 assert.ok(!S.computeShotComposition({...opts(),windowScope:'clip'})[0].split);
});
test('two faces alone, sparse bodies, changing identities, crowds and crossing bodies reject split',()=>{
 for(const transform of [
  (a:any[])=>a.map(s=>({...s,persons:[]})),
  (a:any[])=>a.map((s,i)=>({...s,persons:i<3?s.persons:[]})),
  (a:any[])=>a.map((s,i)=>({...s,faces:s.faces.map((f:any)=>({...f,track_id:i<8?f.track_id:f.track_id+'new'}))})),
  (a:any[])=>a.map(s=>({...s,faces:[...s.faces,face('c',.5)]})),
  (a:any[])=>a.map(s=>({...s,persons:[{...s.persons[0],width:.7},s.persons[1]]})),
 ])assert.ok(!S.computeShotComposition({...opts(),rawSamples:transform(samples())})[0].split);
});
test('protected side text and short transients do not trigger a split',()=>{
 assert.ok(!S.computeShotComposition({...opts(),duration:1})[0].split);
 assert.ok(!S.computeShotComposition({...opts(),protectedContentRegions:[{start:0,end:4,x:0,y:0,width:.2,height:.1,confidence:.9}]})[0].split);
});
test('mixed shots switch only in the explicitly eligible pair interval',()=>{
 const solo=samples().map(s=>({...s,faces:[s.faces[0]],persons:[s.persons[0]]}));
 const none=samples().map(s=>({...s,time:s.time+4,faces:[],persons:[]}));
 const pair=samples().map(s=>({...s,time:s.time+8}));
 const p=S.computeShotComposition({...opts(),rawSamples:[...solo,...none,...pair],sceneCuts:[4,8],duration:12});
 assert.deepEqual(p.map(s=>Boolean(s.split)),[false,false,true]);
});

test('single-window acceptance cannot silently flatten a split plan',()=>{
 const shot=S.computeShotComposition(opts())[0];
 const result=applyPlanSceneToProject({canvas:{aspect_ratio:'9:16'},tracks:[]},shot,{clipStartSec:0,analyzedTrimStart:0,currentTrimStart:0,planVersion:'test',sourceWidth:910,sourceHeight:480});
 assert.equal(result.ok,false);assert.match((result as any).reasons[0],/two-panel/);
});

test('real FFmpeg executes sliced solo/fit/split plan with exact frame count',async()=>{
 const {execFileSync}=await import('node:child_process');const {default:ffmpeg}=await import('ffmpeg-static');
 const {ProEditorService}=await import('../services/proEditorService.js');
 const solo=samples().map(s=>({...s,faces:[s.faces[0]],persons:[s.persons[0]]}));
 const none=samples().map(s=>({...s,time:s.time+4,faces:[],persons:[]}));
 const pair=samples().map(s=>({...s,time:s.time+8}));
 const raw=[...solo,...none,...pair];
 const plan=S.computeShotComposition({...opts(),rawSamples:raw,sceneCuts:[4,8],duration:12});
 const graph=S.buildShotCompositionFilter({plan,start:3,duration:8,sourceWidth:910,sourceHeight:480});
 const quick=execFileSync(ffmpeg as string,['-v','error','-filter_complex_threads','1','-f','lavfi','-i','testsrc2=s=910x480:r=30:d=8','-filter_complex',graph,'-map','[out]','-f','framemd5','-'],{timeout:30000}).toString();
 assert.equal(quick.split('\n').filter(l=>/^0,/.test(l)).length,240);
 const track={smoothed_keyframes:[{time:0,centerX:.5}],source_width:910,source_height:480,raw_samples:raw,metadata:{clip_duration:12,scene_cuts:[4,8],shot_composition_candidate:true,shot_composition_window_scope:'shot',conversation_split_candidate:true,automatic_fit_aspect:'4:3'}};
 const reframe=syntheticMeasuredContext({mode:'smart',aspectRatio:'9:16',clipStartSec:0,layoutMode:'track',track});
 const pro=(ProEditorService as any).buildSliceCropFilter({id:'mixed-slice',source_start:3,source_end:11},reframe,3,8);
 assert.ok(pro.includes('vstack'));
 const frames=execFileSync(ffmpeg as string,['-v','error','-filter_complex_threads','1','-f','lavfi','-i','testsrc2=s=910x480:r=30:d=8','-filter_complex','[0:v]'+pro+'[check]','-map','[check]','-f','framemd5','-'],{timeout:30000}).toString();
 assert.equal(frames.split('\n').filter(l=>/^0,/.test(l)).length,240);
 const manual=(ProEditorService as any).buildSliceCropFilter({id:'manual-fill',source_start:3,source_end:11,crop:{mode:'fill'}},reframe,3,8);
 assert.ok(!manual.includes('vstack'));
});
