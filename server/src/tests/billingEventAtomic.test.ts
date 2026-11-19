import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {MongoClient,Collection} from 'mongodb';
import {config} from '../config/index.js';
import {handlePaddleWebhook} from '../controllers/billingController.js';
import {closeMongo} from '../db/mongoClient.js';
import {applyVerifiedBillingEvent} from '../services/billingEventApplication.js';

test('malformed verified event lookup keys and dates refuse before database access',async()=>{
 const valid:any={provider:'paddle',eventId:'evt_fixture',eventType:'subscription.active',rawEventType:'subscription.activated',occurredAt:new Date(),rawPayload:{fixture:true}};
 let touched=0;const db:any={collection(){touched++;throw Error('DATABASE_SHOULD_NOT_BE_TOUCHED');}};const client:any={db(){touched++;throw Error('DATABASE_SHOULD_NOT_BE_TOUCHED');}};
 for(const patch of [{eventId:''},{eventId:{$ne:null}},{eventId:['evt']},{userId:{$ne:null}},{customerId:17},{subscriptionId:{}},{occurredAt:new Date(NaN)},{currentPeriodEnd:new Date(NaN)},{amount:NaN},{amount:-1},{rawPayload:{data:{id:{$ne:null}}}},{eventType:'unknown'},{status:'bogus'}])await assert.rejects(applyVerifiedBillingEvent({...valid,...patch},db,client),{code:'BILLING_EVENT_INVALID'});
 assert.equal(touched,0);
});

