import crypto from 'node:crypto';
import {AppError} from '../types/index.js';
/** Exact input coverage only, never semantic truth or complete-thought proof. */
export function hookTranscriptScope(clip:any,transcript:any){
 const numeric=(v:any)=>typeof v==='number'&&Number.isFinite(v),offset=(v:any)=>v==null?0:v;
 const values=[clip.start_seconds,clip.end_seconds,offset(clip.trim_start_offset),offset(clip.trim_end_offset)];
 if(!values.every(numeric)||values[0]<0||values[2]<0)throw new AppError('invalid-source-window',409,'HOOK_SOURCE_REVIEW_REQUIRED');
 const start=values[0]+values[2],end=values[1]-values[3];if(!numeric(transcript.duration_seconds)||transcript.duration_seconds<=0||end>transcript.duration_seconds+.001)throw new AppError('The effective hook interval exceeds the verified transcript duration.',409,'HOOK_SOURCE_REVIEW_REQUIRED');if(end<=start)throw new AppError('empty-source-window',409,'HOOK_SOURCE_REVIEW_REQUIRED');
 const words=Array.isArray(transcript.words)?transcript.words:[];
 const segments:any[]=[];const excluded:any[]=[];
 for(const[sIndex,segment]of(transcript.segments||[]).entries()){
  if(!numeric(segment.start)||!numeric(segment.end)||segment.end<=segment.start||typeof segment.text!=='string')throw new AppError('malformed-transcript',409,'HOOK_SOURCE_REVIEW_REQUIRED');
  if(segment.end<=start||segment.start>=end)continue;
  if(segment.start>=start&&segment.end<=end){segments.push({...segment,source_segment_index:sIndex});continue;}
  const segmentWords=words.filter((w:any)=>numeric(w.start)&&numeric(w.end)&&w.start<segment.end&&w.end>segment.start).sort((a:any,b:any)=>a.start-b.start);
  const lexical=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
  const tokens=segment.text.split(/\s+/).filter(Boolean);
  const exactCoverage=segmentWords.length>0&&tokens.length===segmentWords.length&&segmentWords.every((w:any,i:number)=>w.start>=segment.start&&w.end<=segment.end&&w.end>w.start&&typeof(w.word??w.text)==='string'&&lexical(tokens[i])===lexical(w.word??w.text)&&Boolean(lexical(tokens[i])));
  if(!exactCoverage){excluded.push({segment:sIndex,reason:'partial-segment-without-exact-word-text-coverage'});continue;}
  const overlapping=segmentWords.filter((w:any)=>w.start<end&&w.end>start);
  if(!overlapping.length||overlapping.some((w:any)=>w.start<start||w.end>end)){excluded.push({segment:sIndex,reason:'partial-word-boundary'});continue;}
  const indices=overlapping.map((w:any)=>segmentWords.indexOf(w));
  if(indices.some((v:number,i:number)=>i>0&&v!==indices[i-1]+1)){excluded.push({segment:sIndex,reason:'noncontiguous-word-coverage'});continue;}
  segments.push({start:overlapping[0].start,end:overlapping.at(-1).end,text:tokens.slice(indices[0],indices.at(-1)+1).join(' '),source_segment_index:sIndex,scope:'exact-token-aligned-timed-words'});
 }
 // Timed speech outside the supplied segment coverage cannot disappear from
 // a supposedly complete generation input. Refuse rather than invent text.
 for(const word of words){if(!word||!numeric(word.start)||!numeric(word.end)||word.end<=word.start||typeof(word.word??word.text)!=='string')throw new AppError('Malformed timed speech needs review.',409,'HOOK_SOURCE_REVIEW_REQUIRED');if(word.start<end&&word.end>start&&!segments.some(segment=>word.start>=segment.start&&word.end<=segment.end))throw new AppError('Timed speech is not fully covered by the effective transcript segments.',409,'HOOK_SOURCE_REVIEW_REQUIRED');}
 segments.sort((a,b)=>a.start-b.start||a.end-b.end);
 if(segments.some((s:any,i:number)=>i>0&&s.start<segments[i-1].end))throw new AppError('overlapping-segment-evidence-needs-review',409,'HOOK_SOURCE_REVIEW_REQUIRED');
 if(excluded.length)throw new AppError('The effective hook interval has incomplete transcript coverage. Review the trim before generating hooks.',409,'HOOK_SOURCE_REVIEW_REQUIRED');
 const speech=segments.map(s=>s.text.trim()).filter(Boolean).join(' ');
 if(!speech)throw new AppError('no-verifiable-speech-in-effective-window',409,'HOOK_SOURCE_REVIEW_REQUIRED');
 const digest=crypto.createHash('sha256').update(JSON.stringify({start,end,segments})).digest('hex');
 return {start,end,segments,words:words.filter((w:any)=>numeric(w.start)&&numeric(w.end)&&w.start>=start&&w.end<=end),speech,digest,excluded};
}
export function exactHookEvidence(scope:any,segment:any,reason:string){
 if(!scope.segments.includes(segment))throw new AppError('foreign-evidence',409,'HOOK_SOURCE_REVIEW_REQUIRED');
 return {start_seconds:segment.start-scope.start,end_seconds:segment.end-scope.start,text:segment.text,segment_id:segment.id||`source-segment-${segment.source_segment_index}`,reason};
}
