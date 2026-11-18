import type {Db,MongoClient} from 'mongodb';
import {AppError} from '../../types/index.js';

export interface RenderLeaseIdentity {jobId:string;clipId:string;userId:string;workerId:string;renderVersion?:number;editorVersion?:number}
export interface RenderLeaseOutcome {job:Record<string,unknown>;clip:Record<string,unknown>;preserveSupersedingClip?:boolean}
/** Publish a terminal/retry outcome only while this exact worker still owns
 * the processing job. Mongo transaction conflicts re-evaluate that ownership.
 * No nontransactional fallback: a standalone/unavailable DB leaves the lease
 * for operational recovery instead of publishing half a result.
 */
export async function commitFencedRenderOutcome(client:MongoClient,db:Db,identity:RenderLeaseIdentity,outcome:RenderLeaseOutcome):Promise<void>{
 if(![identity.jobId,identity.clipId,identity.userId,identity.workerId].every(v=>typeof v==='string'&&v.trim()))throw new AppError('Render lease identity is required.',409,'FENCING_TOKEN_MISMATCH');
 const session=client.startSession();
 try{
  await session.withTransaction(async()=>{
   const job=await db.collection('render_jobs').updateOne({id:identity.jobId,clip_id:identity.clipId,user_id:identity.userId,worker_id:identity.workerId,status:'processing'},{$set:outcome.job},{session});
   if(job.matchedCount!==1)throw new AppError('Render lease was expired or claimed by another worker.',409,'FENCING_TOKEN_MISMATCH');
   const current=await db.collection('clips').findOne({id:identity.clipId,user_id:identity.userId},{session});
   if(!current)throw new AppError('Clip no longer exists for this render owner.',404,'CLIP_NOT_FOUND');
   const superseded=(identity.renderVersion!==undefined&&Number(current.render_version||1)!==identity.renderVersion)||(identity.editorVersion!==undefined&&Number(current.editor_version||1)!==identity.editorVersion);
   if(superseded){
    if(outcome.preserveSupersedingClip&&outcome.job.status!=='completed'){
     await db.collection('render_jobs').updateOne({id:identity.jobId,clip_id:identity.clipId,user_id:identity.userId},{$set:{status:'failed',stage:'failed',worker_id:null,locked_at:null,next_retry_at:null,error_code:'RENDER_INPUT_CHANGED',error_message:'Clip inputs changed during rendering. Start a fresh render.',updated_at:new Date()}},{session});
     return;
    }
    throw new AppError('Clip inputs changed during rendering. Start a fresh render.',409,'RENDER_INPUT_CHANGED');
   }
   const clip=await db.collection('clips').updateOne({id:identity.clipId,user_id:identity.userId},{$set:outcome.clip},{session});
   if(clip.matchedCount!==1)throw new AppError('Clip no longer exists for this render owner.',404,'CLIP_NOT_FOUND');
  },{readPreference:'primary',readConcern:{level:'snapshot'},writeConcern:{w:'majority'},maxCommitTimeMS:10_000});
 }finally{await session.endSession();}
}
