import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.MONGODB_DB_NAME = 'vireo_bootstrap_readiness_' + process.pid;
process.env.SUPABASE_URL = 'http://127.0.0.1:5998';
process.env.SUPABASE_SECRET_KEY = 'fixture';
process.env.R2_ACCOUNT_ID = 'fixture';
process.env.R2_ACCESS_KEY_ID = 'fixture';
process.env.R2_SECRET_ACCESS_KEY = 'fixture';
process.env.OPENROUTER_API_KEY = 'fixture';
process.env.GROQ_API_KEY = '';

test('database bootstrap state fails closed until explicitly completed', async () => {
  const { isDatabaseBootstrapReady, setDatabaseBootstrapState } = await import('../services/databaseBootstrapState.js');
  assert.equal(isDatabaseBootstrapReady(), false);
  setDatabaseBootstrapState('failed');
  assert.equal(isDatabaseBootstrapReady(), false);
  setDatabaseBootstrapState('pending');
  assert.equal(isDatabaseBootstrapReady(), false);
  setDatabaseBootstrapState('ready');
  assert.equal(isDatabaseBootstrapReady(), true);
  setDatabaseBootstrapState('pending');
  assert.equal(isDatabaseBootstrapReady(), false);
});

test('reachable empty Mongo cannot report ready before bootstrap or after failure', {
  skip: !process.env.MONGODB_URI,
}, async (t) => {
  const { getMongoDb, closeMongo } = await import('../db/mongoClient.js');
  const { setDatabaseBootstrapState } = await import('../services/databaseBootstrapState.js');
  const { SmartReframeService } = await import('../services/smartReframeService.js');
  const prior = SmartReframeService.checkReframeRuntime;
  SmartReframeService.checkReframeRuntime = async () => ({ available: false, pythonPath: 'fixture' }) as any;
  t.after(async () => {
    setDatabaseBootstrapState('pending');
    SmartReframeService.checkReframeRuntime = prior;
    await closeMongo();
  });
  const db = await getMongoDb();
  assert.deepEqual(await db.listCollections({}, { nameOnly: true }).toArray(), []);
  const { getReadinessStatus } = await import('../services/healthService.js');
  for (const state of ['pending', 'failed'] as const) {
    setDatabaseBootstrapState(state);
    const result = await getReadinessStatus();
    assert.equal(result.checks.mongodb, true);
    assert.equal(result.checks.databaseBootstrap, false);
    assert.equal(result.status, 'not_ready');
  }
  setDatabaseBootstrapState('ready');
  const ready = await getReadinessStatus();
  assert.equal(ready.checks.databaseBootstrap, true);
  assert.equal(ready.status, 'ready');
  assert.equal(ready.reframeRuntime?.available, false, 'optional CV remains informational');
  assert.deepEqual(await db.listCollections({}, { nameOnly: true }).toArray(), [], 'probe makes no schema changes');
});
