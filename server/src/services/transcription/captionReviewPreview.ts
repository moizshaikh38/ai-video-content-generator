import type {NormalizedTranscriptionResult} from './types.js';
/** A draft projection, never an accepted canonical transcript or automatic review clearance. */
export function buildCaptionReviewPreview(result:NormalizedTranscriptionResult) {
 const reviewSpans:Array<{start:number;end:number;reason:string}>=[];
 const words=(result.words||[]).filter(w=>{
  if(w.kind==='audio_event'||w.kind==='redaction') {reviewSpans.push({start:w.start,end:w.end,reason:w.kind});return false;}
  if(w.confidence!==undefined&&w.confidence<.6)reviewSpans.push({start:w.start,end:w.end,reason:'low_provider_confidence'});
  return true;
 });
 return {words,reviewSpans,status:'unverified_preview' as const,canonicalUnchanged:true as const};
}
