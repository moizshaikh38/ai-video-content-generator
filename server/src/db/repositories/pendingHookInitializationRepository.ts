import type {ClientSession, Db, MongoClient} from 'mongodb';
import {AppError} from '../../types/index.js';
import {editorRenderSnapshot, type EditorRenderSnapshot} from '../../shared/editorRenderSnapshot.js';
import {projectHook} from '../../shared/hookDisplayMode.js';
import type {FreshHookBandReview} from '../../shared/freshHookPictureBand.js';
import {creationDigest} from './candidateCreationRepository.js';

// Deliberately not wired into creation, Studio reads or render workers yet.
// Only NEW prepared creations may register. Never infer pending work from v1.
const collection='pending_hook_initializations';
const tx={readPreference:'primary' as const,readConcern:{level:'snapshot' as const},writeConcern:{w:'majority' as const},maxCommitTimeMS:10_000};
const key=(owner:string,clipId:string)=>creationDigest(['pending-hook-initialization-v1',owner,clipId]);
const equal=(a:unknown,b:unknown)=>creationDigest(a)===creationDigest(b);
const changed=()=>new AppError('Saved inputs changed before new-hook initialization. Start a fresh render.',409,'RENDER_INPUT_CHANGED');
const lost=()=>new AppError('Render lease was expired or claimed by another worker.',409,'FENCING_TOKEN_MISMATCH');
/** Excludes worker status, stage/progress and output/audit fields. */
export const pendingHookClipIdentity=(clip:any)=>creationDigest(Object.fromEntries([
 'id','user_id','project_id','candidate_id','source_storage_path','source_object_key','selection_source_receipt',
 'start_seconds','end_seconds','duration_seconds','trim_start_offset','trim_end_offset','aspect_ratio','crop_mode','crop_config',
 'auto_hook_title_enabled','auto_hook_title_text','caption_enabled','caption_style','caption_position','caption_config','overlay_config',
 'cold_open','volume','render_resolution',
].map(k=>[k,clip[k]])));

/** Must run inside the SAME new prepared clip/editor/job admission transaction.
 * Registering is explicit, not a background migration. Immutable creation
 * preparation and receipt documents are never touched by this workflow. */
export async function registerPendingHookInitialization(db:Db,session:ClientSession,input:{clip:any;project:any;job:any}):Promise<boolean>{
 const {clip,project,job}=input,hook=projectHook(project);
 if(clip.auto_hook_title_enabled!==true||clip.crop_config?.mode!=='smart'||clip.crop_config?.layout_mode_source!=='auto'||!hook?.text?.hook_style_linked)return false;
 const sourceSha=clip.selection_source_receipt?.source_receipt?.sha256;
 if(typeof sourceSha!=='string'||!/^[a-f0-9]{64}$/.test(sourceSha)||typeof clip.source_storage_path!=='string')return false;
 const baseline=editorRenderSnapshot(project);
 if(project.version!==1||clip.editor_version!==1||clip.render_version!==1||project.clip_id!==clip.id||project.user_id!==clip.user_id||
    job.clip_id!==clip.id||job.user_id!==clip.user_id||job.admission_version!==1||job.editor_version!==1||job.render_version!==1||job.status!=='queued'||!equal(job.editor_project_snapshot,baseline))throw changed();
 await db.collection<any>(collection).insertOne({_id:key(clip.user_id,clip.id),version:1,user_id:clip.user_id,clip_id:clip.id,project_id:project.id,job_id:job.id,
   state:'pending',baseline,clip_identity:pendingHookClipIdentity(clip),source_key:clip.source_storage_path,source_sha:sourceSha,created_at:new Date()},{session});
 return true;
}

/** First editable read atomically freezes the old anchor OR returns the fully
 * completed revision. No CV wait, no disabled editor, no stale read fallback.
 * Internal render/caption-only reads must not call this function. */
export async function readEditorAndFreezePendingHook(client:MongoClient,db:Db,input:{userId:string;clipId?:string;projectId?:string}):Promise<any|null>{
 if(!input.clipId&&!input.projectId)throw new AppError('An editor identity is required.',400,'INVALID_EDITOR_ID');
 const session=client.startSession();try{return await session.withTransaction(async()=>{
  const project=await db.collection('editor_projects').findOne({user_id:input.userId,...(input.clipId?{clip_id:input.clipId}:{}),...(input.projectId?{id:input.projectId}:{})},{session});
  if(!project)return null;
  await db.collection<any>(collection).updateOne({_id:key(input.userId,project.clip_id),user_id:input.userId,project_id:project.id,state:'pending'},{$set:{state:'frozen-on-open',finished_at:new Date()}},{session});
  return project;
 },tx);}finally{await session.endSession();}
}

export interface CompletePendingHookInput {userId:string;clipId:string;jobId:string;workerId:string;clip:any;baseline:any;review:FreshHookBandReview;}
export interface PendingHookCompletion {status:'not-pending'|'completed'|'recovered';editorVersion?:number;editorProject?:EditorRenderSnapshot|null;reviewStatus?:FreshHookBandReview['status'];}
/** Reject anything beyond the measured y-only translation before any writes.
 * Caller computes review with current source-object-verified CV outside the
 * transaction; digest/lease checks below fence the exact inputs it measured. */
