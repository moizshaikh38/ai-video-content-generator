import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.VIREO_SERVICE_ROLE = 'api';
process.env.SUPABASE_URL = 'http://127.0.0.1:5998';
process.env.SUPABASE_SECRET_KEY = 'fixture';

test('real API refuses pending/failed bootstrap before auth and resumes only when ready', async (t) => {
  const { setDatabaseBootstrapState } = await import('../services/databaseBootstrapState.js');
  const { default: app } = await import('../index.js');
  const server = app.listen(0, '127.0.0.1');
  t.after(async () => {
    setDatabaseBootstrapState('pending');
    delete process.env.VIREO_SERVICE_ROLE;
    server.closeAllConnections();
    await new Promise<void>(r => server.close(() => r()));
  });
  await new Promise<void>(r => server.once('listening', r));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  for (const state of ['pending', 'failed'] as const) {
    setDatabaseBootstrapState(state);
    const response = await fetch(base + '/api/projects');
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('retry-after'), '2');
    assert.equal((await response.json()).code, 'SERVICE_UNAVAILABLE');
    const health = await fetch(base + '/health');
    assert.equal(health.status, 200, 'liveness stays available');
  }
  setDatabaseBootstrapState('ready');
  const response = await fetch(base + '/api/projects');
  assert.equal(response.status, 401, 'real authenticated route resumes');
  assert.equal((await response.json()).code, 'AUTH_MISSING');
});
