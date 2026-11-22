import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';

test('reuse-only reservation fails before source work while fresh intent and verified zero-credit reuse retain their paths',async(t)=>{
  const keys=['NODE_ENV','MONGODB_URI','MONGODB_DB_NAME','OPENROUTER_API_KEY','GROQ_API_KEY'];
  const oldEnv=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  Object.assign(process.env,{NODE_ENV:'test',MONGODB_URI:'mongodb://127.0.0.1:1',MONGODB_DB_NAME:'unused_reuse_preflight_fixture',OPENROUTER_API_KEY:'',GROQ_API_KEY:''});
  const {MongoClient}=await import('mongodb');
  const {config}=await import('../config/index.js');
  const {dataRepository,ownerContext}=await import('../db/repositories/dataRepository.js');
  const {getMongoDb,closeMongo}=await import('../db/mongoClient.js');
  const {processProjectVideo,isProjectProcessingActive}=await import('../services/videoProcessingService.js');
  const {ClipRenderService}=await import('../services/clipRenderService.js');
  const {CreditWalletService}=await import('../services/creditWalletService.js');
  const {UsageService}=await import('../services/usageService.js');
  const {EntitlementService}=await import('../services/entitlementService.js');
  const {transcriptContentIdentity}=await import('../shared/transcriptSourceBinding.js');
  const {workLifecycle}=await import('../services/queue/workLifecycle.js');
  const old={connect:MongoClient.prototype.connect,db:MongoClient.prototype.db,close:MongoClient.prototype.close,from:dataRepository.from,source:ClipRenderService.ensureSourceVideo,walletRelease:CreditWalletService.releaseReservation,walletSettle:CreditWalletService.settleReservation,usageRelease:UsageService.releaseReservation,usageSettle:UsageService.settleReservation,entitlements:EntitlementService.resolveUserEntitlements,fetch:globalThis.fetch};
  const storageKeys=['r2AccountId','r2AccessKeyId','r2SecretAccessKey','r2SourceBucket','r2Endpoint']as const;
  const oldStorage=Object.fromEntries(storageKeys.map(k=>[k,config[k]]));
  let heads=0;
  const server=http.createServer((req,res)=>{assert.equal(req.method,'HEAD');heads++;res.setHeader('Content-Length','7');res.setHeader('ETag','"fixture"');res.end()});
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();assert(address&&typeof address!=='string');
  Object.assign(config,{r2AccountId:'fixture',r2AccessKeyId:'fixture',r2SecretAccessKey:'fixture',r2SourceBucket:'source',r2Endpoint:`http://127.0.0.1:${address.port}`});
  const projectId=crypto.randomUUID(),userId=crypto.randomUUID(),attemptId=crypto.randomUUID(),sourceKey='fixture/key';
  let existing:any=null,reservation:any=null,sourceCalls=0,entitlementCalls=0,unexpectedFetchCalls=0,fakeConnectCalls=0;
  let updates:any[]=[],walletReleases:any[]=[],usageReleases:any[]=[],walletSettles:any[]=[],usageSettles:any[]=[],reservationReads=0;
  const db={async command(command:any){assert.equal(command.ping,1);return{ok:1}},collection(name:string){return{async findOne(filter:any){assert.equal(filter.user_id,userId);if(name==='projects'){assert.equal(filter.id,projectId);return{id:projectId,user_id:userId,source_url:sourceKey}}if(name==='transcripts'){assert.equal(filter.project_id,projectId);return existing}assert.equal(name,'credit_reservations');assert.equal(filter.attempt_id,attemptId);reservationReads++;return reservation}}}};
  (MongoClient.prototype as any).connect=async function(){fakeConnectCalls++;return this};
  (MongoClient.prototype as any).db=function(){return db};
  (MongoClient.prototype as any).close=async()=>{};
  (dataRepository as any).from=(name:string)=>{assert.equal(name,'projects');assert.equal(ownerContext.getStore(),userId);const q={update(delta:any){updates.push(structuredClone(delta));return q},eq(column:string,value:string){assert.equal(value,column==='user_id'?userId:projectId);return q},then(resolve:any,reject:any){return Promise.resolve({data:null,error:null}).then(resolve,reject)}};return q};
  ClipRenderService.ensureSourceVideo=async()=>{sourceCalls++;throw Error('SOURCE_RESOLVER_FIXTURE_STOP')};
  (CreditWalletService as any).releaseReservation=async(...args:any[])=>{walletReleases.push(args)};
  (CreditWalletService as any).settleReservation=async(...args:any[])=>{walletSettles.push(args)};
  (UsageService as any).releaseReservation=async(...args:any[])=>{usageReleases.push(args)};
  (UsageService as any).settleReservation=async(...args:any[])=>{usageSettles.push(args)};
  (EntitlementService as any).resolveUserEntitlements=async()=>{entitlementCalls++;return{isUnlimited:true,limits:{maxUploadDurationSeconds:7200}}};
  globalThis.fetch=async()=>{unexpectedFetchCalls++;throw Error('Unexpected external fetch')};
  const observed:any[]=[];
  try{
    for(const kind of ['orphaned-reuse','fresh-intent','missing-reservation','verified-reuse']){
      sourceCalls=0;entitlementCalls=0;reservationReads=0;updates=[];walletReleases=[];usageReleases=[];walletSettles=[];usageSettles=[];existing=null;
      reservation=kind==='missing-reservation'?null:{attempt_id:attemptId,user_id:userId,metadata:{isReusedTranscript:kind!=='fresh-intent'}};
      if(kind==='verified-reuse'){
        existing={project_id:projectId,user_id:userId,transcript_text:'Source words.',language:'en',duration_seconds:2,segments:[{start:0,end:2,text:'Source words.'}]};
        existing.source_binding={version:1,source_receipt:{key:sourceKey,size:7,etag:'"fixture"',sha256:'a'.repeat(64)},prepared_audio_sha256:'b'.repeat(64),requests:[{sha256:'b'.repeat(64),bytes:7,status:'completed'}],transcript_content_sha256:transcriptContentIdentity(existing)};
      }
      const before=structuredClone(existing),beforeHeads=heads;
      const result=await processProjectVideo(projectId,userId,sourceKey,attemptId);
      assert.equal(isProjectProcessingActive(projectId),false);
      assert.equal(workLifecycle.snapshot().active.length,0);
      if(kind==='orphaned-reuse'){
        assert.equal(result.reviewCode,'TRANSCRIPT_SOURCE_REVIEW_REQUIRED');assert.equal(result.status,'failed');assert.equal(sourceCalls,0);assert.equal(entitlementCalls,0);assert.equal(heads,beforeHeads);
        assert.equal(updates.at(-1).error_code,'TRANSCRIPT_SOURCE_REVIEW_REQUIRED');assert.equal(updates.at(-1).transcript_quality_status,'needs_review');
      }else if(kind==='verified-reuse'){
        assert.equal(result.status,'transcribed');assert.equal(result.transcript,existing);assert.equal(sourceCalls,0);assert.equal(entitlementCalls,1);assert.equal(heads,beforeHeads+1);assert.equal(walletReleases.length,0);assert.equal(usageReleases.length,0);
        assert.equal(walletSettles.length,1);assert.equal(walletSettles[0][1],0);assert.equal(usageSettles.length,1);assert.equal(usageSettles[0][1],0);assert.equal(updates.at(-1).video_status,'transcribed');
      }else{
        assert.equal(result.status,'failed');assert.equal(result.error,'SOURCE_RESOLVER_FIXTURE_STOP');assert.equal(result.reviewCode,undefined);assert.equal(sourceCalls,1);assert.equal(heads,beforeHeads);
      }
      if(kind!=='verified-reuse'){assert.equal(walletReleases.length,1);assert.equal(usageReleases.length,1);assert.equal(walletSettles.length,0);assert.equal(usageSettles.length,0);}
      assert.deepEqual(existing,before);assert.equal(unexpectedFetchCalls,0);
      observed.push({fixture:kind,status:result.status,reviewCode:result.reviewCode??null,sourceResolverCalls:sourceCalls,loopbackStorageHeads:heads-beforeHeads,reservationReads,walletReleaseCalls:walletReleases.length,usageReleaseCalls:usageReleases.length,walletSettledAmounts:walletSettles.map(x=>x[1]),usageSettledAmounts:usageSettles.map(x=>x[1]),activeGuardCleared:!isProjectProcessingActive(projectId)});
    }
    assert.equal(fakeConnectCalls,1);assert.equal(heads,1);assert.equal(unexpectedFetchCalls,0);
    t.diagnostic(JSON.stringify({observed,syntheticFixtures:true,databaseApiDoubled:true,walletAndEntitlementApisDoubled:true,actualVideoProcessingService:true,realDatabaseConnections:0,realProviderCalls:0,actualMoneyOrCreditEffects:false,sourceResolverTrappedBeforeAnyDownloadOrExtraction:true}));
  }finally{
    await closeMongo();MongoClient.prototype.connect=old.connect;MongoClient.prototype.db=old.db;MongoClient.prototype.close=old.close;dataRepository.from=old.from;ClipRenderService.ensureSourceVideo=old.source;CreditWalletService.releaseReservation=old.walletRelease;CreditWalletService.settleReservation=old.walletSettle;UsageService.releaseReservation=old.usageRelease;UsageService.settleReservation=old.usageSettle;EntitlementService.resolveUserEntitlements=old.entitlements;globalThis.fetch=old.fetch;Object.assign(config,oldStorage);
    server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));
    for(const k of keys){const value=oldEnv[k];if(value===undefined)delete process.env[k];else process.env[k]=value;}
  }
});
