import fs from'node:fs';import os from'node:os';import path from'node:path';import crypto from'node:crypto';import{execFile}from'node:child_process';import{promisify}from'node:util';import{performance}from'node:perf_hooks';import ffmpegStatic from'ffmpeg-static';import{AppError}from'../types/index.js';import type{StreamVideoSource}from'../shared/streamVideoSource.js';import{pinnedPublicMediaFetch}from'../utils/pinnedHttpsAssetFetch.js';import{parsePublicHls}from'../shared/publicHlsPlan.js';
const run=promisify(execFile);const fail=(message:string,code='KICK_IMPORT_UNAVAILABLE',status=502)=>new AppError(message,status,code);
export class KickImportService{
 static async metadataRequest(url:string,body?:string){
  const r=await pinnedPublicMediaFetch(url,AbortSignal.timeout(12000),{httpsOnly:true,...(body?{method:'POST' as const,body}:{})});
  if(!r.ok){await r.body?.cancel();if([401,403].includes(r.status))throw fail('This Kick video requires access or could not be retrieved. Use a public completed video or upload a file you may use.','KICK_ACCESS_REQUIRED',403);if(r.status===404)throw fail('Kick video was not found.','KICK_VIDEO_NOT_FOUND',404);if(r.status===429)throw fail('Kick rate limit reached. Try later.','KICK_RATE_LIMITED',429);throw fail('Kick could not provide this video.')}
  const reader=r.body?.getReader();if(!reader)throw fail('Kick returned an empty response.');let bytes=0;const chunks:Uint8Array[]=[];try{while(true){const p=await reader.read();if(p.done)break;bytes+=p.value.length;if(bytes>1024*1024)throw fail('Kick metadata exceeded the safe limit.');chunks.push(p.value)}}finally{await reader.cancel()}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw fail('Kick returned an unexpected response.')}
 }
 static async resolve(source:StreamVideoSource){
  if(source.provider!=='kick')throw fail('Invalid Kick source.','INVALID_PLATFORM_URL',400);
  let url:unknown,title='Kick video',duration:number|undefined;
  if(source.kind==='clip'){
   const data=await this.metadataRequest('https://kick.com/api/v2/clips/'+encodeURIComponent(source.id));const clip=data.clip;
   if(!clip||clip.id!==source.id||clip.is_private===true||clip.is_subscriber_only===true)throw fail('This Kick clip is not publicly downloadable.','KICK_ACCESS_REQUIRED',403);
   url=clip.playback_url||clip.clip_url||clip.video_url;title=String(clip.title||'Kick clip').slice(0,255);duration=Number(clip.duration);
  }else{
   const data=await this.metadataRequest('https://web.kick.com/api/v1/stream/'+encodeURIComponent(source.id)+'/playback',JSON.stringify({video_player:{player:{}},video_session:{},user_session:{non_personalised_ads:true}}));
   if(data.data||data.is_live===true||data.video_session?.is_live===true)throw fail('Kick did not provide a completed public video.','KICK_ACCESS_REQUIRED',403);
   url=data.playback_url?.vod;
  }
  let u:URL;try{u=new URL(String(url))}catch{throw fail('Kick did not provide downloadable video.','KICK_NO_MEDIA',409)}
  if(u.protocol!=='https:'||u.username||u.password||u.port)throw fail('Kick returned an unexpected media address.');
  if(duration!==undefined&&(!Number.isFinite(duration)||duration<=0||duration>7200))throw fail('Kick video exceeds the supported duration.','VIDEO_TOO_LONG',400);
  return{url:u.toString(),title,duration};
 }
 static async download(media:{url:string},maxBytes:number,download:(u:string,m:number,t?:number,r?:{start:number;length:number})=>Promise<{tempFilePath:string;totalBytes:number;contentType:string}>){
  if(!new URL(media.url).pathname.endsWith('.m3u8'))return download(media.url,maxBytes,60000);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vireo-kick-hls-')),deadline=performance.now()+120000;let consumed=0;const left=()=>{const n=deadline-performance.now();if(n<=0)throw fail('Kick import timed out.','DOWNLOAD_TIMEOUT',408);return Math.min(20000,Math.round(n))};
  async function get(u:string,cap:number,r?:{start:number;length:number}){if(cap<=0||r&&r.length>cap)throw fail('Video exceeds your file-size limit.','FILE_SIZE_EXCEEDED',400);const f=await download(u,r?r.length:cap,left(),r);consumed+=f.totalBytes;if(consumed>maxBytes){fs.rmSync(f.tempFilePath,{force:true});throw fail('Video exceeds your file-size limit.','FILE_SIZE_EXCEEDED',400)}return f}
  try{
   let current=media.url,plan:ReturnType<typeof parsePublicHls>|undefined;
   for(let depth=0;depth<3;depth++){const f=await get(current,Math.min(1024*1024,maxBytes-consumed));let text:string;try{text=fs.readFileSync(f.tempFilePath,'utf8')}finally{fs.rmSync(f.tempFilePath,{force:true})}plan=parsePublicHls(text,current);if(plan.kind==='media')break;const variants=plan.variants.filter(v=>!v.height||v.height<=1080).sort((a,b)=>(b.height??0)-(a.height??0)||b.bandwidth-a.bandwidth);if(!variants.length)throw fail('No supported Kick source at1080p or below.','HLS_FORMAT_UNSUPPORTED',400);current=variants[0].url;}
   if(!plan||plan.kind!=='media')throw fail('Kick playlist nesting exceeded the safe limit.','HLS_FORMAT_UNSUPPORTED',400);
   if(plan.ranges?.every(Boolean)&&plan.ranges.reduce((n,r)=>n+r!.length,consumed)>maxBytes)throw fail('Video exceeds your file-size limit.','FILE_SIZE_EXCEEDED',400);
   const names:string[]=[];for(const [i,u]of plan.segments.entries()){left();const f=await get(u,maxBytes-consumed,plan.ranges?.[i]??undefined);const name='segment-'+i+'.ts';fs.renameSync(f.tempFilePath,path.join(dir,name));names.push(name)}
   const list=path.join(dir,'segments.txt');fs.writeFileSync(list,names.map(n=>"file '"+n+"'").join('\n'));const output=path.join(os.tmpdir(),'vireo-kick-'+crypto.randomUUID()+'.mp4');
   try{await run((ffmpegStatic as unknown as string)||'ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-protocol_whitelist','file','-f','concat','-safe','1','-i',list,'-map','0:v:0','-map','0:a?','-c','copy','-movflags','+faststart',output],{timeout:left(),maxBuffer:1024*1024});const size=fs.statSync(output).size;if(size>=maxBytes)throw fail('Video exceeds your file-size limit.','FILE_SIZE_EXCEEDED',400);return{tempFilePath:output,totalBytes:size,contentType:'video/mp4'}}catch(e){fs.rmSync(output,{force:true});throw e}
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
 }
}
