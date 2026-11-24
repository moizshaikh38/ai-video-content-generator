import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
test('API-only subtitle admission preserves Mongo state and exact completed-attempt readback',async(t)=>{
 Object.assign(process.env,{NODE_ENV:'test',VIREO_SERVICE_ROLE:'api',MONGODB_URI:process.env.VIREO_BOUNDARY_TEST_MONGO_URI||'mongodb://127.0.0.1:27029/?replicaSet=hook1172',MONGODB_DB_NAME:'subtitle_api_boundary_'+crypto.randomUUID().replaceAll('-',''),SUPABASE_URL:'http://127.0.0.1:1',SUPABASE_SECRET_KEY:'fixture'});
 const{getMongoDb,closeMongo}=await import('../db/mongoClient.js');const{ownerContext}=await import('../db/repositories/dataRepository.js');const{CreditRepository:R}=await import('../db/repositories/creditRepository.js');const{CreditWalletService:W}=await import('../services/creditWalletService.js');const{ClipRenderService:C}=await import('../services/clipRenderService.js');const{isProjectProcessingActive}=await import('../services/videoProcessingService.js');const{publishProcessingCompletion:publish}=await import('../services/transcription/processingCompletion.js');
 const{SubtitleStudioService:S}=await import('../services/subtitleStudioService.js');const{EntitlementService:E}=await import('../services/entitlementService.js');
 const db=await getMongoDb(),u=crypto.randomUUID(),other=crypto.randomUUID(),p=crypto.randomUUID(),source='fixture-source';const old={reserve:W.reserveCredits,ensure:C.ensureSourceVideo,fetch:globalThis.fetch,entitlement:E.resolveUserEntitlements,reuse:S.findReusableTranscript};let reservations=0,sourceReads=0,network=0,entitlements=0,reuses=0;
 const names=['projects','credit_wallets','credit_reservations','credit_transactions','idempotency_keys','render_jobs','video_analysis_jobs','transcripts'];
 async function snapshot(){return Object.fromEntries(await Promise.all(names.map(async name=>[name,await db.collection(name).find({}).sort({_id:1}).toArray()])))}

 try{
  await db.collection('projects').insertOne({id:p,user_id:u,source_url:source,source_type:'upload',project_type:'subtitles',video_status:'uploaded',created_at:new Date(),updated_at:new Date()});
  await R.grantCredits({userId:u,amount:20,type:'manual_adjustment',idempotencyKey:crypto.randomUUID(),description:'Disposable API boundary qualification'});
  W.reserveCredits=async(...args)=>{reservations++;return old.reserve.apply(W,args)};
  C.ensureSourceVideo=(async()=>{sourceReads++;throw Error('unexpected media source read')})as any;
  globalThis.fetch=(async()=>{network++;throw Error('unexpected provider network')})as any;
  E.resolveUserEntitlements=(async()=>{entitlements++;throw Error('must not resolve entitlement before rejection')})as any;
  S.findReusableTranscript=(async()=>{reuses++;throw Error('must not clone before rejection')})as any;
  let before=await snapshot();
  for(const attempt of [undefined,crypto.randomUUID()]){
   await assert.rejects(ownerContext.run(u,()=>S.transcribeProject(p,u,attempt)),{code:'PROCESSING_DISPATCH_UNAVAILABLE',statusCode:503});assert.deepEqual(await snapshot(),before);
  }
  await assert.rejects(ownerContext.run(other,()=>S.transcribeProject(p,other)),{code:'PROJECT_NOT_FOUND',statusCode:404});assert.deepEqual(await snapshot(),before);
  assert.equal(entitlements,0);assert.equal(reuses,0);
  // Build a real committed completion through actual wallet settlement/publication.
  const a=crypto.randomUUID(),token=crypto.randomUUID(),tid=crypto.randomUUID();await old.reserve.call(W,{userId:u,attemptId:a,amount:2,operationId:'core_video_processing',metadata:{projectId:p,sourceUrl:source}});
  const transcript={id:tid,project_id:p,user_id:u,transcript_text:'Synthetic fixture words.',segments:[{start:0,end:2,text:'Synthetic fixture words.'}],words:[{word:'Synthetic',start:0,end:.6},{word:'fixture',start:.6,end:1.2},{word:'words.',start:1.2,end:2}],duration_seconds:2,source_binding:{source_receipt:{key:source,size:3,etag:'fixture',sha256:'a'.repeat(64)}}};
  await db.collection('transcripts').insertOne(transcript);await db.collection('projects').updateOne({id:p},{$set:{video_status:'transcribing',processing_attempt_id:a,processing_run_token:token}});await db.collection('credit_reservations').updateOne({attempt_id:a},{$set:{processing_admission:{userId:u,projectId:p,sourceUrl:source,runToken:token}}});
  const owner={userId:u,projectId:p,sourceUrl:source,attemptId:a,runToken:token};await W.settleReservation(a,2,{},(session,replay)=>publish(db,session,owner,transcript,{duration_seconds:2},undefined,replay),{userId:u,projectId:p,sourceUrl:source,runToken:token,transcriptId:tid});await db.collection('projects').updateOne({id:p},{$unset:{processing_run_token:''}});
  before=await snapshot();const done=await ownerContext.run(u,()=>S.transcribeProject(p,u,a));assert.equal(done.completionIsCurrent,true);assert.equal(done.creditsCharged,2);assert.equal(done.attemptId,a);assert.deepEqual(await snapshot(),before);
  await assert.rejects(ownerContext.run(other,()=>S.transcribeProject(p,other,a)),{code:'PROJECT_NOT_FOUND',statusCode:404});assert.deepEqual(await snapshot(),before);
  assert.equal(entitlements,0);assert.equal(reuses,0);
  assert.equal(reservations,0);assert.equal(sourceReads,0);assert.equal(network,0);assert.equal(isProjectProcessingActive(p),false);
  t.diagnostic(JSON.stringify({realMongoReplicaSet:true,newAdmissionRejectedWithoutStateChange:true,otherTenant404:true,realCommittedCompletionReadOnly:true,subtitleCompletedReadbackPreserved:true,entitlementCalls:entitlements,reuseCloneCalls:reuses,reservationCallsFromController:reservations,sourceReadCalls:sourceReads,externalFetchCalls:network,mediaFilesNeeded:false}));
 }finally{E.resolveUserEntitlements=old.entitlement;S.findReusableTranscript=old.reuse;W.reserveCredits=old.reserve;C.ensureSourceVideo=old.ensure;globalThis.fetch=old.fetch;await db.dropDatabase();await closeMongo();}
});
