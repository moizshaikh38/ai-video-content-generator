import type {ClientSession,Db,MongoClient} from 'mongodb';
import {renderBudgetAvailableExpr} from '../../shared/renderRetryBudget.js';
import {claimRenderLease} from './renderLeaseClaim.js';

/** Choose one oldest eligible job per owner, then the owner least recently
 * started. History lives in the existing job collection, so restarts/processes
 * do not reset ordering. This is dispatch fairness, not a capacity or SLA bound.
 * New owners tie at epoch and use oldest queued creation time. */
export async function nextOwnerFairRenderJob(db:Db,now:Date,options:{busyClipIds?:string[];session?:ClientSession}={}){
 const eligible={status:'queued',worker_id:null,locked_at:null,$expr:renderBudgetAvailableExpr,
  $or:[{next_retry_at:null},{next_retry_at:{$lte:now}}],
  ...(options.busyClipIds?.length?{clip_id:{$nin:options.busyClipIds}}:{})};
 const rows=await db.collection('render_jobs').aggregate([
  {$match:eligible},{$sort:{created_at:1,_id:1}},
  {$group:{_id:'$user_id',job:{$first:'$$ROOT'}}},
  {$lookup:{from:'render_jobs',let:{owner:'$_id'},pipeline:[
   {$match:{$expr:{$eq:['$user_id','$$owner']},started_at:{$type:'date'}}},
   {$sort:{started_at:-1}},{$limit:1},{$project:{_id:0,started_at:1}},
  ],as:'history'}},
  {$set:{last_started:{$ifNull:[{$arrayElemAt:['$history.started_at',0]},new Date(0)]}}},
  {$sort:{last_started:1,'job.created_at':1,'job._id':1}},{$limit:1},{$replaceRoot:{newRoot:'$job'}},
 ],{maxTimeMS:2000,allowDiskUse:false,...(options.session?{session:options.session}:{})}).toArray();
 return rows[0]??null;
}

type Identity=Parameters<typeof claimRenderLease>[1];
export async function claimOwnerFairRenderLease(db:Db,input:Identity,now:Date,client:MongoClient){
 const session=client.startSession();
 try{return await session.withTransaction(async()=>{
  const next=await nextOwnerFairRenderJob(db,now,{session});
  if(!next||next.id!==input.jobId)return {status:'deferred' as const};
  const job=await claimRenderLease(db,input,now,session);
  return job?{status:'claimed' as const,job}:{status:'busy' as const};
 },{readPreference:'primary',readConcern:{level:'snapshot'},writeConcern:{w:'majority'},maxCommitTimeMS:2000,timeoutMS:5000});}
 catch(cause){throw Object.assign(Error('Render queue admission is temporarily unavailable.'),{code:'RENDER_ADMISSION_UNAVAILABLE',cause});}
 finally{await session.endSession();}
}
