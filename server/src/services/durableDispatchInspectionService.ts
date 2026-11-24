import type {Db} from 'mongodb';
import {AppError} from '../types/index.js';
/** Read-only exact-record diagnostics. Never proves that a worker/provider has
 * stopped, and never authorizes replay, capacity release or financial repair. */
export async function inspectDurableDispatch(db:Db,input:{stage:'core'|'selection';userId:string;projectId:string;jobKey:string}){
 if(!['core','selection'].includes(input.stage)||!input.userId||!input.projectId||!/^[a-f0-9]{64}$/.test(input.jobKey))throw new AppError('Exact stage, owner, project and saved job key are required.',400,'INVALID_DISPATCH_INSPECTION');
 const collection=input.stage==='core'?'core_processing_jobs':'clip_selection_jobs';
 const row=await db.collection(collection).findOne({_id:input.jobKey as any,user_id:input.userId,project_id:input.projectId},{projection:{id:1,status:1,worker_id:1,attempt_id:1,project_deleted_at:1},maxTimeMS:1000,timeoutMS:1500});
 // Missing or unknown states are not evidence of completion or stopped work.
 if(!row)return{stage:input.stage,found:false,stopVerified:false,automaticRecoveryAllowed:false};
 const state=typeof row.status==='string'&&['queued','processing','review_required','completed','failed','cancelled'].includes(row.status)?row.status:'unknown';
 return{stage:input.stage,found:true,state,jobId:typeof row.id==='string'?row.id:null,workerId:typeof row.worker_id==='string'?row.worker_id:null,attemptId:typeof row.attempt_id==='string'?row.attempt_id:null,
  projectDeleted:row.project_deleted_at instanceof Date,capacityMayBeHeld:['processing','review_required','unknown'].includes(state),stopVerified:false,automaticRecoveryAllowed:false,
  // Do not pass through arbitrary error text or future payload fields. Dates
  // and code are deliberately omitted; they do not prove stop or safe replay.
 };
}
