import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {validateRecord} from '../db/schemaValidation.js';
import type {ClipCropMode} from '../types/index.js';

// Keep persisted modes aligned with controller fallback and renderer support.
const modes:ClipCropMode[]=['center','manual','smart','fit'];
test('all supported clip framing modes validate; unknown modes remain rejected',()=>{
 for(const mode of modes)assert.doesNotThrow(()=>validateRecord('clips',{crop_mode:mode}));
 for(const mode of ['bogus','fit_blur','',{},true])assert.throws(()=>validateRecord('clips',{crop_mode:mode}),{code:'INVALID_FIELD'});
});
test('fit mode survives actual owner-scoped persistence and rejects unknown updates',async()=>{
 const {dataRepository,ownerContext}=await import('../db/repositories/dataRepository.js');
 const {getMongoDb,closeMongo}=await import('../db/mongoClient.js');
 const user=crypto.randomUUID(),id=crypto.randomUUID();
 try{
  await ownerContext.run(user,async()=>{
   const inserted=await dataRepository.from('clips').insert({id,user_id:user,project_id:crypto.randomUUID(),crop_mode:'fit',crop_config:{mode:'fit'},aspect_ratio:'9:16',render_status:'draft'}).select('*').single();
   assert.equal(inserted.error,null);assert.equal(inserted.data?.crop_mode,'fit');
   const invalid=await dataRepository.from('clips').update({crop_mode:'bogus'}).eq('id',id);assert(invalid.error);
   const reloaded=await dataRepository.from('clips').select('*').eq('id',id).single();assert.equal(reloaded.data?.crop_mode,'fit');
  });
  await ownerContext.run(crypto.randomUUID(),async()=>{const other=await dataRepository.from('clips').select('*').eq('id',id).maybeSingle();assert.equal(other.data,null);});
 }finally{const db=await getMongoDb();await db.collection('clips').deleteOne({id,user_id:user});await closeMongo();}
});
