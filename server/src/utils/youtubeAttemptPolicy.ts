import {performance} from 'node:perf_hooks';
import {classifyYouTubeFailure,toAppError,type YouTubeFailure,type ClassifyYouTubeFailureInput} from './youtubeErrorClassifier.js';

/** One deadline for the complete ordered extraction pass, not a new timeout per profile.
 * Challenge/throttle/permission failures terminate the pass immediately. This does not
 * create a background retry or schedule a later attempt. The caller owns process cleanup. */
export async function runYouTubeStrategyAttempts<T,S>(options:{
 strategies:readonly S[];timeoutMs:number;
 run:(strategy:S,remainingMs:number)=>Promise<T>;
 onFailure?:(strategy:S,failure:YouTubeFailure,error:unknown)=>void;
 maxBytes?:number;now?:()=>number;
}):Promise<{ok:true;value:T}|{ok:false;failures:YouTubeFailure[]}>{
 if(!Number.isFinite(options.timeoutMs)||options.timeoutMs<=0)throw new RangeError('YouTube attempt timeout must be finite and positive');
 const now=options.now??(()=>performance.now()),deadline=now()+options.timeoutMs,failures:YouTubeFailure[]=[];
 for(const strategy of options.strategies){
  const remainingMs=Math.floor(deadline-now());
  if(remainingMs<=0)throw toAppError(classifyYouTubeFailure({killed:true,errCode:'ETIMEDOUT'}));
  try{return {ok:true,value:await options.run(strategy,remainingMs)};}
  catch(error){
   const e=error as ClassifyYouTubeFailureInput&{code?:string|number};
   const failure=classifyYouTubeFailure({stderr:e?.stderr,stdout:e?.stdout,message:e?.message,killed:e?.killed,errCode:e?.code,signal:e?.signal},{maxBytes:options.maxBytes});
   options.onFailure?.(strategy,failure,error);
   if(failure.terminal)throw toAppError(failure);
   failures.push(failure);
  }
 }
 return {ok:false,failures};
}
