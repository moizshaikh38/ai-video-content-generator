import os from 'node:os';import fs from 'node:fs';
export type ServiceRole='combined'|'api'|'worker';
export function serviceRole(env:NodeJS.ProcessEnv=process.env):ServiceRole{const role=env.VIREO_SERVICE_ROLE??'combined';if(!['combined','api','worker'].includes(role))throw Error('VIREO_SERVICE_ROLE must be combined, api or worker');return role as ServiceRole;}
export const runsBackgroundWorkers=()=>serviceRole()!=='api';
export const acceptsApiRequests=()=>serviceRole()!=='worker';
function positive(env:NodeJS.ProcessEnv,key:string):number|undefined{const value=env[key];if(value===undefined||value==='')return undefined;const n=Number(value);if(!Number.isSafeInteger(n)||n<=0)throw Error(`${key} must be a positive safe integer`);return n;}
export function renderBudget(env:NodeJS.ProcessEnv=process.env){const max=positive(env,'VIREO_RENDER_MAX_CONCURRENT'),threads=positive(env,'VIREO_FFMPEG_THREADS'),memory=positive(env,'VIREO_RENDER_MEMORY_BUDGET_MB'),perJob=positive(env,'VIREO_RENDER_ESTIMATED_JOB_MB'),reserve=positive(env,'VIREO_RENDER_MEMORY_RESERVE_MB');if(Boolean(memory)!==Boolean(perJob))throw Error('Render memory budget and estimated job memory must be configured together');return{max,threads,memory,perJob,reserve:reserve??256};}
export function budgetedRenderCapacity(input:{cpuCount:number;memoryLimitMb?:number;memoryUsedMb?:number;occupied?:number},env:NodeJS.ProcessEnv=process.env):number{
 const b=renderBudget(env),legacy=Math.max(1,Math.min(4,Math.floor(input.cpuCount/2)));let limit=b.max===undefined?legacy:Math.min(legacy,b.max);
 if(b.threads!==undefined)limit=Math.min(limit,Math.max(1,Math.floor(input.cpuCount/b.threads)));
 if(b.memory!==undefined&&b.perJob!==undefined){const budget=Math.min(b.memory,input.memoryLimitMb??Infinity);limit=Math.min(limit,Math.max(0,Math.floor((budget-b.reserve)/b.perJob)));if(input.memoryLimitMb!==undefined&&input.memoryUsedMb!==undefined)limit=Math.min(limit,(input.occupied??0)+Math.max(0,Math.floor((input.memoryLimitMb-input.memoryUsedMb-b.reserve)/b.perJob)));}
 return limit;
}
export interface RenderHostProbe {
 cpuCount:number;
 availableParallelism:number;
 readFile:(path:string)=>string;
}
/** Injectable reads keep cgroup/affinity regression tests independent of the test host. */
export function hostRenderCapacity(occupied=0,probe:RenderHostProbe={cpuCount:os.cpus().length,availableParallelism:os.availableParallelism?.()??os.cpus().length,readFile:path=>fs.readFileSync(path,'utf8')}):number{
 let memoryLimitMb:number|undefined,memoryUsedMb:number|undefined;let cpuCount=Math.max(1,Math.min(probe.cpuCount,probe.availableParallelism));
 for(const root of['/sys/fs/cgroup','/sys/fs/cgroup/user']){try{const [quota,period]=probe.readFile(root+'/cpu.max').trim().split(/\s+/).map(Number);if(Number.isFinite(quota)&&quota>0&&Number.isFinite(period)&&period>0)cpuCount=Math.min(cpuCount,Math.max(1,Math.floor(quota/period)));}catch{}try{const max=Number(probe.readFile(root+'/memory.max')),used=Number(probe.readFile(root+'/memory.current'));if(Number.isFinite(max)&&max>0&&Number.isFinite(used)){if(memoryLimitMb===undefined||max/1048576<memoryLimitMb){memoryLimitMb=max/1048576;memoryUsedMb=used/1048576;}}}catch{}}
 return budgetedRenderCapacity({cpuCount,memoryLimitMb,memoryUsedMb,occupied});
}
export function ffmpegThreadArgs(env:NodeJS.ProcessEnv=process.env):string[]{const n=renderBudget(env).threads;return n===undefined?[]:['-threads',String(n),'-filter_threads',String(n),'-filter_complex_threads',String(n)];}
export function ffmpegEncoderThreadArgs(env:NodeJS.ProcessEnv=process.env):string[]{const n=renderBudget(env).threads;return n===undefined?[]:['-threads',String(n)];}
export function renderSweepInterval(env:NodeJS.ProcessEnv=process.env):number{const value=positive(env,'VIREO_RENDER_SWEEP_INTERVAL_MS')??60000;if(value<1000||value>60000)throw Error('Render sweep interval must be between 1000 and 60000 milliseconds');return value;}
export function validateRuntimePolicy(){serviceRole();renderBudget();renderSweepInterval();}
