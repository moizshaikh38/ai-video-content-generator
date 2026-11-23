import type {Db,MongoClient} from 'mongodb';
import {creationDigest} from './candidateCreationRepository.js';
import {automaticSelectedInput} from '../../shared/autopilotSelectedInput.js';
import {editorRenderSnapshot} from '../../shared/editorRenderSnapshot.js';
import {validateRecord} from '../schemaValidation.js';
import {ensureRenderQuotaFence,type RenderQuotaPolicy} from './renderQuotaRepository.js';
import {admitRenderJobInTransaction} from './renderAdmissionRepository.js';
import {AppError} from '../../types/index.js';
const changed=()=>new AppError('Automatic hook inputs or run ownership changed. Review this run before retrying.',409,'AUTOPILOT_HOOK_ADMISSION_CHANGED');
export async function readAutomaticHookAdmission(db:Db,userId:string,runId:string,session?:any){
 const one=(name:string,filter:any)=>db.collection(name).findOne({...filter,user_id:userId},{session});
 const run=await one('autopilot_runs',{id:runId});if(!run)throw changed();
 const clip=await one('clips',{id:run.clip_id}),editor=await one('editor_projects',{clip_id:run.clip_id}),candidate=await one('hook_candidates',{id:run.selected_hook_candidate_id}),hookSession=await one('hook_lab_sessions',{id:run.hook_session_id}),project=await one('projects',{id:run.project_id}),transcript=await one('transcripts',{project_id:run.project_id});
 const producerJob=await one('render_jobs',{id:run.steps?.find((s:any)=>s.step==='PRODUCER')?.artifacts?.render_job_id});
 return {run,clip,editor,candidate,session:hookSession,project,transcript,producerJob};
}
/** A new automatic selected-overlay path only. Apply and final render admission
 * share one transaction and one durable run receipt, so a crash cannot leave an
 * applied overlay without a recoverable render job. Explicit approval stays later. */
