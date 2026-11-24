import type {Db,ClientSession} from 'mongodb';
import {AppError} from '../types/index.js';
import {coreProcessingDispatchEnabled,coreProcessingMaxActive,clipSelectionDispatchEnabled,clipSelectionMaxActive,coreSelectionContinuationEnabled,runsBackgroundWorkers} from './runtimePolicy.js';
import {workLifecycle} from './queue/workLifecycle.js';
export type DurableStage='core'|'selection'|'continuation';
const protocol=1;
const key=(stage:DurableStage,maximum:number)=>`${stage}:${protocol}:${maximum}`;
function maximum(stage:DurableStage){return stage==='core'?coreProcessingMaxActive():clipSelectionMaxActive();}
function enabled(stage:DurableStage){return stage==='core'?coreProcessingDispatchEnabled():stage==='selection'?clipSelectionDispatchEnabled():coreSelectionContinuationEnabled();}
/** Server-time announcement of compatible poller registration, not execution,
 * available capacity, provider readiness or stopped-work evidence. No TTL. */
export async function announceDurableWorker(db:Db,stage:DurableStage):Promise<void>{
 if(!enabled(stage)||!runsBackgroundWorkers()||workLifecycle.isDraining())return;
 const count=maximum(stage);
 await db.collection('durable_worker_handshakes').updateOne({_id:key(stage,count) as any},{$set:{stage,protocol,maximum:count},$currentDate:{seen_at:true}},{upsert:true,timeoutMS:1500});
}
/** Only new intents require a recent announcement. Exact replay never dispatches.
 * Server $$NOW avoids trusting API/worker clock agreement. A worker may vanish
 * immediately after this read; queued work still needs operational monitoring. */
export async function assertDurableWorker(db:Db,stage:DurableStage,session?:ClientSession):Promise<void>{
 if(!enabled(stage))return;
 const count=maximum(stage);
 const row=await db.collection('durable_worker_handshakes').findOne({_id:key(stage,count) as any,stage,protocol,maximum:count,seen_at:{$type:'date'},$expr:{$and:[{$gte:['$seen_at',{$subtract:['$$NOW',30000]}]},{$lte:['$seen_at','$$NOW']}] }},{session,projection:{_id:1},maxTimeMS:1000,...(session?{}:{timeoutMS:1500})});
 if(!row)throw new AppError('A recent compatible processing worker announcement is unavailable. No new request was saved. Retry when workers are available.',503,'DURABLE_WORKER_UNAVAILABLE');
}
export function startDurableWorkerAnnouncements(db:Db,onError:(error:unknown)=>void):()=>void{
 let stopped=false,pending=false;
 const tick=()=>{if(stopped||pending||workLifecycle.isDraining())return;pending=true;void workLifecycle.run('durable-worker-announcement',async()=>{
  for(const stage of ['core','selection','continuation'] as const){if(stopped||workLifecycle.isDraining())return;await announceDurableWorker(db,stage);}
 }).catch(onError).finally(()=>{pending=false;});};
 tick();const timer=setInterval(tick,10000);timer.unref();return()=>{stopped=true;clearInterval(timer);};
}
