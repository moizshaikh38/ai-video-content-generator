import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {ClientSession, MongoServerError} from 'mongodb';

test('settlement and refund rollbacks retain the active slot until the financial commit', async () => {
 const uri=process.env.MONGODB_URI;
 assert(uri && ['127.0.0.1','localhost'].includes(new URL(uri).hostname),'isolated local Mongo required');
 process.env.NODE_ENV='test';process.env.MONGODB_DB_NAME='vireo_credit_qualified_0041';
 const {getMongoDb,closeMongo}=await import('../db/mongoClient.js');
 const {bootstrapMongo}=await import('../db/bootstrapMongo.js');
 const {CreditRepository}=await import('../db/repositories/creditRepository.js');
 const db=await getMongoDb(),users:string[]=[];
 const commit=ClientSession.prototype.commitTransaction;
 try {
  await bootstrapMongo(db);
  for(const mode of ['settle','refund'] as const) {
   const user=crypto.randomUUID(),attempt=crypto.randomUUID();users.push(user);
   await CreditRepository.grantCredits({userId:user,amount:100,type:'manual_adjustment',idempotencyKey:'fixture-'+user,description:'Synthetic terminal rollback fixture'});
   await CreditRepository.reserveCredits({userId:user,attemptId:attempt,operationId:'core_video_processing',amount:10});
   const slot=await db.collection('user_concurrency_slots').findOne({user_id:user,attempt_id:attempt,status:'active'});
   assert(slot?.slot_token);
   const fence={slotId:String(slot._id),slotToken:slot.slot_token};
   const finish=()=>mode==='settle'?CreditRepository.settleReservation(attempt,7,undefined,fence):CreditRepository.releaseReservation(attempt,'Synthetic refund',fence);
   let injected=false;
   (ClientSession.prototype as any).commitTransaction=async function(){injected=true;throw new MongoServerError({message:'Synthetic refusal before actual terminal commit',code:2});};
   try {await assert.rejects(finish,{code:2});}
   finally {ClientSession.prototype.commitTransaction=commit;}
   assert(injected);
   const wallet=await CreditRepository.getOrCreateWallet(user);
   assert.equal(wallet.available_credits,90);assert.equal(wallet.reserved_credits,10);assert.equal(wallet.lifetime_consumed,0);
   assert.equal((await db.collection('credit_reservations').findOne({user_id:user,attempt_id:attempt}))?.status,'reserved');
   assert.equal(await db.collection('user_concurrency_slots').countDocuments({user_id:user,attempt_id:attempt,status:'active'}),1,`${mode} rollback must not release the committed reservation's slot`);
   let terminalCommitted=false;
   (ClientSession.prototype as any).commitTransaction=async function(...args:any[]) {
    await (commit as any).apply(this,args);terminalCommitted=true;
    throw new MongoServerError({message:'Synthetic reply lost after actual terminal commit',code:91});
   };
   try {await assert.rejects(finish,{code:91});}
   finally {ClientSession.prototype.commitTransaction=commit;}
   assert(terminalCommitted);
   assert((await finish()).idempotent);
   assert.equal((await CreditRepository.getOrCreateWallet(user)).available_credits,mode==='settle'?93:100);
   assert.equal((await CreditRepository.getOrCreateWallet(user)).reserved_credits,0);
   assert.equal(await db.collection('user_concurrency_slots').countDocuments({user_id:user,status:'active'}),0);
  }
 } finally {
  ClientSession.prototype.commitTransaction=commit;
  for(const name of ['credit_wallets','credit_transactions','credit_reservations','idempotency_keys','user_concurrency_slots','outbox_events'])await db.collection(name).deleteMany({user_id:{$in:users}});
  await closeMongo();
 }
});
