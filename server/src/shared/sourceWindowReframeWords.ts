import {hasValidTranscriptSourceBinding,transcriptContentIdentity} from './transcriptSourceBinding.js';
import {sourceObjectReceiptMatches,type SourceObjectReceipt} from './sourceObjectReceipt.js';
import {reliableOrderedClocks} from './orderedTranscriptTiming.js';
import {assertTranscriptUsable} from '../services/transcription/transcriptQuality.js';
export interface ReframeWordJoin {words:Array<{start:number;end:number;word?:string}>;audit:{status:'accepted'|'unavailable';reason:string;transcriptContentSha256?:string;windowWordCount?:number}}
/** Optional timing enrichment only. Bind words to the bytes actually decoded by
 * this CV pass. No retrieval, repair, diarization or speaker identity inference. */
export function sourceWindowReframeWords(transcript:any,input:{sourceReceipt?:SourceObjectReceipt;sourceSha256:string;start:number;end:number}):ReframeWordJoin {
 const unavailable=(reason:string):ReframeWordJoin=>({words:[],audit:{status:'unavailable',reason}});
 const {sourceReceipt:r,sourceSha256:sha,start,end}=input;
 if(!r||!sourceObjectReceiptMatches(r,r.key,r,sha))return unavailable('CURRENT_SOURCE_UNBOUND');
 if(![start,end].every(Number.isFinite)||start<0||end<=start)return unavailable('INVALID_SOURCE_WINDOW');
 try{
  if(!transcript||!hasValidTranscriptSourceBinding(transcript,r.key)||!sourceObjectReceiptMatches(transcript.source_binding.source_receipt,r.key,r,sha))return unavailable('TRANSCRIPT_SOURCE_BINDING_MISMATCH');
  const words=transcript.words;
  if(!Array.isArray(words)||words.length>200000||!reliableOrderedClocks(words))return unavailable('TRANSCRIPT_WORD_CLOCKS_UNAVAILABLE');
  assertTranscriptUsable(transcript);
  const projected=words.filter((w:any)=>w.end>start&&w.start<end).map((w:any)=>({start:Math.max(0,Number((w.start-start).toFixed(3))),end:Math.min(Number((end-start).toFixed(3)),Number((w.end-start).toFixed(3))),word:typeof(w.word??w.text)==='string'?(w.word??w.text):undefined})).filter((w:any)=>w.end>w.start);
  return {words:projected,audit:{status:'accepted',reason:'CURRENT_SOURCE_BOUND_WORD_CLOCK',transcriptContentSha256:transcriptContentIdentity(transcript),windowWordCount:projected.length}};
 }catch{return unavailable('TRANSCRIPT_WORD_REVIEW_REQUIRED');}
}
