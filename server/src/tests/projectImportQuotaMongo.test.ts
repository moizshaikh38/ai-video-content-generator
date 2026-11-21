import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import type {AddressInfo} from 'node:net';

test('URL import and live promotion contend for the same project slot in actual local Mongo', {skip: !process.env.MONGODB_URI}, async () => {
  assert(['localhost', '127.0.0.1'].includes(new URL(process.env.MONGODB_URI!).hostname));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-import-race-'));
  const capture = path.join(dir, 'capture.mp4'); fs.writeFileSync(capture, 'isolated synthetic source bytes');
  const objects = new Map<string, number>(); let puts = 0, release!: () => void;
  const bothUploaded = new Promise<void>(r => {release = r;});
  const storage = http.createServer((req, res) => {
    void (async () => {
      assert.equal(req.method, 'PUT'); let bytes = 0;
      for await (const chunk of req) bytes += chunk.length;
      objects.set(req.url!.split('?')[0], bytes); puts++;
      if (puts === 2) release(); await bothUploaded;
      res.setHeader('ETag', '"fixture"'); res.end();
    })().catch(() => {res.statusCode = 500; res.end();});
  });
  await new Promise<void>(r => storage.listen(0, '127.0.0.1', r));
  Object.assign(process.env, {NODE_ENV: 'test', MONGODB_DB_NAME: 'vireo_import_project_quota_' + process.pid, R2_ACCOUNT_ID: 'fixture', R2_ACCESS_KEY_ID: 'fixture', R2_SECRET_ACCESS_KEY: 'fixture', R2_SOURCE_BUCKET: 'source', R2_CLIPS_BUCKET: 'clips', R2_ENDPOINT: 'http://127.0.0.1:' + (storage.address() as AddressInfo).port, SUPABASE_URL: 'http://127.0.0.1:5998', SUPABASE_SECRET_KEY: 'fixture'});
  const {UrlValidator} = await import('../utils/urlValidator.js');
  const {UrlIngestionService: ingestion} = await import('../services/urlIngestionService.js');
  const {importCapturedProject, liveProjectDeps} = await import('../services/liveCaptureProjectService.js');
  const {getMongoDb, closeMongo} = await import('../db/mongoClient.js');
  const {ownerContext} = await import('../db/repositories/dataRepository.js');
  const db = await getMongoDb(), owner = crypto.randomUUID(), urlProject = crypto.randomUUID(), liveProject = crypto.randomUUID(), captureId = crypto.randomUUID();
  const validate = UrlValidator.validateVideoUrl, download = ingestion.downloadToTempFile, probe = ingestion.probeVideoFile;
  // Acquisition and stream metadata are explicit fixture seams. This test
  // qualifies final admission and real HTTP storage, not public URL safety or media quality.
  UrlValidator.validateVideoUrl = async () => ({provider: 'direct', normalizedUrl: 'https://fixture.example.invalid/source.mp4', hostname: 'fixture.example.invalid', inferredFilename: 'source.mp4'}) as any;
  ingestion.downloadToTempFile = async () => {const file = path.join(dir, 'download.mp4'); fs.copyFileSync(capture, file); return {tempFilePath: file, totalBytes: fs.statSync(file).size, contentType: 'video/mp4'};};
  ingestion.probeVideoFile = async () => ({hasVideo: true, hasAudio: true, durationSeconds: 5, width: 640, height: 360});
  const plan: any = {isUnlimited: false, planId: 'free', displayName: 'Fixture', limits: {maxProjects: 1, maxFileSizeBytes: 1024 * 1024}};
  try {
    const results = await Promise.allSettled([
      ownerContext.run(owner, () => ingestion.ingestUrlToProject({userId: owner, projectId: urlProject, url: 'https://fixture.example.invalid/source.mp4', projectQuota: {kind: 'limited', maximum: 1, displayName: 'Fixture'}, creationPlanId: 'free'})),
      importCapturedProject({owner, projectId: liveProject, captureId, file: capture, source: {provider: 'kick', url: 'https://kick.com/fixture'}, title: 'Synthetic promotion', capturedAt: new Date().toISOString(), requestedSeconds: 5, maxHeight: 360}, plan, {...liveProjectDeps, probe: ingestion.probeVideoFile}),
    ]);
    assert.equal(puts, 2);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(results.filter(r => r.status === 'rejected' && r.reason.code === 'MONTHLY_PROJECT_LIMIT_EXCEEDED').length, 1);
    assert.equal(await db.collection('projects').countDocuments({user_id: owner}), 1);
    assert(fs.existsSync(capture), 'admission refusal must not destroy the sole capture');
    assert.equal(objects.size, 2, 'unreferenced uploaded source is retained for explicit reconciliation, not silently deleted');
    console.log('IMPORT_QUOTA_FINAL_ADMISSION_PASS; uploaded attempts retained=2, projects=1; orphan reconciliation remains separate');
  } finally {
    UrlValidator.validateVideoUrl = validate; ingestion.downloadToTempFile = download; ingestion.probeVideoFile = probe;
    for (const name of ['projects', 'project_quota_fences']) await db.collection(name).deleteMany({user_id: owner});
    await closeMongo(); storage.closeAllConnections(); await new Promise<void>(r => storage.close(() => r()));
    fs.rmSync(dir, {recursive: true, force: true});
  }
});
