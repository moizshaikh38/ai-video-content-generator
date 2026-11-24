import{getMongoDb,getMongoClient}from'../db/mongoClient.js';import{coreSelectionContinuationEnabled,clipSelectionDispatchEnabled,runsBackgroundWorkers}from'./runtimePolicy.js';import{workLifecycle}from'./queue/workLifecycle.js';import{enqueueClipSelection}from'../db/repositories/clipSelectionDispatchRepository.js';
let running=false;
/** At-least-once outbox delivery to idempotent immutable selection intent.
 * No claim/timeout can accidentally re-run a provider: only queue insertion. */
export async function processNextCoreSelectionContinuation():Promise<boolean>{
 if(!coreSelectionContinuationEnabled()||!clipSelectionDispatchEnabled()||!runsBackgroundWorkers()||running||workLifecycle.isDraining())return false;running=true;
 try{return await workLifecycle.run('core-selection-continuation',async()=>{
  const db=await getMongoDb(),item=await db.collection('core_selection_outbox').findOne({version:1,status:'pending'},{sort:{created_at:1,_id:1}});if(!item)return false;
  try{
   const job=await enqueueClipSelection(await getMongoClient(),db,{userId:item.user_id,projectId:item.project_id,sourceUrl:item.source_url,receipt:item.receipt,context:item.context,customNotes:item.custom_notes??undefined,preferences:item.preferences??undefined});
   await db.collection('core_selection_outbox').updateOne({_id:item._id,status:'pending'},{$set:{status:'delivered',selection_job_id:job!.id,updated_at:new Date()}});
  }catch(error:any){
   // Known stale/active intent refuses, never turns into different selection.
   // Unknown delivery failure stays pending; identical enqueue is idempotent.
   if(['CLIP_SELECTION_CONTEXT_CHANGED','CLIP_ANALYSIS_ACTIVE'].includes(error?.code))await db.collection('core_selection_outbox').updateOne({_id:item._id,status:'pending'},{$set:{status:'review_required',result_code:error.code,updated_at:new Date()}});
   else throw error;
  }return true;
 });}finally{running=false;}
}
