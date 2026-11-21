import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import{execFileSync}from'node:child_process';
import{ProEditorService as P}from'../services/proEditorService.js';import{ClipRenderService as C}from'../services/clipRenderService.js';
const ff=(args:string[])=>execFileSync('ffmpeg',['-v','error','-nostdin','-threads','1','-filter_threads','1','-filter_complex_threads','1',...args],{timeout:6000,maxBuffer:4*1024*1024});
for(const kind of ['ordinary','multi','card','freeze'])for(const fps of [24,30,60])for(const gap of [.5,1/fps])test(`${kind} preserves terminal${gap}s at${fps}fps`,()=>{
 const baseEnd=kind==='multi'?1:.5,duration=baseEnd+gap;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'terminal-gap-'));
 try{
 const source=path.join(dir,'source.mp4'),output=path.join(dir,'out.mp4');ff(['-f','lavfi','-i',`color=red:s=160x90:r=${fps}:d=2`,'-f','lavfi','-i','sine=frequency=700:sample_rate=44100:duration=2','-c:v','libx264','-preset','ultrafast','-threads','1','-c:a','aac','-y',source]);
 const item={id:'base',type:'VIDEO',source_start:0,source_end:.5,timeline_start:0,timeline_end:.5,...(kind==='card'?{is_title_card:true,background_color:'#00FF00'}:kind==='freeze'?{is_freeze:true,freeze_source_time:0}:{})};
 const p:any={canvas:{width:1920,height:1080,aspect_ratio:'16:9',duration,fps},tracks:[{id:'main',type:'VIDEO',name:'Main',items:[item,...(kind==='multi'?[{...item,id:'second',source_start:.5,source_end:1,timeline_start:.5,timeline_end:1}]:[])]}]};
 assert(C.hasCustomProEdits(p,{start_seconds:0}),'terminal gap must not use raw-source shortcut');
 const g=P.compileRenderGraph(p,source,output,dir,{canvasScale:1/12,sourceHasAudio:true}as any,'off');ff([...g.inputArgs,'-filter_complex',g.filterComplex.join(';'),'-map',g.videoMap,'-map',g.audioMap,'-t',String(duration),'-c:v','libx264','-preset','ultrafast','-threads','1','-c:a','aac','-y',output]);
 const rgb=ff(['-i',output,'-pix_fmt','rgb24','-f','rawvideo','-']);assert.equal(rgb.length,Math.round(duration*fps)*160*90*3,'canvas must reach1s');const tail=rgb.subarray(Math.round(baseEnd*fps)*160*90*3);assert(tail.every(v=>v<5),'terminal15frames must be black, not source/hold');
 if(gap>.1){const audio=ff(['-ss',String(baseEnd+.1),'-i',output,'-t','0.3','-vn','-ac','1','-ar','8000','-f','s16le','-']);assert(audio.length>0);assert(audio.every(v=>v===0),'tail interior silence');}
 if(fps===30&&gap>.1&&process.env.TERMINAL_GAP_ARTIFACT_DIR){fs.mkdirSync(process.env.TERMINAL_GAP_ARTIFACT_DIR,{recursive:true});fs.copyFileSync(output,path.join(process.env.TERMINAL_GAP_ARTIFACT_DIR,kind+'.mp4'))}
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
