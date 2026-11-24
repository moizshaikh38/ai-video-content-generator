import type{Db}from'mongodb';import{automaticOneExportEnabled,coreProcessingDispatchEnabled,clipSelectionDispatchEnabled,coreSelectionContinuationEnabled}from'../services/runtimePolicy.js';
/** Additive query indexes only, behind the same dormant stage switches. No TTL,
 * row migration, uniqueness conversion, stale claim release or data deletion. */
export async function ensureDurableDispatchIndexes(db:Db,env:NodeJS.ProcessEnv=process.env){
 const specs:Array<{collection:string;key:Record<string,1|-1>;name:string}>=[];
 if(coreProcessingDispatchEnabled(env))specs.push(
  {collection:'core_processing_jobs',key:{version:1,status:1,worker_id:1,created_at:1,_id:1},name:'core_dispatch_claim_v1'},
  {collection:'core_processing_jobs',key:{user_id:1,project_id:1,status:1},name:'core_dispatch_project_v1'},
  {collection:'core_processing_jobs',key:{id:1,status:1,worker_id:1},name:'core_dispatch_result_v1'});
 if(clipSelectionDispatchEnabled(env))specs.push(
  {collection:'clip_selection_jobs',key:{version:1,status:1,worker_id:1,created_at:1,_id:1},name:'selection_dispatch_claim_v1'},
  {collection:'clip_selection_jobs',key:{user_id:1,project_id:1,status:1},name:'selection_dispatch_project_v1'},
  {collection:'clip_selection_jobs',key:{user_id:1,project_id:1,id:1},name:'selection_dispatch_read_v1'},
  {collection:'clip_selection_jobs',key:{id:1,status:1,worker_id:1},name:'selection_dispatch_result_v1'});
 if(coreSelectionContinuationEnabled(env))specs.push({collection:'core_selection_outbox',key:{version:1,status:1,created_at:1,_id:1},name:'core_selection_delivery_v1'});
 if(automaticOneExportEnabled(env))specs.push({collection:'automatic_export_outbox',key:{version:1,status:1,created_at:1,_id:1},name:'automatic_export_delivery_v1'});
 for(const spec of specs)await db.collection(spec.collection).createIndex(spec.key,{name:spec.name});
 return specs.map(spec=>({collection:spec.collection,name:spec.name}));
}
