import {test} from 'node:test';import assert from 'node:assert/strict';import {serviceRole,acceptsApiRequests,runsBackgroundWorkers,budgetedRenderCapacity as cap,ffmpegThreadArgs,ffmpegEncoderThreadArgs,renderBudget,renderSweepInterval,hostRenderCapacity} from '../services/runtimePolicy.js';
test('explicit roles, combined compatibility and invalid role refusal',()=>{assert.equal(serviceRole({}),'combined');for(const role of['api','worker','combined'])assert.equal(serviceRole({VIREO_SERVICE_ROLE:role}),role);assert.throws(()=>serviceRole({VIREO_SERVICE_ROLE:'bogus'}));});
test('default render capacity unchanged with no quality, preset or thread override',()=>{for(const n of[1,2,4,8,32])assert.equal(cap({cpuCount:n},{}),Math.max(1,Math.min(4,Math.floor(n/2))));assert.deepEqual(ffmpegThreadArgs({}),[]);assert.deepEqual(ffmpegEncoderThreadArgs({}),[]);});
test('explicit CPU job/thread caps combine with memory budget and live headroom',()=>{const env={VIREO_RENDER_MAX_CONCURRENT:'3',VIREO_FFMPEG_THREADS:'2',VIREO_RENDER_MEMORY_BUDGET_MB:'2048',VIREO_RENDER_ESTIMATED_JOB_MB:'512',VIREO_RENDER_MEMORY_RESERVE_MB:'256'};assert.equal(cap({cpuCount:8},env),3);assert.equal(cap({cpuCount:4},env),2);assert.equal(cap({cpuCount:8,memoryLimitMb:1024,memoryUsedMb:0},env),1);assert.equal(cap({cpuCount:8,memoryLimitMb:1024,memoryUsedMb:800},env),0);assert.equal(cap({cpuCount:8,memoryLimitMb:1024,memoryUsedMb:800,occupied:1},env),1);assert.deepEqual(ffmpegThreadArgs(env),['-threads','2','-filter_threads','2','-filter_complex_threads','2']);assert.deepEqual(ffmpegEncoderThreadArgs(env),['-threads','2']);});
test('malformed budgets refuse rather than silently expand capacity',()=>{for(const value of['0','-1','1.5','NaN','Infinity'])assert.throws(()=>renderBudget({VIREO_RENDER_MAX_CONCURRENT:value}));assert.throws(()=>renderBudget({VIREO_RENDER_MEMORY_BUDGET_MB:'1024'}));assert.throws(()=>renderBudget({VIREO_RENDER_ESTIMATED_JOB_MB:'512'}));});
test('API role defers inline and background queue work without database effects',async()=>{const old=process.env.VIREO_SERVICE_ROLE;process.env.VIREO_SERVICE_ROLE='api';try{assert(acceptsApiRequests());assert(!runsBackgroundWorkers());const {launchInlineRender,ClipRenderService,renderOccupancy}=await import('../services/clipRenderService.js');const before=renderOccupancy();assert.equal(launchInlineRender('fixture','fixture',undefined),false);assert.equal(await ClipRenderService.processDueRenderJobs(),0);assert.equal(renderOccupancy(),before);const{VideoAnalysisWorker}=await import('../services/multimodal/videoAnalysisWorker.js');assert.equal(await VideoAnalysisWorker.processNext(),false);}finally{if(old===undefined)delete process.env.VIREO_SERVICE_ROLE;else process.env.VIREO_SERVICE_ROLE=old;}});

test('queue pickup cadence is explicit, bounded and defaults unchanged',()=>{assert.equal(renderSweepInterval({}),60000);assert.equal(renderSweepInterval({VIREO_RENDER_SWEEP_INTERVAL_MS:'2000'}),2000);for(const v of['0','999','60001','NaN'])assert.throws(()=>renderSweepInterval({VIREO_RENDER_SWEEP_INTERVAL_MS:v}));});

// Production defaults must respect container CPUs even without opt-in budget variables.
test('host defaults respect cgroup quotas and CPU affinity without render overrides',()=>{
 const keys=['VIREO_RENDER_MAX_CONCURRENT','VIREO_FFMPEG_THREADS','VIREO_RENDER_MEMORY_BUDGET_MB','VIREO_RENDER_ESTIMATED_JOB_MB','VIREO_RENDER_MEMORY_RESERVE_MB'];
 const saved=keys.map(key=>[key,process.env[key]] as const);for(const key of keys)delete process.env[key];
 const probe=(quota:string,affinity=32)=>({cpuCount:32,availableParallelism:affinity,readFile:(path:string)=>{if(path==='/sys/fs/cgroup/cpu.max')return quota;throw Error('fixture unavailable');}});
 try{
  assert.equal(hostRenderCapacity(0,probe('200000 100000')),1);
  assert.equal(hostRenderCapacity(0,probe('50000 100000')),1);
  assert.equal(hostRenderCapacity(0,probe('600000 100000')),3);
  assert.equal(hostRenderCapacity(0,probe('max 100000',2)),1);
  assert.equal(hostRenderCapacity(0,probe('malformed',4)),2);
  assert.equal(hostRenderCapacity(0,probe('max 100000')),4);
  assert.equal(hostRenderCapacity(0,{cpuCount:32,availableParallelism:32,readFile:()=>{throw Error('no cgroups');}}),4);
  assert.equal(hostRenderCapacity(0,{cpuCount:32,availableParallelism:32,readFile:path=>path.endsWith('/cpu.max')?(path.includes('/user/')?'200000 100000':'800000 100000'):(()=>{throw Error('no memory fixture');})()}),1);
 }finally{for(const[key,value]of saved){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
