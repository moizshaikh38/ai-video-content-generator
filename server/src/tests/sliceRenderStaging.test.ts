import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';import ffmpegStatic from 'ffmpeg-static';
import {ProEditorService as P} from '../services/proEditorService.js';import {buildSliceRenderStaging} from '../services/sliceRenderStaging.js';
const ffmpeg=ffmpegStatic as unknown as string;
function fixture(){return {canvas:{width:360,height:640,aspect_ratio:'9:16',fps:30,duration:1},tracks:[{type:'VIDEO',name:'Main',items:[{id:'a',timeline_start:0,timeline_end:.5,source_start:.25,source_end:.75},{id:'b',timeline_start:.5,timeline_end:1,source_start:1,source_end:2,speed:{speed:2}}]}]} as any;}
const context:any={sourceHasAudio:true,aspectRatio:'9:16',mode:'fallback_center',clipStartSec:0,layoutMode:'track',track:null,cropConfig:null};
test('staging is opt-in and rejects unsupported graph shapes without mutation',()=>{
 const g=P.compileRenderGraph(fixture(),'/tmp/not-read.mp4',undefined,undefined,context,'off'),before=JSON.stringify(g);assert.ok(g.sliceStaging);assert.ok(buildSliceRenderStaging(g,['/tmp/a.nut','/tmp/b.nut']));assert.equal(JSON.stringify(g),before);
 for(const paths of [[],['/tmp/a.nut','/tmp/a.nut'],['/tmp/a.mp4','/tmp/b.nut']])assert.equal(buildSliceRenderStaging(g,paths),null);
 assert.equal(buildSliceRenderStaging({...g,inputArgs:['-i','a','-i','music']},['a.nut','b.nut']),null);
 const changed=structuredClone(g);changed.filterComplex.push('[0:a]anull[untracked]');assert.equal(buildSliceRenderStaging(changed,['a.nut','b.nut']),null);
 const silent=P.compileRenderGraph(fixture(),'/tmp/not-read.mp4',undefined,undefined,{...context,sourceHasAudio:false},'off');assert.equal(silent.sliceStaging,undefined);
 const transition=fixture();transition.tracks[0].items[1].transition_in={type:'fade',duration:.1};const t=P.compileRenderGraph(transition,'/tmp/not-read.mp4',undefined,undefined,context,'off');assert.equal(t.sliceStaging,undefined);
});
test('nonzero trims and speed changes retain exact decoded frame and PCM sample hashes through lossless stages',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'slice-stage-'));
 try{
  const source=path.join(dir,'source.mp4');execFileSync(ffmpeg,['-v','error','-f','lavfi','-i','testsrc2=s=320x180:r=30:d=3','-f','lavfi','-i','sine=frequency=440:duration=3','-c:v','libx264','-threads','1','-preset','ultrafast','-c:a','aac','-shortest',source],{timeout:20000});
  const graph=P.compileRenderGraph(fixture(),source,undefined,dir,context,'off');const plan=buildSliceRenderStaging(graph,[path.join(dir,'a.nut'),path.join(dir,'b.nut')]);assert.ok(plan);
  const run=(args:string[])=>execFileSync(ffmpeg,['-y','-v','error','-filter_complex_threads','1',...args],{timeout:20000,maxBuffer:1024*1024});
  const hash=(g:typeof graph,file:string)=>{run([...g.inputArgs,'-filter_complex',g.filterComplex.join(';'),'-map',g.videoMap,'-map',g.audioMap,'-t',String(g.duration),'-c:v','rawvideo','-threads:v','1','-c:a','pcm_s16le','-f','framehash',file]);return fs.readFileSync(file,'utf8').split('\n').filter(l=>l&&!l.startsWith('#')).sort()};
  const expected=hash(graph,path.join(dir,'direct.hash'));
  for(const stage of plan.stages)run([...stage.inputArgs,'-filter_complex',stage.filterComplex.join(';'),'-map',stage.videoMap,'-map',stage.audioMap,...stage.codecArgs,stage.outputPath]);
  assert.deepEqual(hash(plan.finalGraph,path.join(dir,'staged.hash')),expected);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
