import {ensureRenderQuotaFence,type RenderQuotaPolicy} from './renderQuotaRepository.js';
import crypto from 'node:crypto';
import type {Db,MongoClient,ClientSession} from 'mongodb';
import {AppError} from '../../types/index.js';
import {validateRecord} from '../schemaValidation.js';
import {editorRenderSnapshot} from '../../shared/editorRenderSnapshot.js';
import {admitRenderJobInTransaction} from './renderAdmissionRepository.js';

function stable(value:any):any {
 if(value instanceof Date)return value.toISOString();
 if(Array.isArray(value))return value.map(stable);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)]));
 return value;
}
function digest(value:any){return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');}
export function producerPlanIdentity(plan:any){return digest({id:plan.id,user_id:plan.user_id,clip_id:plan.clip_id,operations:plan.operations,mode:plan.mode,target_platform:plan.target_platform});}
function clipIdentity(clip:any){return digest(Object.fromEntries(['id','user_id','project_id','render_version','editor_version','start_seconds','end_seconds','trim_start_offset','trim_end_offset','aspect_ratio','crop_config','caption_enabled','caption_style','caption_position','caption_config','overlay_config','volume','source_storage_path','selection_source_receipt'].map(k=>[k,clip[k]])));}
const changed=()=>new AppError('Producer plan, clip or editor changed before Apply. Reload and review before retrying.',409,'PRODUCER_APPLY_CONFLICT');
const revision=(v:any)=>v==null?1:v;

/** The plan ID is the immutable Apply key. Never re-apply operations on replay. */
export async function findProducerApply(db:Db,userId:string,plan:any,session?:ClientSession){
 const row=await db.collection('producer_plans').findOne({id:plan.id,user_id:userId},{session});
 if(!row)throw new AppError('Producer plan not found.',404,'PLAN_NOT_FOUND');
 const receipt=row.apply_receipt;
 if(!receipt)return null;
 if(receipt.version!==1||receipt.plan_identity!==producerPlanIdentity(plan)||receipt.plan_identity!==producerPlanIdentity(row))throw changed();
 const clip=await db.collection('clips').findOne({id:plan.clip_id,user_id:userId},{session});
 if(!clip)throw new AppError('Clip not found.',404,'CLIP_NOT_FOUND');
 const job=receipt.job;
 if(!job?.id||job.user_id!==userId||job.clip_id!==clip.id||job.admission_version!==1||!Number.isSafeInteger(job.render_version)||!Number.isSafeInteger(job.editor_version)||receipt.clip?.id!==clip.id||receipt.clip?.user_id!==userId||receipt.clip?.render_version!==job.render_version||receipt.clip?.editor_version!==job.editor_version)throw new AppError('Producer Apply receipt cannot be verified. No new render was started.',503,'PRODUCER_APPLY_UNVERIFIED');
 return {clip,plan:row,renderJob:job,replayed:true};
}
export interface ProducerApplyInput {quotaPolicy?:RenderQuotaPolicy;userId:string;plan:any;clip:any;expectedEditor:any;editor:any;clipUpdates:Record<string,unknown>}
/** One atomic boundary: configuration, editor, plan receipt and V1 job. No
 * background worker is invoked from this transaction. Live source and plan
 * preflight remain the service's responsibility, as with Quick/Studio. */
export async function commitProducerApply(client:MongoClient,db:Db,input:ProducerApplyInput){
 await ensureRenderQuotaFence(db,input.userId);
 const session=client.startSession();
 try{return await session.withTransaction(async()=>{
  const prior=await findProducerApply(db,input.userId,input.plan,session);if(prior)return prior;
  const plan=await db.collection('producer_plans').findOne({id:input.plan.id,user_id:input.userId},{session});
  if(!plan||producerPlanIdentity(plan)!==producerPlanIdentity(input.plan)||plan.status==='applied')throw changed();
  const clip=await db.collection('clips').findOne({id:input.clip.id,user_id:input.userId},{session});
  if(!clip)throw new AppError('Clip not found.',404,'CLIP_NOT_FOUND');
  if(clipIdentity(clip)!==clipIdentity(input.clip)||clip.editor_project_sync_pending)throw changed();
  const editor=await db.collection('editor_projects').findOne({clip_id:clip.id,user_id:input.userId},{session});
  if(JSON.stringify(editorRenderSnapshot(editor))!==JSON.stringify(editorRenderSnapshot(input.expectedEditor)))throw changed();
  const renderVersion=revision(clip.render_version),editorVersion=revision(clip.editor_version)+1;
  if(!Number.isSafeInteger(editorVersion)||editorVersion<2||editorVersion>=Number.MAX_SAFE_INTEGER)throw changed();
  const staged=input.editor;
  if(staged?.clip_id!==clip.id||staged?.user_id!==input.userId||!staged.id||staged.version!==(editor?editor.version+1:1))throw changed();
  validateRecord('editor_projects',staged);validateRecord('clips',input.clipUpdates);
  const now=new Date();
  if(editor){
   const {_id,...updates}=staged;
   const saved=await db.collection('editor_projects').replaceOne({id:editor.id,clip_id:clip.id,user_id:input.userId,version:editor.version},updates,{session});if(saved.matchedCount!==1)throw changed();
  }else await db.collection('editor_projects').insertOne({...staged},{session});
  const updated=await db.collection('clips').updateOne({id:clip.id,user_id:input.userId},{$set:{...input.clipUpdates,editor_version:editorVersion,updated_at:now}},{session});if(updated.matchedCount!==1)throw changed();
  const admitted=await admitRenderJobInTransaction(db,session,{clipId:clip.id,userId:input.userId,expectedRenderVersion:renderVersion,expectedEditorVersion:editorVersion,expectedEditorProject:editorRenderSnapshot(staged),quotaPolicy:input.quotaPolicy});
  const savedClip=await db.collection('clips').findOne({id:clip.id,user_id:input.userId},{session});
  const receipt={version:1,plan_identity:producerPlanIdentity(plan),job:admitted.job,clip:savedClip};
  const savedPlan=await db.collection('producer_plans').findOneAndUpdate({id:plan.id,user_id:input.userId},{$set:{status:'applied',applied_at:now,updated_at:now,apply_receipt:receipt}},{session,returnDocument:'after'});
  if(!savedPlan)throw changed();
  return {clip:savedClip,plan:savedPlan,renderJob:admitted.job,replayed:false};
 },{readPreference:'primary',readConcern:{level:'snapshot'},writeConcern:{w:'majority'},maxCommitTimeMS:10000});
 }catch(error){const prior=await findProducerApply(db,input.userId,input.plan);if(prior)return prior;throw error;}
 finally{await session.endSession();}
}
