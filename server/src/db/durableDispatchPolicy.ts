import type {Db} from 'mongodb';
import {AppError} from '../types/index.js';
import {coreProcessingDispatchEnabled,coreProcessingMaxActive,clipSelectionDispatchEnabled,clipSelectionMaxActive,subtitleBurnDispatchEnabled,subtitleBurnMaxActive} from '../services/runtimePolicy.js';
/** Read-only startup check, not worker liveness or a policy migration. A missing
 * policy remains worker-initialized. Claim-time contention checks are still
 * required because another process can initialize/change it after this read. */
export async function assertDurableDispatchPolicy(db:Db,env:NodeJS.ProcessEnv=process.env):Promise<void>{
 const policies:Array<{collection:string;maximum:number;code:string}>=[];
 if(coreProcessingDispatchEnabled(env))policies.push({collection:'core_processing_capacity',maximum:coreProcessingMaxActive(env),code:'CORE_CAPACITY_POLICY_MISMATCH'});
 if(clipSelectionDispatchEnabled(env))policies.push({collection:'clip_selection_capacity',maximum:clipSelectionMaxActive(env),code:'SELECTION_CAPACITY_POLICY_MISMATCH'});
 if(subtitleBurnDispatchEnabled(env))policies.push({collection:'subtitle_burn_capacity',maximum:subtitleBurnMaxActive(env),code:'SUBTITLE_CAPACITY_POLICY_MISMATCH'});
 for(const policy of policies){
  const saved=await db.collection(policy.collection).findOne({_id:'v1' as any},{projection:{maximum:1},maxTimeMS:1000,timeoutMS:1500});
  if(saved&&saved.maximum!==policy.maximum)throw new AppError('Persisted durable dispatch count policy differs from this process. Startup refused; reconcile the policy explicitly without releasing uncertain work.',503,policy.code);
 }
}
