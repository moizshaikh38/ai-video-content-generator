import type {SourceObjectReceipt} from './sourceObjectReceipt.js';
export interface SourceWindowCutJoin {
  cuts:number[];
  audit:{status:'accepted'|'unavailable';reason:string;sourceCutCount?:number;windowCutCount?:number};
}
/** Join completed source-clock detector output to one analyzed source window.
 * The caller must obtain the record through getFreshAnalysis. This independent
 * join also requires the exact bytes/validator used by the current CV pass.
 * Cuts are boundaries only, never evidence that a crop or layout is correct.
 */
export function sourceWindowSceneCuts(record:any,input:{sourceReceipt?:SourceObjectReceipt;sourceSha256:string;start:number;end:number}):SourceWindowCutJoin {
  const unavailable=(reason:string):SourceWindowCutJoin=>({cuts:[],audit:{status:'unavailable',reason}});
  const {sourceReceipt:r,sourceSha256:sha,start,end}=input;
  if(!r||!/^[a-f0-9]{64}$/.test(sha)||r.sha256!==sha||!r.key||!r.etag||r.etag.startsWith('W/')||!Number.isSafeInteger(r.size)||r.size<=0)return unavailable('CURRENT_SOURCE_UNBOUND');
  if(![start,end].every(Number.isFinite)||start<0||end<=start)return unavailable('INVALID_SOURCE_WINDOW');
  if(record?.status!=='completed')return unavailable('FRESH_COMPLETED_TIMELINE_UNAVAILABLE');
  const bound=record.metadata?.source_receipt;
  if(!bound||bound.sha256!==sha||bound.key!==r.key||bound.etag!==r.etag||bound.size!==r.size)return unavailable('TIMELINE_SOURCE_RECEIPT_MISMATCH');
  const timeline=record.timeline,signal=timeline?.signal_evidence?.sceneCuts;
  if(signal?.status!=='completed'||signal.scope!=='whole-source')return unavailable('SCENE_CUT_EXECUTION_UNVERIFIED');
  if(!Number.isFinite(timeline.duration_seconds)||timeline.duration_seconds<=0||end>timeline.duration_seconds+.001)return unavailable('TIMELINE_SOURCE_CLOCK_MISMATCH');
  const raw=timeline.scene_cuts;
  // Current fusion emits VideoSceneCut objects, not primitive numbers. Never
  // coerce whole objects, booleans, null or numeric strings to timestamps.
  if(!Array.isArray(raw)||raw.some((c:any)=>!c||typeof c!=='object'||!Number.isFinite(c.timestamp)||c.timestamp<0||c.timestamp>timeline.duration_seconds))return unavailable('INVALID_SCENE_CUT_SCHEMA');
  // Retain the existing 250 ms margin for this coarse detector. The separately
  // precision-tagged local-CV merge may admit independently refined edge cuts.
  const cuts=[...new Set<number>(raw.map((c:any)=>c.timestamp as number)
    .filter((time:number)=>time>start+.25&&time<end-.25)
    .map((time:number)=>Number((time-start).toFixed(3))))].sort((a,b)=>a-b);
  return {cuts,audit:{status:'accepted',reason:'FRESH_SOURCE_CLOCK_REBASED',sourceCutCount:raw.length,windowCutCount:cuts.length}};
}
