import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import type {AddressInfo} from 'node:net';
import type {AuthenticatedRequest} from '../types/index.js';

const uri = process.env.MONGODB_URI;
test('local HTTP deletion retries and admission fences keep records and immutable uploads consistent', {skip: !uri}, async t => {
  assert(['localhost', '127.0.0.1'].includes(new URL(uri!).hostname), 'isolated local Mongo only');
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_DB_NAME = 'vireo_delete_http_' + process.pid;
  process.env.SUPABASE_URL = 'http://127.0.0.1:5998';
  process.env.SUPABASE_SECRET_KEY = 'fixture';
  const {config} = await import('../config/index.js');
  const {getMongoDb, closeMongo} = await import('../db/mongoClient.js');
  const {ownerContext} = await import('../db/repositories/dataRepository.js');
  const {deleteProject, createProjectUploadUrl, confirmProjectUpload} = await import('../controllers/projectController.js');
  const {ClipRenderService} = await import('../services/clipRenderService.js');
  const {publishPosterAttempt, posterAttemptKey} = await import('../services/posterPublicationService.js');
  const {createClipWithJob} = await import('../db/repositories/clipRepository.js');
  const {selectionSourceReceipt} = await import('../shared/selectionSourceReceipt.js');
  const {transcriptContentIdentity} = await import('../shared/transcriptSourceBinding.js');
  const db = await getMongoDb();
  const objects = new Map<string, Buffer>();
  const receipts: Array<{method: string; path: string}> = [];
  let denyClipDelete = false;
  let onListing: (() => Promise<void>) | undefined;
  const storage = http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url!, 'http://localhost');
      receipts.push({method: req.method!, path: url.pathname});
      res.setHeader('Content-Type', 'application/xml');
      if (req.method === 'PUT') {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        objects.set(decodeURIComponent(url.pathname), Buffer.concat(chunks));
        res.setHeader('ETag', '"fixture"'); res.end(); return;
      }
      if (req.method === 'HEAD') {
        const bytes = objects.get(decodeURIComponent(url.pathname));
        res.statusCode = bytes ? 200 : 404;
        if (bytes) {res.setHeader('Content-Length', String(bytes.length)); res.setHeader('Content-Type', 'video/mp4'); res.setHeader('ETag', '"fixture"');}
        res.end(); return;
      }
      if (req.method === 'GET') {
        const bucket = url.pathname.split('/')[1];
        const prefix = url.searchParams.get('prefix') || '';
        const keys = [...objects.keys()].filter(k => k.startsWith('/' + bucket + '/' + prefix));
        const hook = onListing; onListing = undefined;
        if (hook) await hook();
        res.end('<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><IsTruncated>false</IsTruncated>' + keys.map(k => '<Contents><Key>' + k.slice(bucket.length + 2) + '</Key><Size>7</Size></Contents>').join('') + '</ListBucketResult>'); return;
      }
      let body = '';
      for await (const chunk of req) body += chunk.toString();
      const bucket = url.pathname.split('/')[1];
      const keys = [...body.matchAll(/<Key>(.*?)<\/Key>/g)].map(m => m[1]);
      assert.equal(req.method, 'POST');
      assert(keys.length > 0);
      if (!denyClipDelete || bucket !== 'clips') for (const key of keys) objects.delete('/' + bucket + '/' + key);
      res.end('<DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">' + (denyClipDelete && bucket === 'clips' ? keys.map(key => '<Error><Key>' + key + '</Key><Code>AccessDenied</Code></Error>').join('') : '') + '</DeleteResult>');
    })().catch(error => { res.statusCode = 500; res.end(); console.error(error); });
  });
  await new Promise<void>(r => storage.listen(0, '127.0.0.1', r));
  const storageOrigin = 'http://127.0.0.1:' + (storage.address() as AddressInfo).port;
  Object.assign(config, {r2AccountId: 'fixture', r2AccessKeyId: 'fixture', r2SecretAccessKey: 'fixture', r2Endpoint: storageOrigin, r2ClipsBucket: 'clips', r2SourceBucket: 'source'});
  const owner = crypto.randomUUID();
  const api = http.createServer((req, res) => {
    void ownerContext.run(owner, async () => {
      const parts = req.url!.split('/');
      const mockResponse = {
        status(code: number) {res.statusCode = code; return this;},
        json(value: unknown) {res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value));},
      };
      if (parts[1] === 'projects') {
        let body = '';
        for await (const chunk of req) body += chunk.toString();
        const mockRequest = {user: {id: owner}, params: {id: parts[2]}, body: body ? JSON.parse(body) : {}} as unknown as AuthenticatedRequest;
        if (parts[3] === 'upload-url') await createProjectUploadUrl(mockRequest, mockResponse as any);
        else if (parts[3] === 'confirm-upload') await confirmProjectUpload(mockRequest, mockResponse as any);
        else await deleteProject(mockRequest, mockResponse as any);
      } else {
        try {await ClipRenderService.deleteClip(parts[2], owner); res.statusCode = 200; res.end('{}');}
        catch {res.statusCode = 500; res.end('{}');}
      }
    }).catch((error: any) => {res.statusCode = error.statusCode || 500; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({code: error.code || 'INTERNAL_ERROR'}));});
  });
  await new Promise<void>(r => api.listen(0, '127.0.0.1', r));
  const apiOrigin = 'http://127.0.0.1:' + (api.address() as AddressInfo).port;
  async function seed() {
    const project = crypto.randomUUID(), clip = crypto.randomUUID();
    const prefix = `users/${owner}/projects/${project}/`;
    await db.collection('projects').insertOne({id: project, user_id: owner, source_url: prefix + 'source/input.mp4', video_status: 'transcribed'});
    await db.collection('clips').insertOne({id: clip, project_id: project, user_id: owner, render_version: 1, editor_version: 1});
    objects.set('/source/' + prefix + 'source/input.mp4', Buffer.from('fixture'));
    objects.set('/clips/' + prefix + `clips/${clip}/render.mp4`, Buffer.from('fixture'));
    return {project, clip, prefix};
  }
  try {
    await t.test('second-bucket denial does not delete records; retry completes through actual project controller', async () => {
      const f = await seed(); denyClipDelete = true;
      assert.equal((await fetch(apiOrigin + '/projects/' + f.project, {method: 'DELETE'})).status, 500);
      assert.equal(await db.collection('projects').countDocuments({id: f.project, deletion_started_at: {$exists: true}}), 1);
      assert.equal(await db.collection('clips').countDocuments({id: f.clip, deletion_started_at: {$exists: true}}), 1);
      assert([...objects.keys()].some(k => k.startsWith('/clips/' + f.prefix)));
      assert(![...objects.keys()].some(k => k.startsWith('/source/' + f.prefix)));
      denyClipDelete = false;
      assert.equal((await fetch(apiOrigin + '/projects/' + f.project, {method: 'DELETE'})).status, 200);
      assert.equal(await db.collection('projects').countDocuments({id: f.project}), 0);
      assert.equal(await db.collection('clips').countDocuments({id: f.clip}), 0);
      assert(![...objects.keys()].some(k => k.includes(f.project)));
    });
    await t.test('poster uploaded after listing snapshot loses to marker and removes only its own bytes', async () => {
      const f = await seed();
      const canonical = f.prefix + `clips/${f.clip}/poster-v1.jpg`, key = posterAttemptKey(canonical);
      let ran = false;
      onListing = async () => {
        assert.equal(await db.collection('clips').countDocuments({id: f.clip, deletion_started_at: {$exists: true}}), 1);
        const upload = await fetch(storageOrigin + '/clips/' + key, {method: 'PUT', body: 'synthetic late poster'});
        assert.equal(upload.status, 200); assert(objects.has('/clips/' + key));
        assert.equal(await publishPosterAttempt('clips', owner, f.clip, key, canonical), null);
        assert(!objects.has('/clips/' + key)); ran = true;
      };
      assert.equal((await fetch(apiOrigin + '/projects/' + f.project, {method: 'DELETE'})).status, 200);
      assert(ran); assert(![...objects.keys()].some(k => k.includes(f.project)));
    });
    await t.test('clip storage denial keeps marker and parent until successful retry', async () => {
      const f = await seed(); denyClipDelete = true;
      assert.equal((await fetch(apiOrigin + '/clips/' + f.clip, {method: 'DELETE'})).status, 500);
      assert.equal(await db.collection('clips').countDocuments({id: f.clip, deletion_started_at: {$exists: true}}), 1);
      denyClipDelete = false;
      assert.equal((await fetch(apiOrigin + '/clips/' + f.clip, {method: 'DELETE'})).status, 200);
      assert.equal(await db.collection('clips').countDocuments({id: f.clip}), 0);
      assert.equal(await db.collection('projects').countDocuments({id: f.project}), 1);
      assert.equal((await fetch(apiOrigin + '/projects/' + f.project, {method: 'DELETE'})).status, 200);
    });
    await t.test('ordinary unprepared creation cannot add an unmarked child to a deleting project', async () => {
      const f = await seed(), candidate = crypto.randomUUID(), key = f.prefix + 'source/input.mp4';
      const transcript: any = {id: crypto.randomUUID(), project_id: f.project, user_id: owner, transcript_text: 'Synthetic deletion fixture.', segments: [], words: []};
      transcript.source_binding = {version: 1, source_receipt: {key, size: 7, etag: '"fixture"', sha256: 'a'.repeat(64)}, prepared_audio_sha256: 'b'.repeat(64), requests: [{sha256: 'b'.repeat(64), bytes: 7, status: 'completed'}], transcript_content_sha256: transcriptContentIdentity(transcript)};
      await db.collection('transcripts').insertOne(transcript);
      await db.collection('clip_candidates').insertOne({id: candidate, user_id: owner, project_id: f.project, start_seconds: 0, end_seconds: 2, metadata: {selection_source_receipt: selectionSourceReceipt(transcript, key)}});
      const {admitProjectDeletion} = await import('../services/deletionAdmissionService.js');
      const normal = await createClipWithJob(f.project, candidate, owner, '9:16', 'center', undefined, undefined, {kind: 'unlimited'});
      assert(normal?.clip.id, 'unmarked project still admits ordinary creation');
      assert.equal(await db.collection('render_jobs').countDocuments({user_id: owner}), 1);
      const {Collection} = await import('mongodb');
      const originalUpdate = Collection.prototype.updateOne;
      let deletionWon = false;
      (Collection.prototype as any).updateOne = async function(this: any, filter: any, update: any, options: any) {
        if (!deletionWon && this.collectionName === 'projects' && update.$inc?.creation_admission_serial === 1) {
          deletionWon = true;
          assert.equal(await admitProjectDeletion(owner, f.project), true);
        }
        return (originalUpdate as any).call(this, filter, update, options);
      };
      try {
        await assert.rejects(() => createClipWithJob(f.project, candidate, owner, '9:16', 'center', undefined, undefined, {kind: 'unlimited'}), {code: 'PROJECT_DELETING'});
      } finally {Collection.prototype.updateOne = originalUpdate;}
      assert(deletionWon, 'real deletion committed between creation snapshot read and project write fence');
      assert.equal(await db.collection('clips').countDocuments({project_id: f.project, deletion_started_at: {$exists: true}}), 2);
      await assert.rejects(() => createClipWithJob(f.project, candidate, owner, '9:16', 'center', undefined, undefined, {kind: 'unlimited'}), {code: 'PROJECT_DELETING'});
      assert.equal(await db.collection('clips').countDocuments({project_id: f.project}), 2);
      assert.equal(await db.collection('render_jobs').countDocuments({user_id: owner}), 1);
      assert.equal((await fetch(apiOrigin + '/projects/' + f.project, {method: 'DELETE'})).status, 200);
      assert.equal(await db.collection('render_jobs').countDocuments({user_id: owner}), 0);
    });
    await t.test('deletion-admitted project cannot issue another upload grant', async () => {
      const f = await seed();
      await db.collection('projects').updateOne({id: f.project}, {$set: {video_status: 'uploading'}});
      const {admitProjectDeletion} = await import('../services/deletionAdmissionService.js');
      assert.equal(await admitProjectDeletion(owner, f.project), true);
      const response = await fetch(apiOrigin + '/projects/' + f.project + '/upload-url', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({fileName: 'fixture.mp4', fileSize: 7, contentType: 'video/mp4'})});
      assert.equal(response.status, 409);
      assert.equal((await response.json() as any).code, 'PROJECT_DELETING');
      assert.equal(await db.collection('project_upload_attempts').countDocuments({project_id: f.project}), 0);
      assert.equal((await fetch(apiOrigin + '/projects/' + f.project, {method: 'DELETE'})).status, 200);
    });
    await t.test('grant racing deletion cannot admit its parent session or orphan attempt record', async () => {
      const f = await seed();
      await db.collection('projects').updateOne({id: f.project}, {$set: {video_status: 'uploading'}});
      const {UploadLifecycleService} = await import('../services/uploadLifecycleService.js');
      const {admitProjectDeletion} = await import('../services/deletionAdmissionService.js');
      const original = UploadLifecycleService.admitAttempt;
      let raced = false;
      UploadLifecycleService.admitAttempt = async function(params) {
        raced = true; assert.equal(await admitProjectDeletion(owner, f.project), true);
        return original.call(this, params);
      };
      try {
        const response = await fetch(apiOrigin + '/projects/' + f.project + '/upload-url', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({fileName: 'fixture.mp4', fileSize: 7, contentType: 'video/mp4'})});
        assert.equal(response.status, 409); assert.equal((await response.json() as any).code, 'PROJECT_DELETING');
      } finally {UploadLifecycleService.admitAttempt = original;}
      assert(raced); assert.equal(await db.collection('project_upload_attempts').countDocuments({project_id: f.project}), 0);
      assert.equal((await db.collection('projects').findOne({id: f.project}))?.pending_upload_key, undefined);
      assert.equal((await fetch(apiOrigin + '/projects/' + f.project, {method: 'DELETE'})).status, 200);
    });
    await t.test('source publication CAS refuses deletion admitted after confirmation bookkeeping', async () => {
      const f = await seed();
      await db.collection('projects').updateOne({id: f.project}, {$set: {video_status: 'uploading'}});
      const grantResponse = await fetch(apiOrigin + '/projects/' + f.project + '/upload-url', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({fileName: 'fixture.mp4', fileSize: 7, contentType: 'video/mp4'})});
      assert.equal(grantResponse.status, 200); const grant = await grantResponse.json() as any;
      assert.equal(new URL(grant.uploadUrl).hostname, '127.0.0.1');
      assert.equal((await fetch(grant.uploadUrl, {method: 'PUT', headers: {'Content-Type': 'video/mp4'}, body: 'fixture'})).status, 200);
      const {UploadLifecycleService} = await import('../services/uploadLifecycleService.js');
      const {admitProjectDeletion} = await import('../services/deletionAdmissionService.js');
      const original = UploadLifecycleService.confirmAttempt;
      let raced = false;
      UploadLifecycleService.confirmAttempt = async function(params) {
        const result = await original.call(this, params);
        raced = true; assert.equal(await admitProjectDeletion(owner, f.project), true);
        return result;
      };
      const confirm = () => fetch(apiOrigin + '/projects/' + f.project + '/confirm-upload', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({attemptId: grant.attemptId, objectKey: grant.objectKey})});
      try {
        const response = await confirm(); assert.equal(response.status, 409);
        assert.equal((await response.json() as any).code, 'PROJECT_DELETING');
      } finally {UploadLifecycleService.confirmAttempt = original;}
      assert(raced);
      const project = await db.collection('projects').findOne({id: f.project});
      assert.notEqual(project?.source_url, grant.objectKey); assert.equal(project?.video_status, 'uploading');
      const repeated = await confirm(); assert.equal(repeated.status, 409);
      await assert.rejects(() => UploadLifecycleService.confirmAttempt({userId: owner, projectId: f.project, attemptId: grant.attemptId}), {code: 'PROJECT_DELETING'});
      assert.equal((await fetch(apiOrigin + '/projects/' + f.project, {method: 'DELETE'})).status, 200);
    });
    await t.test('normal admitted upload still confirms and retries idempotently before deletion', async () => {
      const f = await seed();
      await db.collection('projects').updateOne({id: f.project}, {$set: {video_status: 'uploading'}});
      const response = await fetch(apiOrigin + '/projects/' + f.project + '/upload-url', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({fileName: 'fixture.mp4', fileSize: 7, contentType: 'video/mp4'})});
      assert.equal(response.status, 200); const grant = await response.json() as any;
      assert.equal(new URL(grant.uploadUrl).hostname, '127.0.0.1');
      assert.equal((await fetch(grant.uploadUrl, {method: 'PUT', headers: {'Content-Type': 'video/mp4'}, body: 'fixture'})).status, 200);
      const confirm = () => fetch(apiOrigin + '/projects/' + f.project + '/confirm-upload', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({attemptId: grant.attemptId, objectKey: grant.objectKey})});
      assert.equal((await confirm()).status, 200); assert.equal((await confirm()).status, 200);
      assert.equal((await db.collection('projects').findOne({id: f.project}))?.source_url, grant.objectKey);
      assert.equal((await db.collection('project_upload_attempts').findOne({id: grant.attemptId}))?.status, 'confirmed');
      const {UploadLifecycleService} = await import('../services/uploadLifecycleService.js');
      await assert.rejects(() => UploadLifecycleService.admitAttempt({userId: crypto.randomUUID(), projectId: f.project, objectKey: f.prefix + 'foreign.mp4', fileName: 'foreign.mp4', fileSize: 7, contentType: 'video/mp4', expiresAt: new Date(Date.now() + 60000)}), {code: 'PROJECT_NOT_FOUND'});
      assert.equal(await db.collection('project_upload_attempts').countDocuments({project_id: f.project}), 1);
      assert.equal((await fetch(apiOrigin + '/projects/' + f.project, {method: 'DELETE'})).status, 200);
    });
    await t.test('failed immutable attempt insert rolls back the pending parent session', async () => {
      const f = await seed();
      await db.collection('projects').updateOne({id: f.project}, {$set: {video_status: 'uploading'}});
      const {Collection} = await import('mongodb'); const original = Collection.prototype.insertOne;
      (Collection.prototype as any).insertOne = function(this: any, document: any, options: any) {
        if (this.collectionName === 'project_upload_attempts' && document.project_id === f.project) throw Error('isolated attempt insert failure');
        return (original as any).call(this, document, options);
      };
      try {
        const response = await fetch(apiOrigin + '/projects/' + f.project + '/upload-url', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({fileName: 'fixture.mp4', fileSize: 7, contentType: 'video/mp4'})});
        assert.equal(response.status, 500);
      } finally {Collection.prototype.insertOne = original;}
      assert.equal(await db.collection('project_upload_attempts').countDocuments({project_id: f.project}), 0);
      assert.equal((await db.collection('projects').findOne({id: f.project}))?.pending_upload_key, undefined);
      assert.equal((await fetch(apiOrigin + '/projects/' + f.project, {method: 'DELETE'})).status, 200);
    });
    assert.equal(objects.size, 0);
    assert(receipts.some(r => r.method === 'PUT'));
    assert(receipts.some(r => r.method === 'POST' && r.path === '/clips/'));
  } finally {
    denyClipDelete = false; onListing = undefined;
    for (const name of ['projects', 'clips', 'transcripts', 'clip_candidates', 'render_jobs', 'candidate_creations', 'render_quota_fences']) await db.collection(name).deleteMany({user_id: owner});
    await closeMongo();
    for (const server of [api, storage]) {server.closeAllConnections(); await new Promise<void>(r => server.close(() => r()));}
  }
});
