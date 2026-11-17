import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';import {ProEditorService as P} from '../services/proEditorService.js';import {ClipRenderService as C} from '../services/clipRenderService.js';
const ffmpeg='/usr/bin/ffmpeg';
for(const multi of [false,true])test(`silent decoded source renders ${multi?'multiple speed-adjusted slices':'one slice'} without inventing source audio`,async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vireo-silent-regression-'));
 try{
 const source=path.join(dir,'source.mp4'),output=path.join(dir,'output.mp4');
 execFileSync(ffmpeg,['-v','error','-f','lavfi','-i','testsrc2=s=320x180:r=30:d=3','-an','-c:v','libx264','-threads','1','-preset','ultrafast',source]);
 const probe=await C.probeSourceDimensions(source);assert.equal(probe?.hasAudio,false);assert.equal(probe.width,320);
 const items=multi?[{id:'a',timeline_start:0,timeline_end:1,source_start:0,source_end:1},{id:'b',timeline_start:1,timeline_end:2,source_start:1,source_end:3,speed:{speed:2}}]:[{id:'a',timeline_start:0,timeline_end:2,source_start:0,source_end:2}];
 const project:any={canvas:{width:360,height:640,aspect_ratio:'9:16',fps:30,duration:2},tracks:[{type:'VIDEO',name:'Main Video',items}]};
 const graph=P.compileRenderGraph(project,source,output,dir,{sourceHasAudio:probe.hasAudio,aspectRatio:'9:16',mode:'fallback_center',clipStartSec:0,layoutMode:'track',track:null,cropConfig:null},'off');
 assert.ok(graph.inputArgs.some(x=>x.startsWith('anullsrc=')));assert.ok(!graph.filterComplex.join(';').includes('[0:a]'));
 execFileSync(ffmpeg,['-v','error','-filter_complex_threads','1',...graph.inputArgs,'-filter_complex',graph.filterComplex.join(';'),'-map',graph.videoMap,'-map',graph.audioMap,'-t','2','-c:v','libx264','-threads','1','-preset','ultrafast','-c:a','aac',output],{timeout:20000});
 const out=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',output],{encoding:'utf8'}));assert.equal(out.streams.filter((x:any)=>x.codec_type==='video').length,1);assert.equal(out.streams.filter((x:any)=>x.codec_type==='audio').length,1);assert.ok(Math.abs(Number(out.format.duration)-2)<.1);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('known audio and unprobed inputs keep existing source audio route',()=>{for(const sourceHasAudio of [undefined,true]){const p:any={canvas:{width:360,height:640,aspect_ratio:'9:16',fps:30,duration:2},tracks:[{type:'VIDEO',name:'Main Video',items:[{id:'a',timeline_start:0,timeline_end:2,source_start:0,source_end:2}]}]};const g=P.compileRenderGraph(p,'/not-read-at-compile.mp4',undefined,undefined,{sourceHasAudio,aspectRatio:'9:16',mode:'fallback_center',clipStartSec:0,layoutMode:'track',track:null,cropConfig:null},'off');assert.ok(!g.inputArgs.some(x=>x.startsWith('anullsrc=')));assert.ok(g.filterComplex.join(';').includes('[0:a]')||g.audioMap==='[0:a]')}});
