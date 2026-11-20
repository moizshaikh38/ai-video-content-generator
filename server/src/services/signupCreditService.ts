import crypto from 'node:crypto';
import type {Db,MongoClient,Document,WithId} from 'mongodb';
import {getMongoDb,getMongoClient,assertTransactionalTopology} from '../db/mongoClient.js';
import {getCurrentBillingPeriod,getBillingResetDate} from '../db/repositories/creditRepository.js';
import {EntitlementService,getProvisionalMonthlyCredits} from './entitlementService.js';
import {AppError} from '../types/index.js';

/** Called only after authentication. New application profiles and their initial
 * Free grant commit together. Existing profiles are not a balance-backfill job.
 * Fixed per-user identity, not per-month: renewal/expiry policy is unchanged. */
export async function ensureSignupProfile(user:{id:string;email?:string;user_metadata?:Record<string,unknown>},database?:Db,mongoClient?:MongoClient):Promise<any>{
 if(!user||typeof user.id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id))throw new AppError('Authenticated user required.',401,'AUTH_REQUIRED');
 const db=database??await getMongoDb(),client=mongoClient??await getMongoClient();
 const existing=await db.collection('profiles').findOne({id:user.id,user_id:user.id},{projection:{_id:0}});if(existing)return existing;
 await assertTransactionalTopology(client);const session=client.startSession();
 try{return await session.withTransaction(async()=>{
  const profiles=db.collection('profiles'),wallets=db.collection('credit_wallets'),ledger=db.collection('credit_transactions');
  const profile=await profiles.findOne({id:user.id,user_id:user.id},{session,projection:{_id:0}});if(profile)return profile;
  const entitlement=await EntitlementService.resolveUserEntitlements(user.id,user.email,db,session);
  const now=new Date(),period=getCurrentBillingPeriod();
  const name=typeof user.user_metadata?.full_name==='string'?user.user_metadata.full_name.slice(0,120):user.email?.split('@')[0]||'Creator';
  const created:any={id:user.id,user_id:user.id,email:user.email||'',full_name:name,created_at:now,updated_at:now};
  if(entitlement.planId==='free'&&!entitlement.isUnlimited){
   const amount=getProvisionalMonthlyCredits('free');if(!Number.isSafeInteger(amount)||amount<=0)throw new AppError('Signup credit allowance is invalid.',503,'SIGNUP_CREDIT_CONFIG_INVALID');
   const key=`signup_free_${user.id}`,receipt=await ledger.findOne({idempotency_key:key},{session});
   if(receipt&&receipt.user_id!==user.id)throw new AppError('Signup credit receipt mismatch.',503,'SIGNUP_CREDIT_RECEIPT_INVALID');
   let wallet=await wallets.findOne({user_id:user.id},{session});
   // Do not add another grant to a legacy or externally funded wallet.
   if(!receipt&&(!wallet||(wallet.available_credits===0&&wallet.reserved_credits===0&&wallet.lifetime_granted===0&&wallet.lifetime_consumed===0&&wallet.period_granted===0&&wallet.period_consumed===0))){
    if(!wallet){const newWallet:Document={id:crypto.randomUUID(),user_id:user.id,workspace_id:null,available_credits:0,reserved_credits:0,lifetime_granted:0,lifetime_consumed:0,period_granted:0,period_consumed:0,billing_period:period,reset_date:getBillingResetDate(),status:'active',version:1,created_at:now,updated_at:now};const inserted=await wallets.insertOne(newWallet,{session});wallet={...newWallet,_id:inserted.insertedId} as WithId<Document>;}
    if(wallet.status!=='active')throw new AppError('Credit wallet is not active.',403,'WALLET_INACTIVE');
    await wallets.updateOne({id:wallet.id},{$inc:{available_credits:amount,lifetime_granted:amount,period_granted:amount,version:1},$set:{updated_at:now,billing_period:period,reset_date:getBillingResetDate()}},{session});
    await ledger.insertOne({id:crypto.randomUUID(),wallet_id:wallet.id,user_id:user.id,workspace_id:null,type:'monthly_grant',amount,balance_before:0,balance_after:amount,reserved_before:0,reserved_after:0,available_delta:amount,reserved_delta:0,lifetime_granted_delta:amount,lifetime_consumed_delta:0,net_adjustments_delta:0,idempotency_key:key,description:'Initial Free signup credit allowance',metadata:{plan_tier:'free',grant_reason:'signup',billing_period:period},created_at:now},{session});
    created.signup_credit_grant={amount,receipt_key:key,granted_at:now};
   }
  }
  await profiles.insertOne(created,{session});return created;
 },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'},maxCommitTimeMS:5000,timeoutMS:10000});
 }catch(error:any){
  if(error?.code===11000){const winner=await db.collection('profiles').findOne({id:user.id,user_id:user.id},{projection:{_id:0},maxTimeMS:2000});if(winner)return winner;}
  throw error;
 }finally{await session.endSession();}
}
