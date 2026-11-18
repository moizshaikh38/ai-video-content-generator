import {syntheticMeasuredContext} from './fixtures/syntheticMeasuredContext.js';
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
 assert.equal(p[1].windowW,.75);assert.equal(p[1].windowH,1);
 assert.equal(p[1].contextStatus,'unresolved-review-required');assert.match(p[1].uncertainty!,/crops source context/);
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
 const reframe=syntheticMeasuredContext({mode:'smart',aspectRatio:'9:16',clipStartSec:10,layoutMode:'track',track});
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
 const graph=ProEditorService.compileRenderGraph(project,source,path.join(dir,'out.mp4'),dir,syntheticMeasuredContext(reframe,source),'off');
 fs.writeFileSync('/tmp/pro-shot-graph.json',JSON.stringify(graph));
 const pro=execFileSync(ffmpeg,['-v','error','-filter_complex_threads','1','-ss','1.5',...graph.inputArgs,'-filter_complex',graph.filterComplex.join(';'),'-map',graph.videoMap,'-map',graph.audioMap,'-t','3','-f','framemd5','-'],{timeout:30000}).toString();
 fs.writeFileSync('/tmp/pro-frames.txt',pro);assert.equal(pro.split('\n').filter(l=>/^0,/.test(l)).length,30);
});

test('clip scope keeps one user-selected4:3 Fit size and explicit crop warning, including unknown fallback',()=>{
 const p=S.computeShotComposition(opts as any);
 assert.ok(p.every(s=>s.windowW===p[0].windowW && s.windowH===p[0].windowH));
 assert.ok(p.every(s=>s.windowW===.75 && s.windowH===1));
 assert.ok(p.every(s=>s.contextStatus==='unresolved-review-required'));
 assert.ok(p.every(s=>/crops source context/.test(s.uncertainty!)));
 for(const s of p) for(const k of s.keyframes){assert.equal(k.centerX,.5);assert.equal(k.centerY,.5);}
 const withoutFallback=S.computeShotComposition({...opts,rawSamples:samples.filter(s=>s.time<2||s.time>=4),sceneCuts:[2],duration:6} as any);
 assert.equal(new Set(withoutFallback.map(s=>s.windowW)).size,1);
 assert.equal(new Set(withoutFallback.map(s=>s.windowH)).size,1);
});

test('candidate Pro blur preserves 24-to-30fps last frame without shot concat',()=>{
 const source24=path.join(dir,'source24.mp4');
 execFileSync(ffmpeg,['-y','-v','error','-threads','2','-f','lavfi','-i','testsrc2=s=640x360:r=24:d=8','-f','lavfi','-i','sine=frequency=440:duration=8','-c:v','libx264','-threads','2','-preset','ultrafast','-c:a','aac','-shortest',source24]);
 const project={canvas:{width:1080,height:1920,aspect_ratio:'9:16',fps:30,duration:8},tracks:[{type:'VIDEO',name:'main',items:[{id:'no-cuts-blur',timeline_start:0,timeline_end:8,source_start:0,source_end:8}]}]} as any;
 const reframe={mode:'smart',aspectRatio:'9:16',clipStartSec:0,layoutMode:'blur',track:{smoothed_keyframes:[{time:0,centerX:.5,centerY:.5}],source_width:640,source_height:360,metadata:{shot_composition_candidate:true,clip_duration:8}}} as any;
 const graph=ProEditorService.compileRenderGraph(project,source24,path.join(dir,'blur24.mp4'),dir,reframe,'off');
 const frames=execFileSync(ffmpeg,['-v','error','-filter_complex_threads','1',...graph.inputArgs,'-filter_complex',graph.filterComplex.join(';'),'-map',graph.videoMap,'-map',graph.audioMap,'-t','8','-f','framemd5','-'],{timeout:30000}).toString();
 assert.equal(frames.split('\n').filter(l=>/^0,/.test(l)).length,240);
});