export function validatePendingHookReview(input:CompletePendingHookInput):void{
 const {baseline,review}=input;
 if(!baseline||baseline.version!==1||baseline.clip_id!==input.clipId||baseline.user_id!==input.userId||input.clip.id!==input.clipId||input.clip.user_id!==input.userId)throw changed();
 if(!['placed-in-upper-band','unchanged','no-room','unavailable'].includes(review.status))throw changed();
 if(review.status!=='placed-in-upper-band'){if(!equal(editorRenderSnapshot(baseline),editorRenderSnapshot(review.project)))throw changed();return;}
 const before=projectHook(baseline),after=projectHook(review.project);
 if(!before?.text?.hook_style_linked||!after||before.id!==after.id||!Number.isFinite(after.transform?.position_y))throw changed();
 const normalized=structuredClone(review.project),hook=projectHook(normalized)!;
 hook.transform.position_y=before.transform.position_y;
 if(!equal(editorRenderSnapshot(baseline),editorRenderSnapshot(normalized)))throw changed();
}

/** All-or-nothing editor + clip + admitted job snapshot transition. The current
 * worker must adopt the RETURNED version before any later stage/publication.
 * A concurrent editable read wins by freezing pending, or sees version2 after
 * this commit. A concurrent real save wins or conflicts, never overwritten. */
export async function completePendingHookInitialization(client:MongoClient,db:Db,input:CompletePendingHookInput):Promise<PendingHookCompletion>{
 validatePendingHookReview(input);
 const session=client.startSession();try{return await session.withTransaction(async()=>{
  const marker=await db.collection<any>(collection).findOne({_id:key(input.userId,input.clipId),user_id:input.userId},{session});
  if(!marker||marker.state!=='pending')return {status:'not-pending'};
  if(marker.version!==1||marker.job_id!==input.jobId||marker.project_id!==input.baseline.id||marker.clip_identity!==pendingHookClipIdentity(input.clip)||!equal(marker.baseline,editorRenderSnapshot(input.baseline)))throw changed();
  const job=await db.collection('render_jobs').findOne({id:input.jobId,clip_id:input.clipId,user_id:input.userId,worker_id:input.workerId,status:'processing',admission_version:1,render_version:1,editor_version:1},{session});
  if(!job)throw lost();
  const clip=await db.collection('clips').findOne({id:input.clipId,user_id:input.userId,render_version:1,editor_version:1,editor_project_sync_pending:null},{session});
  const project=await db.collection('editor_projects').findOne({id:marker.project_id,clip_id:input.clipId,user_id:input.userId,version:1},{session});
  if(!clip||pendingHookClipIdentity(clip)!==marker.clip_identity||!project||!equal(editorRenderSnapshot(project),marker.baseline)||!equal(job.editor_project_snapshot,marker.baseline))throw changed();
  const placed=input.review.status==='placed-in-upper-band';
  const next=placed?{...project,tracks:input.review.project.tracks,version:2,updated_at:new Date()}:project;
  const nextSnapshot=editorRenderSnapshot(next);
  if(placed){
   const p=await db.collection('editor_projects').updateOne({id:project.id,user_id:input.userId,version:1},{$set:{tracks:next.tracks,version:2,updated_at:next.updated_at}},{session});
   const c=await db.collection('clips').updateOne({id:input.clipId,user_id:input.userId,render_version:1,editor_version:1,editor_project_sync_pending:null},{$set:{editor_version:2,updated_at:new Date()}},{session});
   const j=await db.collection('render_jobs').updateOne({id:input.jobId,clip_id:input.clipId,user_id:input.userId,worker_id:input.workerId,status:'processing',render_version:1,editor_version:1},{$set:{editor_version:2,editor_project_snapshot:nextSnapshot,updated_at:new Date()}},{session});
   if(p.matchedCount!==1||c.matchedCount!==1)throw changed();if(j.matchedCount!==1)throw lost();
  }
  const m=await db.collection<any>(collection).updateOne({_id:marker._id,state:'pending'},{$set:{state:'completed',review_status:input.review.status,review_reason:input.review.reason,completed_snapshot:nextSnapshot,worker_id:input.workerId,finished_at:new Date()}},{session});
  if(m.matchedCount!==1)throw changed();
  return {status:'completed',editorVersion:placed?2:1,editorProject:nextSnapshot,reviewStatus:input.review.status};
 },tx);}finally{await session.endSession();}
}

/** Optional lost-result recovery. Never upgrades worker authority or trusts
 * a marker alone. A fresh worker must claim the current admitted revision. */
export async function recoverPendingHookCompletion(client:MongoClient,db:Db,input:{userId:string;clipId:string;jobId:string;workerId:string}):Promise<PendingHookCompletion>{
 const session=client.startSession();try{return await session.withTransaction(async()=>{
  const marker=await db.collection<any>(collection).findOne({_id:key(input.userId,input.clipId),user_id:input.userId,state:'completed',job_id:input.jobId,worker_id:input.workerId},{session});
  if(!marker)return {status:'not-pending'};
  const expected=marker.completed_snapshot;
  if(!expected||![1,2].includes(expected.version))throw changed();
  const job=await db.collection('render_jobs').findOne({id:input.jobId,clip_id:input.clipId,user_id:input.userId,worker_id:input.workerId,status:'processing',admission_version:1,render_version:1,editor_version:expected.version},{session});
  if(!job)throw lost();
  const clip=await db.collection('clips').findOne({id:input.clipId,user_id:input.userId,render_version:1,editor_version:expected.version,editor_project_sync_pending:null},{session});
  const project=await db.collection('editor_projects').findOne({id:marker.project_id,clip_id:input.clipId,user_id:input.userId,version:expected.version},{session});
  if(!clip||pendingHookClipIdentity(clip)!==marker.clip_identity||!project||!equal(editorRenderSnapshot(project),expected)||!equal(job.editor_project_snapshot,expected))throw changed();
  return {status:'recovered',editorVersion:expected.version,editorProject:expected,reviewStatus:marker.review_status};
 },tx);}finally{await session.endSession();}
}
