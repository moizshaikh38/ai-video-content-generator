import test from 'node:test';
import assert from 'node:assert/strict';
import {runsPublishingWorker,runsMultimodalWorker,runsBackgroundWorkers,validateRuntimePolicy} from '../services/runtimePolicy.js';

test('optional worker flags preserve defaults, role boundaries and independence',()=>{
 for(const role of ['combined','worker']){
  const env={VIREO_SERVICE_ROLE:role};assert(runsPublishingWorker(env));assert(runsMultimodalWorker(env));
  for(const off of ['false','0']){
   assert(!runsPublishingWorker({...env,VIREO_PUBLISHING_WORKER_ENABLED:off}));assert(runsMultimodalWorker({...env,VIREO_PUBLISHING_WORKER_ENABLED:off}));
   assert(!runsMultimodalWorker({...env,VIREO_MULTIMODAL_WORKER_ENABLED:off}));assert(runsPublishingWorker({...env,VIREO_MULTIMODAL_WORKER_ENABLED:off}));
  }
  for(const on of ['true','1','']){assert(runsPublishingWorker({...env,VIREO_PUBLISHING_WORKER_ENABLED:on}));assert(runsMultimodalWorker({...env,VIREO_MULTIMODAL_WORKER_ENABLED:on}));}
 }
 assert(runsPublishingWorker({}));assert(runsMultimodalWorker({}));
 for(const value of ['true','false','1','0']){assert(!runsPublishingWorker({VIREO_SERVICE_ROLE:'api',VIREO_PUBLISHING_WORKER_ENABLED:value}));assert(!runsMultimodalWorker({VIREO_SERVICE_ROLE:'api',VIREO_MULTIMODAL_WORKER_ENABLED:value}));}
});

test('malformed optional worker policy fails startup validation even in API role',()=>{
 const keys=['VIREO_SERVICE_ROLE','VIREO_PUBLISHING_WORKER_ENABLED','VIREO_MULTIMODAL_WORKER_ENABLED'];const prior=keys.map(k=>[k,process.env[k]] as const);
 try{for(const role of ['combined','api','worker']){process.env.VIREO_SERVICE_ROLE=role;for(const key of keys.slice(1)){for(const k of keys.slice(1))delete process.env[k];for(const bad of ['yes','off','TRUE','2',' false ']){process.env[key]=bad;assert.throws(()=>validateRuntimePolicy(),new RegExp(key));}}}}
 finally{for(const[k,v]of prior){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});

test('disabled poll entry points do no work, enabled paths remain reachable, core role stays active',async()=>{
 const {publishingService}=await import('../services/publishingService.js');
 const {VideoAnalysisWorker}=await import('../services/multimodal/videoAnalysisWorker.js');
 const keys=['VIREO_SERVICE_ROLE','VIREO_PUBLISHING_WORKER_ENABLED','VIREO_MULTIMODAL_WORKER_ENABLED'];const prior=keys.map(k=>[k,process.env[k]] as const);
 const publishing=publishingService as any, oldDue=publishing.executeDueJobs, oldClaim=VideoAnalysisWorker.claimNextJob;
 let due=0,claim=0;publishing.executeDueJobs=async()=>{due++;return 7;};VideoAnalysisWorker.claimNextJob=async()=>{claim++;return null;};
 try{
  process.env.VIREO_SERVICE_ROLE='combined';process.env.VIREO_PUBLISHING_WORKER_ENABLED='false';process.env.VIREO_MULTIMODAL_WORKER_ENABLED='false';assert(runsBackgroundWorkers());
  assert.equal(await publishingService.processDueJobs(),0);assert.equal(await VideoAnalysisWorker.processNext(),false);assert.equal(due,0);assert.equal(claim,0);
  process.env.VIREO_PUBLISHING_WORKER_ENABLED='true';assert.equal(await publishingService.processDueJobs(),7);assert.equal(due,1);assert.equal(await VideoAnalysisWorker.processNext(),false);assert.equal(claim,0);
  process.env.VIREO_MULTIMODAL_WORKER_ENABLED='true';assert.equal(await VideoAnalysisWorker.processNext(),false);assert.equal(claim,1);
  process.env.VIREO_SERVICE_ROLE='api';assert.equal(await publishingService.processDueJobs(),0);assert.equal(await VideoAnalysisWorker.processNext(),false);assert.equal(due,1);assert.equal(claim,1);
 }finally{publishing.executeDueJobs=oldDue;VideoAnalysisWorker.claimNextJob=oldClaim;for(const[k,v]of prior){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});

test('publishing worker start does not schedule a disabled timer',async()=>{
 const {startPublishingWorker,stopPublishingWorker}=await import('../services/publishing/publishingWorker.js');
 const priorRole=process.env.VIREO_SERVICE_ROLE,priorFlag=process.env.VIREO_PUBLISHING_WORKER_ENABLED,oldSet=globalThis.setTimeout,oldClear=globalThis.clearTimeout;
 let timers=0,cleared=0;globalThis.setTimeout=((()=>{timers++;return{unref(){}};}) as unknown) as typeof setTimeout;globalThis.clearTimeout=((()=>{cleared++;}) as unknown) as typeof clearTimeout;
 try{process.env.VIREO_SERVICE_ROLE='combined';process.env.VIREO_PUBLISHING_WORKER_ENABLED='false';startPublishingWorker();assert.equal(timers,0);process.env.VIREO_PUBLISHING_WORKER_ENABLED='true';startPublishingWorker();assert.equal(timers,1);startPublishingWorker();assert.equal(timers,1);stopPublishingWorker();assert.equal(cleared,1);}
 finally{stopPublishingWorker();globalThis.setTimeout=oldSet;globalThis.clearTimeout=oldClear;if(priorRole===undefined)delete process.env.VIREO_SERVICE_ROLE;else process.env.VIREO_SERVICE_ROLE=priorRole;if(priorFlag===undefined)delete process.env.VIREO_PUBLISHING_WORKER_ENABLED;else process.env.VIREO_PUBLISHING_WORKER_ENABLED=priorFlag;}
});
