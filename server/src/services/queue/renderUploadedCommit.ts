import type {Db,MongoClient} from 'mongodb';
import {commitFencedRenderOutcome,type RenderLeaseIdentity,type RenderLeaseOutcome} from './renderLeaseCommit.js';
import {deleteObject,renderAttemptObjectKey} from '../objectStorageService.js';
import {logger} from '../../utils/logger.js';

/** Remove only this worker's immutable attempt after a definitive aborted
 * publication. Unknown commit results keep bytes for reconciliation. Never
 * remove an object referenced by the current clip or a completed job. */
export async function commitUploadedRenderOutcome(client:MongoClient,db:Db,identity:RenderLeaseIdentity,outcome:RenderLeaseOutcome,attempt:{projectId:string;attemptId:string;objectKey:string;validateSource?:()=>Promise<void>}):Promise<void>{
 const key=renderAttemptObjectKey(identity.userId,attempt.projectId,identity.clipId,identity.renderVersion!,attempt.attemptId);
 if(key!==attempt.objectKey||outcome.clip.output_storage_path!==key)throw new Error('Uploaded render attempt identity does not match publication.');
 let validatingSource=true;
 try{await attempt.validateSource?.();validatingSource=false;await commitFencedRenderOutcome(client,db,identity,outcome);}
 catch(error:any){
  if(['FENCING_TOKEN_MISMATCH','CLIP_NOT_FOUND','RENDER_INPUT_CHANGED'].includes(error?.code)||(validatingSource&&error?.code==='TRANSCRIPT_SOURCE_REVIEW_REQUIRED')){
   try{
    const clip=await db.collection('clips').findOne({id:identity.clipId,user_id:identity.userId});
    const job=await db.collection('render_jobs').findOne({id:identity.jobId,clip_id:identity.clipId,user_id:identity.userId});
    if(clip?.output_storage_path!==key&&clip?.output_object_key!==key&&job?.status!=='completed')await deleteObject('clips',key);
   }catch(cleanupError){logger.error('Unpublished render attempt cleanup remains unresolved',{clipId:identity.clipId,jobId:identity.jobId,objectKey:key,error:cleanupError});}
  }
  throw error;
 }
}
