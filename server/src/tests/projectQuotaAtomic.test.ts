import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {MongoClient, Collection} from 'mongodb';
import {insertProjectWithinQuota as insert, readProjectUsageCount, projectQuotaPolicy} from '../db/repositories/projectQuotaRepository.js';

test('project policy accepts explicit unlimited/zero, not malformed limits', () => {
  assert.deepEqual(projectQuotaPolicy({isUnlimited: true}), {kind: 'unlimited'});
  assert.equal((projectQuotaPolicy({isUnlimited: false, limits: {maxProjects: 0}}) as any).maximum, 0);
  for (const value of [undefined, {}, {isUnlimited: 'true'}, {isUnlimited: false, limits: {maxProjects: -1}}, {isUnlimited: false, limits: {maxProjects: 1.5}}]) assert.throws(() => projectQuotaPolicy(value), {code: 'PROJECT_PLAN_UNAVAILABLE'});
});

test('real local Mongo serializes project inserts, rolls back failed admissions and rejects uncountable usage', {skip: !process.env.MONGODB_URI}, async () => {
  const uri = process.env.MONGODB_URI!; assert(['localhost', '127.0.0.1'].includes(new URL(uri).hostname));
  const client = await new MongoClient(uri, {maxPoolSize: 3}).connect();
  const db = client.db('vireo_project_quota_' + process.pid), owners: string[] = [];
  const owner = () => {const id = crypto.randomUUID(); owners.push(id); return id;};
  const row = (user: string) => ({id: crypto.randomUUID(), user_id: user, title: 'Synthetic quota fixture', source_type: 'upload', video_status: 'uploading', created_at: new Date()});
  const one = {kind: 'limited', maximum: 1, displayName: 'Fixture'} as const;
  try {
    const u = owner();
    const admissions = await Promise.allSettled([insert(u, row(u), one, db, client), insert(u, row(u), one, db, client)]);
    assert.equal(admissions.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(admissions.filter(r => r.status === 'rejected' && r.reason.code === 'MONTHLY_PROJECT_LIMIT_EXCEEDED').length, 1);
    assert.equal(await db.collection('projects').countDocuments({user_id: u}), 1);
    const other = owner(); assert((await insert(other, row(other), one, db, client)).id);
    const zero = owner(); await assert.rejects(() => insert(zero, row(zero), {...one, maximum: 0}, db, client), {code: 'MONTHLY_PROJECT_LIMIT_EXCEEDED'});
    assert.equal(await db.collection('projects').countDocuments({user_id: zero}), 0);
    const unlimited = owner(); await insert(unlimited, row(unlimited), {kind: 'unlimited'}, db, client); await insert(unlimited, row(unlimited), {kind: 'unlimited'}, db, client);
    assert.equal(await db.collection('projects').countDocuments({user_id: unlimited}), 2);
    await assert.rejects(() => insert(u, row(other), one, db, client), {code: 'PROJECT_OWNER_MISMATCH'});
    const rollback = owner(), original = Collection.prototype.insertOne;
    (Collection.prototype as any).insertOne = function(this: any, document: any, ...options: any[]) {
      if (this.collectionName === 'projects' && document.user_id === rollback) throw Error('isolated project insert failure');
      return (original as any).call(this, document, ...options);
    };
    try {await assert.rejects(() => insert(rollback, row(rollback), one, db, client), /isolated project insert failure/);}
    finally {Collection.prototype.insertOne = original;}
    assert.equal(await db.collection('projects').countDocuments({user_id: rollback}), 0);
    assert.equal((await db.collection('project_quota_fences').findOne({user_id: rollback}))?.serial, 0);
    assert((await insert(rollback, row(rollback), one, db, client)).id);
    for (const bad of [undefined, null, 'invalid', 17, {}]) {
      const invalid = owner(), record: any = row(invalid); record.created_at = bad;
      await db.collection('projects').insertOne(record);
      await assert.rejects(() => insert(invalid, row(invalid), one, db, client), {code: 'PROJECT_USAGE_UNAVAILABLE'});
    }
    const edge = owner();
    await db.collection('projects').insertMany([
      {...row(edge), created_at: '2026-11-01T01:00:00+02:00'},
      {...row(edge), created_at: '2026-10-31T23:00:00-02:00'},
      {...row(edge), created_at: new Date('2026-11-01T00:00:00Z')},
    ]);
    assert.equal(await readProjectUsageCount(db, edge, new Date('2026-11-15T00:00:00Z')), 2, 'compare UTC instants rather than offset timestamp strings');
  } finally {
    for (const name of ['projects', 'project_quota_fences']) await db.collection(name).deleteMany({user_id: {$in: owners}});
    await client.close();
  }
});
