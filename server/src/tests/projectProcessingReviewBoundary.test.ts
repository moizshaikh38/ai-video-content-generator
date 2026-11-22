import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';

test('project processing controller reports only exact transcript review codes as409 before credit reservation',async(t)=>{
  const envKeys=['NODE_ENV','MONGODB_URI','MONGODB_DB_NAME'];const oldEnv=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
  Object.assign(process.env,{NODE_ENV:'test',MONGODB_URI:'mongodb://127.0.0.1:1',MONGODB_DB_NAME:'unused_project_review_fixture'});
  const {MongoClient}=await import('mongodb');const {config}=await import('../config/index.js');
  const {dataRepository,ownerContext}=await import('../db/repositories/dataRepository.js');
  const {closeMongo}=await import('../db/mongoClient.js');
  const {processProject}=await import('../controllers/projectController.js');
  const {isProjectProcessingActive}=await import('../services/videoProcessingService.js');
  const {EntitlementService}=await import('../services/entitlementService.js');const {CreditWalletService}=await import('../services/creditWalletService.js');
  const {transcriptContentIdentity}=await import('../shared/transcriptSourceBinding.js');
  const old={connect:MongoClient.prototype.connect,db:MongoClient.prototype.db,close:MongoClient.prototype.close,from:dataRepository.from,entitlements:EntitlementService.resolveUserEntitlements,reserve:CreditWalletService.reserveCredits,fetch:globalThis.fetch};
  const oldConfig={groqApiKey:config.groqApiKey,transcriptionProvider:config.transcriptionProvider,r2SecretAccessKey:config.r2SecretAccessKey};
  Object.assign(config,{groqApiKey:'fixture',transcriptionProvider:'groq',r2SecretAccessKey:''});
  const userId=crypto.randomUUID(),projectId=crypto.randomUUID(),sourceKey='fixture/key';
  const project={id:projectId,user_id:userId,video_status:'uploaded',source_type:'url',source_url:sourceKey,duration_seconds:2,created_at:new Date().toISOString()};
  let kind='',record:any,connectCalls=0,reserveCalls=0,unexpectedFetchCalls=0,transcriptReads=0;
  const db={async command(command:any){assert.equal(command.ping,1);return{ok:1}},collection(name:string){assert.equal(name,'transcripts');return{async findOne(filter:any){assert.equal(filter.project_id,projectId);assert.equal(filter.user_id,userId);transcriptReads++;if(kind==='unknown-client-error'||kind==='almost-review-code')throw Object.assign(new Error('FIXTURE_PRIVATE_DIAGNOSTIC'),{statusCode:409,code:kind==='almost-review-code'?'TRANSCRIPT_REVIEW_REQUIRED ':'UNRECOGNIZED_FAILURE'});return record}}}};
  (MongoClient.prototype as any).connect=async function(){connectCalls++;return this};(MongoClient.prototype as any).db=function(){return db};(MongoClient.prototype as any).close=async()=>{};
  (dataRepository as any).from=(name:string)=>{assert.equal(name,'projects');assert.equal(ownerContext.getStore(),userId);const q={select(){return q},eq(column:string,value:string){assert.equal(value,column==='user_id'?userId:projectId);return q},async maybeSingle(){return{data:project,error:null}}};return q};
  (EntitlementService as any).resolveUserEntitlements=async()=>({isUnlimited:true,limits:{maxUploadDurationSeconds:7200}});
  CreditWalletService.reserveCredits=async()=>{reserveCalls++;throw Error('Unexpected wallet reservation')};
  globalThis.fetch=async()=>{unexpectedFetchCalls++;throw Error('Unexpected external fetch')};
  const observed:any[]=[];
  try{
    const cases=[{kind:'invalid-clock',code:'TRANSCRIPT_REVIEW_REQUIRED',status:409},{kind:'nested-text',code:'TRANSCRIPT_WORD_TEXT_REVIEW_REQUIRED',status:409},{kind:'missing-lineage',code:'TRANSCRIPT_SOURCE_REVIEW_REQUIRED',status:409},{kind:'unknown-client-error',code:'DATABASE_UNAVAILABLE',status:503},{kind:'almost-review-code',code:'DATABASE_UNAVAILABLE',status:503},{kind:'storage-unavailable',code:'DATABASE_UNAVAILABLE',status:503}];
    for(const item of cases){
      kind=item.kind;record={project_id:projectId,user_id:userId,transcript_text:'Source words.',duration_seconds:2,segments:[{start:0,end:2,text:'Source words.'}],words:[{word:'Source',start:0,end:1},{word:'words.',start:1,end:2}]};
      if(kind==='invalid-clock')record.words[0].end=0;
      if(kind==='nested-text'){record.segments[0].words=[{word:'Source',start:0,end:1},{word:'changed.',start:1,end:2}];delete record.words;}
      if(kind!=='missing-lineage')record.source_binding={version:1,source_receipt:{key:sourceKey,size:7,etag:'"fixture"',sha256:'a'.repeat(64)},prepared_audio_sha256:'b'.repeat(64),requests:[{sha256:'b'.repeat(64),bytes:7,status:'completed'}],transcript_content_sha256:transcriptContentIdentity(record)};
      const before=structuredClone(record);let status=0,payload:any;
      await ownerContext.run(userId,()=>processProject({user:{id:userId},params:{id:projectId},headers:{},body:{}}as any,{status(v:number){status=v;return this},json(v:any){payload=v;return this}}as any));
      assert.equal(status,item.status,kind);assert.equal(payload.code,item.code,kind);assert.equal(JSON.stringify(payload).includes('FIXTURE_PRIVATE_DIAGNOSTIC'),false);assert.deepEqual(record,before);assert.equal(reserveCalls,0);assert.equal(unexpectedFetchCalls,0);assert.equal(isProjectProcessingActive(projectId),false);
      observed.push({fixture:kind,status,code:payload.code,creditReservationCalls:reserveCalls,sourceRecordUnchanged:true,activeProcessing:false});
    }
    assert.equal(transcriptReads,6);assert.equal(connectCalls,1);
    t.diagnostic(JSON.stringify({observed,realProjectController:true,databaseAndEntitlementInterfacesDoubled:true,realDatabaseConnections:0,realWalletEffects:false,providerCalls:0,externalFetchCalls:unexpectedFetchCalls,creditReservationCalls:reserveCalls,actualAuthOrHttpWireOrUiTest:false}));
  }finally{
    await closeMongo();MongoClient.prototype.connect=old.connect;MongoClient.prototype.db=old.db;MongoClient.prototype.close=old.close;dataRepository.from=old.from;EntitlementService.resolveUserEntitlements=old.entitlements;CreditWalletService.reserveCredits=old.reserve;globalThis.fetch=old.fetch;Object.assign(config,oldConfig);
    for(const k of envKeys){const value=oldEnv[k];if(value===undefined)delete process.env[k];else process.env[k]=value;}
  }
});
