import crypto from 'node:crypto';
import type{ContentGenre,GenreSuggestion}from'../types/index.js';
export const GENRE_IDS=['podcast_interview','education_tutorial','motivation','business_finance','gaming','watch_party','streaming','sports','news_politics','comedy_entertainment','storytelling','documentary','product_marketing','general']as const;
export type VisualContentForm='people_conversation'|'gameplay'|'software_demo'|'live_action'|'slides'|'uncertain';
export interface SemanticGenreReceipt{version:1|2;sourceAudioClock?:SourceGenreAudioClock;sourceSha256:string;transcriptTextSha256:string;durationSeconds:number;model:string;sampling:'uniform-five-v1'|'uniform-nine-long-v1';frames:Array<{time:number;form:VisualContentForm}>;genre:ContentGenre;support:number;reason:string;status:'suggested'|'mixed'|'uncertain';providerCostUsd:number;}
export interface SourceGenreAudioClock {method:'ffprobe-single-av-zero-origin-v1';durationSeconds:number}
/** Independently probe the sole audio/video streams. Never turn a caller's
 * transcript duration into evidence, or guess which alternate stream was used.
 * Quarter-second maximum tail skew is a conservative bound, not a new global
 * timestamp tolerance. Legacy receipts retain their existing 50ms gate. */
export function measuredGenreAudioClock(probe:any):SourceGenreAudioClock|undefined {
 const streams=Array.isArray(probe?.streams)?probe.streams:[];
 const audio=streams.filter((s:any)=>s.codec_type==='audio'),video=streams.filter((s:any)=>s.codec_type==='video');
 if(audio.length!==1||video.length!==1)return;
 const number=(value:unknown)=>typeof value==='number'||(typeof value==='string'&&value.trim()!=='')?Number(value):NaN;
 const a=number(audio[0].duration),v=number(video[0].duration),container=number(probe?.format?.duration);
 const zero=(value:unknown)=>Number.isFinite(number(value))&&Math.abs(number(value))<.000001;
 if(![a,v,container].every(n=>Number.isFinite(n)&&n>0)||!zero(audio[0].start_time)||!zero(video[0].start_time)||!zero(probe?.format?.start_time)||Math.abs(v-container)>.05||container<a||container-a>.25)return;
 return {method:'ffprobe-single-av-zero-origin-v1',durationSeconds:a};
}
function semanticGenreDurationMatches(r:SemanticGenreReceipt,duration:number):boolean {
 if(Math.abs(r.durationSeconds-duration)<=.05)return true;
 const audio=r.sourceAudioClock;
 return r.version===2&&audio?.method==='ffprobe-single-av-zero-origin-v1'&&Number.isFinite(audio.durationSeconds)&&audio.durationSeconds>0&&r.durationSeconds>=audio.durationSeconds&&r.durationSeconds-audio.durationSeconds<=.25&&Math.abs(audio.durationSeconds-duration)<=.05;
}
const forms=new Set(['people_conversation','gameplay','software_demo','live_action','slides','uncertain']);
export function genreTranscriptDigest(text:string):string{return crypto.createHash('sha256').update(text).digest('hex');}
export const MAX_GENRE_REVIEW_SECONDS=7200;
export function genreSampleTimes(duration:number):number[]{
 if(!Number.isFinite(duration)||duration<3||duration>MAX_GENRE_REVIEW_SECONDS)throw Error('Genre review duration must be3to7200seconds');
 const count=duration>180?9:5;
 return Array.from({length:count},(_,i)=>Number((i/(count-1)*Math.max(0,duration-.12)).toFixed(3)));
}
/** Bound tokens without silently using only the opening of a long video. */
export function genreTranscriptSample(text:string,duration:number,segments?:Array<{start:number;end:number;text:string}>):unknown{
 if(duration<=180)return{sampling:'opening-up-to12000characters',text:text.slice(0,12000)};
 const valid=segments?.filter(s=>Number.isFinite(s.start)&&Number.isFinite(s.end)&&s.start>=0&&s.end>s.start&&s.end<=duration+.1&&typeof s.text==='string'&&s.text.trim());
 if(valid?.length){const windows=Array.from({length:5},(_,i)=>{const anchor=i/4*Math.max(0,duration-1);const nearby=[...valid].sort((a,b)=>Math.abs((a.start+a.end)/2-anchor)-Math.abs((b.start+b.end)/2-anchor)).slice(0,12).sort((a,b)=>a.start-b.start);return{anchorSeconds:Number(anchor.toFixed(3)),segments:nearby.map(s=>({start:s.start,end:s.end,text:s.text.slice(0,200)}))};});return{sampling:'five-time-distributed-transcript-windows',windows};}
 const width=2400;return{sampling:'five-character-distributed-excerpts-no-clock-claim',excerpts:Array.from({length:5},(_,i)=>{const start=Math.floor(i/4*Math.max(0,text.length-width));return{characterOffset:start,text:text.slice(start,start+width)};})};
}
/** Sparse visual evidence never grants crop geometry, speaker identity, or proof
 * that all frames share one genre. Invalid/stale receipts cannot replace text. */
