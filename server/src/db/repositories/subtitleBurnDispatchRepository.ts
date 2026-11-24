import {subtitleBurnMaxActive} from '../../services/runtimePolicy.js';
import crypto from 'node:crypto';
import type {MongoClient,Db} from 'mongodb';
import {AppError} from '../../types/index.js';
import {subtitleBurnIdentity} from '../../shared/subtitleBurnIdentity.js';
import {DELETION_MARKER_FIELD} from '../../services/deletionAdmissionService.js';
const jobs='subtitle_burn_jobs';
/** Opt-in durable admission. Project token and immutable execution snapshot commit
 * together. No retry/reclaim of claimed work without separate stop evidence. */
export async function enqueueSubtitleBurn(client:MongoClient,db:Db,input:{userId:string;projectId:string;project:any}){
 if(input.project.id!==input.projectId||input.project.user_id!==input.userId)throw new AppError('Subtitle project identity does not match admission.',409,'SUBTITLE_EXPORT_CHANGED');
 const identity=subtitleBurnIdentity(input.project),id=crypto.randomUUID(),runToken=crypto.randomUUID();
 const session=client.startSession();
 try{return await session.withTransaction(async()=>{
  const filter={id:input.projectId,user_id:input.userId,[DELETION_MARKER_FIELD]:{$exists:false}};
  const project=await db.collection('projects').findOne(filter,{session});
  if(!project||subtitleBurnIdentity(project)!==identity)throw new AppError('Subtitle settings changed before queue admission.',409,'SUBTITLE_EXPORT_CHANGED');
  if(project.subtitle_export_run_token||project.subtitle_export_status==='rendering')throw new AppError('Subtitle rendering is already active.',409,'SUBTITLE_EXPORT_CHANGED');
  const now=new Date();
  const updated=await db.collection('projects').updateOne({...filter,subtitle_export_run_token:null,subtitle_export_status:{$ne:'rendering'}},{$set:{subtitle_export_run_token:runToken,subtitle_export_status:'rendering',subtitle_export_progress:0,subtitle_export_stage:'queued',subtitle_export_error:null,updated_at:now}},{session});
  if(updated.matchedCount!==1)throw new AppError('Subtitle export changed before queue admission.',409,'SUBTITLE_EXPORT_CHANGED');
  await db.collection(jobs).insertOne({id,user_id:input.userId,project_id:input.projectId,version:1,status:'queued',run_token:runToken,identity,project_snapshot:project,worker_id:null,created_at:now,updated_at:now},{session});
  return {id,runToken};
 },{readPreference:'primary',readConcern:{level:'snapshot'},writeConcern:{w:'majority'},timeoutMS:10000});}finally{await session.endSession();}
}
export async function claimSubtitleBurn(db:Db,workerId:string){
 return db.collection(jobs).findOneAndUpdate({version:1,status:'queued',worker_id:null},{$set:{status:'processing',worker_id:workerId,claimed_at:new Date(),updated_at:new Date()}},{sort:{created_at:1,_id:1},returnDocument:'after',writeConcern:{w:'majority'}});
}
/** Shared count admission serializes competing workers on one contention row.
 * It does not expire unknown work or infer memory/CPU/scratch capacity. */
export async function claimCapacityBoundSubtitleBurn(client:MongoClient,db:Db,workerId:string){
 const maximum=subtitleBurnMaxActive();
 const pool=db.collection('subtitle_burn_capacity');
 try{await pool.updateOne({_id:'v1' as any},{$setOnInsert:{maximum,serial:0}},{upsert:true,writeConcern:{w:'majority'}});}catch(error:any){if(error?.code!==11000)throw error;}
 const session=client.startSession();
 try{return await session.withTransaction(async()=>{
  const fence=await pool.updateOne({_id:'v1' as any,maximum},{$inc:{serial:1}},{session});
  if(fence.matchedCount!==1)throw new AppError('Subtitle worker capacity policy differs. Admission stopped.',503,'SUBTITLE_CAPACITY_POLICY_MISMATCH');
  const active=await db.collection(jobs).countDocuments({version:1,status:{$in:['processing','executing','review_required']}},{session});
  if(active>=maximum)return null;
  return db.collection(jobs).findOneAndUpdate({version:1,status:'queued',worker_id:null},{$set:{status:'processing',worker_id:workerId,claimed_at:new Date(),updated_at:new Date()}},{sort:{created_at:1,_id:1},returnDocument:'after',session});
 },{readPreference:'primary',readConcern:{level:'snapshot'},writeConcern:{w:'majority'},timeoutMS:10000});}finally{await session.endSession();}
}

/** Claim is permanent until this exact worker records a terminal outcome. */
export async function executeClaimedSubtitleBurn(db:Db,job:any,execute:(job:any)=>Promise<void>){
 const filter={id:job.id,status:'processing',worker_id:job.worker_id,run_token:job.run_token};
 // A caller cannot execute a fabricated or superseded claim.
 const owned=await db.collection(jobs).findOneAndUpdate(filter,{$set:{status:'executing',updated_at:new Date()}},{returnDocument:'after',writeConcern:{w:'majority'}});if(!owned)return false;
 filter.status='executing';
 const projectFilter={id:owned.project_id,user_id:owned.user_id,subtitle_export_run_token:owned.run_token};
 const project=await db.collection('projects').findOne(projectFilter);
 if(!project||project[DELETION_MARKER_FIELD]||subtitleBurnIdentity(project)!==owned.identity||owned.project_snapshot?.id!==owned.project_id||owned.project_snapshot?.user_id!==owned.user_id||subtitleBurnIdentity(owned.project_snapshot)!==owned.identity){
  await db.collection('projects').updateOne(projectFilter,{$set:{subtitle_export_run_token:null,subtitle_export_status:'failed',subtitle_export_stage:'settings_changed',subtitle_export_error:'Queued subtitle settings changed before execution.'}});
  await db.collection(jobs).updateOne(filter,{$set:{status:'cancelled',finished_at:new Date(),updated_at:new Date()}});return true;
 }
 try{await execute(owned);}catch{
  // Unknown execution/child-stop outcome is NOT permission to retry or clear
  // the project token. Keep claimed work blocked for explicit review.
  await db.collection('projects').updateOne(projectFilter,{$set:{subtitle_export_status:'failed',subtitle_export_stage:'stop_unverified',subtitle_export_error:'Rendering outcome could not be verified. Retry is blocked pending worker review.',updated_at:new Date()}});
  await db.collection(jobs).updateOne(filter,{$set:{status:'review_required',updated_at:new Date()}});return true;
 }
 const after=await db.collection('projects').findOne({id:owned.project_id,user_id:owned.user_id});
 const status=after?.subtitle_export_run_token===owned.run_token?'review_required':after?.subtitle_export_status==='ready'&&after.subtitle_export_identity===owned.identity?'completed':'failed';
 await db.collection(jobs).updateOne(filter,{$set:{status,finished_at:new Date(),updated_at:new Date()}});return true;
}
