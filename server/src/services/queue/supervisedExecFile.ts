import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';

export type SupervisedExecOptions={input?:string;timeoutMs:number;maxBuffer:number;signal?:AbortSignal};
/** Linux process-group ownership. Settle only after close and no running group
 * member remains. Zombies have exited and cannot retain work/resources. This
 * does not authorize freeing a distributed permit owned by another worker. */
export async function supervisedExecFile(file:string,args:string[],options:SupervisedExecOptions):Promise<{stdout:string;stderr:string}>{
 if(process.platform!=='linux')throw Object.assign(Error('Process-group supervision requires Linux.'),{code:'SUPERVISION_UNAVAILABLE'});
 for(const [key,n]of Object.entries({timeoutMs:options.timeoutMs,maxBuffer:options.maxBuffer}))if(!Number.isSafeInteger(n)||n<=0)throw Error(`${key} must be a positive safe integer`);
 if(options.signal?.aborted)throw Object.assign(Error('Work was cancelled before launch.'),{code:'WORK_CANCELLED'});
 const child=spawn(file,args,{detached:true,stdio:['pipe','pipe','pipe'],shell:false});
 let stdout:Buffer[]=[],stderr:Buffer[]=[],outBytes=0,errBytes=0;let failure:Error&{code?:string}|undefined;let closed=false;
 const kill=()=>{if(child.pid){try{process.kill(-child.pid,'SIGKILL');}catch(error:any){if(error.code!=='ESRCH')failure??=Object.assign(Error('Could not stop owned process group.'),{code:'PROCESS_STOP_UNVERIFIED'});}}};
 const stop=(message:string,code:string)=>{failure??=Object.assign(Error(message),{code});kill();};
 const abort=()=>stop('Work was cancelled.','WORK_CANCELLED');
 const timer=setTimeout(()=>stop(`Process timed out after ${options.timeoutMs}ms.`,'PROCESS_TIMEOUT'),options.timeoutMs);
 options.signal?.addEventListener('abort',abort,{once:true});
 if(options.signal?.aborted)abort();
 const collect=(chunk:Buffer,which:'stdout'|'stderr')=>{if(which==='stdout')outBytes+=chunk.length;else errBytes+=chunk.length;if(outBytes>options.maxBuffer||errBytes>options.maxBuffer){stop('Process output exceeded its buffer limit.','PROCESS_OUTPUT_LIMIT');return;}if(which==='stdout')stdout.push(chunk);else stderr.push(chunk);};
 child.stdout.on('data',chunk=>collect(chunk,'stdout'));child.stderr.on('data',chunk=>collect(chunk,'stderr'));
 const exit=await new Promise<{code:number|null;signal:NodeJS.Signals|null}>(resolve=>{child.once('error',error=>{failure??=Object.assign(Error(`Process launch failed: ${error.message}`),{code:'PROCESS_LAUNCH_FAILED'});});child.once('close',(code,signal)=>{closed=true;resolve({code,signal});});child.stdin.on('error',()=>{/* Broken input pipe is reported by exit/output. */});child.stdin.end(options.input??'');});
 clearTimeout(timer);options.signal?.removeEventListener('abort',abort);
 // A leader may exit while descendants close their pipes and keep running.
 // Stop the entire owned group even after successful leader exit.
 kill();
 if(child.pid){const deadline=Date.now()+1500;while(await hasRunningGroupMember(child.pid)){if(Date.now()>=deadline)throw Object.assign(Error('Owned child group exit could not be verified. Do not release its resource permit.'),{code:'PROCESS_STOP_UNVERIFIED'});await new Promise(r=>setTimeout(r,10));}}
 if(!closed)throw Object.assign(Error('Child close was not observed.'),{code:'PROCESS_STOP_UNVERIFIED'});
 if(failure)throw failure;
 if(exit.code!==0)throw Object.assign(Error(`Process exited unsuccessfully (${exit.code??exit.signal}).`),{code:'PROCESS_FAILED',stderr:Buffer.concat(stderr).toString()});
 return {stdout:Buffer.concat(stdout).toString(),stderr:Buffer.concat(stderr).toString()};
}
async function hasRunningGroupMember(group:number):Promise<boolean>{
 // /proc is required evidence. An unreadable process listing is not quiescence.
 const entries=await fs.readdir('/proc');
 for(const name of entries){if(!/^\d+$/.test(name))continue;try{const stat=await fs.readFile(`/proc/${name}/stat`,'utf8');const fields=stat.slice(stat.lastIndexOf(')')+2).split(' ');if(Number(fields[2])===group&&fields[0]!=='Z'&&fields[0]!=='X')return true;}catch(error:any){if(error.code!=='ENOENT'&&error.code!=='ESRCH')throw Object.assign(Error('Could not inspect child group exit.'),{code:'PROCESS_STOP_UNVERIFIED'});}}
 return false;
}
