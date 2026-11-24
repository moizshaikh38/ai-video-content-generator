import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {MongoClient} from 'mongodb';
import {enqueueSubtitleBurn as enqueue,claimCapacityBoundSubtitleBurn as claim} from '../db/repositories/subtitleBurnDispatchRepository.js';
test('separate worker clients obey explicit shared count and retain unknown/crashed capacity',async(t)=>{
 process.env.VIREO_SUBTITLE_BURN_MAX_ACTIVE='1';const uri=process.env.VIREO_BOUNDARY_TEST_MONGO_URI||'mongodb://127.0.0.1:27029/?replicaSet=hook1172',a=new MongoClient(uri),b=new MongoClient(uri);await Promise.all([a.connect(),b.connect()]);const name='burn_capacity_'+crypto.randomUUID().replaceAll('-',''),db=a.db(name),other=b.db(name),u=crypto.randomUUID();
 try{
  for(let i=0;i<3;i++){const p:any={id:crypto.randomUUID(),user_id:u,source_url:'fixture',subtitle_cues:[],subtitle_style:{preset:'clean'},subtitle_export_status:'idle'};await db.collection('projects').insertOne(p);await enqueue(a,db,{userId:u,projectId:p.id,project:p});}
  const results=await Promise.all([claim(a,db,'a'),claim(b,other,'b')]);assert.equal(results.filter(Boolean).length,1);const job=results.find(Boolean)!;assert.equal(await claim(b,other,'c'),null);await db.collection('subtitle_burn_jobs').updateOne({id:job.id},{$set:{status:'review_required',claimed_at:new Date(0)}});assert.equal(await claim(b,other,'d'),null);
  // Only a verified terminal state releases this count; no timeout/reclaim.
  await db.collection('subtitle_burn_jobs').updateOne({id:job.id},{$set:{status:'failed'}});assert(await claim(b,other,'e'));
  process.env.VIREO_SUBTITLE_BURN_MAX_ACTIVE='2';await assert.rejects(claim(a,db,'mismatch'),{code:'SUBTITLE_CAPACITY_POLICY_MISMATCH'});delete process.env.VIREO_SUBTITLE_BURN_MAX_ACTIVE;await assert.rejects(claim(a,db,'missing'),/required/);
  t.diagnostic('Actual separate-client Mongo transactional count admission. Synthetic max1 only, no production sizing. Concurrent claim bounded, unknown/old job holds capacity, policy mismatch/missing fail closed. Not a CPU/RAM/scratch bound.');
 }finally{await db.dropDatabase();await Promise.all([a.close(),b.close()]);delete process.env.VIREO_SUBTITLE_BURN_MAX_ACTIVE;}
});
