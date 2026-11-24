import crypto from 'node:crypto';import {getMongoDb,getMongoClient}from'../db/mongoClient.js';
import {coreProcessingDispatchEnabled,coreProcessingMaxActive,runsBackgroundWorkers}from'./runtimePolicy.js';
import{workLifecycle}from'./queue/workLifecycle.js';import{claimCoreProcessing}from'../db/repositories/coreProcessingDispatchRepository.js';
let running=false;
/** Permanent claims and process quarantine on uncertainty. No timeout reclaim. */
export async function processNextCoreProcessingJob():Promise<boolean>{
 if(!coreProcessingDispatchEnabled()||!runsBackgroundWorkers()||workLifecycle.isDraining()||running)return false;
 running=true;let releaseSafe=true;
 try{return await workLifecycle.run('core-processing-dispatch',async()=>{
  const db=await getMongoDb(),job=await claimCoreProcessing(await getMongoClient(),db,coreProcessingMaxActive(),crypto.randomUUID());if(!job)return false;
  releaseSafe=false;
  const filter={id:job.id,status:'processing',worker_id:job.worker_id};
  try{
   const {executeQueuedProjectProcessing}=await import('../controllers/projectController.js');
   const result=await executeQueuedProjectProcessing(job);
   const project=await db.collection('projects').findOne({id:job.project_id,user_id:job.user_id});
   const {isProjectProcessingActive}=await import('./videoProcessingService.js');
   // Status/HTTP result alone is not worker-stop evidence. The awaited executor
   // and its own retained process/token guards must both show it stopped.
   const reservation=await db.collection('credit_reservations').findOne({attempt_id:job.attempt_id,user_id:job.user_id});
   const unsettled=reservation&&['reserved','active'].includes(reservation.status);
   const uncertain=result.code===202||result.code>=500||Boolean(unsettled)||Boolean(project?.processing_run_token)||isProjectProcessingActive(job.project_id);
   const status=uncertain?'review_required':result.code>=400?'failed':result.body?.video_status==='transcribed'?'completed':'failed';
   await db.collection('core_processing_jobs').updateOne(filter,{$set:{status,response_code:result.code,result_code:typeof result.body?.code==='string'?result.body.code:null,finished_at:new Date(),updated_at:new Date()}});
   releaseSafe=!uncertain;
  }catch{
   await db.collection('core_processing_jobs').updateOne(filter,{$set:{status:'review_required',updated_at:new Date()}});
  }
  return true;
 });}finally{if(releaseSafe)running=false;}
}
