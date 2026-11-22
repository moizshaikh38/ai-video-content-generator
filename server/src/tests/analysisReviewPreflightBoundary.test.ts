import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';

test('real analysis service and controller preserve early and specific review errors and clear the active guard',async(t)=>{
  // Only repository reads are doubled. No live database, external storage,
  // model or auth is exercised. Storage HEAD uses a loopback fixture only.
  // The production service/controller and review gate run intact.
  const envKeys=['NODE_ENV','MONGODB_URI','MONGODB_DB_NAME','OPENROUTER_API_KEY','GROQ_API_KEY','VIREO_AUTO_GENRE_REVIEW','VIREO_AUTOMATIC_GAMING_REVIEW'];
  const oldEnv=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
  Object.assign(process.env,{NODE_ENV:'test',MONGODB_URI:'mongodb://127.0.0.1:1',MONGODB_DB_NAME:'unused_analysis_review_fixture',OPENROUTER_API_KEY:'',GROQ_API_KEY:'',VIREO_AUTO_GENRE_REVIEW:'disabled',VIREO_AUTOMATIC_GAMING_REVIEW:'0'});
  const {MongoClient}=await import('mongodb');
  const oldConnect=MongoClient.prototype.connect,oldFetch=globalThis.fetch;
  let connections=0,networkCalls=0,providerCalls=0,reads=0;
  MongoClient.prototype.connect=async function(){connections++;throw Error('Unexpected database connection in preflight fixture')};
  globalThis.fetch=async()=>{networkCalls++;throw Error('Unexpected external fetch in preflight fixture')};
  const {dataRepository,ownerContext}=await import('../db/repositories/dataRepository.js');
  const {config}=await import('../config/index.js');
  const storageKeys=['r2AccountId','r2AccessKeyId','r2SecretAccessKey','r2SourceBucket','r2Endpoint']as const;
  const oldStorage=Object.fromEntries(storageKeys.map(k=>[k,config[k]]));
  const {transcriptContentIdentity,hasValidTranscriptSourceBinding}=await import('../shared/transcriptSourceBinding.js');
  const {ClipAnalysisService,activeClipAnalysisSet}=await import('../services/clipAnalysisService.js');
  const {analyzeProjectClips}=await import('../controllers/clipController.js');
  let heads=0;
  const storage=http.createServer((req,res)=>{assert.equal(req.method,'HEAD');assert(req.url?.startsWith('/source/fixture/key'));heads++;res.setHeader('Content-Length','7');res.setHeader('ETag','"fixture"');res.end()});
  await new Promise<void>(r=>storage.listen(0,'127.0.0.1',r));const address=storage.address();assert(address&&typeof address!=='string');
  Object.assign(config,{r2AccountId:'fixture',r2AccessKeyId:'fixture',r2SecretAccessKey:'fixture',r2SourceBucket:'source',r2Endpoint:`http://127.0.0.1:${address.port}`});
  const oldFrom=dataRepository.from;
  const userId=crypto.randomUUID(),projectId=crypto.randomUUID(),key='fixture/key';
  const project={id:projectId,user_id:userId,title:'Synthetic preflight fixture',source_url:key};
  let transcript:any;
  const observedCases:any[]=[];
  (dataRepository as any).from=(name:string)=>{
    assert.equal(ownerContext.getStore(),userId);
    assert(['projects','transcripts'].includes(name),'no candidate/wallet/other repository operation may be reached');
    const query={select(){return query},eq(column:string,value:string){assert.equal(value,column==='user_id'?userId:projectId);return query},async maybeSingle(){reads++;return{data:name==='projects'?project:transcript,error:null}}};
    return query;
  };
  const provider={generateJsonCompletion:async()=>{providerCalls++;throw Error('Unexpected selection model call')},generateJsonCompletionWithTelemetry:async()=>{providerCalls++;throw Error('Unexpected selection telemetry call')}};
  const service=new ClipAnalysisService(provider as any);
  const valid=()=>({project_id:projectId,user_id:userId,transcript_text:'Source words.',duration_seconds:2,segments:[{start:0,end:2,text:'Source words.'}],words:[{word:'Source',start:0,end:1},{word:'words.',start:1,end:2}]});
  const cases=[
    {name:'zero-length word',delta:{words:[{word:'Source',start:0,end:0},{word:'words.',start:1,end:2}]},code:'TRANSCRIPT_REVIEW_REQUIRED'},
    {name:'provided word rows without clocks',delta:{words:[{word:'Source'},{word:'words.'}]},code:'TRANSCRIPT_REVIEW_REQUIRED'},
    {name:'nested word text mismatch',delta:{words:undefined,segments:[{start:0,end:2,text:'Source words.',words:[{word:'Source',start:0,end:1},{word:'changed.',start:1,end:2}]}]},code:'TRANSCRIPT_WORD_TEXT_REVIEW_REQUIRED'},
    {name:'missing segment clock',delta:{words:undefined,segments:[{end:2,text:'Source words.'}]},code:'TRANSCRIPT_REVIEW_REQUIRED'},
    {name:'invalid segment text retains the later specific guard',delta:{words:undefined,segments:[{start:0,end:2,text:42}]},code:'CLIP_SEGMENTS_INVALID'}
  ];
  try{
    for(const item of cases){
      transcript={...valid(),...item.delta};
      transcript.source_binding={version:1,source_receipt:{key,size:7,etag:'"fixture"',sha256:'a'.repeat(64)},prepared_audio_sha256:'b'.repeat(64),requests:[{sha256:'b'.repeat(64),bytes:7,status:'completed'}],transcript_content_sha256:transcriptContentIdentity(transcript)};
      assert(hasValidTranscriptSourceBinding(transcript,key));
      const before=structuredClone(transcript),beforeReads=reads,beforeHeads=heads;
      const expectedHeads=item.code==='CLIP_SEGMENTS_INVALID'?1:0;
      const expectedError=expectedHeads?{code:item.code}:{code:item.code,statusCode:409};
      await assert.rejects(service.analyzeAndPersistClips({projectId,userId}),expectedError,item.name);
      assert.equal(heads,beforeHeads+expectedHeads);
      assert.equal(reads,beforeReads+2);assert.equal(activeClipAnalysisSet.has(projectId),false,'review failure must not leave the project stuck active');
      let status=0,payload:any;
      await analyzeProjectClips({user:{id:userId},params:{id:projectId},body:{}}as any,{status(v:number){status=v;return this},json(v:any){payload=v;return this}}as any);
      assert.equal(status,409,item.name);assert.equal(payload.code,item.code,item.name);
      assert.equal(reads,beforeReads+4);assert.equal(activeClipAnalysisSet.has(projectId),false);
      assert.equal(heads,beforeHeads+expectedHeads*2);
      assert.deepEqual(transcript,before);assert.equal(providerCalls,0);assert.equal(networkCalls,0);assert.equal(connections,0);
      observedCases.push({fixture:item.name,controllerStatus:status,controllerCode:payload.code,repositoryReads:reads-beforeReads,loopbackStorageHeads:heads-beforeHeads,activeGuardCleared:!activeClipAnalysisSet.has(projectId)});
    }
    assert.equal(reads,20);assert.equal(heads,2);
    t.diagnostic(JSON.stringify({observedCases,repositoryReads:reads,loopbackStorageHeads:heads,unexpectedFetchCalls:networkCalls,providerCalls,databaseConnections:connections,syntheticFixtures:true,repositoryReadsDoubled:true,productionServiceAndController:true,liveDatabaseOrAuthOrHttpWireTest:false}));
  }finally{
    dataRepository.from=oldFrom;globalThis.fetch=oldFetch;MongoClient.prototype.connect=oldConnect;activeClipAnalysisSet.delete(projectId);Object.assign(config,oldStorage);
    storage.closeAllConnections();await new Promise<void>(r=>storage.close(()=>r()));
    for(const k of envKeys){const value=oldEnv[k];if(value===undefined)delete process.env[k];else process.env[k]=value;}
  }
});
