import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {ProEditorService as P} from '../services/proEditorService.js';
const ff=(args:string[])=>execFileSync('ffmpeg',['-v','error','-nostdin','-threads','1','-filter_threads','1','-filter_complex_threads','1',...args],{timeout:6000,maxBuffer:4*1024*1024});
for(const kind of ['card','freeze'])for(const leading of [true,false])for(const gap of [.5,1/30])test(`${kind} preserves ${leading?'leading':'inter-slice'} ${gap}s black gap before its content`,()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'generated-gap-'));
 try {
  const source=path.join(dir,'source.mp4'),output=path.join(dir,'out.mp4');
  ff(['-f','lavfi','-i','color=red:s=160x90:r=30:d=2','-f','lavfi','-i','sine=frequency=700:sample_rate=44100:duration=2','-c:v','libx264','-preset','ultrafast','-threads','1','-c:a','aac','-y',source]);
  const ordinary={id:'ordinary',type:'VIDEO',source_start:0,source_end:.5,timeline_start:0,timeline_end:.5};
  const start=(leading?0:.5)+gap,end=start+.5;
  const generated={id:'generated',type:'VIDEO',source_start:0,source_end:.5,timeline_start:start,timeline_end:end,...(kind==='card'?{is_title_card:true,background_color:'#00FF00'}:{is_freeze:true,freeze_source_time:0})};
  const project:any={canvas:{width:1920,height:1080,aspect_ratio:'16:9',duration:end,fps:30},tracks:[{id:'main',type:'VIDEO',name:'Main',items:[...(!leading?[ordinary]:[]),generated]}]};
  const g=P.compileRenderGraph(project,source,output,dir,{canvasScale:1/12,sourceHasAudio:true}as any,'off');
  ff([...g.inputArgs,'-filter_complex',g.filterComplex.join(';'),'-map',g.videoMap,'-map',g.audioMap,'-t',String(end),'-c:v','libx264','-preset','ultrafast','-threads','1','-c:a','aac','-y',output]);
  const rgb=ff(['-i',output,'-pix_fmt','rgb24','-f','rawvideo','-']);assert.equal(rgb.length,Math.round(end*30)*160*90*3);
  const frame=(t:number)=>rgb.subarray(Math.floor(t*30)*160*90*3,(Math.floor(t*30)+1)*160*90*3);
  assert(frame(start-gap/2).every(v=>v<5),'gap must be black before generated content');
  const content=frame(start+.25);let red=0,green=0;for(let i=0;i<content.length;i+=3){red+=content[i];green+=content[i+1]};assert(kind==='card'?green>red*5:red>green*5,'generated content must follow gap');
  if(gap>.1){const b=ff(['-ss',String(start-.35),'-i',output,'-t','0.2','-vn','-ac','1','-ar','8000','-f','s16le','-']);assert(b.length>0);assert(b.every(v=>v===0),'gap interior silent');}
  if(gap>.1&&process.env.GENERATED_GAP_ARTIFACT_DIR){fs.mkdirSync(process.env.GENERATED_GAP_ARTIFACT_DIR,{recursive:true});fs.copyFileSync(output,path.join(process.env.GENERATED_GAP_ARTIFACT_DIR,kind+'-'+(leading?'leading':'inter')+'.mp4'))}
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
