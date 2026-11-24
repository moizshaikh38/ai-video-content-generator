import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {MongoClient} from 'mongodb';
import {enqueueSubtitleBurn as enqueue,claimSubtitleBurn as claim,executeClaimedSubtitleBurn as execute} from '../db/repositories/subtitleBurnDispatchRepository.js';
import {subtitleBurnIdentity} from '../shared/subtitleBurnIdentity.js';
test('durable subtitle queue: atomic admission, separate-client claims, restart persistence, stale inputs and unknown outcomes',async(t)=>{
 const uri=process.env.VIREO_BOUNDARY_TEST_MONGO_URI||'mongodb://127.0.0.1:27029/?replicaSet=hook1172',name='subtitle_dispatch_'+crypto.randomUUID().replaceAll('-','');
 const api=new MongoClient(uri),workerA=new MongoClient(uri),workerB=new MongoClient(uri);await Promise.all([api.connect(),workerA.connect(),workerB.connect()]);const db=api.db(name),a=workerA.db(name),b=workerB.db(name);
 const owner=crypto.randomUUID();let sequence=0;
 async function project(){const p={id:crypto.randomUUID(),user_id:owner,source_url:'fixture-source-'+sequence++,subtitle_cues:[{start:0,end:1,text:'Synthetic fixture'}],subtitle_style:{preset:'clean'},subtitle_cues_binding:{sourceUrl:'fixture',sourceSha256:'a'.repeat(64)},subtitle_export_status:'idle'};await db.collection('projects').insertOne(p);return p;}
 try{
  const p=await project();const admissions=await Promise.allSettled([enqueue(api,db,{userId:owner,projectId:p.id,project:p}),enqueue(api,db,{userId:owner,projectId:p.id,project:p})]);assert.equal(admissions.filter(x=>x.status==='fulfilled').length,1);assert.equal(await db.collection('subtitle_burn_jobs').countDocuments({}),1);
  const durable=await db.collection('subtitle_burn_jobs').findOne({});assert.equal((await a.collection('projects').findOne({id:p.id}))?.subtitle_export_run_token,durable?.run_token);
  // Disconnect/reconnect API client before a separate worker claims persisted work.
  await api.close();await api.connect();
  const claims=await Promise.all([claim(a,'worker-a'),claim(b,'worker-b')]);assert.equal(claims.filter(Boolean).length,1);const job=claims.find(Boolean)!;let calls=0;
  const results=await Promise.all([execute(a,job,async j=>{calls++;assert.equal(j.project_snapshot.subtitle_cues[0].text,'Synthetic fixture');await a.collection('projects').updateOne({id:j.project_id,subtitle_export_run_token:j.run_token},{$set:{subtitle_export_run_token:null,subtitle_export_status:'ready',subtitle_export_identity:j.identity}});}),execute(b,job,async()=>{calls++;})]);assert.equal(results.filter(Boolean).length,1);assert.equal(calls,1);assert.equal((await db.collection('subtitle_burn_jobs').findOne({id:job.id}))?.status,'completed');
  const stale=await project();await enqueue(api,db,{userId:owner,projectId:stale.id,project:stale});await db.collection('projects').updateOne({id:stale.id},{$set:{subtitle_cues:[{start:0,end:1,text:'Changed'}]}});const sj=await claim(a,'stale-worker');assert(sj);await execute(a,sj,async()=>assert.fail('stale snapshot must not execute'));assert.equal((await db.collection('subtitle_burn_jobs').findOne({id:sj.id}))?.status,'cancelled');assert.equal((await db.collection('projects').findOne({id:stale.id}))?.subtitle_export_run_token,null);
  const unknown=await project();await enqueue(api,db,{userId:owner,projectId:unknown.id,project:unknown});const uj=await claim(a,'unknown-worker');assert(uj);await execute(a,uj,async()=>{throw Error('Unknown execution outcome');});assert.equal((await db.collection('subtitle_burn_jobs').findOne({id:uj.id}))?.status,'review_required');assert.equal((await db.collection('projects').findOne({id:unknown.id}))?.subtitle_export_run_token,uj.run_token);assert.equal(await claim(b,'no-reclaim'),null);
  const crash=await project();await enqueue(api,db,{userId:owner,projectId:crash.id,project:crash});const cj=await claim(a,'crashed-worker');assert(cj);await db.collection('subtitle_burn_jobs').updateOne({id:cj.id},{$set:{claimed_at:new Date(0)}});assert.equal(await claim(b,'never-timeout-reclaim'),null);
  const wrong=await project();const before=await db.collection('projects').findOne({id:wrong.id});await assert.rejects(enqueue(api,db,{userId:'wrong',projectId:wrong.id,project:wrong}),{code:'SUBTITLE_EXPORT_CHANGED'});assert.deepEqual(await db.collection('projects').findOne({id:wrong.id}),before);
  const raced=await project();await db.collection('projects').updateOne({id:raced.id},{$set:{source_url:'new-source'}});await assert.rejects(enqueue(api,db,{userId:owner,projectId:raced.id,project:raced}),{code:'SUBTITLE_EXPORT_CHANGED'});
  assert.equal((await db.collection('projects').findOne({id:raced.id}))?.subtitle_export_run_token,undefined);
  assert.equal(subtitleBurnIdentity(p),durable?.identity);
  t.diagnostic('Actual disposable replica-set transactions and separate Mongo clients. Executor synthetic only, no media/provider/output quality test. Exactly-one admission, claim and execution, restart-persistent queued work, changed input cancellation and no auto-reclaim verified.');
 }finally{await db.dropDatabase();await Promise.all([api.close(),workerA.close(),workerB.close()]);}
});