export async function commitAutomaticHookAdmission(client:MongoClient,db:Db,input:{userId:string;runId:string;lockToken:string;expected:any;updates:any;quotaPolicy:RenderQuotaPolicy}){
 validateRecord('editor_projects',input.updates);await ensureRenderQuotaFence(db,input.userId);
 const tx=client.startSession();try{return await tx.withTransaction(async()=>{
  const current=await readAutomaticHookAdmission(db,input.userId,input.runId,tx),run=current.run!;
  if(run.execution_lock!==input.lockToken||run.status!=='RUNNING'||!run.execution_lock_expires_at||new Date(run.execution_lock_expires_at).getTime()<=Date.now())throw changed();
  if(run.automatic_hook_render?.version===1){const saved=run.automatic_hook_render;const job=await db.collection('render_jobs').findOne({id:saved.job_id,clip_id:run.clip_id,user_id:input.userId},{session:tx});if(!job||job.render_version!==saved.render_version||job.editor_version!==saved.editor_version)throw changed();return {receipt:saved,job,replayed:true};}
  const stable=(value:any)=>{const copy=structuredClone(value);for(const key of ['execution_lock_expires_at','updated_at'])delete copy.run[key];return creationDigest(copy);};
  if(stable(current)!==stable(input.expected))throw changed();
  const proof=automaticSelectedInput(current),editor=current.editor!,candidate=current.candidate!,clip=current.clip!;
  if(candidate.applied||candidate.editor_apply_receipt?.state==='applied'||input.updates.version!==editor.version+1||clip.editor_project_sync_pending)throw changed();
  const {_id,...updates}=input.updates;
  const saved=await db.collection('editor_projects').findOneAndUpdate({id:editor.id,user_id:input.userId,version:editor.version},{$set:updates},{session:tx,returnDocument:'after'});if(!saved)throw changed();
  await db.collection('clips').updateOne({id:clip.id,user_id:input.userId},{$set:{editor_version:clip.editor_version+1}},{session:tx});
  const {hookCandidateContentIdentity}=await import('../../shared/hookAppliedInput.js');const {_id:priorId,...before}=editor;
  const apply={version:1,state:'applied',automatic_run_id:run.id,editor_id:editor.id,before,after:editorRenderSnapshot(saved),after_title:saved.title,candidate_content_identity:hookCandidateContentIdentity(candidate),applied_input_receipt:proof.current_input};
  await db.collection('hook_candidates').updateOne({id:candidate.id,user_id:input.userId},{$set:{applied:true,status:'APPLIED',editor_apply_receipt:apply,updated_at:new Date()}},{session:tx});
  await db.collection('hook_lab_sessions').updateOne({id:current.session!.id,user_id:input.userId},{$set:{status:'APPLIED',updated_at:new Date()}},{session:tx});
  for(const[name,row]of[['projects',current.project],['transcripts',current.transcript],['render_jobs',current.producerJob]]as const){const f=await db.collection(name).updateOne({_id:row!._id,user_id:input.userId},{$inc:{automatic_hook_fence:1}},{session:tx});if(f.matchedCount!==1)throw changed();}
  const admission=await admitRenderJobInTransaction(db,tx,{clipId:clip.id,userId:input.userId,expectedRenderVersion:clip.render_version,expectedEditorVersion:clip.editor_version+1,expectedEditorProject:editorRenderSnapshot(saved),quotaPolicy:input.quotaPolicy});
  const receipt={version:1,run_id:run.id,user_id:input.userId,clip_id:clip.id,candidate_id:candidate.id,job_id:admission.job.id,render_version:admission.renderVersion,editor_version:clip.editor_version+1,editor:editorRenderSnapshot(saved),selected_input:proof,created_at:new Date()};
  const r=await db.collection('autopilot_runs').updateOne({id:run.id,user_id:input.userId,execution_lock:input.lockToken,status:'RUNNING'},{$set:{automatic_hook_render:receipt,automatic_continuation:{version:1,stage:'HOOK_RENDER_WAIT'},updated_at:new Date()}},{session:tx});if(r.matchedCount!==1)throw changed();
  return {receipt,job:admission.job,replayed:false};
 },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'}});}finally{await tx.endSession();}
}

/** Final readiness and its run state commit contend with every proof writer.
 * External source/output HEAD checks remain service preflight, not Mongo atomic. */
export async function commitAutomaticReady(client:MongoClient,db:Db,input:{userId:string;runId:string;lockToken:string;steps:any[]}){
 const {readAutopilotApproval}=await import('./autopilotApprovalRepository.js');const {provenOutput}=await import('../../shared/autopilotHookOutput.js');
 const tx=client.startSession();try{return await tx.withTransaction(async()=>{
  const current=await readAutopilotApproval(db,input.userId,input.runId,undefined,tx),run=current.run;
  if(!run||run.status!=='RUNNING'||run.execution_lock!==input.lockToken||!run.execution_lock_expires_at||new Date(run.execution_lock_expires_at).getTime()<=Date.now()||run.automatic_continuation?.stage!=='HOOK_RENDER_READY')throw changed();
  if(current.job?.id!==run.automatic_hook_render?.job_id)throw changed();
  provenOutput({...current,run:{...run,status:'COMPLETED',execution_lock:null}});
  if(!current.pack||current.pack.clip_id!==run.clip_id||current.pack.user_id!==input.userId)throw changed();
  for(const[name,row]of[['clips',current.clip],['editor_projects',current.editor],['hook_candidates',current.candidate],['hook_lab_sessions',current.session],['projects',current.project],['transcripts',current.transcript],['render_jobs',current.job],['content_packs',current.pack],['thumbnail_concepts',current.thumb],['thumbnail_lab_sessions',current.thumbSession],...current.items.map(row=>['content_pack_items',row])]as any[]){if(!row)continue;const f=await db.collection(name).updateOne({_id:row._id,user_id:input.userId},{$inc:{automatic_ready_fence:1}},{session:tx});if(f.matchedCount!==1)throw changed();}
  const saved=await db.collection('autopilot_runs').findOneAndUpdate({id:run.id,user_id:input.userId,execution_lock:input.lockToken,status:'RUNNING'},{$set:{status:'COMPLETED',current_step:'APPROVAL',steps:input.steps,updated_at:new Date()},$unset:{automatic_continuation:''}},{session:tx,returnDocument:'after'});if(!saved)throw changed();return saved;
 },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'}});}finally{await tx.endSession();}
}
