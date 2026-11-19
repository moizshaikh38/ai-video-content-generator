import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import {execFileSync} from 'node:child_process';

// Opt-in integration: an isolated LOCAL Mongo URI is required. No external
// metadata/media/provider call is made. Test media is generated, not retained user footage.
test('exact range acquisition survives failed local upload without reacquisition', {
  skip: !process.env.YOUTUBE_CACHE_TEST_MONGODB_URI,
}, async () => {
  const mongo = new URL(process.env.YOUTUBE_CACHE_TEST_MONGODB_URI!);
  assert.equal(mongo.protocol, 'mongodb:');
  assert(['127.0.0.1', 'localhost', '[::1]'].includes(mongo.hostname), 'Only an isolated loopback Mongo instance is allowed');
  assert(!mongo.username && !mongo.password, 'No account credentials belong in this local fixture');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-youtube-recovery-test-'));
  const source = path.join(root, 'fixture.mp4');
  const ffmpeg = (await import('ffmpeg-static')).default as unknown as string;
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=10', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000', '-t', '2', '-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '1', '-c:a', 'aac', source], {timeout: 10000});
  const bytes = fs.readFileSync(source);
  const digest = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');
  const sha = digest(bytes), uploaded: Buffer[] = [];
  let failUpload = true, refused = 0;
  const server = http.createServer((req, res) => {
    if (req.method !== 'PUT') { req.resume(); res.writeHead(404).end(); return; }
    const parts: Buffer[] = [];
    req.on('data', c => parts.push(c));
    req.on('end', () => {
      if (failUpload) {
        refused++;
        res.writeHead(403, {'Content-Type': 'application/xml'}).end('<Error><Code>AccessDenied</Code></Error>');
      } else {
        uploaded.push(Buffer.concat(parts));
        res.writeHead(200, {ETag: '"local-fixture"'}).end();
      }
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as {port: number};
  const user = crypto.randomUUID(), projectKeys: string[] = [];
  const envKeys = ['NODE_ENV', 'MONGODB_URI', 'MONGODB_DB_NAME', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_ENDPOINT', 'R2_SOURCE_BUCKET', 'OPENROUTER_API_KEY', 'GROQ_API_KEY'];
  const oldEnv = Object.fromEntries(envKeys.map(k => [k, process.env[k]]));
  Object.assign(process.env, {NODE_ENV: 'test', MONGODB_URI: process.env.YOUTUBE_CACHE_TEST_MONGODB_URI, MONGODB_DB_NAME: 'vireo_youtube_recovery_test_' + user.replaceAll('-', ''), SUPABASE_URL: 'http://127.0.0.1:1', SUPABASE_SECRET_KEY: 'fixture', R2_ACCOUNT_ID: 'fixture', R2_ACCESS_KEY_ID: 'fixture', R2_SECRET_ACCESS_KEY: 'fixture', R2_ENDPOINT: `http://127.0.0.1:${address.port}`, R2_SOURCE_BUCKET: 'source', OPENROUTER_API_KEY: '', GROQ_API_KEY: ''});
  const {getMongoDb, closeMongo} = await import('../db/mongoClient.js');
  const db = await getMongoDb();
  const {UrlIngestionService: I} = await import('../services/urlIngestionService.js');
  const {ownerContext} = await import('../db/repositories/dataRepository.js');
  const oldMeta = I.fetchYouTubeMetadata, oldDownload = I.downloadYouTubeToTempFile;
  let metadataCalls = 0, acquisitions = 0;
  const options = {userId: user, url: 'https://www.youtube.com/watch?v=abcdefghijk', startTimeSec: 1, endTimeSec: 3};
  try {
    assert.equal(await db.collection('projects').countDocuments(), 0);
    I.fetchYouTubeMetadata = async () => { metadataCalls++; return {videoId: 'abcdefghijk', duration: 5}; };
    I.downloadYouTubeToTempFile = async (_u, _b, _t, range) => {
      assert.deepEqual(range, {startSec: 1, endSec: 3});
      acquisitions++;
      const tempFilePath = path.join(root, crypto.randomUUID() + '.mp4');
      fs.copyFileSync(source, tempFilePath);
      return {tempFilePath, totalBytes: bytes.length, contentType: 'video/mp4'};
    };
    await assert.rejects(ownerContext.run(user, () => I.ingestUrlToProject(options)));
    assert.equal(refused, 1);
    assert.equal(acquisitions, 1);
    assert.equal(await db.collection('projects').countDocuments(), 0);
    failUpload = false;
    const result = await ownerContext.run(user, () => I.ingestUrlToProject(options));
    projectKeys.push(result.sourceUrl);
    assert.equal(acquisitions, 1);
    assert.equal(metadataCalls, 2);
    assert.equal(result.durationSeconds, 2);
    assert.equal(uploaded.length, 1);
    assert.equal(digest(uploaded[0]), sha);
    const project = await db.collection('projects').findOne({id: result.projectId, user_id: user});
    assert.equal(project?.metadata.acquisition_reused, true);
    assert.deepEqual(project?.metadata.selected_range, {startSec: 1, endSec: 3});
    I.downloadYouTubeToTempFile = async () => { acquisitions++; throw Error('different range requires acquisition'); };
    await assert.rejects(ownerContext.run(user, () => I.ingestUrlToProject({...options, startTimeSec: 0, endTimeSec: 2})), /different range/);
    assert.equal(acquisitions, 2);
  } finally {
    I.fetchYouTubeMetadata = oldMeta;
    I.downloadYouTubeToTempFile = oldDownload;
    const {YOUTUBE_SOURCE_FORMAT, YOUTUBE_SOURCE_FORMAT_SORT} = await import('../utils/youtubeFormatPolicy.js');
    const key = crypto.createHash('sha256').update(JSON.stringify([user, 'abcdefghijk', 1, 3, YOUTUBE_SOURCE_FORMAT + '|' + YOUTUBE_SOURCE_FORMAT_SORT + '|duration:5'])).digest('hex');
    fs.rmSync(path.join(os.tmpdir(), 'vireo-youtube-acquisitions-v1', key), {recursive: true, force: true});
    for (const key of projectKeys) fs.rmSync(path.join(os.tmpdir(), 'vireo-source-cache', crypto.createHash('sha256').update(key).digest('hex') + '.mp4'), {force: true});
    await db.dropDatabase();
    await closeMongo();
    await new Promise<void>(resolve => server.close(() => resolve()));
    fs.rmSync(root, {recursive: true, force: true});
    for (const k of envKeys) { if (oldEnv[k] === undefined) delete process.env[k]; else process.env[k] = oldEnv[k]; }
  }
});
