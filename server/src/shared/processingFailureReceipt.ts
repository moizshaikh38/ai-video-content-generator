import {transcriptionWindowFailureSummary} from './transcriptionWindowFailureSummary.js';
import {transcriptReviewCode} from './transcriptReviewErrors.js';
export const PROCESSING_STAGES=['source_validation','transcript_reuse','source_download','audio_extraction','transcription_routing','transcription','transcript_validation','transcript_persistence','genre_analysis','credit_settlement','credit_extension','source_recheck','gaming_enrichment'] as const;
export type ProcessingStage=typeof PROCESSING_STAGES[number];
export interface ProcessingFailureContext {attemptId?:string;stage:ProcessingStage;sourceSha256?:string;sourceBytes?:number;durationSeconds?:number;provider?:string;model?:string;tierPolicy?:string;inputRequests?:Array<{sha256:string;bytes:number;status:string}>}
const codes=new Set(['NO_AUDIO_STREAM','SOURCE_READ_FAILED','SOURCE_CHANGED','PROCESSING_ATTEMPT_CHANGED','PROCESSING_FAILED','TRANSCRIPTION_PROVIDER_CREDITS_UNAVAILABLE','TRANSCRIPTION_POLICY_REVIEW_REQUIRED','TRANSCRIPTION_ENTITLEMENT_REVIEW_REQUIRED','TRANSCRIPTION_MODEL_CONFIG_INVALID','WORK_CANCELLED','PROCESS_STOP_UNVERIFIED','INSUFFICIENT_CREDITS','VIDEO_DURATION_LIMIT_EXCEEDED','DURATION_LIMIT_EXCEEDED']);
const providers=new Map([['groq','groq'],['openrouter','openrouter'],['failover(groq→openrouter)','groq-then-openrouter'],['failover(openrouter→groq)','openrouter-then-groq']]);
const models=new Set(['openai/whisper-large-v3-turbo','openai/whisper-large-v3','elevenlabs/scribe-v2','nvidia/parakeet-tdt-0.6b-v3','microsoft/mai-transcribe-2']);
const own=(v:unknown,k:string):unknown=>{try{if(!v||typeof v!=='object')return;const d=Object.getOwnPropertyDescriptor(v,k);return d&&'value'in d?d.value:undefined;}catch{return;}};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
/** Bounded best-effort observation only. Never reads getters, stringifies outside
 * payloads or records transport URLs, account balances, raw errors or secrets.
 * Provider is the selected abstraction, not a claim about the winning transport.
 * Counts are a snapshot at failure, not eventual settlement of sibling requests. */
export function processingFailureReceipt(context:ProcessingFailureContext,error:unknown,now=new Date()){
 const fallback={version:1 as const,stage:'source_validation' as ProcessingStage,code:'PROCESSING_FAILED',inputSummary:{submitted:0,completed:0,failed:0},boundary:'provider-abstraction-not-individual-transport-attempts' as const,requestCounts:'snapshot-at-failure' as const};
 try{
  const stage=own(context,'stage'),code=own(error,'code'),status=own(error,'statusCode'),attempt=own(context,'attemptId'),sha=own(context,'sourceSha256'),bytes=own(context,'sourceBytes'),duration=own(context,'durationSeconds'),provider=own(context,'provider'),model=own(context,'model'),policy=own(context,'tierPolicy'),requests=own(context,'inputRequests');
  const windowFailures=transcriptionWindowFailureSummary(error);
  const summary={submitted:0,completed:0,failed:0};
  if(Array.isArray(requests)&&requests.length<=10000){for(let i=0;i<requests.length;i++){const r=own(requests,String(i)),state=own(r,'status');if(!['submitted','completed','failed'].includes(state as string))continue;summary.submitted++;if(state==='completed')summary.completed++;if(state==='failed')summary.failed++;}}
  let failedAt:string|undefined;try{const n=Date.prototype.getTime.call(now);if(Number.isFinite(n))failedAt=new Date(n).toISOString();}catch{}
  return {...fallback,...(failedAt?{failedAt}:{}),stage:(PROCESSING_STAGES as readonly unknown[]).includes(stage)?stage as ProcessingStage:fallback.stage,code:transcriptReviewCode(code)??(typeof code==='string'&&codes.has(code)?code:fallback.code),...(uuid(attempt)?{attemptId:attempt}:{}),...(typeof status==='number'&&Number.isInteger(status)&&status>=400&&status<=599?{httpStatus:status}:{}),...(hash(sha)?{sourceSha256:sha}:{}),...(typeof bytes==='number'&&Number.isSafeInteger(bytes)&&bytes>0?{sourceBytes:bytes}:{}),...(typeof duration==='number'&&Number.isFinite(duration)&&duration>=0&&duration<=86400?{durationSeconds:duration}:{}),...(typeof provider==='string'&&providers.has(provider)?{providerAbstraction:providers.get(provider)}:{}),...(typeof model==='string'&&models.has(model)?{selectedModel:model}:{}),...(policy==='free-turbo-paid-mai-v1'?{tierPolicy:policy}:{}),inputSummary:summary,...(windowFailures?{windowFailureSummary:windowFailures}:{})};
 }catch{return fallback;}
}
