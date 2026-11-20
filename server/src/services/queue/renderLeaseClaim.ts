import type{Db,ClientSession}from'mongodb';import{renderBudgetAvailableExpr}from'../../shared/renderRetryBudget.js';
export async function claimRenderLease(db:Db,input:{jobId:string;clipId:string;userId:string;workerId:string;renderVersion:number;editorVersion:number},now:Date,session?:ClientSession){
 const cutoff=new Date(now.getTime()-15*60*1000);
 return db.collection('render_jobs').findOneAndUpdate({id:input.jobId,clip_id:input.clipId,user_id:input.userId,$and:[{$or:[{admission_version:null},{admission_version:1,render_version:input.renderVersion,editor_version:input.editorVersion}]}],$expr:renderBudgetAvailableExpr,$or:[{status:'queued',worker_id:null,locked_at:null},{status:'processing',locked_at:{$lt:cutoff}}]},[{$set:{status:'processing',render_version:input.renderVersion,editor_version:input.editorVersion,stage:'downloading',worker_id:input.workerId,locked_at:now,started_at:'$$NOW',updated_at:now,attempts:{$add:[{$ifNull:['$attempts',0]},1]}}}],{returnDocument:'after',...(session?{session}:{})});
}

/** A failed/ambiguous renewal cancels supervised CV rather than allowing a
 * stale or unverifiable lease to continue heavy analysis. It does not free any
 * resource permit, and cannot stop separate unsupervised FFmpeg paths. */
export async function renewRenderLeaseForCv(db:Db,input:{jobId:string;clipId:string;userId:string;workerId:string},controller:AbortController){
 if(controller.signal.aborted)return false;
 try{
  const result=await db.collection('render_jobs').updateOne({id:input.jobId,clip_id:input.clipId,user_id:input.userId,worker_id:input.workerId,status:'processing'},[{$set:{locked_at:'$$NOW',updated_at:'$$NOW'}}],{maxTimeMS:2000,writeConcern:{w:'majority',wtimeoutMS:2000}});
  if(result.matchedCount===1)return true;
  controller.abort(Object.assign(Error('Render lease is no longer owned by this worker.'),{code:'FENCING_TOKEN_MISMATCH'}));return false;
 }catch(cause){controller.abort(Object.assign(Error('Render lease renewal could not be verified.'),{code:'FENCING_TOKEN_MISMATCH',cause}));return false;}
}
