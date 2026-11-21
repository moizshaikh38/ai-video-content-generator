import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {ProEditorService as P} from '../services/proEditorService.js';import {usesGeneratedSliceGraph} from '../shared/primaryVideoItems.js';
const ff=(args:string[])=>execFileSync('ffmpeg',['-v','error','-nostdin','-threads','1','-filter_complex_threads','1','-filter_threads','1',...args],{timeout:6000,maxBuffer:2*1024*1024});
for(const multi of [false,true])test(`an initial ordinary timeline gap is preserved for${multi?'multiple slices':'one slice'}`,()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gap-position-'));try{
 const source=path.join(dir,'source.mp4'),output=path.join(dir,'gap.mp4');ff(['-f','lavfi','-i','color=red:size=160x90:rate=30:duration=2','-f','lavfi','-i','sine=frequency=700:sample_rate=44100:duration=2','-c:v','libx264','-preset','ultrafast','-threads','1','-c:a','aac','-y',source]);
 const item=(id:string,source_start:number,timeline_start:number)=>({id,type:'VIDEO',source_start,source_end:source_start+.5,timeline_start,timeline_end:timeline_start+.5,speed:{speed:1},audio:{volume:1},keyframes:[],effects:[],transform:{position_x:0,position_y:0,scale:1,opacity:1,rotation:0}});
 const p:any={canvas:{width:1920,height:1080,aspect_ratio:'16:9',duration:multi?1.5:1,fps:30},tracks:[{id:'main',type:'VIDEO',name:'Main',items:[item('first',0,.5),...(multi?[item('second',1,1)]:[])]}]};
 assert(usesGeneratedSliceGraph(p.tracks[0].items),'worker must not input-seek a leading-gap project');const g=P.compileRenderGraph(p,source,output,dir,{canvasScale:1/12,sourceHasAudio:true}as any,'off');ff([...g.inputArgs,'-filter_complex',g.filterComplex.join(';'),'-map',g.videoMap,'-map',g.audioMap,'-t',multi?'1.5':'1','-c:v','libx264','-preset','ultrafast','-threads','1','-c:a','aac','-y',output]);
 const rgb=(t:number)=>ff(['-ss',String(t),'-i',output,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','-']);
 const mean=(b:Buffer)=>[0,1,2].map(c=>{let sum=0;for(let i=c;i<b.length;i+=3)sum+=b[i];return sum/(b.length/3)});
 const gapAudio=ff(['-ss','0.1','-i',output,'-t','0.25','-vn','-ac','1','-ar','8000','-f','s16le','-']);assert(gapAudio.every(b=>b===0),'leading gap interior must be digitally silent');
 const first=mean(rgb(.25)),later=mean(rgb(.75));assert(first.every(c=>c<5),'initial .25s must be black, got '+first);assert(later[0]>200&&later[1]<20);
 if(process.env.LEADING_GAP_ARTIFACT_DIR){fs.mkdirSync(process.env.LEADING_GAP_ARTIFACT_DIR,{recursive:true});fs.copyFileSync(output,path.join(process.env.LEADING_GAP_ARTIFACT_DIR,multi?'multi-gap.mp4':'single-gap.mp4'));}
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
