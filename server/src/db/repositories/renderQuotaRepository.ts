import crypto from 'node:crypto';
import type {Db,ClientSession} from 'mongodb';
import {AppError} from '../../types/index.js';
import {assertRenderQuotaMaximum,assertRenderUsageCount} from '../../shared/renderQuotaSnapshot.js';

export type RenderQuotaPolicy={kind:'unlimited'}|{kind:'limited';maximum:number;displayName:string};
export function renderQuotaPolicy(entitlements:any):RenderQuotaPolicy{
 if(entitlements?.isUnlimited===true)return {kind:'unlimited'};
 if(entitlements?.isUnlimited!==false)throw new AppError('Render plan is unavailable.',503,'RENDER_PLAN_UNAVAILABLE');
 assertRenderQuotaMaximum(entitlements.limits?.maxClipRenders);
 return {kind:'limited',maximum:entitlements.limits.maxClipRenders,displayName:String(entitlements.displayName||'current')};
}
function validatePolicy(policy:RenderQuotaPolicy|undefined):asserts policy is RenderQuotaPolicy{
 if(policy?.kind==='unlimited')return;
 if(policy?.kind!=='limited')throw new AppError('Verified render plan is required for admission.',503,'RENDER_PLAN_UNAVAILABLE');
 assertRenderQuotaMaximum(policy.maximum);
}
const fenceKey=(userId:string)=>crypto.createHash('sha256').update(JSON.stringify(['render-quota-v1',userId])).digest('hex');
/** Provision the account contention row, not a usage reservation. It is outside
 * the transaction to avoid competing first-use upserts aborting one another.
 * Only _id's built-in unique index is needed. Failed admission consumes no job.
 */
export async function ensureRenderQuotaFence(db:Db,userId:string){
 if(typeof userId!=='string'||!userId.trim())throw new AppError('Render owner is invalid.',503,'RENDER_PLAN_UNAVAILABLE');
 const key=fenceKey(userId),collection=db.collection<any>('render_quota_fences'),now=new Date();
 try{await collection.updateOne({_id:key,user_id:userId},{$setOnInsert:{id:key,user_id:userId,serial:0,created_at:now,updated_at:now}},{upsert:true});}
 catch(error:any){if(error.code!==11000||!await collection.findOne({_id:key,user_id:userId}))throw error;}
}
/** Serialize EVERY new account admission before counting jobs in the same
 * snapshot transaction. A conflicting writer retries and sees the committed
 * job, including when it came from a different clip/entry point/process.
 * Retains the existing UTC-month, all-job-status and Date/ISO legacy policy.
 */
export async function assertTransactionalRenderQuota(db:Db,session:ClientSession,userId:string,policy:RenderQuotaPolicy|undefined,now:Date){
 validatePolicy(policy);
 const locked=await db.collection<any>('render_quota_fences').updateOne({_id:fenceKey(userId),user_id:userId},{$inc:{serial:1},$set:{updated_at:now}},{session});
 if(locked.matchedCount!==1)throw new AppError('Render quota serialization is unavailable.',503,'RENDER_USAGE_UNAVAILABLE');
 if(policy.kind==='unlimited')return;
 // Historical usage without a countable clock must not become free quota.
 // Do not repair, delete or infer a month for malformed records.
 const unknown=await db.collection('render_jobs').findOne({user_id:userId,$or:[
  {created_at:{$not:{$type:['date','string']}}},
  {$expr:{$eq:[{$convert:{input:'$created_at',to:'date',onError:null,onNull:null}},null]}}
 ]},{session,projection:{_id:1}});
 if(unknown)throw new AppError('Existing render usage has an invalid timestamp. Review usage before admitting another render.',503,'RENDER_USAGE_UNAVAILABLE');
 const start=new Date(now);start.setUTCDate(1);start.setUTCHours(0,0,0,0);
 const count=await db.collection('render_jobs').countDocuments({user_id:userId,$or:[{created_at:{$gte:start}},{created_at:{$type:'string'},$expr:{$gte:[{$convert:{input:'$created_at',to:'date',onError:null,onNull:null}},start]}}]},{session});
 assertRenderUsageCount(count);
 if(count>=policy.maximum)throw new AppError(`Your ${policy.displayName} plan allows up to ${policy.maximum} clip renders per month. Please upgrade your plan to render more clips.`,403,'MONTHLY_RENDER_LIMIT_EXCEEDED');
}
