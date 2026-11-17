import crypto from 'node:crypto';
import {sourceObjectReceiptMatches, type SourceObjectReceipt} from './sourceObjectReceipt.js';

export interface TranscriptionInputReceipt {
  sha256:string;
  bytes:number;
  status:'submitted'|'completed'|'failed';
}
/** Records the local audio submitted to the provider abstraction. Internal
 * provider failover attempts are not individual receipts. Not an accuracy seal. */
export interface TranscriptSourceBinding {
  version:1;
  source_receipt:SourceObjectReceipt;
  prepared_audio_sha256:string;
  requests:TranscriptionInputReceipt[];
  transcript_content_sha256:string;
}
/** Only speech/review content is signed, so a same-owner cross-project clone
 * can retain its lineage without pretending to be a newly generated transcript. */
export function transcriptContentIdentity(transcript:Record<string,any>):string {
  const canonical=(value:any):any=>{if(value===undefined)return null;if(value instanceof Date)return value.toISOString();if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));return value;};
  // Stable across Mongo's undefined -> null serialization and cloned row IDs.
  const content=Object.fromEntries(['transcript_text','text','duration_seconds','segments','words','language','quality_assessment','transcription_provenance','transcription_timing_issues','av_start_offset_sec'].map(key=>[key,transcript[key]]));
  return crypto.createHash('sha256').update(JSON.stringify(canonical(content))).digest('hex');
}
export const audioInputSha256=(audio:Buffer):string=>crypto.createHash('sha256').update(audio).digest('hex');
export function transcriptSourceBindingMatches(transcript:Record<string,any>,key:string,head:{size:number;etag?:string}):boolean {
  const binding=transcript.source_binding as TranscriptSourceBinding|undefined;
  return binding?.version===1 && sourceObjectReceiptMatches(binding.source_receipt,key,head) &&
    /^[a-f0-9]{64}$/.test(binding.prepared_audio_sha256) &&
    Array.isArray(binding.requests) && binding.requests.length>0 &&
    binding.requests.every(r=>/^[a-f0-9]{64}$/.test(r.sha256)&&Number.isSafeInteger(r.bytes)&&r.bytes>0&&['completed','failed'].includes(r.status)) &&
    binding.requests.some(r=>r.status==='completed') &&
    binding.transcript_content_sha256===transcriptContentIdentity(transcript);
}
