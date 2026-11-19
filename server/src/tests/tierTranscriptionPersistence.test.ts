import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {MongoClient} from 'mongodb';
import {freezeTierSelection,TURBO_MODEL} from '../services/transcription/tierTranscriptionPolicy.js';
import {MAI_MODEL} from '../services/transcription/openRouterTranscriptionProvider.js';
test('real isolated Mongo freezes owner-bound model with competing updates and no network transcription',{
 skip:!process.env.POSTING_TEST_MONGODB_URI,
},async()=>{
 const uri=new URL(process.env.POSTING_TEST_MONGODB_URI!);assert.equal(uri.protocol,'mongodb:');assert(['127.0.0.1','localhost'].includes(uri.hostname));assert(!uri.username&&!uri.password);
 const client=new MongoClient(uri.toString(),{serverSelectionTimeoutMS:3000}),db=client.db('vireo_tier_policy_'+crypto.randomUUID().replaceAll('-',''));
 try{
  await client.connect();await db.collection('credit_reservations').insertOne({attempt_id:'a',user_id:'owner',metadata:{otherEvidence:'retained'}});
  const results=await Promise.all([freezeTierSelection(db,'owner','a',async()=> 'free'),freezeTierSelection(db,'owner','a',async()=> 'pro')]);
  assert.deepEqual(results[0],results[1]);assert([TURBO_MODEL,MAI_MODEL].includes(results[0].model));
  const frozen=await freezeTierSelection(db,'owner','a',async()=>{throw Error('Must not re-resolve after frozen');});assert.deepEqual(frozen,results[0]);
  await assert.rejects(freezeTierSelection(db,'intruder','a',async()=> 'pro'));
  const saved=(await db.collection('credit_reservations').findOne({attempt_id:'a'}))!;assert.equal(saved.metadata.otherEvidence,'retained');assert.deepEqual(saved.metadata.transcriptionPolicy,results[0]);
 }finally{await db.dropDatabase();await client.close();}
});
