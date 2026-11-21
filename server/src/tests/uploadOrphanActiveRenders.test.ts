import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

test('orphan discovery considers every active render, not just the first same-owner job', async () => {
  const uri = process.env.MONGODB_URI;
  assert(uri && ['localhost', '127.0.0.1'].includes(new URL(uri).hostname), 'isolated local Mongo required');
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_DB_NAME = 'vireo_orphan_render_' + process.pid;
  const {getMongoDb, closeMongo} = await import('../db/mongoClient.js');
  const {UploadLifecycleService} = await import('../services/uploadLifecycleService.js');
  const db = await getMongoDb();
  const user = crypto.randomUUID(), project = crypto.randomUUID(), unrelatedProject = crypto.randomUUID();
  const unrelatedClip = crypto.randomUUID(), activeClip = crypto.randomUUID();
  const key = `users/${user}/projects/${project}/source/${crypto.randomUUID()}-source.mp4`;
  const old = new Date(Date.now() - 48 * 3600000);
  const oldHead = UploadLifecycleService.headObjectFn;
  let heads = 0;
  UploadLifecycleService.headObjectFn = async () => {heads++; return {size: 7, contentType: 'video/mp4'};};
  try {
    await db.collection('projects').insertOne({id: project, user_id: user, video_status: 'uploaded'});
    await db.collection('project_upload_attempts').insertOne({id: crypto.randomUUID(), project_id: project, user_id: user, object_key: key, status: 'superseded', expires_at: old, created_at: old});
    await db.collection('clips').insertMany([
      {id: unrelatedClip, project_id: unrelatedProject, user_id: user},
      {id: activeClip, project_id: project, user_id: user},
    ]);
    // Insertion order deliberately puts another project's job first.
    await db.collection('render_jobs').insertMany([
      {id: crypto.randomUUID(), user_id: user, clip_id: unrelatedClip, status: 'rendering'},
      {id: crypto.randomUUID(), user_id: user, clip_id: activeClip, status: 'queued'},
    ]);
    for (const status of ['queued', 'rendering', 'processing']) {
      await db.collection('render_jobs').updateOne({clip_id: activeClip}, {$set: {status}});
      const busy = await UploadLifecycleService.discoverCleanupCandidates({userId: user, projectId: project});
      assert.equal(busy.candidates.length, 0, `second ${status} render must protect project source`);
      assert(busy.skipped.some(x => x.reason === 'ACTIVE_RENDER_JOB'));
      assert.equal(heads, 0, 'active work must refuse before storage lookup');
    }
    await db.collection('render_jobs').updateOne({clip_id: activeClip}, {$set: {status: 'completed'}});
    const idle = await UploadLifecycleService.discoverCleanupCandidates({userId: user, projectId: project});
    assert.deepEqual(idle.candidates.map(x => x.key), [key], 'unrelated active project must not block this idle project');
    assert.equal(heads, 1);
  } finally {
    UploadLifecycleService.headObjectFn = oldHead;
    // This database is synthetic and created only by this test.
    for (const name of ['projects', 'project_upload_attempts', 'clips', 'render_jobs']) await db.collection(name).deleteMany({user_id: user});
    await closeMongo();
  }
});
