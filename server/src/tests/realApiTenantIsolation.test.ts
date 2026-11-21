import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import type {AddressInfo} from 'node:net';

test('real application auth, bootstrap and owner middleware deny cross-tenant data and deletion', {skip: !process.env.MONGODB_URI}, async () => {
  assert(['127.0.0.1', 'localhost'].includes(new URL(process.env.MONGODB_URI!).hostname));
  const first = crypto.randomUUID(), second = crypto.randomUUID(), project = crypto.randomUUID(), clip = crypto.randomUUID();
  let authCalls = 0, storageCalls = 0;
  const auth = http.createServer((req, res) => {
    authCalls++;
    assert.equal(req.url, '/auth/v1/user');
    const token = req.headers.authorization?.slice('Bearer '.length);
    const id = token === 'fixture-owner-one' ? first : token === 'fixture-owner-two' ? second : null;
    res.setHeader('Content-Type', 'application/json');
    if (!id) {res.statusCode = 401; res.end(JSON.stringify({msg: 'Invalid local fixture token'})); return;}
    res.end(JSON.stringify({id, aud: 'authenticated', role: 'authenticated', email: 'owner-' + id + '@example.invalid', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString()}));
  });
  const storage = http.createServer((_req, res) => {storageCalls++; res.statusCode = 500; res.end();});
  for (const server of [auth, storage]) await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  Object.assign(process.env, {
    NODE_ENV: 'test', VIREO_SERVICE_ROLE: 'api', MONGODB_DB_NAME: 'vireo_real_auth_' + process.pid,
    SUPABASE_URL: 'http://127.0.0.1:' + (auth.address() as AddressInfo).port, SUPABASE_SECRET_KEY: 'local-fixture-secret',
    R2_ACCOUNT_ID: 'fixture', R2_ACCESS_KEY_ID: 'fixture', R2_SECRET_ACCESS_KEY: 'fixture', R2_SOURCE_BUCKET: 'source', R2_CLIPS_BUCKET: 'clips',
    R2_ENDPOINT: 'http://127.0.0.1:' + (storage.address() as AddressInfo).port,
    CORS_ORIGIN: 'https://fixture.example.invalid',
  });
  const {default: app} = await import('../index.js');
  const {bootstrapMongo} = await import('../db/bootstrapMongo.js');
  const {setDatabaseBootstrapState} = await import('../services/databaseBootstrapState.js');
  const {getMongoDb, closeMongo} = await import('../db/mongoClient.js');
  const db = await getMongoDb();
  await bootstrapMongo(db);
  await db.collection('projects').insertOne({id: project, user_id: first, title: 'Private local fixture', source_url: null, source_type: 'upload', video_status: 'uploading', created_at: new Date(), updated_at: new Date()});
  await db.collection('clips').insertOne({id: clip, user_id: first, project_id: project, render_status: 'ready', created_at: new Date(), updated_at: new Date()});
  const api = app.listen(0, '127.0.0.1'); await new Promise<void>(r => api.once('listening', r));
  const base = 'http://127.0.0.1:' + (api.address() as AddressInfo).port;
  const call = (path: string, method = 'GET', token?: string, body?: unknown, extraHeaders: Record<string,string> = {}) => fetch(base + path, {method, headers: {...(token ? {Authorization: 'Bearer ' + token} : {}), ...(body ? {'Content-Type': 'application/json'} : {}), ...extraHeaders}, ...(body ? {body: JSON.stringify(body)} : {})});
  try {
    setDatabaseBootstrapState('pending');
    assert.equal((await call('/api/projects', 'GET', 'fixture-owner-one')).status, 503);
    assert.equal(authCalls, 0, 'pending bootstrap must refuse before auth/provider work');
    setDatabaseBootstrapState('ready');
    assert.equal((await call('/api/projects')).status, 401);
    assert.equal((await call('/api/projects', 'GET', 'invalid-fixture-token')).status, 401);
    const listed = await call('/api/projects', 'GET', 'fixture-owner-one');
    assert.equal(listed.status, 200); const mine = await listed.json() as any;
    assert.equal(mine.projects.length, 1); assert.equal(mine.projects[0].id, project);
    assert.equal(listed.headers.get('x-content-type-options'), 'nosniff');
    const empty = await call('/api/projects', 'GET', 'fixture-owner-two');
    assert.equal(empty.status, 200); assert.equal((await empty.json() as any).projects.length, 0);
    for (const path of ['/api/projects/' + project, '/api/clips/' + clip]) {
      assert.equal((await call(path, 'GET', 'fixture-owner-two')).status, 404);
      assert.equal((await call(path, 'DELETE', 'fixture-owner-two')).status, 404);
    }
    const forged = await call('/api/projects/' + project, 'PATCH', 'fixture-owner-two', {user_id: first, title: 'Foreign edit'});
    assert.equal(forged.status, 404);
    assert.equal((await db.collection('projects').findOne({id: project}))?.title, 'Private local fixture');
    assert.equal((await db.collection('projects').findOne({id: project}))?.deletion_started_at, undefined);
    assert.equal(await db.collection('clips').countDocuments({id: clip}), 1);
    assert.equal((await call('/api/admin/overview', 'GET', 'fixture-owner-two')).status, 403);
    const allowedOrigin = await call('/api/projects', 'GET', 'fixture-owner-one', undefined, {Origin: 'https://fixture.example.invalid'});
    assert.equal(allowedOrigin.headers.get('access-control-allow-origin'), 'https://fixture.example.invalid');
    const badOrigin = await call('/api/projects', 'GET', 'fixture-owner-one', undefined, {Origin: 'https://untrusted.example.invalid'});
    assert.equal(badOrigin.headers.get('access-control-allow-origin'), null);
    assert.equal(storageCalls, 0, 'foreign reads/deletes must never touch storage');
    for (let i = 0; i < 3; i++) await db.collection('projects').insertOne({id: crypto.randomUUID(), user_id: first, title: 'Quota fixture', source_type: 'upload', video_status: 'uploading', created_at: new Date(), updated_at: new Date()});
    const {Collection} = await import('mongodb'); const oldCount = Collection.prototype.countDocuments;
    let earlyCounts = 0; let release!: () => void; const bothCounted = new Promise<void>(r => {release = r;});
    (Collection.prototype as any).countDocuments = async function(this: any, filter: any, ...options: any[]) {
      const count = await (oldCount as any).call(this, filter, ...options);
      if (this.collectionName === 'projects' && filter.user_id === first && earlyCounts < 2) {
        earlyCounts++; if (earlyCounts === 2) release(); await bothCounted;
      }
      return count;
    };
    try {
      const admissions = await Promise.all([call('/api/projects', 'POST', 'fixture-owner-one', {title: 'Ordinary quota race'}), call('/api/subtitles/projects', 'POST', 'fixture-owner-one', {title: 'Subtitle quota race'})]);
      assert.equal(admissions.filter(r => r.status === 201).length, 1, 'only one entry point may take the account final project slot');
      assert.equal(admissions.filter(r => r.status === 403).length, 1);
      assert.equal(await db.collection('projects').countDocuments({user_id: first}), 5);
    } finally {Collection.prototype.countDocuments = oldCount;}
    assert(authCalls >= 3, 'real auth middleware must call only the isolated auth upstream');
  } finally {
    setDatabaseBootstrapState('pending');
    await db.collection('clips').deleteMany({user_id: {$in: [first, second]}});
    await db.collection('projects').deleteMany({user_id: {$in: [first, second]}});
    await closeMongo();
    for (const server of [api, auth, storage]) {server.closeAllConnections(); await new Promise<void>(r => server.close(() => r()));}
  }
});
