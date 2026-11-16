import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import { claimProjectProcessing } from '../db/repositories/projectRepository.js';

test('poster update cannot block idle processing; duplicate, stale and wrong-owner claims stay fenced', { skip: !process.env.MONGODB_URI }, async () => {
  const db = await getMongoDb();
  const id = crypto.randomUUID(), userId = crypto.randomUUID();
  const seen = new Date('2026-11-16T17:00:00Z');
  try {
    await db.collection('projects').insertOne({ id, user_id: userId, video_status: 'uploaded', updated_at: seen });
    await db.collection('projects').updateOne({ id, user_id: userId }, { $set: { poster_key: 'local-test-poster', updated_at: new Date() } });
    const claims = await Promise.all([0, 1].map(() => claimProjectProcessing(userId, id, 'uploaded', seen)));
    assert.equal(claims.filter(Boolean).length, 1);
    assert.equal(await claimProjectProcessing(userId, id, 'processing', seen), false);
    assert.equal(await claimProjectProcessing(crypto.randomUUID(), id, 'processing', seen), false);
    const current = await db.collection('projects').findOne({ id, user_id: userId });
    assert.equal(await claimProjectProcessing(userId, id, 'processing', current!.updated_at), true);
  } finally {
    // Delete only the random record created by this test.
    await db.collection('projects').deleteOne({ id, user_id: userId });
    await closeMongo();
  }
});
