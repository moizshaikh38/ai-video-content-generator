import {AutopilotService} from './autopilotService.js';
import {runsBackgroundWorkers} from './runtimePolicy.js';
import {workLifecycle} from './queue/workLifecycle.js';
import {logger} from '../utils/logger.js';
let timer:NodeJS.Timeout|null=null,active=false;
export function startAutopilotContinuationWorker(){
 if(active||!runsBackgroundWorkers())return;active=true;
 const tick=async()=>{try{if(!workLifecycle.isDraining())await workLifecycle.run('autopilot-continuation',()=>AutopilotService.processAutomaticContinuations());}catch(error:any){logger.warn('Automatic continuation deferred',{code:error?.code});}finally{if(active){timer=setTimeout(tick,15000);timer.unref();}}};
 timer=setTimeout(tick,5000);timer.unref();
}
export function stopAutopilotContinuationWorker(){active=false;if(timer)clearTimeout(timer);timer=null;}
