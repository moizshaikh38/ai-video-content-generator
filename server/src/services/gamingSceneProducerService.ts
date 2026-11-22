import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {supervisedExecFile} from './queue/supervisedExecFile.js';
import {reviewGamingRegions} from '../shared/freeGamingRoleClient.js';
import {bindMeasuredGamingRegions} from '../shared/bindMeasuredGamingRegions.js';
import type {GamingSceneEvidence} from '../shared/normalGamingScenePlan.js';

async function hashSource(file:string,signal?:AbortSignal):Promise<string>{
 const stream=fs.createReadStream(file),hash=createHash('sha256'),abort=()=>stream.destroy(Object.assign(Error('Work cancelled.'),{code:'WORK_CANCELLED'}));
 signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 try{for await(const chunk of stream)hash.update(chunk);return hash.digest('hex');}finally{signal?.removeEventListener('abort',abort);}
}

export interface GamingProductionInput {
 enabled:boolean;apiKey:string;model:string;sourcePath:string;sourceVerified:boolean;
 sourceSha256:string;sourceStart:number;sourceEnd:number;sourceWidth:number;sourceHeight:number;
 crop:any;aspect:string;sceneCuts:number[];shotCompositionOwned:boolean;rawSamples:unknown[];
 python:string;workerPath:string;outputDir:string;signal?:AbortSignal;
}
export function gamingSceneProductionEligible(i:GamingProductionInput):boolean {
 return i.enabled===true&&i.sourceVerified===true&&!!i.apiKey&&i.model.endsWith(':free')&&i.crop?.mode==='smart'&&i.crop?.layout_mode_source==='auto'&&i.aspect==='9:16'&&!i.shotCompositionOwned&&Array.isArray(i.sceneCuts)&&i.sceneCuts.length===0&&(!i.crop.layoutPolicy||i.crop.layoutPolicy.allowed?.includes('split'))&&/^[a-f0-9]{64}$/.test(i.sourceSha256)&&[i.sourceStart,i.sourceEnd,i.sourceWidth,i.sourceHeight].every(Number.isFinite)&&i.sourceStart>=0&&i.sourceEnd-i.sourceStart>=3&&i.sourceEnd-i.sourceStart<=30&&Number.isInteger(i.sourceWidth)&&Number.isInteger(i.sourceHeight)&&i.sourceWidth>0&&i.sourceHeight>0&&i.sourceWidth*i.sourceHeight<=1920*1080&&Array.isArray(i.rawSamples)&&i.rawSamples.length>=6;
}
/** Disabled unless explicitly enabled by the caller. Does not persist, upload,
 * certify storage, change crop ownership or alter existing fallback behavior. */
