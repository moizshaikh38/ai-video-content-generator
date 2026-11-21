import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { auditWalletCollectionValidator, WALLET_COLLECTION_JSON_SCHEMA } from '../db/bootstrapMongo.js';

test('real local Mongo wallet audit restores strict error enforcement, rejects invalid money', {
  skip: !process.env.MONGODB_URI,
}, async (t) => {
  const uri = process.env.MONGODB_URI!;
  assert(['127.0.0.1', 'localhost'].includes(new URL(uri).hostname), 'local fixture only');
  const client = new MongoClient(uri, { maxPoolSize: 2 });
  await client.connect();
  const db = client.db('vireo_wallet_audit_' + randomUUID().replaceAll('-', ''));
  let created = false;
  t.after(async () => {
    try { if (created) await db.collection('credit_wallets').drop(); }
    finally { await client.close(); }
  });
  assert.deepEqual(await db.listCollections({}, { nameOnly: true }).toArray(), []);
  await db.createCollection('credit_wallets', {
    validator: { $jsonSchema: WALLET_COLLECTION_JSON_SCHEMA },
    validationLevel: 'moderate', validationAction: 'warn',
  });
  created = true;
  const result = await auditWalletCollectionValidator(db);
  assert.equal(result.status, 'CURRENT');
  const [info] = await db.listCollections({ name: 'credit_wallets' }).toArray();
  assert.equal(info.options?.validationLevel, 'strict');
  assert.equal(info.options?.validationAction, 'error');
  const row = {
    id: randomUUID(), user_id: randomUUID(), available_credits: 1, reserved_credits: 0,
    lifetime_granted: 1, lifetime_consumed: 0, period_granted: 1, period_consumed: 0,
    billing_period: '2026-11', reset_date: '2026-12-01T00:00:00Z', status: 'active',
    version: 1, created_at: new Date(), updated_at: new Date(),
  };
  await db.collection('credit_wallets').insertOne({ ...row });
  for (const reserved_credits of [-1, 0.5, 9007199254740992]) {
    await assert.rejects(db.collection('credit_wallets').insertOne({ ...row, id: randomUUID(), reserved_credits }), { code: 121 });
  }
  assert.equal(await db.collection('credit_wallets').countDocuments(), 1);
});
