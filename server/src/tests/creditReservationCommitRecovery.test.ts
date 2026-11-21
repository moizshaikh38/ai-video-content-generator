import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {ClientSession, Collection, MongoServerError} from 'mongodb';

test('reservation retry after a lost actual commit response preserves one debit and its concurrency slot', async () => {
  const uri = process.env.MONGODB_URI;
  assert(uri && ['localhost','127.0.0.1'].includes(new URL(uri).hostname), 'isolated local Mongo required');
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_DB_NAME = 'vireo_credit_commit_' + process.pid;
  const {getMongoDb, closeMongo} = await import('../db/mongoClient.js');
  const {bootstrapMongo} = await import('../db/bootstrapMongo.js');
  const {CreditRepository} = await import('../db/repositories/creditRepository.js');
  const db = await getMongoDb();
  const user = crypto.randomUUID(), attempt = crypto.randomUUID();
  const original = ClientSession.prototype.commitTransaction;
  let committed = false;
  try {
    await bootstrapMongo(db);
    await CreditRepository.grantCredits({userId:user,amount:100,type:'manual_adjustment',idempotencyKey:'fixture-'+user,description:'Synthetic local commit-response fixture'});
    (ClientSession.prototype as any).commitTransaction = async function(...args:any[]) {
      const result = await (original as any).apply(this,args);
      if (!committed) {
        committed=true;
        assert.equal(await db.collection('user_concurrency_slots').countDocuments({user_id:user,attempt_id:attempt,status:'active'}),1,'slot is active immediately after actual financial commit');
        throw new MongoServerError({message:'Synthetic response lost after actual reservation commit',code:91});
      }
      return result;
    };
    const params = {userId:user,attemptId:attempt,operationId:'core_video_processing',amount:10};
    try {await assert.rejects(CreditRepository.reserveCredits(params),{code:91});}
    finally {ClientSession.prototype.commitTransaction=original;}
    assert(committed, 'failure injected after real Mongo commit');
    const replay = await CreditRepository.reserveCredits(params);
    assert(replay.allowed); assert(replay.idempotent);
    assert.equal(replay.wallet.available_credits,90);
    assert.equal(replay.wallet.reserved_credits,10);
    assert.equal(await db.collection('credit_reservations').countDocuments({user_id:user,attempt_id:attempt}),1);
    assert.equal(await db.collection('user_concurrency_slots').countDocuments({user_id:user,attempt_id:attempt,status:'active',reservation_id:replay.reservation!.id}),1,'durably reserved attempt must retain an active linked concurrency slot');

    // A slot fencing failure rolls back every financial and dispatch record.
    const secondAttempt=crypto.randomUUID(), secondParams={...params,attemptId:secondAttempt};
    const originalUpdate=Collection.prototype.updateOne; let fenced=false;
    (Collection.prototype as any).updateOne=async function(filter:any,update:any,...rest:any[]) {
      if(this.collectionName==='user_concurrency_slots' && filter.attempt_id===secondAttempt && update.$set?.status==='active') {fenced=true;return {matchedCount:0,modifiedCount:0};}
      return (originalUpdate as any).call(this,filter,update,...rest);
    };
    try {await assert.rejects(CreditRepository.reserveCredits(secondParams),{code:'RESERVATION_SLOT_CHANGED'});}
    finally {Collection.prototype.updateOne=originalUpdate;}
    assert(fenced);
    const unchanged=await CreditRepository.getOrCreateWallet(user);
    assert.equal(unchanged.available_credits,90);assert.equal(unchanged.reserved_credits,10);
    for(const name of ['credit_transactions','credit_reservations','idempotency_keys']) assert.equal(await db.collection(name).countDocuments({user_id:user,attempt_id:secondAttempt}),0);
    assert.equal(await db.collection('outbox_events').countDocuments({user_id:user,aggregate_id:secondAttempt}),0);
    assert.equal(await db.collection('user_concurrency_slots').countDocuments({user_id:user,attempt_id:secondAttempt}),0);
    assert((await CreditRepository.reserveCredits(secondParams)).allowed);
    assert.equal(await db.collection('user_concurrency_slots').countDocuments({user_id:user,status:'active'}),2);

    async function lostResponse(action:()=>Promise<unknown>) {
      let injected=false;
      (ClientSession.prototype as any).commitTransaction=async function(...args:any[]) {
        const result=await (original as any).apply(this,args);
        if(!injected){injected=true;throw new MongoServerError({message:'Synthetic finalization response lost after actual commit',code:91});}
        return result;
      };
      try {await assert.rejects(action,{code:91});assert(injected);}
      finally {ClientSession.prototype.commitTransaction=original;}
    }
    await lostResponse(()=>CreditRepository.settleReservation(attempt,7));
    assert((await CreditRepository.settleReservation(attempt,7)).idempotent);
    await lostResponse(()=>CreditRepository.releaseReservation(secondAttempt,'Synthetic local failure'));
    assert((await CreditRepository.releaseReservation(secondAttempt,'Synthetic local retry')).idempotent);
    const final=await CreditRepository.getOrCreateWallet(user);
    assert.equal(final.available_credits,93);assert.equal(final.reserved_credits,0);assert.equal(final.lifetime_consumed,7);
    for(const id of [attempt,secondAttempt]) assert.equal(await db.collection('credit_transactions').countDocuments({user_id:user,attempt_id:id,type:'reservation'}),1);
    console.log('ACTUAL_COMMIT_RESPONSE_LOSS_RESERVE_SETTLE_RELEASE_ONCE_ONLY_SLOT_ATOMIC_ROLLBACK_PASS');
  } finally {
    ClientSession.prototype.commitTransaction=original;
    for(const name of ['credit_wallets','credit_transactions','credit_reservations','idempotency_keys','user_concurrency_slots','outbox_events']) await db.collection(name).deleteMany({user_id:user});
    await closeMongo();
  }
});
