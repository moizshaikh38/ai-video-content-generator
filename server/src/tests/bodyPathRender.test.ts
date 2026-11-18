import {syntheticMeasuredContext} from './fixtures/syntheticMeasuredContext.js';
import {test} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';import ffmpegStatic from 'ffmpeg-static';
import {SmartReframeService as S} from '../services/smartReframeService.js';import {ProEditorService as P} from '../services/proEditorService.js';
const evidence=JSON.parse(fs.readFileSync(new URL('./fixtures/walking-sands-detections.json',import.meta.url),'utf8'));
const ffmpeg=ffmpegStatic as unknown as string;
test('moving body plan Quick/Pro fractional slice uses same source interval and frame budget',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'body-path-render-'));
 try{
  const source=path.join(dir,'source.mp4');
  // Generated pixels test execution/timing only. Independent real walking
  // output and editor screenshots are separately documented visual evidence.
  execFileSync(ffmpeg,['-y','-v','error','-threads','2','-f','lavfi','-i','testsrc2=s=854x480:r=30:d=12','-f','lavfi','-i','sine=frequency=440:duration=12','-c:v','libx264','-threads','2','-preset','ultrafast','-c:a','aac','-shortest',source]);
  const start=2.7,duration=5.2,plan=S.computeShotComposition({rawSamples:evidence.samples,duration:12,sourceWidth:854,sourceHeight:480});
  assert.ok(plan[0].keyframes.length>1);
  const quick=S.buildShotCompositionFilter({plan,start,duration,sourceWidth:854,sourceHeight:480});
  const track={raw_samples:evidence.samples,smoothed_keyframes:[{time:0,centerX:.5,centerY:.5}],source_width:854,source_height:480,metadata:{shot_composition_candidate:true,clip_duration:12}};
  const project={canvas:{width:1080,height:1920,aspect_ratio:'9:16',fps:30,duration},tracks:[{type:'VIDEO',name:'Main Video',items:[{id:'moving-slice',timeline_start:0,timeline_end:duration,source_start:start,source_end:start+duration}]}]};
  const graph=P.compileRenderGraph(project as any,source,path.join(dir,'out.mp4'),dir,syntheticMeasuredContext({mode:'smart',aspectRatio:'9:16',clipStartSec:0,layoutMode:'track',track},source),'off');
  const common=['-v','error','-threads','2','-filter_complex_threads','1','-ss',String(start)];
  const rows=(args:string[])=>execFileSync(ffmpeg,args,{timeout:60000}).toString().split('\n').filter(l=>/^0,/.test(l));
  const a=rows([...common,'-i',source,'-filter_complex',quick,'-map','[out]','-t',String(duration),'-f','framemd5','-']);
  // Single-item Pro caller seeks the input; do not compare an unseeked
  // source to correctly rebased composition keyframes.
  const b=rows([...common,...graph.inputArgs,'-filter_complex',graph.filterComplex.join(';'),'-map',graph.videoMap,'-map',graph.audioMap,'-t',String(duration),'-f','framemd5','-']);
  assert.equal(a.length,156);assert.equal(b.length,156);assert.deepEqual(a,b);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
