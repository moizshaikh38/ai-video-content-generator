import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {ProEditorService as P} from '../services/proEditorService.js';
const ff=(args:string[])=>execFileSync('ffmpeg',['-v','error','-nostdin','-threads','1','-filter_complex_threads','1','-filter_threads','1',...args],{timeout:6000,maxBuffer:2*1024*1024});
test('a deliberate ordinary cut gap occurs at its saved timeline position, not after the following slice',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gap-position-'));try{
 const source=path.join(dir,'source.mp4'),output=path.join(dir,'gap.mp4');ff(['-f','lavfi','-i','color=red:size=160x90:rate=30:duration=2','-f','lavfi','-i','sine=frequency=700:sample_rate=44100:duration=2','-c:v','libx264','-preset','ultrafast','-threads','1','-c:a','aac','-y',source]);
 const item=(id:string,source_start:number,timeline_start:number)=>({id,type:'VIDEO',source_start,source_end:source_start+.5,timeline_start,timeline_end:timeline_start+.5,speed:{speed:1},audio:{volume:1},keyframes:[],effects:[],transform:{position_x:0,position_y:0,scale:1,opacity:1,rotation:0}});
 const p:any={canvas:{width:1920,height:1080,aspect_ratio:'16:9',duration:1.5,fps:30},tracks:[{id:'main',type:'VIDEO',name:'Main',items:[item('first',0,0),item('second',1,1)]}]};
 const g=P.compileRenderGraph(p,source,output,dir,{canvasScale:1/12,sourceHasAudio:true}as any,'off');ff([...g.inputArgs,'-filter_complex',g.filterComplex.join(';'),'-map',g.videoMap,'-map',g.audioMap,'-t','1.5','-c:v','libx264','-preset','ultrafast','-threads','1','-c:a','aac','-y',output]);
 const rgb=(t:number)=>ff(['-ss',String(t),'-i',output,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','-']);
 const mean=(b:Buffer)=>[0,1,2].map(c=>{let sum=0;for(let i=c;i<b.length;i+=3)sum+=b[i];return sum/(b.length/3)});
 const before=mean(rgb(.25)),gap=mean(rgb(.75)),after=mean(rgb(1.25));assert(before[0]>200&&before[1]<20);assert(gap.every(c=>c<5),'saved gap at .75sec must be black, got '+gap);assert(after[0]>200&&after[1]<20,'following slice must appear at1.25s');
 const rms=(t:number)=>{const b=ff(['-ss',String(t),'-i',output,'-t','0.15','-vn','-ac','1','-ar','8000','-f','s16le','-']);let sum=0;for(let i=0;i<b.length;i+=2)sum+=b.readInt16LE(i)**2;return Math.sqrt(sum/(b.length/2))};assert(rms(.25)>1000);assert(rms(.7)<2,'audio must be silent inside saved gap');assert(rms(1.2)>1000,'following audio must retain timeline offset');
 if(process.env.GAP_POSITION_ARTIFACT_DIR){fs.mkdirSync(process.env.GAP_POSITION_ARTIFACT_DIR,{recursive:true});fs.copyFileSync(output,path.join(process.env.GAP_POSITION_ARTIFACT_DIR,'gap.mp4'));}
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
