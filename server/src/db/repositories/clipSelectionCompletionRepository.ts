import type{Db,ClientSession}from'mongodb';import{AppError}from'../../types/index.js';
export interface ClipSelectionOwner{jobId:string;workerId:string;context:string}
/** Shares the candidate-publication transaction. A worker response is not the
 * completion receipt; this exact job/worker write commits with candidate rows. */
export async function publishClipSelectionCompletion(db:Db,session:ClientSession,userId:string,projectId:string,owner:ClipSelectionOwner,candidateIds:string[]){
 const result=await db.collection('clip_selection_jobs').updateOne({id:owner.jobId,user_id:userId,project_id:projectId,status:'processing',worker_id:owner.workerId,context:owner.context},{$set:{status:'completed',candidate_ids:candidateIds,publication_receipt:{version:1,job_id:owner.jobId,worker_id:owner.workerId,context:owner.context,candidate_ids:candidateIds},updated_at:new Date(),finished_at:new Date()}},{session});
 if(result.matchedCount!==1)throw new AppError('Saved selection ownership changed before publication.',409,'CLIP_SELECTION_OWNER_CHANGED');
}
export async function hasClipSelectionCompletion(db:Db,userId:string,projectId:string,owner:ClipSelectionOwner):Promise<boolean>{
 const job=await db.collection('clip_selection_jobs').findOne({id:owner.jobId,user_id:userId,project_id:projectId,worker_id:owner.workerId,status:'completed',context:owner.context});const receipt=job?.publication_receipt;
 return receipt?.version===1&&receipt.job_id===owner.jobId&&receipt.worker_id===owner.workerId&&receipt.context===owner.context&&JSON.stringify(receipt.candidate_ids)===JSON.stringify(job?.candidate_ids);
}
