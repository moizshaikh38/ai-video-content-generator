import crypto from 'node:crypto';
import {automaticOneExportEnabled} from '../../services/runtimePolicy.js';
import type{Db,ClientSession}from'mongodb';import{AppError}from'../../types/index.js';
export interface ClipSelectionOwner{jobId:string;workerId:string;context:string}
/** Shares the candidate-publication transaction. A worker response is not the
 * completion receipt; this exact job/worker write commits with candidate rows. */
export async function publishClipSelectionCompletion(db:Db,session:ClientSession,userId:string,projectId:string,owner:ClipSelectionOwner,candidateIds:string[],freshCandidateIds:string[]=candidateIds){
 const job=await db.collection('clip_selection_jobs').findOne({id:owner.jobId,user_id:userId,project_id:projectId,status:'processing',worker_id:owner.workerId,context:owner.context},{session});
 const result=await db.collection('clip_selection_jobs').updateOne({id:owner.jobId,user_id:userId,project_id:projectId,status:'processing',worker_id:owner.workerId,context:owner.context},{$set:{status:'completed',candidate_ids:candidateIds,publication_receipt:{version:1,job_id:owner.jobId,worker_id:owner.workerId,context:owner.context,candidate_ids:candidateIds},updated_at:new Date(),finished_at:new Date()}},{session});
 if(job?.automatic_export&&automaticOneExportEnabled()){await db.collection('automatic_export_outbox').updateOne({_id:owner.jobId as any},{$setOnInsert:{id:crypto.randomUUID(),version:1,user_id:userId,project_id:projectId,selection_job_id:owner.jobId,context:owner.context,source_url:job.source_url,source_receipt:job.source_receipt,candidate_ids:freshCandidateIds,settings:job.automatic_export,attempt_id:job.automatic_export_attempt_id,creation_id:crypto.randomUUID(),status:'pending',created_at:new Date(),updated_at:new Date()}},{upsert:true,session});}
 if(result.matchedCount!==1)throw new AppError('Saved selection ownership changed before publication.',409,'CLIP_SELECTION_OWNER_CHANGED');
}
export async function hasClipSelectionCompletion(db:Db,userId:string,projectId:string,owner:ClipSelectionOwner):Promise<boolean>{
 const job=await db.collection('clip_selection_jobs').findOne({id:owner.jobId,user_id:userId,project_id:projectId,worker_id:owner.workerId,status:'completed',context:owner.context});const receipt=job?.publication_receipt;
 return receipt?.version===1&&receipt.job_id===owner.jobId&&receipt.worker_id===owner.workerId&&receipt.context===owner.context&&JSON.stringify(receipt.candidate_ids)===JSON.stringify(job?.candidate_ids);
}
