import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {dataRepository,ownerContext} from '../../db/repositories/dataRepository.js';
import {AppError,HookCandidate,isValidUUID} from '../../types/index.js';
import {downloadObjectToFile,headObject,uploadFile,signObjectGet,deleteObject} from '../objectStorageService.js';
import {getDrawtextFfmpeg} from '../../utils/drawtextFfmpeg.js';
import {resolveBundledFontFile} from '../editorFontFiles.js';
import {CAPTION_WIDTH_METRICS} from '../../shared/captionWidthMetrics.js';
import {ffmpegThreadArgs,ffmpegEncoderThreadArgs} from '../runtimePolicy.js';

const exec=promisify(execFile);
const unavailable=(message:string)=>new AppError(message,409,'HOOK_PREVIEW_UNAVAILABLE');
export const HOOK_PREVIEW_MAX_BYTES=512*1024*1024;
/** A source excerpt, never a substitute for the saved Studio timeline. */
export function planHookSourcePreview(clip:any,candidate:HookCandidate){
 if(candidate.delivery_mode!=='TEXT_OVERLAY'||candidate.trim_plan||candidate.reorder_plan)throw unavailable('Only text-overlay source previews are supported. This delivery mode needs its own output workflow.');
 const p=candidate.text_overlay_plan;
 if(!p)throw unavailable('The text overlay plan is missing.');
 const number=(v:any)=>typeof v==='number'&&Number.isFinite(v);
 const offset=(v:any)=>v===undefined||v===null?0:v;
 const ts=offset(clip.trim_start_offset),te=offset(clip.trim_end_offset);
 if(![clip.start_seconds,clip.end_seconds,ts,te,p.start_time,p.end_time,p.position_y,p.font_size].every(number)||ts<0||te<0||clip.start_seconds<0)throw unavailable('The source interval or overlay geometry needs review.');
 const sourceStart=clip.start_seconds+ts,sourceEnd=clip.end_seconds-te;
 if(sourceEnd<=sourceStart||p.start_time<0||p.end_time<=p.start_time||p.end_time>10||p.end_time>sourceEnd-sourceStart||p.position_y<.1||p.position_y>.9||p.font_size<16||p.font_size>96)throw unavailable('The source interval or overlay timing does not fit this preview.');
 // A manual candidate edit changes candidate.text, while the generated plan may
 // still carry its old text. Never preview the stale generated words instead.
 const text=candidate.text;
 if(typeof text!=='string'||!text.trim()||text.length>100||/[\x00-\x08\x0b-\x1f\x7f]/.test(text))throw unavailable('Source previews support one to 100 visible text characters.');
 if(!['Inter','Montserrat','Bangers'].includes(p.font_family)||!/^#[0-9a-fA-F]{6}$/.test(p.color))throw unavailable('This overlay font or color needs a supported preview style.');
 return {sourceStart,sourceEnd,duration:Math.min(sourceEnd-sourceStart,Math.max(3,p.end_time)),text,start:p.start_time,end:p.end_time,y:p.position_y,font:p.font_family,size:p.font_size,color:p.color};
}
export function fitHookSourcePreviewText(text:string,font:string,size:number,width:number){
 const metrics=CAPTION_WIDTH_METRICS[font];
 const measure=(s:string)=>Array.from(s).reduce((n,c)=>n+(metrics?.[c]??1.2),0)*size*1.08;
 const lines:string[]=[];let line='';
 for(const word of text.replace(/\s+/g,' ').trim().split(' ')){
  if(measure(word)>width)throw unavailable('A hook word is too wide for this preview style.');
  const next=line?line+' '+word:word;
  if(measure(next)>width){lines.push(line);line=word;}else line=next;
 }
 if(line)lines.push(line);
 if(lines.length>4)throw unavailable('The hook does not fit four lines in this preview style.');
 return lines.join('\n');
}
export async function renderHookSourcePreview(userId:string,clipId:string,input:HookCandidate):Promise<{previewUrl:string;duration:number;verified:boolean}>{
 return ownerContext.run(userId,async()=>{
  if(![userId,clipId,input.id,input.hook_lab_session_id].every(isValidUUID))throw unavailable('The hook preview identity needs review.');
  const load=async()=>{
   const {data:candidate,error:ce}=await dataRepository.from('hook_candidates').select('*').eq('id',input.id).eq('user_id',userId).eq('hook_lab_session_id',input.hook_lab_session_id).single();
   const {data:session,error:se}=await dataRepository.from('hook_lab_sessions').select('*').eq('id',input.hook_lab_session_id).eq('user_id',userId).single();
   const {data:clip,error:ve}=await dataRepository.from('clips').select('*').eq('id',clipId).eq('user_id',userId).single();
   if(ce||se||ve||!candidate||!session||!clip||session.clip_id!==clipId||session.project_id!==clip.project_id||!isValidUUID(clip.project_id))throw unavailable('The hook no longer belongs to this source clip.');
   const {data:project,error:pe}=await dataRepository.from('projects').select('*').eq('id',clip.project_id).eq('user_id',userId).single();
   if(pe||!project||!clip.source_storage_path||project.source_url!==clip.source_storage_path)throw unavailable('The project source identity needs review.');
   const key=clip.source_storage_path;
   if(typeof key!=='string'||!key.startsWith(`users/${userId}/projects/${clip.project_id}/`)||key.includes('..')||key.includes('\\'))throw unavailable('The source path does not belong to this project.');
   const plan=planHookSourcePreview(clip,candidate as HookCandidate);
   const binding=JSON.stringify([candidate,session,clip.id,clip.project_id,key,clip.start_seconds,clip.end_seconds,clip.trim_start_offset??null,clip.trim_end_offset??null]);
   return {clip,candidate,key,plan,binding};
  };
  const initial=await load(),p=initial.plan;
  const bin=getDrawtextFfmpeg();if(!bin)throw unavailable('Text rendering is unavailable on this host.');
  const font=resolveBundledFontFile(p.font,'bold')||resolveBundledFontFile(p.font,'regular');if(!font)throw unavailable('The selected preview font is unavailable.');
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'vireo-hook-source-'));
  let uploadedKey:string|undefined;
  try{
   const source=path.join(tmp,'source.media'),output=path.join(tmp,'preview.mp4');
   const before=await headObject('source',initial.key);
   if(!Number.isSafeInteger(before.size)||before.size<=0||before.size>HOOK_PREVIEW_MAX_BYTES||!before.etag||before.etag.startsWith('W/'))throw unavailable('The source cannot be prepared within the preview budget.');
   const downloaded=await downloadObjectToFile('source',initial.key,source,{requireStreamingSha256:true,requireSnapshotReceipt:true,expectedObject:{size:before.size,etag:before.etag,versionId:before.versionId},maxBytes:HOOK_PREVIEW_MAX_BYTES,timeoutMs:60000});
   if(!downloaded.sourceReceipt||downloaded.sizeBytes!==before.size)throw unavailable('The source snapshot could not be verified.');
   const probe=JSON.parse((await exec('ffprobe',['-v','error','-show_streams','-show_format','-of','json',source],{timeout:10000,maxBuffer:1024*1024})).stdout);
   const video=probe.streams?.find((s:any)=>s.codec_type==='video'&&s.disposition?.attached_pic!==1);
   const sourceDuration=Number(video?.duration??probe.format?.duration),width=Number(video?.width),height=Number(video?.height);
   if(!video||!Number.isFinite(sourceDuration)||sourceDuration+1/30<p.sourceEnd||![width,height].every(v=>Number.isFinite(v)&&v>0))throw unavailable('The source has no verifiable video covering this clip interval.');
   // Fixed small preview, preserve the source aspect. This intentionally does
   // not claim to reproduce a saved crop, scene, caption or audio edit.
   const sar=String(video.sample_aspect_ratio||'1:1').split(':').map(Number);
   const ratio=sar.length===2&&sar.every((n:number)=>Number.isFinite(n)&&n>0)?sar[0]/sar[1]:1;
   const rotation=Number(video.side_data_list?.find((d:any)=>d.rotation!==undefined)?.rotation??video.tags?.rotate??0);
   if(!Number.isFinite(rotation)||Math.abs(rotation%90)>0.01)throw unavailable('This source rotation needs separate preparation.');
   const rotated=Math.abs(rotation%180)>0.01,displayW=rotated?height:width*ratio,displayH=rotated?width*ratio:height;
   const scale=Math.min(1,720/displayW,720/displayH),w=Math.max(2,Math.floor(displayW*scale/2)*2),h=Math.max(2,Math.floor(displayH*scale/2)*2);
   const size=Math.max(12,Math.round(p.size*w/1080));
   const text=fitHookSourcePreviewText(p.text,p.font,size,w*.84);
   const lines=text.split('\n').length,block=lines*size*1.25+16;
   if(h*p.y-block/2<8||h*p.y+block/2>h-8)throw unavailable('The hook extends beyond the source preview. Move it inward.');
   const textfile=path.join(tmp,'hook.txt');fs.writeFileSync(textfile,text);
   const filter=`scale=${w}:${h},setsar=1,drawtext=fontfile='${font}':textfile='${textfile}':expansion=none:fontcolor=${p.color}:fontsize=${size}:line_spacing=${Math.round(size*.25)}:x=(w-text_w)/2:y=h*${p.y}-text_h/2:box=1:boxcolor=black@0.65:boxborderw=8:enable='gte(t,${p.start})*lt(t,${p.end})'`;
   await exec(bin,['-nostdin','-y',...ffmpegThreadArgs(),'-ss',String(p.sourceStart),'-i',source,'-t',String(p.duration),'-map','0:v:0','-map','0:a:0?','-vf',filter,'-c:v','libx264','-preset','veryfast','-crf','24',...ffmpegEncoderThreadArgs(),'-c:a','aac','-b:a','128k','-pix_fmt','yuv420p','-movflags','+faststart',output],{timeout:45000,maxBuffer:1024*1024});
   const result=JSON.parse((await exec('ffprobe',['-v','error','-count_frames','-show_streams','-show_format','-of','json',output],{timeout:10000,maxBuffer:1024*1024})).stdout);
   const rendered=result.streams?.find((s:any)=>s.codec_type==='video'),duration=Number(rendered?.duration);
   if(!rendered||!Number.isFinite(Number(rendered.nb_read_frames))||Number(rendered.nb_read_frames)<1||!Number.isFinite(duration)||Math.abs(duration-p.duration)>.15)throw unavailable('The preview output did not cover the requested video interval.');
   await exec(bin,['-nostdin','-v','error',...ffmpegThreadArgs(),'-i',output,'-map','0:v:0','-map','0:a:0?','-f','null','-'],{timeout:20000,maxBuffer:1024*1024});
   const validate=async()=>{const current=await load(),after=await headObject('source',initial.key);if(current.binding!==initial.binding||after.size!==before.size||after.etag!==before.etag||after.versionId!==before.versionId)throw unavailable('The hook or source changed during preview. Try again.');};
   await validate();
   const key=`users/${userId}/projects/${initial.clip.project_id}/clips/${clipId}/hook-preview-${input.id}-${crypto.randomUUID()}.mp4`;
   uploadedKey=key;
   await uploadFile('clips',key,output,fs.statSync(output).size,'video/mp4');
   await validate();
   const previewUrl=await signObjectGet('clips',key,'hook-source-preview.mp4');
   uploadedKey=undefined;
   return {previewUrl,duration,verified:true};
  }catch(error){if(uploadedKey)await deleteObject('clips',uploadedKey).catch(()=>undefined);throw error;}finally{fs.rmSync(tmp,{recursive:true,force:true});}
 });
}
