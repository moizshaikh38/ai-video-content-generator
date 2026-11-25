import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
process.env.NODE_ENV='test';process.env.MONGODB_DB_NAME='vireo_lease_release_'+process.pid;
const {getMongoClient,getMongoDb,closeMongo}=await import('../db/mongoClient.js');
const {commitFencedRenderOutcome}=await import('../services/queue/renderLeaseCommit.js');
const {DELETION_MARKER_FIELD}=await import('../services/deletionAdmissionService.js');
after(async()=>{await closeMongo();});
const failed={job:{status:'failed',worker_id:null},clip:{render_status:'failed'},preserveSupersedingClip:true};
async function fixture(clipExtra:any,run:(f:any)=>Promise<void>,jobs:any[]=[]){
 const db=await getMongoDb(),client=await getMongoClient(),userId=crypto.randomUUID(),clipId=crypto.randomUUID(),jobId=crypto.randomUUID(),workerId=crypto.randomUUID();
 const identity={userId,clipId,jobId,workerId,renderVersion:1,editorVersion:1};
 await db.collection('clips').insertOne({id:clipId,user_id:userId,project_id:'p',render_version:1,editor_version:2,render_status:'rendering',output_storage_path:'newer-output',render_input_digest:'newer-digest',...clipExtra});
 await db.collection('render_jobs').insertOne({id:jobId,clip_id:clipId,user_id:userId,worker_id:workerId,status:'processing',render_version:1});
 for(const j of jobs)await db.collection('render_jobs').insertOne({id:crypto.randomUUID(),clip_id:clipId,user_id:userId,...j});
 try{await run({db,client,identity,clipId,userId,jobId,commit:()=>commitFencedRenderOutcome(client,db,identity,failed),clip:()=>db.collection('clips').findOne({id:clipId}),job:()=>db.collection('render_jobs').findOne({id:jobId})});}
 finally{for(const n of ['clips','render_jobs'])await db.collection(n).deleteMany({user_id:userId});}
}
test('superseded by a newer editor revision: dead lease released, newer outputs/editor_version preserved, job failed with RENDER_INPUT_CHANGED',()=>fixture({},async f=>{
 await f.commit();const c=await f.clip(),j=await f.job();
 assert.equal(c.render_status,'failed');assert.equal(c.render_error_code,'RENDER_INPUT_CHANGED');
 assert.equal(c.editor_version,2);assert.equal(c.output_storage_path,'newer-output');assert.equal(c.render_input_digest,'newer-digest');assert.equal(c.render_version,1);
 assert.equal(j.status,'failed');assert.equal(j.error_code,'RENDER_INPUT_CHANGED');assert.equal(j.worker_id,null);
 // the released clip no longer blocks a later admission-style transition guarded on non-live render status
 assert.equal((await f.db.collection('clips').updateOne({id:f.clipId,render_status:{$nin:['rendering','uploading']}},{$set:{render_version:2,render_status:'rendering'}})).matchedCount,1);
}));
test('a competing queued/processing/uploading job keeps the clip lease untouched',async()=>{
 for(const status of ['queued','processing','uploading'])await fixture({},async f=>{
  await f.commit();const c=await f.clip();assert.equal(c.render_status,'rendering');assert.equal(c.render_error_code,undefined);assert.equal((await f.job()).status,'failed');
 },[{status,worker_id:status==='queued'?null:'other',render_version:1}]);
});
test('newer admitted render_version and deletion-marked clips are untouched; uploading clip is released',async()=>{
 await fixture({render_version:2},async f=>{await f.commit();const c=await f.clip();assert.equal(c.render_status,'rendering');assert.equal(c.render_version,2);assert.equal(c.render_error_code,undefined);});
 await fixture({[DELETION_MARKER_FIELD]:new Date()},async f=>{await f.commit();const c=await f.clip();assert.equal(c.render_status,'rendering');assert.equal(c.render_error_code,undefined);});
 await fixture({render_status:'ready'},async f=>{await f.commit();assert.equal((await f.clip()).render_status,'ready');});
 await fixture({render_status:'uploading'},async f=>{await f.commit();assert.equal((await f.clip()).render_status,'failed');});
});
test('concurrent-revision safety probe (NOT an admission race: synthetic clip update + job insert, no admission guards): newer render_version/status are never left failed',async()=>{
 for(let i=0;i<8;i++)await fixture({},async f=>{
  await Promise.all([f.commit(),f.db.collection('clips').updateOne({id:f.clipId},{$set:{render_version:2,render_status:'rendering',editor_version:3}}).then(()=>f.db.collection('render_jobs').insertOne({id:crypto.randomUUID(),clip_id:f.clipId,user_id:f.userId,status:'queued',render_version:2}))]);
  const c=await f.clip();assert.equal(c.render_version,2);assert.equal(c.render_status,'rendering');
 });
});
test('fence unchanged: a completed outcome on a superseded clip still throws RENDER_INPUT_CHANGED and publishes nothing',()=>fixture({},async f=>{
 await assert.rejects(()=>commitFencedRenderOutcome(f.client,f.db,f.identity,{job:{status:'completed',worker_id:null},clip:{render_status:'ready',output_storage_path:'stale'}}),{code:'RENDER_INPUT_CHANGED'});
 const c=await f.clip();assert.equal(c.output_storage_path,'newer-output');assert.equal(c.render_status,'rendering');
}));