export function applySemanticGenreReceipt(base:GenreSuggestion,input:unknown,sha:string,duration:number,transcriptText:string):GenreSuggestion{
 const r=input as SemanticGenreReceipt;if(!r||(r.version!==1&&r.version!==2)||r.sourceSha256!==sha||r.transcriptTextSha256!==genreTranscriptDigest(transcriptText)||!/^[a-f0-9]{64}$/.test(sha)||r.sampling!==(r.durationSeconds>180?'uniform-nine-long-v1':'uniform-five-v1')||!Number.isFinite(duration)||!Number.isFinite(r.durationSeconds)||!semanticGenreDurationMatches(r,duration)||!Array.isArray(r.frames)||r.frames.length!==(r.durationSeconds>180?9:5)||typeof r.model!=='string'||!r.model.endsWith(':free')||r.providerCostUsd!==0||!GENRE_IDS.includes(r.genre)||!Number.isFinite(r.support)||r.support<0||r.support>1||typeof r.reason!=='string'||r.reason.length>600)return base;
 let times:number[];try{times=genreSampleTimes(r.durationSeconds);}catch{return base;}
 if(r.frames.some((f,i)=>!f||!forms.has(f.form)||!Number.isFinite(f.time)||Math.abs(f.time-times[i])>.01))return base;
 const counts=Object.fromEntries([...forms].map(f=>[f,r.frames.filter(x=>x.form===f).length]));
 const contradiction=(r.genre==='gaming'&&counts.gameplay<Math.ceil(r.frames.length*.8))||(r.genre==='podcast_interview'&&counts.people_conversation<Math.ceil(r.frames.length*.6))||(r.genre==='education_tutorial'&&(counts.software_demo+counts.slides<Math.ceil(r.frames.length*.6)));
 const materialThreshold=Math.max(2,Math.ceil(r.frames.length*.2));
 const presentationFamilies=[counts.people_conversation,counts.gameplay,counts.software_demo+counts.slides,counts.live_action];
 const materiallyMixed=presentationFamilies.filter(n=>n>=materialThreshold).length>=2;
 const uncertain=materiallyMixed||r.status!=='suggested'||r.support<.75||r.genre==='general'||counts.uncertain>=Math.ceil(r.frames.length*.3)||contradiction;
 const evidence={version:1 as const,method:'source-bound-semantic' as const,status:uncertain?'abstained' as const:'suggested' as const,confidenceIsProbability:false as const,candidateGenre:r.genre,margin:0,matchedKeywords:base.evidence?.matchedKeywords??{}};
 return{...base,genre:uncertain?'general':r.genre,confidence:uncertain?0:Math.min(.85,r.support),evidence,semanticEvidence:{model:r.model,sourceSha256:sha,sampleCount:r.frames.length,scope:'sampled-source',status:uncertain?'review-required':'suggested',limitations:[`${r.frames.length} sparse frames${transcriptText.trim()?' plus sampled transcript':''}; unobserved content may differ.`,'Model support is not calibrated genre accuracy.','No crop/layout geometry or active-speaker permission.']},reasons:[uncertain?'Mixed, uncertain or contradictory semantic evidence. General defaults retained.':'Model genre suggestion: '+r.reason]};
}
