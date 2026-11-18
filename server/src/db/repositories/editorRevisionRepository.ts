import {validateRecord} from '../schemaValidation.js';
import type{Db,MongoClient}from'mongodb';import{AppError}from'../../types/index.js';
const tx={readConcern:{level:'snapshot' as const},writeConcern:{w:'majority' as const},maxCommitTimeMS:10_000};
const conflict=()=>new AppError('This editor project changed elsewhere. Your local edits are kept. Reload or reconcile before saving again.',409,'EDITOR_REVISION_CONFLICT');
/** Serialize first creation on the owning clip, including the absent-project
 * render case. Never insert a second project on a racing initialization. */
export async function createEditorRevision(client:MongoClient,db:Db,project:any){
 validateRecord('editor_projects',project);
 const session=client.startSession();try{return await session.withTransaction(async()=>{
  const existing=await db.collection('editor_projects').findOne({clip_id:project.clip_id,user_id:project.user_id},{session});if(existing)return existing;
  const clip=await db.collection('clips').updateOne({id:project.clip_id,user_id:project.user_id},[{$set:{editor_version:{$add:[{$ifNull:['$editor_version',1]},1]}}}],{session});if(clip.matchedCount!==1)throw new AppError('Clip not found.',404,'CLIP_NOT_FOUND');
  await db.collection('editor_projects').insertOne(project,{session});return project;
 },tx);}finally{await session.endSession();}
}
/** Submitted revision is an optimistic-lock precondition, never next version.
 * Mark Quick projection pending in the same transaction. No render may publish
 * mixed Pro/Quick state while the second, revision-bound sync is outstanding. */
export async function saveEditorRevision(client:MongoClient,db:Db,input:{id:string;userId:string;expectedVersion:number;updates:Record<string,unknown>;requireClipSync?:boolean}){
 if(!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<1||input.expectedVersion>=Number.MAX_SAFE_INTEGER)throw conflict();
 const {version:_ignored,...updates}=input.updates;validateRecord('editor_projects',updates);const session=client.startSession();try{return await session.withTransaction(async()=>{
  const row=await db.collection('editor_projects').findOneAndUpdate({id:input.id,user_id:input.userId,version:input.expectedVersion},{$set:{...updates,version:input.expectedVersion+1}},{returnDocument:'after',session});if(!row)throw conflict();
  const clip=await db.collection('clips').updateOne({id:row.clip_id,user_id:input.userId},[{$set:{editor_version:{$add:[{$ifNull:['$editor_version',1]},1]},editor_project_sync_pending:input.requireClipSync!==false?{id:row.id,version:row.version}:{$cond:[{$ne:[{$ifNull:['$editor_project_sync_pending',null]},null]},{id:row.id,version:row.version},null]}}}],{session});if(clip.matchedCount!==1)throw new AppError('Clip not found.',404,'CLIP_NOT_FOUND');return row;
 },tx);}finally{await session.endSession();}
}
export async function syncClipEditorRevision(client:MongoClient,db:Db,input:{clipId:string;userId:string;expectedClipVersion:number;project?:{id:string;version:number};payload:Record<string,unknown>}){
 validateRecord('clips',input.payload);
 const session=client.startSession();try{return await session.withTransaction(async()=>{
  if(input.project){
   const p=input.project;if(typeof p.id!=='string'||!Number.isSafeInteger(p.version)||p.version<1)throw conflict();
   const result=await db.collection('editor_projects').updateOne({id:p.id,clip_id:input.clipId,user_id:input.userId,version:p.version},{$inc:{clip_sync_fence_serial:1}},{session});if(result.matchedCount!==1)throw conflict();
  }
  const filter:any={id:input.clipId,user_id:input.userId,$expr:{$eq:[{$ifNull:['$editor_version',1]},input.expectedClipVersion]}};
  if(input.project)filter.$or=[{editor_project_sync_pending:input.project},{editor_project_sync_pending:null}];else filter.editor_project_sync_pending=null;
  const row=await db.collection('clips').findOneAndUpdate(filter,{$set:{...input.payload,editor_project_sync_pending:null}},{returnDocument:'after',session});if(!row)throw conflict();return row;
 },tx);}finally{await session.endSession();}
}
