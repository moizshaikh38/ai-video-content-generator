import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {getMongoDb,closeMongo} from '../db/mongoClient.js';
import {ownerContext} from '../db/repositories/dataRepository.js';
import {SmartReframeService} from '../services/smartReframeService.js';
test('normal reframe fetch rejects replaced or shifted source even when trim offsets match',async()=>{
 const db=await getMongoDb(),user=crypto.randomUUID(),id=crypto.randomUUID(),trackId=crypto.randomUUID();
 try{
  await db.collection('clips').insertOne({id,user_id:user,source_storage_path:'source-a.mp4',start_seconds:10,end_seconds:30,trim_start_offset:1,trim_end_offset:2,aspect_ratio:'9:16'});
  await db.collection('reframe_tracks').insertOne({id:trackId,clip_id:id,user_id:user,status:'ready',analyzed_trim_start:1,analyzed_trim_end:2,analyzed_aspect_ratio:'9:16',created_at:new Date().toISOString(),metadata:{analyzed_source_path:'source-a.mp4',analyzed_source_start:11,analyzed_source_end:28}});
  await ownerContext.run(user,async()=>{
   assert.equal((await SmartReframeService.getReframeTrack(id,user))?.isStale,false);
   const sha='a'.repeat(64);
   assert.equal((await SmartReframeService.getReframeTrack(id,user,sha))?.isStale,true);
   await db.collection('reframe_tracks').updateOne({id:trackId},{$set:{'metadata.analyzed_source_sha256':sha}});
   assert.equal((await SmartReframeService.getReframeTrack(id,user,sha))?.isStale,false);
   assert.equal((await SmartReframeService.getReframeTrack(id,user,'b'.repeat(64)))?.isStale,true);
   await db.collection('clips').updateOne({id},{$set:{source_storage_path:'source-b.mp4'}});
   assert.equal((await SmartReframeService.getReframeTrack(id,user))?.isStale,true);
   await db.collection('clips').updateOne({id},{$set:{source_storage_path:'source-a.mp4',start_seconds:15,end_seconds:35}});
   assert.equal((await SmartReframeService.getReframeTrack(id,user))?.isStale,true);
   await db.collection('clips').updateOne({id},{$set:{start_seconds:10,end_seconds:30}});
   await db.collection('reframe_tracks').updateOne({id:trackId},{$unset:{'metadata.analyzed_source_start':'','metadata.analyzed_source_end':''}});
   assert.equal((await SmartReframeService.getReframeTrack(id,user))?.isStale,true);
  });
 }finally{await db.collection('clips').deleteOne({id});await db.collection('reframe_tracks').deleteOne({id:trackId});await closeMongo();}
});
