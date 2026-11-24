import crypto from 'node:crypto';import type{MongoClient,Db}from'mongodb';
import {AppError}from'../../types/index.js';import{DELETION_MARKER_FIELD}from'../../services/deletionAdmissionService.js';
const jobs='core_processing_jobs';
/** Queue intent BEFORE reserving credits. No media/provider/credit effect. */
export async function enqueueCoreProcessing(client:MongoClient,db:Db,input:{userId:string;projectId:string;sourceUrl:string;attemptId:string;email?:string;selectionContinuation?:{customNotes?:string;preferences?:any}}){
 const key=crypto.createHash('sha256').update(JSON.stringify([input.userId,input.attemptId])).digest('hex'),session=client.startSession();
 try{return await session.withTransaction(async()=>{
  const prior=await db.collection(jobs).findOne({_id:key as any},{session});
  if(prior){if(prior.project_id!==input.projectId||prior.source_url!==input.sourceUrl||JSON.stringify(prior.selection_continuation??null)!==JSON.stringify(input.selectionContinuation??null))throw new AppError('Saved processing request inputs changed.',409,'PROCESSING_ATTEMPT_CHANGED');return prior;}
  const filter={id:input.projectId,user_id:input.userId,source_url:input.sourceUrl,[DELETION_MARKER_FIELD]:{$exists:false},processing_run_token:null,video_status:{$nin:['processing','transcribing']}};
  const project=await db.collection('projects').findOne(filter,{session});if(!project)throw new AppError('Project is unavailable for queued processing.',409,'PROCESSING_ATTEMPT_CHANGED');
  const active=await db.collection(jobs).findOne({project_id:input.projectId,user_id:input.userId,status:{$in:['queued','processing','review_required']}},{session});if(active)throw new AppError('A processing request is already queued or requires review.',409,'PROCESSING_ACTIVE');
  if((await db.collection('projects').updateOne(filter,{$inc:{processing_dispatch_serial:1},$set:{core_processing_dispatch:{key,attemptId:input.attemptId,sourceUrl:input.sourceUrl},...(input.selectionContinuation?{core_selection_continuation:{attemptId:input.attemptId,sourceUrl:input.sourceUrl,notes:project.notes??null,project_preferences:project.clip_preferences??null,...input.selectionContinuation}}:{})}},{session})).matchedCount!==1)throw new AppError('Project changed before queue admission.',409,'PROCESSING_ATTEMPT_CHANGED');
  const job={_id:key as any,id:crypto.randomUUID(),version:1,user_id:input.userId,project_id:input.projectId,source_url:input.sourceUrl,attempt_id:input.attemptId,previous_attempt_id:project.processing_attempt_id??null,selection_continuation:input.selectionContinuation??null,email:input.email??null,status:'queued',worker_id:null,created_at:new Date(),updated_at:new Date()};await db.collection(jobs).insertOne(job,{session});return job;
 },{readPreference:'primary',readConcern:{level:'snapshot'},writeConcern:{w:'majority'},timeoutMS:10000});}finally{await session.endSession();}
}
export async function claimCoreProcessing(client:MongoClient,db:Db,maximum:number,workerId:string){
 if(!Number.isSafeInteger(maximum)||maximum<1)throw Error('Explicit core processing count is required.');
 const pool=db.collection('core_processing_capacity');try{await pool.updateOne({_id:'v1' as any},{$setOnInsert:{maximum,serial:0}},{upsert:true,writeConcern:{w:'majority'}});}catch(e:any){if(e?.code!==11000)throw e;}
 const session=client.startSession();try{return await session.withTransaction(async()=>{
  if((await pool.updateOne({_id:'v1' as any,maximum},{$inc:{serial:1}},{session})).matchedCount!==1)throw new AppError('Core worker count policy differs.',503,'CORE_CAPACITY_POLICY_MISMATCH');
  if(await db.collection(jobs).countDocuments({version:1,status:{$in:['processing','review_required']}},{session})>=maximum)return null;
  return db.collection(jobs).findOneAndUpdate({version:1,status:'queued',worker_id:null},{$set:{status:'processing',worker_id:workerId,claimed_at:new Date(),updated_at:new Date()}},{sort:{created_at:1,_id:1},returnDocument:'after',session});
 },{readPreference:'primary',readConcern:{level:'snapshot'},writeConcern:{w:'majority'},timeoutMS:10000});}finally{await session.endSession();}
}
