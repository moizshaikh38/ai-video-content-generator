import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
for(const failure of ['project-review','job-review','final-read'])test('unknown '+failure+' write/read keeps durable burn token and quarantines local capacity',async(t)=>{
 Object.assign(process.env,{NODE_ENV:'test',VIREO_SERVICE_ROLE:'worker',VIREO_SUBTITLE_BURN_DISPATCH_V1:'1',VIREO_SUBTITLE_BURN_MAX_ACTIVE:'1',MONGODB_URI:process.env.VIREO_BOUNDARY_TEST_MONGO_URI||'mongodb://127.0.0.1:27029/?replicaSet=hook1172',MONGODB_DB_NAME:'burn_ambiguous_'+crypto.randomUUID().replaceAll('-','')});
 const {getMongoDb,getMongoClient,closeMongo}=await import('../db/mongoClient.js'),{SubtitleStudioService:S}=await import('../services/subtitleStudioService.js'),{enqueueSubtitleBurn:enqueue}=await import('../db/repositories/subtitleBurnDispatchRepository.js'),{Collection}=await import('mongodb');
 const db=await getMongoDb(),client=await getMongoClient(),u=crypto.randomUUID(),old={run:(S as any).runBurnWorker,update:Collection.prototype.updateOne,find:Collection.prototype.findOne};
 // Test isolation only: a process-lifetime quarantine is reset here between
 // independent failure scenarios, never exposed as production recovery.
 (S as any).burnDispatchRunning=false;
 async function add(){const p:any={id:crypto.randomUUID(),user_id:u,source_url:'fixture',subtitle_cues:[{start:0,end:1,text:'Synthetic'}],subtitle_style:{preset:'clean'},subtitle_export_status:'idle',subtitle_export_path:'prior.mp4'};await db.collection('projects').insertOne(p);await enqueue(client,db,{userId:u,projectId:p.id,project:p});return p;}
 try{
  const p=await add();await add();let calls=0,executed=false,injected=false;
  (S as any).runBurnWorker=async()=>{calls++;executed=true;if(failure!=='final-read')throw Error('Unknown executor outcome');};
  (Collection.prototype as any).updateOne=function(...args:any[]){const patch=args[1]?.$set;if((failure==='project-review'&&this.collectionName==='projects'&&patch?.subtitle_export_stage==='stop_unverified')||(failure==='job-review'&&this.collectionName==='subtitle_burn_jobs'&&patch?.status==='review_required')){injected=true;throw Error('Injected ambiguous metadata write');}return old.update.apply(this,args as any);};
  (Collection.prototype as any).findOne=function(...args:any[]){if(failure==='final-read'&&executed&&this.collectionName==='projects'){injected=true;throw Error('Injected final read uncertainty');}return old.find.apply(this,args as any);};
  await assert.rejects(S.processNextBurnJob(),/Injected/);assert(injected);assert.equal(calls,1);
  Collection.prototype.updateOne=old.update;Collection.prototype.findOne=old.find;
  const project=await db.collection('projects').findOne({id:p.id}),job=await db.collection('subtitle_burn_jobs').findOne({project_id:p.id});assert.equal(project?.subtitle_export_run_token,job?.run_token);assert.equal(project.subtitle_export_path,'prior.mp4');assert.equal(job.status,'executing');assert.equal(await S.processNextBurnJob(),false);assert.equal(calls,1);assert.equal(await db.collection('subtitle_burn_jobs').countDocuments({status:'queued'}),1);
  t.diagnostic('Actual Mongo service entry with targeted driver failure injection. Unknown metadata/reconciliation outcome preserves same token/prior output and leaves executing job unclaimable plus process-local slot quarantined. No child/media/provider work.');
 }finally{Collection.prototype.updateOne=old.update;Collection.prototype.findOne=old.find;(S as any).runBurnWorker=old.run;(S as any).burnDispatchRunning=false;await db.dropDatabase();await closeMongo();delete process.env.VIREO_SERVICE_ROLE;delete process.env.VIREO_SUBTITLE_BURN_DISPATCH_V1;}
});
