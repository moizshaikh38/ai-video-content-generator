import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import express from 'express';
import { workLifecycle, workAdmission, createShutdown } from '../../src/services/queue/workLifecycle.js';

const out = '/downloads/vireo-drain-http-0237';
fs.mkdirSync(out, { recursive: true });
let releaseBackground!: () => void;
let allowHttpClose!: () => void;
const backgroundGate = new Promise<void>(r => releaseBackground = r);
const closeGate = new Promise<void>(r => allowHttpClose = r);
const events: string[] = [];
let background: Promise<void> | undefined;
const app = express();
app.use(workAdmission);
app.post('/start', (_req, res) => {
  background = workLifecycle.run('retained-synthetic-background', async () => {
    events.push('background-started');
    await backgroundGate;
    events.push('background-cleaned');
  });
  res.status(202).json({ accepted: true });
});
app.get('/probe', (_req, res) => res.json({ admitted: true }));
const server = http.createServer(app);
await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
const address = server.address() as any;
const origin = `http://127.0.0.1:${address.port}`;
let databaseCloseCalls = 0;
const shutdown = createShutdown({
  lifecycle: workLifecycle,
  timeoutMs: 1500,
  stopPollers: () => { events.push('pollers-stopped'); },
  closeHttp: async () => {
    await closeGate;
    events.push('http-closing');
    server.closeIdleConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    events.push('http-closed');
  },
  closeDatabase: async () => {
    assert.deepEqual(workLifecycle.snapshot().active, []);
    databaseCloseCalls++;
    events.push('database-close-double');
  },
});
try {
  const accepted = await fetch(origin + '/start', { method: 'POST' });
  await accepted.json();
  assert.equal(accepted.status, 202);
  await new Promise<void>(r => setImmediate(r));
  assert.deepEqual(workLifecycle.snapshot().active, ['retained-synthetic-background']);
  const result = shutdown();
  assert.equal(workLifecycle.isDraining(), true);
  const rejected = await fetch(origin + '/probe');
  const rejection: any = await rejected.json();
  assert.equal(rejected.status, 503);
  assert.equal(rejection.code, 'SERVER_DRAINING');
  assert.equal(rejected.headers.get('connection'), 'close');
  await new Promise<void>(r => setImmediate(r));
  assert.deepEqual(workLifecycle.snapshot().active, ['retained-synthetic-background']);
  allowHttpClose();
  while (!events.includes('http-closed')) await new Promise<void>(r => setTimeout(r, 2));
  assert.equal(databaseCloseCalls, 0);
  releaseBackground();
  await background;
  assert.equal(await result, true);
  assert.equal(databaseCloseCalls, 1);
  assert.ok(events.indexOf('database-close-double') > events.indexOf('background-cleaned'));
  fs.writeFileSync(out + '/result.json', JSON.stringify({ status: 'passed', actualLoopbackHttp: true, realWorkAdmissionAndShutdown: true, acceptedStatus: accepted.status, drainingStatus: rejected.status, drainingCode: rejection.code, connectionCloseHeader: true, backgroundRetainedAfter202: true, databaseCloseCalls, events, databaseCloseIsDouble: true, processRestartQualified: false, distributedLeasesQualified: false, noProductionMutation: true, noExternalNetwork: true }, null, 2));
  console.log('DRAIN_HTTP_PASS', out);
} finally {
  allowHttpClose(); releaseBackground();
  server.closeAllConnections(); server.close();
}
