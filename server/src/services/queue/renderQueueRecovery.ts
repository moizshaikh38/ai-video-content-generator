import type{MongoClient,Db}from'mongodb';import{renderRetryBudget,renderBudgetExhaustedExpr}from'../../shared/renderRetryBudget.js';
/** Small recoverable batches, exact heartbeat/token snapshot, transactional
 * recheck. Never clear a fresh/replaced lease or revive an exhausted job.
 * Legacy jobs without a render revision do not authorize changing clip state.
 */
export async function recoverRenderQueue(client:MongoClient,db:Db,now:Date,limit=25):Promise<number>{
 const cutoff=new Date(now.getTime()-15*60*1000);
 const jobs=await db.collection('render_jobs').find({$or:[{status:'processing',locked_at:{$lt:cutoff}},{status:'queued',worker_id:null,locked_at:null,$expr:renderBudgetExhaustedExpr}]}).sort({created_at:1}).limit(Math.min(25,Math.max(1,limit))).toArray();let recovered=0;
 for(const snapshot of jobs){
  const session=client.startSession();
  try{let changed=false;await session.withTransaction(async()=>{
   changed=false;
   const filter={id:snapshot.id,clip_id:snapshot.clip_id,user_id:snapshot.user_id,status:snapshot.status,worker_id:snapshot.worker_id??null,locked_at:snapshot.locked_at??null};
   const job=await db.collection('render_jobs').findOne(filter,{session});if(!job)return;
   const budget=renderRetryBudget(job);const retry=job.status==='processing'&&budget.available;
   if(job.status==='processing'&&!(job.locked_at instanceof Date&&job.locked_at<cutoff))return;
   if(job.status==='queued'&&budget.available)return;
   const status=retry?'queued':'failed';
   const update=await db.collection('render_jobs').updateOne(filter,{$set:{status,stage:status,worker_id:null,locked_at:null,next_retry_at:null,updated_at:now,error_code:retry?'RENDER_LEASE_EXPIRED':'MAX_ATTEMPTS_EXCEEDED',error_message:retry?'The previous worker lease expired. Rendering is queued again.':'Rendering stopped after its retry budget was exhausted.'}},{session});if(update.matchedCount!==1)return;
   // Only a revision-bound latest job can update the clip's displayed state.
   if(Number.isSafeInteger(job.render_version)&&job.render_version>0){
    const latest=await db.collection('render_jobs').findOne({clip_id:job.clip_id,user_id:job.user_id},{session,sort:{created_at:-1,_id:-1}});
    if(latest?.id===job.id)await db.collection('clips').updateOne({id:job.clip_id,user_id:job.user_id,render_version:job.render_version,render_status:{$in:['queued','rendering','uploading']}},{$set:{render_status:status,render_error_code:retry?'RENDER_LEASE_EXPIRED':'MAX_ATTEMPTS_EXCEEDED',updated_at:now}},{session});
   }
   changed=true;
  },{readPreference:'primary',readConcern:{level:'snapshot'},writeConcern:{w:'majority'},maxCommitTimeMS:10_000});if(changed)recovered++;}finally{await session.endSession();}
 }
 return recovered;
}
