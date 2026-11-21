import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {ProEditorService as P} from '../services/proEditorService.js';
import {ClipRenderService as C} from '../services/clipRenderService.js';
import {usesGeneratedSliceGraph} from '../shared/primaryVideoItems.js';

const exec=(args:string[])=>execFileSync('ffmpeg',['-nostdin','-v','error','-threads','1','-filter_threads','1','-filter_complex_threads','1',...args],{timeout:6000,maxBuffer:8*1024*1024});
function project(kind:'freeze'|'title'):any{return{id:'single-generated',version:1,canvas:{width:1920,height:1080,aspect_ratio:'16:9',duration:1.2,fps:30},tracks:[{id:'main',type:'VIDEO',name:'Main Video',items:[{id:kind,type:'VIDEO',timeline_start:0,timeline_end:1.2,source_start:1,source_end:1,source_path:'fixture.mp4',...(kind==='freeze'?{is_freeze:true,freeze_source_time:1,muted:true}:{is_title_card:true,title_card_text:'ONLY CARD',background_color:'#0033CC'}),transform:{position_x:0,position_y:0,scale:1,rotation:0,opacity:1},effects:[],keyframes:[],speed:{speed:1},audio:{volume:1}}]}]};}
test('worker and compiler share absolute-source policy for lone generated items',()=>{for(const kind of ['freeze','title']as const)assert.equal(usesGeneratedSliceGraph(project(kind).tracks[0].items),true);assert.equal(usesGeneratedSliceGraph([{}]),false);assert.equal(usesGeneratedSliceGraph([{},{}]),true);const worker=fs.readFileSync(new URL('../services/clipRenderService.ts',import.meta.url),'utf8');assert(worker.includes('const isMultiSlice = usesGeneratedSliceGraph(videoTrackItems,editorProject.canvas.duration);'))});
test('a lone generated item forces the Pro path even without other edit markers',()=>{for(const kind of ['freeze','title']as const){const p=project(kind);delete p.tracks[0].items[0].audio;assert.equal(C.hasCustomProEdits(p,{start_seconds:1}),true)}});
test('lone freeze/card compiler uses generated slices, not raw source audio or a live-video fast path',()=>{for(const kind of ['freeze','title']as const){const g=P.compileRenderGraph(project(kind),'fixture.mp4','/tmp/unused.mp4','/tmp',{mode:'fallback_center',aspectRatio:'16:9',canvasScale:1/6,sourceHasAudio:true}as any,'off');assert(g.inputArgs.includes('anullsrc=channel_layout=stereo:sample_rate=44100'));if(kind==='title')assert(g.inputArgs.some(s=>s.startsWith('color=c=0x0033CC')));else assert(g.filterComplex.join(';').includes('trim=start=1.000'));assert(g.filterComplex.join(';').includes('concat=n=1:v=1:a=1'))}});
test('actual lone freeze holds one exact selected frame throughout and title is solid card, both silent',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'single-generated-'));try{
  const source=path.join(dir,'source.mp4');exec(['-f','lavfi','-i','testsrc2=size=320x180:rate=30:duration=3','-f','lavfi','-i','sine=frequency=700:sample_rate=44100:duration=3','-c:v','libx264','-preset','ultrafast','-threads','1','-c:a','aac','-y',source]);
  for(const kind of ['freeze','title']as const){const p=project(kind),output=path.join(dir,kind+'.mp4'),g=P.compileRenderGraph(p,source,output,dir,{mode:'fallback_center',aspectRatio:'16:9',canvasScale:1/6,sourceHasAudio:true}as any,'off');exec([...g.inputArgs,'-filter_complex',g.filterComplex.join(';'),'-map',g.videoMap,'-map',g.audioMap,'-t','1.2','-c:v','libx264','-preset','ultrafast','-crf','18','-threads','1','-c:a','aac','-y',output]);
   const pixels=exec(['-i',output,'-map','0:v','-pix_fmt','rgb24','-f','rawvideo','-']);assert.equal(pixels.length,320*180*3*36);const frame=pixels.subarray(0,320*180*3);let maxMeanDiff=0;for(let i=1;i<36;i++){let diff=0;for(let n=0;n<frame.length;n++)diff+=Math.abs(pixels[i*frame.length+n]-frame[n]);maxMeanDiff=Math.max(maxMeanDiff,diff/frame.length)}assert(maxMeanDiff<1.5,kind+' must not move; measured mean pixel difference '+maxMeanDiff);
   if(kind==='freeze'){const selected=exec(['-ss','1','-i',source,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','-']);let diff=0;for(let n=0;n<frame.length;n++)diff+=Math.abs(frame[n]-selected[n]);assert(diff/frame.length<6,'freeze must hold selected source time, mean difference '+diff/frame.length);}
   if(kind==='title'){let blue=0;for(let n=0;n<frame.length;n+=3)if(frame[n]<30&&frame[n+1]>20&&frame[n+1]<90&&frame[n+2]>130)blue++;assert(blue/(320*180)>.85,'solid requested blue card, not source video');}
   const audio=exec(['-i',output,'-vn','-ac','1','-ar','8000','-f','s16le','-']);let peak=0;for(let i=0;i<audio.length;i+=2)peak=Math.max(peak,Math.abs(audio.readInt16LE(i)));assert(peak<=2,kind+' must be silent, peak '+peak);
   if(process.env.SINGLE_GENERATED_ARTIFACT_DIR){fs.mkdirSync(process.env.SINGLE_GENERATED_ARTIFACT_DIR,{recursive:true});fs.copyFileSync(output,path.join(process.env.SINGLE_GENERATED_ARTIFACT_DIR,kind+'.mp4'));}
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('muted normalization is excluded and unmuted generated silence skips safely, including no-audio sources',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'single-generated-normalized-'));try{
  const source=path.join(dir,'source.mp4');exec(['-f','lavfi','-i','testsrc2=size=320x180:rate=30:duration=2','-an','-c:v','libx264','-preset','ultrafast','-threads','1','-y',source]);
  for(const kind of ['freeze','title']as const){const p=project(kind);p.tracks[0].items[0].audio.normalized=true;const graph=await P.compileRenderGraphWithNormalization(p,source,path.join(dir,'unused.mp4'),dir,{mode:'fallback_center',aspectRatio:'16:9',canvasScale:1/6,sourceHasAudio:false}as any);assert.equal(graph.normalizationMode,p.tracks[0].items[0].muted?undefined:'skipped-silent');assert.equal(graph.measurement,null);}
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
