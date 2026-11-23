import type {Db} from 'mongodb';
import {AppError,type VideoAnalysisJobRecord} from '../../types/index.js';
export const MULTIMODAL_LEASE_MS=300_000;
export function multimodalLeaseLost(){return new AppError('Multimodal analysis lease is no longer owned. Retry or check job status.',409,'MULTIMODAL_LEASE_LOST');}
/** worker_id is a random per-claim token, not a process-wide identity. */
export function multimodalLeaseFilter(job:VideoAnalysisJobRecord,now=new Date()){
 if(![job.id,job.project_id,job.user_id,job.worker_id].every(v=>typeof v==='string'&&v.trim())||!Number.isSafeInteger(job.attempts)||job.attempts<1)throw multimodalLeaseLost();
 return {id:job.id,project_id:job.project_id,user_id:job.user_id,worker_id:job.worker_id,attempts:job.attempts,status:'processing',locked_at:{$gte:new Date(now.getTime()-MULTIMODAL_LEASE_MS)}};
}
export async function renewMultimodalLease(db:Db,job:VideoAnalysisJobRecord,patch:Record<string,unknown>={}){
 const now=new Date();const result=await db.collection('video_analysis_jobs').updateOne(multimodalLeaseFilter(job,now),{$set:{...patch,locked_at:now,updated_at:now}},{maxTimeMS:2000,timeoutMS:5000,writeConcern:{w:'majority',wtimeoutMS:2000}});
 if(result.matchedCount!==1)throw multimodalLeaseLost();
}
/** At most one renewal in flight. Loss is sticky. The caller still owns bounded
 * native subprocess cleanup; this heartbeat does not claim to cancel them. */
export function startMultimodalHeartbeat(renew:()=>Promise<void>,intervalMs=60_000){
 let lost=false,pending:Promise<void>|undefined;
 const timer=setInterval(()=>{if(lost||pending)return;pending=renew().catch(()=>{lost=true;}).finally(()=>{pending=undefined;});},intervalMs);timer.unref();
 return {assertOwned(){if(lost)throw multimodalLeaseLost();},async stop(){clearInterval(timer);await pending;}};
}
