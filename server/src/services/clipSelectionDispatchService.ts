import crypto from'node:crypto';import{getMongoDb,getMongoClient}from'../db/mongoClient.js';import{clipSelectionDispatchEnabled,clipSelectionMaxActive,runsBackgroundWorkers}from'./runtimePolicy.js';import{workLifecycle}from'./queue/workLifecycle.js';import{claimClipSelection}from'../db/repositories/clipSelectionDispatchRepository.js';import{selectionContextIdentity}from'../shared/selectionContextIdentity.js';import{selectionSourceReceiptMatches}from'../shared/selectionSourceReceipt.js';import{assertTranscriptReusable}from'./transcriptSourceBindingService.js';
let running=false;
export async function processNextClipSelectionJob():Promise<boolean>{
 if(!clipSelectionDispatchEnabled()||!runsBackgroundWorkers()||workLifecycle.isDraining()||running)return false;running=true;let safe=true;
 try{return await workLifecycle.run('clip-selection-dispatch',async()=>{
  const db=await getMongoDb(),job=await claimClipSelection(await getMongoClient(),db,clipSelectionMaxActive(),crypto.randomUUID());if(!job)return false;safe=false;
  const filter={id:job.id,status:'processing',worker_id:job.worker_id};let entered=false;
  try{
   const project=await db.collection('projects').findOne({id:job.project_id,user_id:job.user_id,deletion_started_at:{$exists:false}}),transcript=await db.collection('transcripts').findOne({project_id:job.project_id,user_id:job.user_id});
   if(!project||!transcript||project.source_url!==job.source_url||selectionContextIdentity({clip_preferences:project.clip_preferences,notes:project.notes,semantic_genre_receipt:project.semantic_genre_receipt})!==job.context||!selectionSourceReceiptMatches(job.source_receipt,transcript,job.source_url)){
    const stopped=await db.collection('clip_selection_jobs').updateOne(filter,{$set:{status:'failed',result_code:'CLIP_SELECTION_CONTEXT_CHANGED',updated_at:new Date()}});if(stopped.matchedCount!==1)throw Error('Selection stop ownership was lost.');safe=true;return true;
   }
   await assertTranscriptReusable(transcript,job.source_url);
   const{ClipAnalysisService}=await import('./clipAnalysisService.js');entered=true;
   const candidates=await new ClipAnalysisService().analyzeAndPersistClips({projectId:job.project_id,userId:job.user_id,customNotes:job.custom_notes??undefined,preferences:job.preferences??undefined,clipPreferences:job.preferences??undefined,expectedDispatch:{context:job.context,receipt:job.source_receipt}});
   const result=await db.collection('clip_selection_jobs').updateOne(filter,{$set:{status:'completed',candidate_ids:candidates.map(c=>c.id),updated_at:new Date(),finished_at:new Date()}});if(result.matchedCount!==1)throw Error('Selection completion ownership was lost.');safe=true;
  }catch(error:any){
   // After selector entry a provider or publication may have succeeded. Never
   // reclaim or replay it merely because HTTP/provider/job state is uncertain.
   const status=entered?'review_required':'failed';const result=await db.collection('clip_selection_jobs').updateOne(filter,{$set:{status,result_code:typeof error?.code==='string'?error.code:'CLIP_SELECTION_STOP_UNVERIFIED',updated_at:new Date()}});safe=!entered&&result.matchedCount===1;
  }
  return true;
 });}finally{if(safe)running=false;}
}
