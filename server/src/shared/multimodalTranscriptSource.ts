import {hasValidTranscriptSourceBinding} from './transcriptSourceBinding.js';
import {sourceObjectReceiptMatches,type SourceObjectReceipt} from './sourceObjectReceipt.js';
import {assertTranscriptUsable} from '../services/transcription/transcriptQuality.js';
/** One source for fused speech and measured media. A snapshot hash of stale
 * speech beside new media is not lineage. No transcription or repair here. */
export function multimodalTranscriptSourceCurrent(transcript:any,receipt:SourceObjectReceipt|undefined):boolean {
 try{
  if(!receipt||!sourceObjectReceiptMatches(receipt,receipt.key,receipt,receipt.sha256)||!hasValidTranscriptSourceBinding(transcript,receipt.key)||!sourceObjectReceiptMatches(transcript.source_binding.source_receipt,receipt.key,receipt,receipt.sha256))return false;
  assertTranscriptUsable(transcript);return true;
 }catch{return false;}
}

/** Old/unavailable visual evidence is not a reason to reject valid speech.
 * But a download receipt still matching the current object must not be ignored
 * when its known byte hash contradicts transcript lineage. No new download. */
export function multimodalKnownSourceContradiction(transcript:any,sourceKey:string,head:{size:number;etag?:string},knownReceipt:unknown):boolean {
 if(!sourceObjectReceiptMatches(knownReceipt,sourceKey,head))return false;
 return !multimodalTranscriptSourceCurrent(transcript,knownReceipt);
}