export async function produceGamingSceneEvidence(i:GamingProductionInput,deps:{run?:typeof supervisedExecFile;request?:typeof fetch;hash?:(file:string,signal?:AbortSignal)=>Promise<string>}={}):Promise<{evidence?:GamingSceneEvidence;status:string;cameraRegionId?:string}>{
 if(!gamingSceneProductionEligible(i))return {status:'not-eligible'};
 if(i.signal?.aborted)throw Object.assign(Error('Work cancelled.'),{code:'WORK_CANCELLED'});
 const run=deps.run??supervisedExecFile;
 try{
  if(!fs.existsSync(i.workerPath))return {status:'worker-unavailable'};
  fs.mkdirSync(i.outputDir,{recursive:false});
  const inputPath=path.join(i.outputDir,'source-input.json'),geometryDir=path.join(i.outputDir,'geometry');
  fs.writeFileSync(inputPath,JSON.stringify({source_width:i.sourceWidth,source_height:i.sourceHeight,raw_samples:i.rawSamples,metadata:{analyzed_source_sha256:i.sourceSha256,analyzed_source_start:i.sourceStart,analyzed_source_end:i.sourceEnd}}));
  await run(i.python,[i.workerPath,i.sourcePath,inputPath,geometryDir],{timeoutMs:150000,maxBuffer:256*1024,signal:i.signal});
  const m=JSON.parse(fs.readFileSync(path.join(geometryDir,'geometry-candidates.json'),'utf8'));
  if(m?.status!=='geometry-candidates-awaiting-independent-roles'||m.sourceSha256!==i.sourceSha256||m.sourceStart!==i.sourceStart||m.sourceEnd!==i.sourceEnd||m.sourceWidth!==i.sourceWidth||m.sourceHeight!==i.sourceHeight||m.clockCoverageVerified!==true||m.presentationFrames!==m.decodedFrames||!Array.isArray(m.presentationTimes)||m.presentationTimes.length!==m.decodedFrames||!Array.isArray(m.regions)||![1,2].includes(m.regions.length))return {status:'geometry-unresolved'};
  const ids=m.regions.map((q:any)=>q.id);
  if(new Set(ids).size!==ids.length||ids.some((id:any)=>!['A','B'].includes(id))||m.regions.some((q:any)=>!Array.isArray(q.rect)||q.rect.length!==4||!q.rect.every(Number.isInteger)||q.rect[0]<0||q.rect[1]<0||q.rect[2]<=q.rect[0]||q.rect[3]<=q.rect[1]||q.rect[2]>i.sourceWidth||q.rect[3]>i.sourceHeight||q.supportedFrames!==m.decodedFrames))return {status:'geometry-unresolved'};
  const duration=i.sourceEnd-i.sourceStart,times=Array.from({length:5},(_,n)=>Number((n/4*(duration-.12)).toFixed(3))),indices=times.map(t=>m.presentationTimes.findIndex((v:number)=>v>=t-1e-6));
  if(indices.some(n=>n<0)||new Set(indices).size!==5)return {status:'sampling-unresolved'};
  const roles=await reviewGamingRegions({...i,times,regionDefinitions:m.regions.map((q:any)=>({id:q.id,rect:q.rect})),images:async()=>{
   const framesDir=path.join(i.outputDir,'role-frames');fs.mkdirSync(framesDir);
   const select=`select='${indices.map(n=>`eq(n,${n})`).join('+')}'`,boxes=m.regions.map((q:any,n:number)=>{const [x,y,xx,yy]=q.rect;return `drawbox=x=${x}:y=${y}:w=${xx-x}:h=${yy-y}:color=${n===0?'red':'cyan'}:t=${n===0?8:2}`;});
   const labels=m.regions.flatMap((q:any,n:number)=>{
    const [x,,xx,yy]=q.rect,color=n===0?'red':'cyan',right=xx+55<i.sourceWidth,labelX=right?xx+14:Math.max(0,x-44),tickX=right?xx:Math.max(0,x-12),labelY=Math.min(i.sourceHeight-28,Math.max(4,yy-24));
    return [`drawbox=x=${tickX}:y=${yy-2}:w=12:h=3:color=${color}:t=fill`,`drawtext=text='${q.id}':x=${labelX}:y=${labelY}:fontsize=20:fontcolor=white:box=1:boxcolor=${color}@0.95:boxborderw=3`];
   });
   const filter=[select,...boxes,...labels,"scale='min(iw,1280)':-2"].join(',');
   await run('ffmpeg',['-nostdin','-v','error','-threads','1','-ss',String(i.sourceStart),'-i',i.sourcePath,'-t',String(duration),'-vf',filter,'-vsync','0','-frames:v','5','-threads','1','-q:v','3',path.join(framesDir,'frame-%d.jpg')],{timeoutMs:30000,maxBuffer:128*1024,signal:i.signal});
   if(await (deps.hash??hashSource)(i.sourcePath,i.signal)!==i.sourceSha256)throw Error('ROLE_SOURCE_CHANGED');
   return Array.from({length:5},(_,n)=>{const b=fs.readFileSync(path.join(framesDir,`frame-${n+1}.jpg`));if(b.length>1024*1024||b[0]!==255||b[1]!==216)throw Error('ROLE_IMAGE_INVALID');return 'data:image/jpeg;base64,'+b.toString('base64');});
  }},deps.request);
  if(!roles)return {status:'roles-unavailable'};
  roles.sampledPresentationTimes=indices.map(n=>m.presentationTimes[n]);
  const joined=bindMeasuredGamingRegions(m,roles);
  fs.writeFileSync(path.join(i.outputDir,'role-receipt.json'),JSON.stringify(roles,null,2));
  return joined?{status:'source-evidence-ready',...joined}:{status:'roles-unresolved'};
 }catch(error:any){if(error?.code==='PROCESS_STOP_UNVERIFIED'||error?.code==='WORK_CANCELLED'||i.signal?.aborted)throw error;return {status:'producer-unavailable'};}
}
