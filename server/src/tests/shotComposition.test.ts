import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {execFileSync} from 'node:child_process';import ffmpegStatic from 'ffmpeg-static';
import {SmartReframeService as S} from '../services/smartReframeService.js';
import {ProEditorService} from '../services/proEditorService.js';
const face=(id:string,x:number,w=.08)=>({track_id:id,x:x-w/2,y:.2,width:w,height:w*1.8,center_x:x,center_y:.2+w*.9,confidence:.95});
const samples=Array.from({length:24},(_,i)=>({time:i*.25,faces:i<8?[face('a',.25),face('b',.7)]:i<16?[]:[face('c',.65,.18)]}));
const opts={rawSamples:samples,sceneCuts:[2,4],duration:6,sourceWidth:640,sourceHeight:360};
test('composition evidence is partitioned at cuts, no global group leakage',()=>{
 const p=S.computeShotComposition(opts as any);assert.deepEqual(p.map(s=>s.kind),['group','fit','solo']);
 assert.deepEqual(p.map(s=>[s.start,s.end]),[[0,2],[2,4],[4,6]]);
 assert.equal(p[1].windowW,1);assert.equal(p[1].windowH,1);
 for(const s of p)for(const k of s.keyframes)assert.ok(k.time>=s.start&&k.time<s.end);
 assert.ok(p[2].windowW>=.18*3.5);assert.equal(p[2].keyframes[0].time,4);
});
test('stable larger speaker wins over longer-lived tiny artifact',()=>{
 const a=Array.from({length:8},(_,i)=>({time:i*.25,faces:[face('artifact',.05,.025),...(i<6?[face('person',.7,.2)]:[])]}));
 const p=S.computeShotComposition({...opts,rawSamples:a,sceneCuts:[],duration:2} as any);
 // A tiny artifact must not steer the solo context to the opposite edge.
 assert.ok(p[0].keyframes[0].centerX>.5);
});
test('single Pro candidate uses item window minus analysis source origin',()=>{
 const track={smoothed_keyframes:[{time:0,centerX:.5}],source_width:640,source_height:360,raw_samples:samples,metadata:{shot_composition_candidate:true,scene_cuts:[2,4],clip_duration:6}};
 const reframe={mode:'smart',aspectRatio:'9:16',clipStartSec:10,layoutMode:'track',track};
 const item={id:'nonzero-source',source_start:11.5,source_end:14.5};
 const f=(ProEditorService as any).buildSliceCropFilter(item,reframe,1.5,3);
 assert.ok(f.includes('trim=start=0.000000:duration=0.500000'));
 assert.ok(f.includes('trim=start=0.500000:duration=2.000000'));
 assert.ok(f.includes('trim=start=2.500000:duration=0.500000'));
});
test('empty evidence does not invent a composition',()=>assert.deepEqual(S.computeShotComposition({...opts,rawSamples:[]}),[]));
test('slice crosses cuts with locally rebased trims and unique labels',()=>{
 const f=S.buildShotCompositionFilter({plan:S.computeShotComposition(opts as any),start:1.5,duration:3,sourceWidth:640,sourceHeight:360,tag:'sliceA'});
 assert.ok(f.startsWith('split=3'));assert.ok(f.includes('trim=start=0.000000:duration=0.500000'));
 assert.ok(f.includes('trim=start=0.500000:duration=2.000000'));assert.ok(f.includes('trim=start=2.500000:duration=0.500000'));
 assert.ok(!f.includes('[0:v]'));assert.ok(!f.includes('[out]'));assert.ok(f.includes('concat=n=3:v=1:a=0'));assert.ok(f.includes('trim=end_frame=90'));assert.ok(f.endsWith('setpts=N/(30*TB)'));
});
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shot-composition-'));const source=path.join(dir,'source.mp4');const ffmpeg=ffmpegStatic as unknown as string;
test('Quick and Pro slice graphs execute and preserve requested frame counts',()=>{
 execFileSync(ffmpeg,['-y','-v','error','-threads','2','-f','lavfi','-i','testsrc2=s=640x360:r=10:d=6','-f','lavfi','-i','sine=frequency=440:duration=6','-c:v','libx264','-threads','2','-preset','ultrafast','-c:a','aac','-shortest',source]);
 const fractional=S.computeShotComposition({...opts,sceneCuts:[2.083333,4.875]} as any);
 const fractionalFilter=S.buildShotCompositionFilter({plan:fractional,duration:6,sourceWidth:640,sourceHeight:360});
 const fractionalFrames=execFileSync(ffmpeg,['-v','error','-filter_complex_threads','1','-i',source,'-filter_complex',fractionalFilter+';[out]fps=30[check]','-map','[check]','-f','framemd5','-'],{timeout:30000}).toString();
 assert.equal(fractionalFrames.split('\n').filter(l=>/^0,/.test(l)).length,180, 'fractional source cuts must preserve all180 output frames');
 const plan=S.computeShotComposition(opts as any);
 const filter=S.buildShotCompositionFilter({plan,duration:6,sourceWidth:640,sourceHeight:360});
 const quick=execFileSync(ffmpeg,['-v','error','-filter_complex_threads','1','-i',source,'-filter_complex',filter+';[out]fps=10[check]','-map','[check]','-f','framemd5','-'],{timeout:30000}).toString();
 assert.equal(quick.split('\n').filter(l=>/^0,/.test(l)).length,60);
 const project={canvas:{width:1080,height:1920,aspect_ratio:'9:16',fps:10,duration:3},tracks:[{type:'VIDEO',name:'main',items:[{id:'shot-slice',timeline_start:0,timeline_end:3,source_start:11.5,source_end:14.5}]}]} as any;
 project.tracks[0].items[0].source_start=1.5;project.tracks[0].items[0].source_end=4.5;
 const reframe={mode:'smart',aspectRatio:'9:16',clipStartSec:0,layoutMode:'track',track:{smoothed_keyframes:[{time:0,centerX:.5,centerY:.5}],source_width:640,source_height:360,raw_samples:samples,metadata:{shot_composition_candidate:true,scene_cuts:[2,4],clip_duration:6}}} as any;
 const graph=ProEditorService.compileRenderGraph(project,source,path.join(dir,'out.mp4'),dir,reframe,'off');
 fs.writeFileSync('/tmp/pro-shot-graph.json',JSON.stringify(graph));
 const pro=execFileSync(ffmpeg,['-v','error','-filter_complex_threads','1','-ss','1.5',...graph.inputArgs,'-filter_complex',graph.filterComplex.join(';'),'-map',graph.videoMap,'-map',graph.audioMap,'-t','3','-f','framemd5','-'],{timeout:30000}).toString();
 fs.writeFileSync('/tmp/pro-frames.txt',pro);assert.equal(pro.split('\n').filter(l=>/^0,/.test(l)).length,30);
});