test('brief fractional-rate final shot keeps its last distinct frame, not a cloned penultimate frame',()=>{
 const raw=path.join(dir,'brief-tail.rgb'),input=path.join(dir,'brief-tail.mp4');const frameBytes=64*36*3;
 fs.writeFileSync(raw,Buffer.concat(Array.from({length:12},(_,i)=>Buffer.alloc(frameBytes,i===10?220:i===11?30:100))));
 execFileSync(ffmpeg,['-v','error','-y','-f','rawvideo','-pixel_format','rgb24','-video_size','64x36','-framerate','30000/1001','-i',raw,'-c:v','libx264','-threads','1','-crf','0','-pix_fmt','yuv444p',input]);
 const duration=12*1001/30000,cut=.333666;
 const plan=[{start:0,end:cut,kind:'fit',windowW:.75,windowH:1,keyframes:[{time:0,centerX:.5,centerY:.5}]},{start:cut,end:duration,kind:'fit',windowW:.75,windowH:1,keyframes:[{time:cut,centerX:.5,centerY:.5}]}] as any;
 const graph=S.buildShotCompositionFilter({plan,duration,sourceWidth:64,sourceHeight:36,canvasScale:.1});
 const pixels=execFileSync(ffmpeg,['-v','error','-filter_complex_threads','1','-i',input,'-filter_complex',graph+';[out]fps=30,scale=8:8,format=rgb24[check]','-map','[check]','-f','rawvideo','-threads','1','-'],{timeout:30000});
 assert.equal(pixels.length,12*8*8*3);const mean=(n:number)=>{const b=pixels.subarray(n*192,(n+1)*192);return b.reduce((a,v)=>a+v,0)/b.length;};
 assert.ok(mean(10)>150,'penultimate source frame remains bright');assert.ok(mean(11)<100,'last source frame remains dark instead of cloning the bright frame');
});

test('brief first/interior/last scenes keep their rounded output spans across24/25/29.97/30/60fps sources',()=>{
 for(const[num,den]of[[24,1],[25,1],[30000,1001],[30,1],[60,1]]){
  const frameCount=24,dt=den/num,duration=frameCount*dt,bounds=[0,2*dt,12*dt,22*dt,duration],levels=[35,100,170,230];
  const raw=path.join(dir,`cadence-${num}.rgb`),input=path.join(dir,`cadence-${num}.mp4`);
  fs.writeFileSync(raw,Buffer.concat(Array.from({length:frameCount},(_,i)=>Buffer.alloc(64*36*3,levels[i<2?0:i<12?1:i<22?2:3]))));
  execFileSync(ffmpeg,['-v','error','-y','-f','rawvideo','-pixel_format','rgb24','-video_size','64x36','-framerate',`${num}/${den}`,'-i',raw,'-c:v','libx264','-threads','1','-crf','0','-pix_fmt','yuv444p',input]);
  const plan=bounds.slice(0,-1).map((start,i)=>({start,end:bounds[i+1],kind:'fit',windowW:.75,windowH:1,keyframes:[{time:start,centerX:.5,centerY:.5}]})) as any;
  const filter=S.buildShotCompositionFilter({plan,duration,sourceWidth:64,sourceHeight:36,canvasScale:.1});
  const pixels=execFileSync(ffmpeg,['-v','error','-filter_complex_threads','1','-i',input,'-filter_complex',filter+';[out]fps=30,scale=8:8,format=rgb24[check]','-map','[check]','-f','rawvideo','-threads','1','-'],{timeout:30000});
  assert.equal(pixels.length,Math.round(duration*30)*192,`${num}/${den} total frame count`);
  const renderedLevels=[12,71,139,198];
  for(let shot=0;shot<4;shot++)for(let n=Math.round(bounds[shot]*30);n<Math.round(bounds[shot+1]*30);n++){
   const b=pixels.subarray(n*192,(n+1)*192),mean=b.reduce((s,v)=>s+v,0)/b.length;
   assert.ok(Math.abs(mean-renderedLevels[shot])<6,`${num}/${den} shot${shot} frame${n} must not leak an adjacent scene`);
  }
 }
});
