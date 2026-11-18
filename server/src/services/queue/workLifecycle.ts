import type{Request,Response,NextFunction}from'express';
import{AsyncLocalStorage}from'node:async_hooks';import{AppError}from'../../types/index.js';
/** Process-local admission/drain ownership, not a distributed queue lease. */
export class WorkLifecycle{
 private draining=false;private next=0;private active=new Map<number,string>();private context=new AsyncLocalStorage<number>();private waiters=new Set<()=>void>();
 isDraining(){return this.draining;}
 beginDrain(){this.draining=true;}
 snapshot(){return{draining:this.draining,active:[...this.active.values()]};}
 run<T>(label:string,work:()=>Promise<T>|T):Promise<T>{
  const parent=this.context.getStore();
  if(this.draining&&(parent===undefined||!this.active.has(parent)))return Promise.reject(new AppError('Server is draining. Retry shortly.',503,'SERVER_DRAINING'));
  const id=++this.next;this.active.set(id,label);
  return this.context.run(id,async()=>{try{return await work();}finally{this.active.delete(id);if(this.active.size===0){for(const notify of this.waiters)notify();this.waiters.clear();}}});
 }
 waitForIdle():Promise<void>{if(this.active.size===0)return Promise.resolve();return new Promise(resolve=>this.waiters.add(resolve));}
}
export const workLifecycle=new WorkLifecycle();
/** Register response lifetime as well as separately tracked async handlers. */
export function workAdmission(_req:Request,res:Response,next:NextFunction){
 if(workLifecycle.isDraining()){res.setHeader('Connection','close');res.status(503).json({status:'error',code:'SERVER_DRAINING',message:'Server is restarting. Retry shortly.'});return;}
 void workLifecycle.run('http-request',()=>new Promise<void>(resolve=>{res.once('finish',resolve);res.once('close',resolve);next();})).catch(next);
}
/** Stops admission before stopping timers/HTTP. DB close happens only after
 * admitted HTTP AND tracked background work settle. Timeout leaves DB alone:
 * the caller reports nonzero exit, never a false successful graceful drain. */
export function createShutdown(options:{lifecycle:WorkLifecycle;stopPollers:()=>void;closeHttp:()=>Promise<void>;closeDatabase:()=>Promise<void>;timeoutMs:number;onTimeout?:(active:string[])=>void}){
 let shutdown:Promise<boolean>|null=null;
 return()=>shutdown??=(async()=>{
  options.lifecycle.beginDrain();let timer:ReturnType<typeof setTimeout>|undefined;
  const timeout=new Promise<false>(resolve=>{timer=setTimeout(()=>{options.onTimeout?.(options.lifecycle.snapshot().active);resolve(false);},options.timeoutMs);});
  let expired=false;
  const deadline=timeout.then(value=>{expired=true;return value;});
  try{
   options.stopPollers();
   const drained=(async()=>{await options.closeHttp();await options.lifecycle.waitForIdle();if(expired)return false;await options.closeDatabase();return !expired;})();
   return await Promise.race([drained,deadline]);
  }finally{if(timer)clearTimeout(timer);}
 })();
}
