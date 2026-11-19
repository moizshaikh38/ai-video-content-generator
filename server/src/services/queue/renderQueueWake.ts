import type {Db} from 'mongodb';
/** Committed Mongo change events wake the existing lease-based queue drain.
 * Notifications never claim a job; polling remains the recovery fallback. */
export function startRenderQueueWake(db:Db,drain:()=>Promise<void>,onError:(error:unknown)=>void):{request:()=>void;stop:()=>void}{
 let stopped=false,running=false,pending=false,timer:ReturnType<typeof setImmediate>|undefined;
 const request=()=>{if(stopped)return;pending=true;if(running||timer)return;timer=setImmediate(()=>{timer=undefined;void run();});};
 const run=async()=>{if(stopped||running)return;running=true;try{while(pending&&!stopped){pending=false;await drain();}}catch(error){onError(error);}finally{running=false;}};
 const stream=db.collection('render_jobs').watch([{$match:{operationType:{$in:['insert','update','replace']},'fullDocument.status':'queued'}}],{fullDocument:'updateLookup',maxAwaitTimeMS:1000});
 stream.on('change',request);stream.on('error',error=>{if(!stopped)onError(error);});
 return{request,stop:()=>{stopped=true;pending=false;if(timer)clearImmediate(timer);void stream.close().catch(onError);}};
}
