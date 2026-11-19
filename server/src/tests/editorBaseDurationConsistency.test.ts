import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { buildClipEditorUpdatePayload } from '../../../src/lib/editorSavePayload.js';
import { transcriptContentIdentity } from '../shared/transcriptSourceBinding.js';
import { selectionSourceReceipt } from '../shared/selectionSourceReceipt.js';

// No render, source download, provider, HTTP listener, or new database process.
// Uses the existing local qualification replica set in a separate database.
test('ordinary clip creation and editor trims keep base duration consistent; malformed records are not repaired', async () => {
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: 'mongodb://127.0.0.1:27020/?replicaSet=homeproof',
    MONGODB_DB_NAME: 'vireo_duration_consistency_test',
    SUPABASE_URL: 'http://127.0.0.1:5998', SUPABASE_SECRET_KEY: 'fixture',
    OPENROUTER_API_KEY: '', GROQ_API_KEY: '',
  });
  const { getMongoDb, closeMongo } = await import('../db/mongoClient.js');
  const { ownerContext } = await import('../db/repositories/dataRepository.js');
  const { createClipWithJob } = await import('../db/repositories/clipRepository.js');
  const { ClipRenderService } = await import('../services/clipRenderService.js');
  const db = await getMongoDb();
  const user = crypto.randomUUID(), projectId = crypto.randomUUID(), candidateId = crypto.randomUUID();
  const key = `fixture/${projectId}.mp4`;
  const transcript: any = { transcript_text: 'Synthetic duration consistency input.', language: 'en', duration_seconds: 90,
    segments: [{ start: 0, end: 90, text: 'Synthetic duration consistency input.' }] };
  transcript.source_binding = { version: 1,
    source_receipt: { key, size: 7, etag: 'duration-fixture', sha256: 'a'.repeat(64) },
    prepared_audio_sha256: 'b'.repeat(64), requests: [],
    transcript_content_sha256: transcriptContentIdentity(transcript) };
  try {
    await db.collection('projects').insertOne({ id: projectId, user_id: user, source_url: key, video_status: 'transcribed', duration_seconds: 90 });
    await db.collection('transcripts').insertOne({ ...transcript, id: crypto.randomUUID(), project_id: projectId, user_id: user });
    await db.collection('clip_candidates').insertOne({ id: candidateId, project_id: projectId, user_id: user,
      start_seconds: 10, end_seconds: 40, duration_seconds: 999, status: 'suggested',
      metadata: { selection_source_receipt: selectionSourceReceipt(transcript, key) } });
    const created = await createClipWithJob(projectId, candidateId, user, '9:16', 'center',undefined,undefined,{kind:'unlimited'});
    assert(created);
    const clip: any = created.clip;
    // Creation does not copy an inconsistent candidate duration field.
    assert.equal(clip.duration_seconds, 30);
    const project: any = { canvas: { aspect_ratio: '9:16' }, tracks: [{ type: 'VIDEO', items: [{
      type: 'VIDEO', source_asset_id: clip.id, source_start: 12, source_end: 35,
    }] }] };
    const payload = buildClipEditorUpdatePayload(project, clip);
    assert.equal(payload.trimStartOffset, 2);
    assert.equal(payload.trimEndOffset, 5);
    await ownerContext.run(user, () => ClipRenderService.updateClipEditorConfig(clip.id, user, payload));
    const saved: any = await db.collection('clips').findOne({ id: clip.id });
    assert.equal(saved.duration_seconds, saved.end_seconds - saved.start_seconds);
    assert.equal(saved.duration_seconds - saved.trim_start_offset - saved.trim_end_offset, 23);
    assert.equal(saved.start_seconds, 10); assert.equal(saved.end_seconds, 40);
    // Repeated editor save does not convert the base duration to trimmed duration.
    await ownerContext.run(user, () => ClipRenderService.updateClipEditorConfig(clip.id, user, payload));
    assert.equal((await db.collection('clips').findOne({ id: clip.id }))?.duration_seconds, 30);
    // A direct database clone mutation is outside that ordinary write path.
    await db.collection('clips').updateOne({ id: clip.id }, { $set: { end_seconds: 15, trim_start_offset: 0, trim_end_offset: 0 } });
    await ownerContext.run(user, () => ClipRenderService.updateClipEditorConfig(clip.id, user, { trimStartOffset: 0, trimEndOffset: 0 }));
    const malformed: any = await db.collection('clips').findOne({ id: clip.id });
    assert.equal(malformed.end_seconds - malformed.start_seconds, 5);
    assert.equal(malformed.duration_seconds, 30, 'ordinary save does not repair manually inconsistent records');
    await db.collection('clips').updateOne({ id: clip.id }, { $set: { end_seconds: 12 } });
    await assert.rejects(ownerContext.run(user, () => ClipRenderService.updateClipEditorConfig(clip.id, user, { trimStartOffset: 0, trimEndOffset: 0 })), { code: 'TRIM_TOO_SHORT' });
    assert.equal(await db.collection('render_jobs').countDocuments({ clip_id: clip.id, status: 'queued' }), 1);
  } finally {
    for (const collection of ['projects', 'transcripts', 'clip_candidates', 'clips', 'render_jobs']) {
      await db.collection(collection).deleteMany({ user_id: user });
    }
    await closeMongo();
  }
});
