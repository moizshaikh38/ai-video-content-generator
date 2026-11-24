import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
test('actual durable burn worker entry reserves one process-local slot before awaits and releases on completion or error',async(t)=>{
 Object.assign(process.env,{NODE_ENV:'test',VIREO_SERVICE_ROLE:'worker',VIREO_SUBTITLE_BURN_DISPATCH_V1:'1',MONGODB_URI:process.env.VIREO_BOUNDARY_TEST_MONGO_URI||'mongodb://127.0.0.1:27029/?replicaSet=hook1172',MONGODB_DB_NAME:'burn_single_'+crypto.randomUUID().replaceAll('-','')});
 const {getMongoDb,getMongoClient,closeMongo}=await import('../db/mongoClient.js'),{SubtitleStudioService:S}=await import('../services/subtitleStudioService.js'),{enqueueSubtitleBurn}=await import('../db/repositories/subtitleBurnDispatchRepository.js');
 const db=await getMongoDb(),client=await getMongoClient(),u=crypto.randomUUID(),original=(S as any).runBurnWorker;
 async function add(){const p:any={id:crypto.randomUUID(),user_id:u,source_url:'fixture',subtitle_cues:[{start:0,end:1,text:'Synthetic'}],subtitle_style:{preset:'clean'},subtitle_export_status:'idle'};await db.collection('projects').insertOne(p);await enqueueSubtitleBurn(client,db,{userId:u,projectId:p.id,project:p});return p;}
 try{
  await add();await add();let entered!:()=>void,release!:()=>void;const atExecution=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);let active=0,max=0,calls=0;
  (S as any).runBurnWorker=async(projectId:string,owner:string,token:string,identity:string)=>{calls++;active++;max=Math.max(max,active);entered();await gate;await db.collection('projects').updateOne({id:projectId,user_id:owner,subtitle_export_run_token:token},{$set:{subtitle_export_run_token:null,subtitle_export_status:'ready',subtitle_export_identity:identity}});active--;};
  const first=S.processNextBurnJob();assert.equal(await S.processNextBurnJob(),false);await atExecution;assert.equal(await S.processNextBurnJob(),false);assert.equal(await db.collection('subtitle_burn_jobs').countDocuments({status:'queued'}),1);release();assert.equal(await first,true);assert.equal(await S.processNextBurnJob(),true);assert.equal(calls,2);assert.equal(max,1);
  // A failed pre-execution claim did not launch a child and releases the slot.
  // Patch the driver prototype because getMongoDb creates a fresh Db wrapper.
  const {Collection}=await import('mongodb');const oldClaim=Collection.prototype.findOneAndUpdate;
  (Collection.prototype as any).findOneAndUpdate=function(...args:any[]){if(this.collectionName==='subtitle_burn_jobs')throw Error('Injected claim read failure');return oldClaim.apply(this,args as any);};
  try{await assert.rejects(S.processNextBurnJob(),/Injected claim read failure/);}finally{Collection.prototype.findOneAndUpdate=oldClaim;}
  assert.equal(await S.processNextBurnJob(),false);
  await add();(S as any).runBurnWorker=async()=>{throw Error('Unknown executor stop');};assert.equal(await S.processNextBurnJob(),true);assert.equal(await db.collection('subtitle_burn_jobs').countDocuments({status:'review_required'}),1);
  const review=await db.collection('subtitle_burn_jobs').findOne({status:'review_required'});assert.equal((await db.collection('projects').findOne({id:review!.project_id}))?.subtitle_export_run_token,review!.run_token);
  // Unverified child stop quarantines capacity in this process, even for a
  // different queued job. No timer or elapsed lease releases this slot.
  await add();assert.equal(await S.processNextBurnJob(),false);assert.equal(await db.collection('subtitle_burn_jobs').countDocuments({status:'queued'}),1);
  t.diagnostic('Actual Mongo/service entry, synthetic executor. At most one active call per process; queued second job remains unclaimed during first execution. Unknown executor outcome quarantines local capacity and preserves durable job/token. Not a global capacity limit.');
 }finally{(S as any).runBurnWorker=original;await db.dropDatabase();await closeMongo();delete process.env.VIREO_SERVICE_ROLE;delete process.env.VIREO_SUBTITLE_BURN_DISPATCH_V1;}
});
