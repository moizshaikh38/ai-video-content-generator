import crypto from 'node:crypto';
import type {Collection,Document} from 'mongodb';

export type ResourceCost={memory_mb:number;cpu_millis:number;scratch_mb:number};
export type ResourcePoolPolicy=ResourceCost&{revision:string;max_reservations:number};
export type ResourceIdentity={reservation_id:string;owner_id:string;worker_id:string;kind:string;scope_key:string};
const axes=['memory_mb','cpu_millis','scratch_mb'] as const;
const options={maxTimeMS:2000,writeConcern:{w:'majority' as const,wtimeoutMS:2000}};
function text(value:string,name:string){if(typeof value!=='string'||!value.trim()||value.length>256)throw Error(`${name} must be a nonempty string of at most256characters`);}
function integer(value:number,name:string,zero=false){if(!Number.isSafeInteger(value)||value<(zero?0:1))throw Error(`${name} must be a ${zero?'nonnegative':'positive'} safe integer`);}
function checkedPolicy(policy:ResourcePoolPolicy){text(policy.revision,'revision');for(const axis of axes)integer(policy[axis],axis,axis==='scratch_mb');integer(policy.max_reservations,'max_reservations');return {revision:policy.revision,memory_mb:policy.memory_mb,cpu_millis:policy.cpu_millis,scratch_mb:policy.scratch_mb,max_reservations:policy.max_reservations};}
export function resourcePolicyDigest(policy:ResourcePoolPolicy){return crypto.createHash('sha256').update(JSON.stringify(checkedPolicy(policy))).digest('hex');}
function checkedIdentity(identity:ResourceIdentity){for(const key of ['reservation_id','owner_id','worker_id','kind','scope_key'] as const)text(identity[key],key);return {reservation_id:identity.reservation_id,owner_id:identity.owner_id,worker_id:identity.worker_id,kind:identity.kind,scope_key:identity.scope_key};}
function literal<T>(value:T){return {$literal:value};}
function sameReservation(identity:ResourceIdentity){return {$and:[{$eq:['$$r.reservation_id',literal(identity.reservation_id)]},{$eq:['$$r.worker_id',literal(identity.worker_id)]},{$eq:['$$r.owner_id',literal(identity.owner_id)]},{$eq:['$$r.kind',literal(identity.kind)]},{$eq:['$$r.scope_key',literal(identity.scope_key)]}]};}

/** Atomic resource-accounting primitive, NOT an integrated scheduler.
 * The caller supplies a measured, explicit shared pool policy. No defaults or
 * production sizing are inferred. Each reservation counts until its owner has
 * stopped the work and explicitly releases it. Expiry NEVER frees capacity:
 * an expired lease is not proof that an FFmpeg/Python process stopped.
 * Recovery therefore requires a supervisor that proves process quiescence.
 * Do not wire automatic expiry deletion or a TTL index to these documents. */
export class ResourcePoolAdmission{
 private digest:string;private policy:ResourcePoolPolicy;
 constructor(private collection:Collection<Document>,private poolId:string,policy:ResourcePoolPolicy){text(poolId,'poolId');this.policy=checkedPolicy(policy);this.digest=resourcePolicyDigest(this.policy);}
 async initialize(){
  try{await this.collection.updateOne({_id:this.poolId as any},{$setOnInsert:{schema_version:1,policy:this.policy,policy_digest:this.digest,reservations:[]}},{...options,upsert:true});}catch(error:any){if(error?.code!==11000)throw error;}
  const row=await this.collection.findOne({_id:this.poolId as any},{maxTimeMS:2000});
  if(row?.schema_version!==1||row?.policy_digest!==this.digest||!Array.isArray(row?.reservations))throw Object.assign(Error('Resource pool policy differs or is invalid. Admission stopped.'),{code:'RESOURCE_POLICY_MISMATCH'});
 }
 async reserve(identity:ResourceIdentity,cost:ResourceCost,leaseMs:number):Promise<boolean>{
  identity=checkedIdentity(identity);integer(leaseMs,'leaseMs');for(const axis of axes){integer(cost[axis],axis,axis==='scratch_mb');if(cost[axis]>this.policy[axis])throw Object.assign(Error('Work exceeds the measured resource pool policy.'),{code:'RESOURCE_WORK_TOO_LARGE'});}
  const bounded={$and:[{$lt:[{$size:'$reservations'},this.policy.max_reservations]},...axes.map(axis=>({$lte:[{$add:[{$sum:{$map:{input:'$reservations',as:'r',in:'$$r.cost.'+axis}}},cost[axis]]},this.policy[axis]]}))]};
  const row=await this.collection.findOneAndUpdate({_id:this.poolId as any,schema_version:1,policy_digest:this.digest,'reservations.reservation_id':{$ne:identity.reservation_id},$expr:bounded},[{$set:{reservations:{$concatArrays:['$reservations',[{...Object.fromEntries(Object.entries(identity).map(([k,v])=>[k,literal(v)])),cost:literal({memory_mb:cost.memory_mb,cpu_millis:cost.cpu_millis,scratch_mb:cost.scratch_mb}),started_at:'$$NOW',last_renewed_at:'$$NOW',lease_until:{$dateAdd:{startDate:'$$NOW',unit:'millisecond',amount:leaseMs}}}]]}}}],{...options,returnDocument:'after'});
  if(!row&&!(await this.inspect()))throw Object.assign(Error('Resource pool is missing or has a different policy. Admission stopped.'),{code:'RESOURCE_POLICY_MISMATCH'});
  return Boolean(row);
 }
 async renew(identity:ResourceIdentity,leaseMs:number):Promise<boolean>{
  identity=checkedIdentity(identity);integer(leaseMs,'leaseMs');const match={$and:[sameReservation(identity),{$gt:['$$r.lease_until','$$NOW']}]};
  const renewed={$mergeObjects:['$$r',{last_renewed_at:'$$NOW',lease_until:{$dateAdd:{startDate:'$$NOW',unit:'millisecond',amount:leaseMs}}}]};
  const pipeline=[{$set:{reservations:{$map:{input:'$reservations',as:'r',in:{$cond:[match,renewed,'$$r']}}}}}];
  const row=await this.collection.findOneAndUpdate({_id:this.poolId as any,schema_version:1,policy_digest:this.digest,$expr:{$anyElementTrue:{$map:{input:'$reservations',as:'r',in:match}}}},pipeline,{...options,returnDocument:'after'});
  return Boolean(row);
 }
 /** Only call after all children using this permit have exited. No public
  * request, elapsed timer, or missing heartbeat can supply that evidence. */
 async releaseAfterWorkStopped(identity:ResourceIdentity):Promise<boolean>{
  identity=checkedIdentity(identity);const result=await this.collection.updateOne({_id:this.poolId as any,schema_version:1,policy_digest:this.digest,reservations:{$elemMatch:identity}},{$pull:{reservations:identity} as any},options);
  return result.modifiedCount===1;
 }
 async inspect(){
  const [row]=await this.collection.aggregate([{$match:{_id:this.poolId,schema_version:1,policy_digest:this.digest}},{$project:{_id:0,policy:1,reservation_count:{$size:'$reservations'},used:Object.fromEntries(axes.map(axis=>[axis,{$sum:{$map:{input:'$reservations',as:'r',in:'$$r.cost.'+axis}}}])),expired_reservation_count:{$size:{$filter:{input:'$reservations',as:'r',cond:{$lte:['$$r.lease_until','$$NOW']}}}}}}],{maxTimeMS:2000}).toArray();
  return row??null;
 }
}
