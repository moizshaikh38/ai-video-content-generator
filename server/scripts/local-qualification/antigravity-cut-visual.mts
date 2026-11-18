import fs from 'node:fs';import {execFileSync}from'node:child_process';import{SmartReframeService as S}from'../../src/services/smartReframeService.js';import{buildSmartCropFilter}from'../../src/services/clipRenderService.js';
const out='/downloads/vireo-cut-port-visual-1317';fs.mkdirSync(out,{recursive:true});
const cut=3+8/24;
const xs=(t:number)=>t<3?.2:t<cut?.5:.8;
const samples=Array.from({length:41},(_,i)=>{const t=i*.25,x=xs(t);return{time:t,faces:[{track_id:'a',x:x-.04,y:.3,width:.08,height:.2,center_x:x,center_y:.4,confidence:.95}]}});
const after=S.smoothAndGenerateKeyframes({samples,dominantTrackId:'a',duration:10,sourceFps:24,sourceWidth:960,sourceHeight:540,sceneCuts:[3,cut]});
// Reproduce old current sanitizer by supplying its exact surviving cut list.
const before=S.smoothAndGenerateKeyframes({samples,dominantTrackId:'a',duration:10,sourceFps:24,sourceWidth:960,sourceHeight:540,sceneCuts:[3]});
fs.writeFileSync(out+'/camera.json',JSON.stringify({synthetic:true,cuts:[3,cut],samples,before,after},null,2));
const source=out+'/synthetic-source.mp4';
execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=0x283348:s=960x540:r=24:d=10','-vf',`drawbox=x=154:y=162:w=76:h=108:c=yellow:t=fill:enable='lt(t,3)',drawbox=x=442:y=162:w=76:h=108:c=lime:t=fill:enable='gte(t,3)*lt(t,${cut})',drawbox=x=730:y=162:w=76:h=108:c=cyan:t=fill:enable='gte(t,${cut})'`,'-c:v','libx264','-threads','1','-preset','ultrafast',source]);
for(const [name,keys]of [['before',before],['after',after]]as const){const f=buildSmartCropFilter(keys,'9:16',960,540,10,.5);fs.writeFileSync(out+'/'+name+'-filter.txt',f);execFileSync('ffmpeg',['-v','error','-threads','1','-i',source,'-vf',f,'-an','-c:v','libx264','-threads','1','-preset','ultrafast',out+'/'+name+'.mp4']);execFileSync('ffmpeg',['-v','error','-ss','3.5','-i',out+'/'+name+'.mp4','-frames:v','1','-threads','1',out+'/'+name+'-3.5.png']);}
