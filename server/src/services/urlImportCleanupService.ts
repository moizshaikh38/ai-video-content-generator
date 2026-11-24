import {getMongoDb} from '../db/mongoClient.js';
import {deleteObject} from './objectStorageService.js';
import {UploadLifecycleService} from './uploadLifecycleService.js';
import {isValidUUID} from '../types/index.js';
import {logger} from '../utils/logger.js';

/** Server-owned upload attempt, recorded before PUT. This is not a presigned
 * grant and never authorizes deleting an older source or a whole prefix. */
export async function recordUrlImportAttempt(userId:string,projectId:string,key:string,fileName:string,bytes:number,contentType:string){
 if(!isValidUUID(userId)||!isValidUUID(projectId))throw Error('URL import attempt owner invalid.');
 if(!key.startsWith(`users/${userId}/projects/${projectId}/source/`))throw Error('URL import attempt owner mismatch.');
 const attempt=await UploadLifecycleService.recordAttempt({userId,projectId,objectKey:key,fileName,fileSize:bytes,contentType,expiresAt:new Date()});
 await (await getMongoDb()).collection('project_upload_attempts').updateOne({id:attempt.id,user_id:userId},{$set:{origin:'url_import_server'}});
 return attempt;
}

/** A quota rejection is thrown before project insert, not an unknown commit.
 * Any existing parent or reference vetoes deletion. Unknown outcomes retain the
 * recorded attempt for the existing expiry/grace-aware discovery, not a claim
 * that an automatic cleanup worker exists. Original ingestion error wins. */
export async function finishUrlImportAttempt(attempt:Awaited<ReturnType<typeof recordUrlImportAttempt>>,published:boolean,error?:unknown){
 const db=await getMongoDb(),filter={id:attempt.id,user_id:attempt.user_id,object_key:attempt.object_key};
 if(published){await db.collection('project_upload_attempts').updateOne(filter,{$set:{status:'confirmed',confirmed_at:new Date(),updated_at:new Date()}});return;}
 const recorded=await db.collection('project_upload_attempts').findOne(filter);
 if(!recorded||recorded.origin!=='url_import_server'||recorded.status!=='pending'||recorded.project_id!==attempt.project_id||recorded.expires_at>new Date())return;
 const definitive=(error as any)?.code==='MONTHLY_PROJECT_LIMIT_EXCEEDED';
 let state='review_required';
 if(definitive){
  const key=attempt.object_key,owner=attempt.user_id;
  const parent=await db.collection('projects').findOne({id:attempt.project_id});
  let referenced=Boolean(parent);
  if(await db.collection('projects').findOne({$or:[{source_url:key},{source_storage_path:key},{source_object_key:key},{pending_upload_key:key}]}))referenced=true;
  if(await db.collection('project_upload_attempts').findOne({id:{$ne:attempt.id},object_key:key,$or:[{status:'confirmed'},{status:'pending'},{expires_at:{$gt:new Date()}}]}))referenced=true;
  const checks:Array<[string,Record<string,unknown>]>=[
   ['transcripts',{$or:[{source_url:key},{source_storage_path:key}]}],
   ['clips',{$or:[{source_storage_path:key},{source_object_key:key}]}],
   ['media_assets',{storage_path:key}],
   ['editor_projects',{$or:[{source_storage_path:key},{'metadata.source_url':key}]}],
   ['content_packs',{$or:[{'source.storage_path':key},{'source.source_url':key}]}],
  ];
  for(const [name,query]of checks){if(await db.collection(name).findOne({user_id:owner,...query}))referenced=true;}
  if(!referenced){
   // This attempt's publication has definitively aborted; there is no retrying
   // publisher or client PUT grant for this fresh random key.
   state='delete_pending';
   await db.collection('project_upload_attempts').updateOne(filter,{$set:{status:'abandoned',cleanup_state:state,updated_at:new Date()}});
   try{await deleteObject('source',key);state='deleted';}
   catch{state='delete_failed';logger.warn('URL import owned attempt cleanup remains unresolved',{attemptId:attempt.id});}
  }else state='reference_preserved';
 }
 await db.collection('project_upload_attempts').updateOne(filter,{$set:{status:'abandoned',cleanup_state:state,updated_at:new Date()}});
}
