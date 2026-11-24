import {assertDurableWorker} from '../../services/durableWorkerHandshake.js';
import crypto from'node:crypto';import type{Db,MongoClient}from'mongodb';import{AppError}from'../../types/index.js';import{selectionContextIdentity}from'../../shared/selectionContextIdentity.js';import{selectionSourceReceiptMatches}from'../../shared/selectionSourceReceipt.js';import{DELETION_MARKER_FIELD}from'../../services/deletionAdmissionService.js';
export async function enqueueClipSelection(client:MongoClient,db:Db,input:{userId:string;projectId:string;sourceUrl:string;receipt:any;context:string;customNotes?:string;preferences?:any}){
 const key=crypto.createHash('sha256').update(JSON.stringify([input.userId,input.projectId,input.sourceUrl,input.receipt,input.context,input.customNotes??null,input.preferences??null])).digest('hex'),session=client.startSession();
 try{return await session.withTransaction(async()=>{
  const project=await db.collection('projects').findOne({id:input.projectId,user_id:input.userId,source_url:input.sourceUrl,[DELETION_MARKER_FIELD]:{$exists:false}},{session});const transcript=await db.collection('transcripts').findOne({project_id:input.projectId,user_id:input.userId},{session});
  if(!project||!transcript||selectionContextIdentity({clip_preferences:project.clip_preferences,notes:project.notes,semantic_genre_receipt:project.semantic_genre_receipt})!==input.context||!selectionSourceReceiptMatches(input.receipt,transcript,input.sourceUrl))throw new AppError('Source, transcript or clip settings changed before selection was queued.',409,'CLIP_SELECTION_CONTEXT_CHANGED');
  const prior=await db.collection('clip_selection_jobs').findOne({_id:key as any},{session});if(prior)return prior;
  await assertDurableWorker(db,'selection',session);
  if(await db.collection('clip_selection_jobs').findOne({user_id:input.userId,project_id:input.projectId,status:{$in:['queued','processing','review_required']}},{session}))throw new AppError('A saved selection request already exists or requires review.',409,'CLIP_ANALYSIS_ACTIVE');
  await db.collection('projects').updateOne({id:input.projectId,user_id:input.userId,[DELETION_MARKER_FIELD]:{$exists:false}},{$inc:{clip_selection_dispatch_serial:1}},{session});
  const job={_id:key as any,id:crypto.randomUUID(),version:1,user_id:input.userId,project_id:input.projectId,source_url:input.sourceUrl,source_receipt:input.receipt,context:input.context,custom_notes:input.customNotes??null,preferences:input.preferences??null,status:'queued',worker_id:null,created_at:new Date(),updated_at:new Date()};await db.collection('clip_selection_jobs').insertOne(job,{session});return job;
 },{readPreference:'primary',readConcern:{level:'snapshot'},writeConcern:{w:'majority'},timeoutMS:10000});}finally{await session.endSession();}
}
export async function claimClipSelection(client:MongoClient,db:Db,maximum:number,workerId:string){
 if(!Number.isSafeInteger(maximum)||maximum<1)throw Error('Explicit selection shared count is required.');const capacity=db.collection('clip_selection_capacity');try{await capacity.updateOne({_id:'v1' as any},{$setOnInsert:{maximum,serial:0}},{upsert:true,writeConcern:{w:'majority'}});}catch(e:any){if(e?.code!==11000)throw e;}
 const session=client.startSession();try{return await session.withTransaction(async()=>{
  if((await capacity.updateOne({_id:'v1' as any,maximum},{$inc:{serial:1}},{session})).matchedCount!==1)throw new AppError('Selection worker count policy differs.',503,'SELECTION_CAPACITY_POLICY_MISMATCH');
  if(await db.collection('clip_selection_jobs').countDocuments({version:1,status:{$in:['processing','review_required']}},{session})>=maximum)return null;
  return db.collection('clip_selection_jobs').findOneAndUpdate({version:1,status:'queued',worker_id:null},{$set:{status:'processing',worker_id:workerId,updated_at:new Date()}},{sort:{created_at:1,_id:1},returnDocument:'after',session});
 },{readPreference:'primary',readConcern:{level:'snapshot'},writeConcern:{w:'majority'},timeoutMS:10000});}finally{await session.endSession();}
}
