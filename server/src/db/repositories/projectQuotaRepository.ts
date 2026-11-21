import crypto from 'node:crypto';
import type {Db, MongoClient, ClientSession} from 'mongodb';
import {getMongoClient, getMongoDb} from '../mongoClient.js';
import {validateRecord} from '../schemaValidation.js';
import {AppError} from '../../types/index.js';

export type ProjectQuotaPolicy = {kind: 'unlimited'} | {kind: 'limited'; maximum: number; displayName: string};
export function projectQuotaPolicy(entitlements: any): ProjectQuotaPolicy {
  if (entitlements?.isUnlimited === true) return {kind: 'unlimited'};
  if (entitlements?.isUnlimited !== false || !Number.isSafeInteger(entitlements.limits?.maxProjects) || entitlements.limits.maxProjects < 0) throw new AppError('Project plan is unavailable.', 503, 'PROJECT_PLAN_UNAVAILABLE');
  return {kind: 'limited', maximum: entitlements.limits.maxProjects, displayName: String(entitlements.displayName || 'current')};
}
const fenceId = (owner: string) => crypto.createHash('sha256').update(JSON.stringify(['project-quota-v1', owner])).digest('hex');

/** Preserve the existing all-status UTC-month project-count policy, but do not
 * turn malformed clocks into free allowance. No data repair or renewal grant. */
export async function readProjectUsageCount(db: Db, owner: string, now = new Date(), session?: ClientSession): Promise<number> {
  const unknown = await db.collection('projects').findOne({user_id: owner, $or: [
    {created_at: {$not: {$type: ['date', 'string']}}},
    {$expr: {$eq: [{$convert: {input: '$created_at', to: 'date', onError: null, onNull: null}}, null]}},
  ]}, {session, projection: {_id: 1}});
  if (unknown) throw new AppError('Existing project usage has an invalid timestamp. Review usage before creating another project.', 503, 'PROJECT_USAGE_UNAVAILABLE');
  const start = new Date(now); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
  return db.collection('projects').countDocuments({user_id: owner, $expr: {$gte: [{$convert: {input: '$created_at', to: 'date', onError: null, onNull: null}}, start]}}, {session});
}

/** Count and insert after the account's write fence in the same transaction.
 * The built-in unique _id index supplies first-use serialization. No fallback
 * to count-then-insert when transactions or plan information are unavailable. */
export async function insertProjectWithinQuota(owner: string, record: Record<string, any>, policy: ProjectQuotaPolicy, database?: Db, mongoClient?: MongoClient): Promise<any> {
  if (!owner || record.user_id !== owner) throw new AppError('Project owner is invalid.', 403, 'PROJECT_OWNER_MISMATCH');
  if (policy?.kind !== 'unlimited' && (policy?.kind !== 'limited' || !Number.isSafeInteger(policy.maximum) || policy.maximum < 0)) throw new AppError('Verified project plan is required.', 503, 'PROJECT_PLAN_UNAVAILABLE');
  const now = new Date();
  const normalized = {...record, created_at: record.created_at ? new Date(record.created_at) : now, updated_at: record.updated_at ? new Date(record.updated_at) : now};
  if (!Number.isFinite(normalized.created_at.getTime()) || !Number.isFinite(normalized.updated_at.getTime())) throw new AppError('Invalid timestamp.', 400, 'INVALID_TIMESTAMP');
  validateRecord('projects', normalized);
  const db = database ?? await getMongoDb(), client = mongoClient ?? await getMongoClient(), id = fenceId(owner);
  const fences = db.collection<any>('project_quota_fences');
  try {await fences.updateOne({_id: id, user_id: owner}, {$setOnInsert: {id, user_id: owner, serial: 0, created_at: now, updated_at: now}}, {upsert: true});}
  catch (error: any) {if (error.code !== 11000 || !await fences.findOne({_id: id, user_id: owner})) throw error;}
  const session = client.startSession();
  try {
    const result = await session.withTransaction(async () => {
      const locked = await fences.updateOne({_id: id, user_id: owner}, {$inc: {serial: 1}, $set: {updated_at: now}}, {session});
      if (locked.matchedCount !== 1) throw new AppError('Project quota serialization is unavailable.', 503, 'PROJECT_USAGE_UNAVAILABLE');
      if (policy.kind === 'limited' && await readProjectUsageCount(db, owner, now, session) >= policy.maximum) throw new AppError(`Your ${policy.displayName} plan allows up to ${policy.maximum} projects per month.`, 403, 'MONTHLY_PROJECT_LIMIT_EXCEEDED');
      await db.collection('projects').insertOne(normalized, {session});
      const {_id, ...saved} = normalized as any; return saved;
    }, {readPreference: 'primary', readConcern: {level: 'snapshot'}, writeConcern: {w: 'majority'}, maxCommitTimeMS: 10000});
    if (!result) throw new AppError('Project admission did not complete.', 503, 'PROJECT_USAGE_UNAVAILABLE');
    return result;
  } finally {await session.endSession();}
}
