import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import { ClipAnalysisService } from '../services/clipAnalysisService.js';

test('impossible source/profile duration fails before invoking paid analysis', { skip: !process.env.MONGODB_URI }, async () => {
  const db = await getMongoDb(), uid = crypto.randomUUID(), pid = crypto.randomUUID();
  let calls = 0;
  const service = new ClipAnalysisService({ generateJsonCompletion: async () => { calls++; throw new Error('must not pay for impossible duration'); } } as any);
  try {
    await db.collection('projects').insertOne({ id: pid, user_id: uid, title: 'local duration preflight', clip_preferences: { genre: 'general', genreSelectionMode: 'manual' } });
    await db.collection('transcripts').insertOne({ id: crypto.randomUUID(), project_id: pid, user_id: uid, transcript_text: 'A complete statement about the rule of law.', duration_seconds: 18.51, segments: [{ start: 0, end: 18.51, text: 'A complete statement about the rule of law.' }] });
    await assert.rejects(service.analyzeAndPersistClips({ projectId: pid, userId: uid }), (e: any) => e.code === 'SOURCE_TOO_SHORT_FOR_CLIP_SETTINGS');
    assert.equal(calls, 0);
    // User-selected duration overrides must be honored before prompting too.
    await db.collection('transcripts').updateOne({ project_id: pid, user_id: uid }, { $set: { duration_seconds: 23.51 } });
    await db.collection('projects').updateOne({ id: pid, user_id: uid }, { $set: { 'clip_preferences.preferredDurations': '30-60' } });
    await assert.rejects(service.analyzeAndPersistClips({ projectId: pid, userId: uid }), (e: any) => e.code === 'SOURCE_TOO_SHORT_FOR_CLIP_SETTINGS' && e.message.includes('30-second'));
    assert.equal(calls, 0);
  } finally {
    await db.collection('projects').deleteOne({ id: pid, user_id: uid });
    await db.collection('transcripts').deleteOne({ project_id: pid, user_id: uid });
    await closeMongo();
  }
});
