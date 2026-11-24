import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
test('queued burn rechecks current preset entitlement before source download or child work',async(t)=>{
 Object.assign(process.env,{NODE_ENV:'test',VIREO_SERVICE_ROLE:'worker',VIREO_SUBTITLE_BURN_DISPATCH_V1:'1',VIREO_SUBTITLE_BURN_MAX_ACTIVE:'1',MONGODB_URI:process.env.VIREO_BOUNDARY_TEST_MONGO_URI||'mongodb://127.0.0.1:27029/?replicaSet=hook1172',MONGODB_DB_NAME:'burn_entitlement_'+crypto.randomUUID().replaceAll('-','')});
 const {getMongoDb,getMongoClient,closeMongo}=await import('../db/mongoClient.js'),{SubtitleStudioService:S}=await import('../services/subtitleStudioService.js'),{enqueueSubtitleBurn:enqueue}=await import('../db/repositories/subtitleBurnDispatchRepository.js'),{EntitlementService:E}=await import('../services/entitlementService.js'),{ClipRenderService:C}=await import('../services/clipRenderService.js');
 const db=await getMongoDb(),client=await getMongoClient(),u=crypto.randomUUID(),p=crypto.randomUUID(),old={ent:E.resolveUserEntitlements,ensure:C.ensureSourceVideo,fetch:globalThis.fetch};let source=0,entitlements=0,network=0;
 try{
  const project:any={id:p,user_id:u,source_url:'fixture',subtitle_cues:[{start:0,end:1,text:'Synthetic'}],subtitle_style:{preset:'hormozi'},subtitle_export_status:'idle',subtitle_export_path:'previous.mp4'};
  await db.collection('projects').insertOne(project);await enqueue(client,db,{userId:u,projectId:p,project});
  E.resolveUserEntitlements=async(owner:string)=>{assert.equal(owner,u);entitlements++;return{allowedSubtitlePresets:['clean'],isUnlimited:false}as any;};
  C.ensureSourceVideo=(async()=>{source++;throw Error('Source must not open after downgrade');})as any;globalThis.fetch=(async()=>{network++;throw Error('No external network expected');})as any;
  assert.equal(await S.processNextBurnJob(),true);assert.equal(entitlements,1);assert.equal(source,0);assert.equal(network,0);
  const row=await db.collection('projects').findOne({id:p});assert.equal(row?.subtitle_export_status,'failed');assert.equal(row.subtitle_export_run_token,null);assert.equal(row.subtitle_export_path,'previous.mp4');assert.match(row.subtitle_export_error,/preset.*current plan/);assert.equal((await db.collection('subtitle_burn_jobs').findOne({project_id:p}))?.status,'failed');assert.equal(await S.processNextBurnJob(),false);
  t.diagnostic('Actual Mongo admission, queue worker and existing unmocked burn executor. Current entitlement denied before scratch/source/FFmpeg. Only entitlement resolver/source/fetch boundaries instrumented. Prior export retained, owned token cleared after known no-child failure, no auto-retry.');
 }finally{E.resolveUserEntitlements=old.ent;C.ensureSourceVideo=old.ensure;globalThis.fetch=old.fetch;await db.dropDatabase();await closeMongo();delete process.env.VIREO_SERVICE_ROLE;delete process.env.VIREO_SUBTITLE_BURN_DISPATCH_V1;}
});
