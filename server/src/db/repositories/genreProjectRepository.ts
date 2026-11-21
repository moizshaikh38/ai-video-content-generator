import {AppError} from '../../types/index.js';
import {validateRecord} from '../schemaValidation.js';
import {getMongoDb} from '../mongoClient.js';
/** Preserve a preference edit made while optional semantic review was running.
 * Source movement is never treated as a successful project enrichment. */
export async function persistGenreProjectUpdate(userId:string,projectId:string,sourceUrl:string,expectedPreferences:unknown,payload:Record<string,unknown>):Promise<void>{
 const updatedAt=payload.updated_at===undefined?new Date():new Date(payload.updated_at as any);
 if(Number.isNaN(updatedAt.getTime()))throw new AppError('Invalid timestamp.',400,'INVALID_TIMESTAMP');
 const normalized:Record<string,unknown>={...payload,updated_at:updatedAt};validateRecord('projects',normalized);
 const db=await getMongoDb(),projects=db.collection('projects');
 const source={id:projectId,user_id:userId,source_url:sourceUrl};
 const result=await projects.updateOne({...source,clip_preferences:expectedPreferences??null},{$set:normalized});
 if(result.matchedCount)return;
 // A changed preference does not justify undoing the user's edit or failing a
 // valid transcription. Save only source-bound processing/evidence metadata.
 const {clip_preferences:ignored,...withoutPreferences}=normalized;
 const preserved=await projects.updateOne(source,{$set:withoutPreferences});
 if(!preserved.matchedCount)throw new AppError('Project source changed before genre evidence could be saved.',409,'TRANSCRIPT_SOURCE_REVIEW_REQUIRED');
}
