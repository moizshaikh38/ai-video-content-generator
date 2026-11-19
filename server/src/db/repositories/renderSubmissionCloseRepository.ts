import type {Db, MongoClient} from 'mongodb';
import {getMongoClient, getMongoDb} from '../mongoClient.js';
import {AppError} from '../../types/index.js';
import {findRenderSubmission, renderSubmissionKey, type RenderSubmissionIntent} from './renderSubmissionRepository.js';

/** Close only an unadmitted intent. This never cancels, retries or changes an
 * admitted job. The same unique owner/key identity contends with admission, so
 * a delayed request cannot commit after a successful close acknowledgment.
 */
export async function closeUnadmittedRenderSubmission(client:MongoClient,db:Db,userId:string,clipId:string,intent:RenderSubmissionIntent){
  const session=client.startSession();
  const closed={cancelled:true as const,submissionId:intent.id};
  const resolveExisting=async(activeSession?:typeof session)=>{
    const record=await db.collection<any>('render_submissions').findOne({_id:renderSubmissionKey(userId,intent.id),user_id:userId},{session:activeSession});
    if(!record)return null;
    if(record.clip_id!==clipId||record.fingerprint!==intent.fingerprint)throw new AppError('This saved request belongs to different render inputs.',409,'RENDER_SUBMISSION_CONFLICT');
    if(record.version===1&&record.state==='cancelled')return closed;
    const receipt=await findRenderSubmission(db,userId,clipId,intent,activeSession);
    return {cancelled:false as const,receipt};
  };
  try{
    return await session.withTransaction(async()=>{
      const existing=await resolveExisting(session);if(existing)return existing;
      const clip=await db.collection('clips').updateOne({id:clipId,user_id:userId},{$inc:{render_submission_close_serial:1}},{session});
      if(clip.matchedCount!==1)throw new AppError('Clip not found.',404,'CLIP_NOT_FOUND');
      const now=new Date();
      await db.collection<any>('render_submissions').insertOne({_id:renderSubmissionKey(userId,intent.id),id:intent.id,user_id:userId,
        clip_id:clipId,version:1,state:'cancelled',fingerprint:intent.fingerprint,created_at:now,updated_at:now},{session});
      return closed;
    },{readPreference:'primary',readConcern:{level:'snapshot'},writeConcern:{w:'majority'},maxCommitTimeMS:10_000});
  }catch(error){
    // Concurrent admission or uncertain commit can only resolve this exact
    // identity. No guessed close and no unkeyed replacement are permitted.
    const existing=await resolveExisting();if(existing)return existing;throw error;
  }finally{await session.endSession();}
}
export async function closeSavedRenderSubmission(userId:string,clipId:string,intent:RenderSubmissionIntent){
  return closeUnadmittedRenderSubmission(await getMongoClient(),await getMongoDb(),userId,clipId,intent);
}
