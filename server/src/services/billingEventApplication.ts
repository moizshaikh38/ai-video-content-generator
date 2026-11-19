import {assertBillingEventShape} from './billing/billingEventValidation.js';
import crypto from 'node:crypto';
import type {Db,MongoClient} from 'mongodb';
import {AppError} from '../types/index.js';
import {getMongoDb,getMongoClient,assertTransactionalTopology} from '../db/mongoClient.js';
import {SubscriptionService,BillingOwnershipError} from './subscriptionService.js';
import type {NormalizedBillingEvent} from './billing/types.js';

/** Called only after signature verification and normalization. All durable
 * effects and the terminal receipt commit together. Never persist a new
 * processing lease outside this transaction. Legacy processing rows need
 * reviewed recovery after old nontransactional writers are retired. */
export async function applyVerifiedBillingEvent(event:NormalizedBillingEvent,database?:Db,mongoClient?:MongoClient){
 assertBillingEventShape(event);
 const db=database??await getMongoDb(),client=mongoClient??await getMongoClient();
 await assertTransactionalTopology(client);
 const session=client.startSession();
 const key={provider:event.provider,provider_event_id:event.eventId};
 const payloadHash=crypto.createHash('sha256').update(JSON.stringify(event.rawPayload)).digest('hex');
 const events=db.collection('billing_events');
 try{
  return await session.withTransaction(async()=>{
   const previous=await events.findOne(key,{session});
   if(previous?.payload_hash&&previous.payload_hash!==payloadHash)throw new AppError('Billing event payload changed.',409,'BILLING_EVENT_PAYLOAD_CHANGED');
   if(previous?.status==='processed'||previous?.status==='ignored')return {idempotent:true,ignored:previous.status==='ignored'};
   if(previous&&previous.status!=='failed')throw new AppError('An earlier billing event attempt needs reviewed recovery.',503,'BILLING_EVENT_RECOVERY_REQUIRED');
   const now=new Date();
   await events.updateOne(key,{$set:{status:'processing',processed_at:now,payload_hash:payloadHash},$setOnInsert:{id:crypto.randomUUID(),...key,created_at:now,event_type:event.rawEventType}},{upsert:true,session});
   let ignored=false,errorCode:string|null=null,errorMessage:string|null=null;
   try{await SubscriptionService.processNormalizedEvent(event,db,session);}
   catch(error){if(!(error instanceof BillingOwnershipError))throw error;ignored=true;errorCode=error.code;errorMessage=error.message;}
   await events.updateOne(key,{$set:{status:ignored?'ignored':'processed',event_type:event.rawEventType,processed_at:new Date(),payload_hash:payloadHash,error_code:errorCode,error_message:errorMessage}},{session});
   return {idempotent:false,ignored};
  },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'}});
 }catch(error:any){
  // A concurrent first delivery may win the unique event key. Only a verified
  // matching terminal receipt is safe to acknowledge, never any duplicate key.
  if(error?.code===11000){const current=await events.findOne(key);if(current?.payload_hash===payloadHash&&(current.status==='processed'||current.status==='ignored'))return {idempotent:true,ignored:current.status==='ignored'};}
  throw error;
 }finally{await session.endSession();}
}
