import {test} from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import os from'node:os';import path from'node:path';import{execFileSync}from'node:child_process';import ffmpeg from'ffmpeg-static';import{ProEditorService as P}from'../services/proEditorService.js';import{LoudnormTwoPassService as L}from'../services/loudnormTwoPassService.js';
test('dynamic normalization rebuild keeps the same finite program bound as measurement',async()=>{
 const project:any={canvas:{width:1080,height:1920,aspect_ratio:'9:16',fps:30,duration:.25},tracks:[{id:'v',type:'VIDEO',name:'main',items:[{id:'i',source_start:0,source_end:.5,timeline_start:0,timeline_end:.25,speed:{speed:2},audio:{normalized:true}}]}]};
 const graph=P.compileRenderGraph(project,'unused.mp4','/tmp/unused.mp4','/tmp',{sourceHasAudio:false}as any,'measure');assert.ok(graph.measurement);assert.ok(graph.inputArgs.some(s=>s.includes('anullsrc=')&&s.includes('duration=0.500000')),'unused generated-silence sinks must also terminate');
 assert.ok(graph.measurement.preMarkerFilters.includes('atrim=end=0.25'),'dynamic reconstruction must carry the metered program bound');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'vireo-normalization-bound-'));
 try{const out=path.join(tmp,'out.wav');await L.renderNormalizedDialogue(['-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=44100'],{...graph.measurement,filterComplex:graph.measurement.filterComplex.map(s=>s.replaceAll('[1:a]','[0:a]'))},out,5000);const b=fs.readFileSync(out);assert.ok(b.length>1000&&b.length<300000,'generated silence must be finite');
 const final=P.compileRenderGraph(project,'unused.mp4',out,tmp,{sourceHasAudio:false}as any,{preNormalizedDialoguePath:out});
 const audio=final.filterComplex.filter(s=>!s.includes('[0:v]'));
 execFileSync(ffmpeg!,['-v','error',...final.inputArgs.slice(2),'-filter_complex',audio.map(s=>s.replaceAll('[1:a]','[0:a]').replaceAll('[2:a]','[1:a]')).join(';'),'-map',final.audioMap,'-t','0.25','-f','null','-'],{timeout:5000});}finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