test('actual Mongo billing terminal receipt and state commit together; races, rollback, retry and ownership',async()=>{
 process.env.PADDLE_ENABLED='true';config.paddleApiKey='pdl_sdbx_synthetic_fixture_not_real';config.paddleWebhookSecret='synthetic-fixture-secret';config.paddlePriceProMonthly='pri_FIXTURE';
 const client=await new MongoClient(process.env.MONGODB_URI!,{maxPoolSize:3}).connect();const db=client.db(process.env.MONGODB_DB_NAME);const prefix=crypto.randomUUID();const users:string[]=[],ids:string[]=[];
 const seed=()=>{const user=crypto.randomUUID();users.push(user);const id=`fixture-${prefix}-${ids.length}`;ids.push(id);return {provider:'paddle',eventId:id,eventType:'subscription.active',rawEventType:'subscription.activated',occurredAt:new Date(),userId:user,customerId:`fixture-${user}`,subscriptionId:`fixture-${user}`,planId:'pro',interval:'month',status:'active',rawPayload:{fixture:id},currentPeriodEnd:new Date(Date.now()+86400000)} as any;};
 try{
  for(const [name,key] of [['billing_events',{provider:1,provider_event_id:1}],['subscriptions',{provider:1,provider_subscription_id:1}],['billing_customers',{user_id:1,provider:1}],['subscription_limits',{user_id:1,billing_period:1}],['billing_invoices',{provider:1,provider_invoice_id:1}]] as const)await db.collection(name).createIndex(key as any,{unique:true});
  const event=seed();const race=await Promise.all(Array.from({length:4},()=>applyVerifiedBillingEvent(event,db,client)));assert.equal(race.filter(x=>!x?.idempotent).length,1);assert.equal(await db.collection('subscriptions').countDocuments({user_id:event.userId}),1);assert.equal((await db.collection('billing_events').findOne({provider_event_id:event.eventId}))?.status,'processed');
  await assert.rejects(applyVerifiedBillingEvent({...event,rawPayload:{changed:true}},db,client),{code:'BILLING_EVENT_PAYLOAD_CHANGED'});
  const rollback=seed(),original=Collection.prototype.updateOne;let injected=false;
  (Collection.prototype as any).updateOne=async function(filter:any,...rest:any[]){if(this.collectionName==='subscription_limits'&&filter.user_id===rollback.userId){injected=true;throw Object.assign(Error('Synthetic post-subscription failure'),{code:'FIXTURE_FAILURE'});}return (original as any).call(this,filter,...rest);};
  try{await assert.rejects(applyVerifiedBillingEvent(rollback,db,client),{code:'FIXTURE_FAILURE'});}finally{Collection.prototype.updateOne=original;}
  assert(injected);assert.equal(await db.collection('subscriptions').countDocuments({user_id:rollback.userId}),0);assert.equal(await db.collection('billing_customers').countDocuments({user_id:rollback.userId}),0);assert.equal(await db.collection('billing_events').countDocuments({provider_event_id:rollback.eventId}),0);assert.equal((await applyVerifiedBillingEvent(rollback,db,client))?.idempotent,false);
  const legacy=seed();await db.collection('billing_events').insertOne({provider:'paddle',provider_event_id:legacy.eventId,status:'processing',processed_at:new Date(0)});await assert.rejects(applyVerifiedBillingEvent(legacy,db,client),{code:'BILLING_EVENT_RECOVERY_REQUIRED'});assert.equal(await db.collection('subscriptions').countDocuments({user_id:legacy.userId}),0);
  await db.collection('billing_events').updateOne({provider_event_id:legacy.eventId},{$set:{status:'failed'}});assert.equal((await applyVerifiedBillingEvent(legacy,db,client))?.idempotent,false);
  const other=seed();const conflict={...other,subscriptionId:event.subscriptionId,customerId:event.customerId};const ignored=await applyVerifiedBillingEvent(conflict,db,client);assert(ignored?.ignored);assert.equal(await db.collection('subscriptions').countDocuments({user_id:other.userId}),0);assert.equal((await db.collection('subscriptions').findOne({provider_subscription_id:event.subscriptionId}))?.user_id,event.userId);
  const callback=seed();const callbackBody=JSON.stringify({event_id:callback.eventId,event_type:'subscription.activated',occurred_at:new Date().toISOString(),data:{id:callback.subscriptionId,customer_id:callback.customerId,status:'active',items:[{price:{id:'pri_FIXTURE'}}],custom_data:{userId:callback.userId}}});
  const ts=Math.floor(Date.now()/1000);const sig=crypto.createHmac('sha256',config.paddleWebhookSecret).update(`${ts}:${callbackBody}`).digest('hex');
  async function deliver(signature:string,bodyText=callbackBody){let code=200,body:any;const res:any={status(n:number){code=n;return this;},json(b:any){body=b;return this;},send(b:any){body=b;return this;}};await handlePaddleWebhook({body:bodyText,headers:{'paddle-signature':signature}} as any,res);return {code,body};}
  const invalidBody=JSON.stringify({...JSON.parse(callbackBody),event_id:{$ne:null}});const invalidSig=crypto.createHmac('sha256',config.paddleWebhookSecret).update(`${ts}:${invalidBody}`).digest('hex');assert.equal((await deliver(`ts=${ts};h1=${invalidSig}`,invalidBody)).code,400,'signed but malformed event is rejected before query');
  assert.equal((await deliver('bad')).code,400);assert.equal(await db.collection('billing_events').countDocuments({provider_event_id:callback.eventId}),0);await db.collection('billing_events').insertOne({provider:'paddle',provider_event_id:callback.eventId,status:'processing',processed_at:new Date(0)});assert.equal((await deliver(`ts=${ts};h1=${sig}`)).code,503);await db.collection('billing_events').deleteOne({provider_event_id:callback.eventId});
  const oldUpdate=Collection.prototype.updateOne;(Collection.prototype as any).updateOne=async function(filter:any,...rest:any[]){if(this.collectionName==='subscription_limits'&&filter.user_id===callback.userId)throw Error('Synthetic controller rollback');return (oldUpdate as any).call(this,filter,...rest);};
  try{assert.equal((await deliver(`ts=${ts};h1=${sig}`)).code,500);}finally{Collection.prototype.updateOne=oldUpdate;}
  assert.equal(await db.collection('subscriptions').countDocuments({user_id:callback.userId}),0);assert.equal(await db.collection('billing_events').countDocuments({provider_event_id:callback.eventId}),0);
  assert.equal((await deliver(`ts=${ts};h1=${sig}`)).code,200);assert.equal((await deliver(`ts=${ts};h1=${sig}`)).body.idempotent,true);assert.equal(await db.collection('subscriptions').countDocuments({user_id:callback.userId}),1);
  const cancel={...event,eventId:`fixture-${prefix}-cancel`,eventType:'subscription.canceled',rawEventType:'subscription.canceled',status:'canceled',currentPeriodEnd:new Date(Date.now()-86400000),occurredAt:new Date(Date.now()+1000),rawPayload:{cancel:true}};ids.push(cancel.eventId);await applyVerifiedBillingEvent(cancel,db,client);assert.equal((await db.collection('subscription_limits').findOne({user_id:event.userId}))?.plan_tier,'free','cancellation resolver reads its own transactional subscription write');
 }finally{for(const name of ['subscriptions','billing_customers','subscription_limits','billing_invoices'])await db.collection(name).deleteMany({user_id:{$in:users}});await db.collection('billing_events').deleteMany({provider_event_id:{$in:ids}});await client.close();await closeMongo();}
});
