import{finalSpeechAdmissionEnabled}from'../shared/finalSpeechAdmission.js';
import crypto from'node:crypto';import type{Db}from'mongodb';import{selectionContextIdentity}from'../shared/selectionContextIdentity.js';import{selectionSourceReceiptMatches}from'../shared/selectionSourceReceipt.js';import{automaticOneExportEnabled,coreSelectionContinuationEnabled,coreProcessingDispatchEnabled,clipSelectionDispatchEnabled}from'./runtimePolicy.js';
/** Owned immutable pointer lookup. Status errors never turn a saved request
 * into permission for a second selection. No provider, writes or wallet work. */
export async function withCoreSelectionStatus<T extends Record<string,any>>(db:Db,userId:string,projects:T[]):Promise<T[]>{
 const capability=coreSelectionContinuationEnabled()&&coreProcessingDispatchEnabled()&&clipSelectionDispatchEnabled();
 return Promise.all(projects.map(async project=>{
  if(project.user_id!==userId)return project;
  const base={...project,automatic_export_capable:capability&&automaticOneExportEnabled()&&finalSpeechAdmissionEnabled()&&process.env.VIREO_RENDER_ADMISSION_V1==='1'&&project.project_type!=='subtitles',core_selection_capable:capability&&project.project_type!=='subtitles'},intent=project.core_selection_continuation;
  if(!intent||intent.sourceUrl!==project.source_url||!intent.attemptId)return base;
  if(project.processing_attempt_id&&project.processing_attempt_id!==intent.attemptId&&project.core_processing_dispatch?.attemptId!==intent.attemptId)return base;
  const status=(state:string,jobId?:string)=>({...base,core_selection_status:{attemptId:intent.attemptId,state,...(jobId?{selectionJobId:jobId}:{})}});
  try{
   const key=crypto.createHash('sha256').update(JSON.stringify([userId,project.id,intent.attemptId])).digest('hex');
   const outbox=await db.collection('core_selection_outbox').findOne({_id:key as any,user_id:userId,project_id:project.id},{maxTimeMS:500});
   if(!outbox)return status(['queued','processing','transcribing','uploaded'].includes(project.video_status)?'pending':'unavailable');
   if(outbox.status==='review_required')return status('review_required');
   if(outbox.status==='pending')return status('pending');
   if(outbox.status!=='delivered'||typeof outbox.selection_job_key!=='string')return status('unavailable');
   const job=await db.collection('clip_selection_jobs').findOne({_id:outbox.selection_job_key as any,user_id:userId,project_id:project.id},{maxTimeMS:500});
   if(!job||job.id!==outbox.selection_job_id||job.source_url!==project.source_url)return status('unavailable');
   const automatic=job.automatic_export?await db.collection('automatic_export_outbox').findOne({selection_job_id:job.id,user_id:userId,project_id:project.id},{maxTimeMS:500}):null;
   if(automatic?.status==='queued'&&automatic.clip_id){const savedClip=await db.collection('clips').findOne({id:automatic.clip_id,user_id:userId,project_id:project.id},{maxTimeMS:500});return {...status('completed',job.id),automatic_export_status:{state:'queued',clipId:automatic.clip_id,renderStatus:savedClip?.render_status??'unavailable'}};}
   if(selectionContextIdentity({clip_preferences:project.clip_preferences,notes:project.notes,semantic_genre_receipt:project.semantic_genre_receipt})!==job.context)return status('review_required',job.id);
   const transcript=await db.collection('transcripts').findOne({project_id:project.id,user_id:userId},{maxTimeMS:500});
   if(!transcript||!selectionSourceReceiptMatches(job.source_receipt,transcript,project.source_url))return status('review_required',job.id);
   const result=status(['queued','processing','completed','failed','review_required'].includes(job.status)?job.status:'unavailable',job.id);
   if(!job.automatic_export)return result;
   const clip=automatic?.clip_id?await db.collection('clips').findOne({id:automatic.clip_id,user_id:userId,project_id:project.id},{maxTimeMS:500}):null;
   return {...result,automatic_export_status:{state:automatic?.status??'pending',...(automatic?.clip_id?{clipId:automatic.clip_id,renderStatus:clip?.render_status??'unavailable'}:{})}};
  }catch{return status('unavailable');}
 }));
}
