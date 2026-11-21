import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.MONGODB_DB_NAME = 'vireo_readiness_drain_' + process.pid;
process.env.SUPABASE_URL = 'http://127.0.0.1:5998';
process.env.SUPABASE_SECRET_KEY = 'fixture';
process.env.R2_ACCOUNT_ID = 'fixture';
process.env.R2_ACCESS_KEY_ID = 'fixture';
process.env.R2_SECRET_ACCESS_KEY = 'fixture';
process.env.OPENROUTER_API_KEY = 'fixture';
process.env.GROQ_API_KEY = '';

test('drain beginning during advisory probes cannot return stale ready status', {
  skip: !process.env.MONGODB_URI,
}, async (t) => {
  const { closeMongo } = await import('../db/mongoClient.js');
  const { setDatabaseBootstrapState } = await import('../services/databaseBootstrapState.js');
  const { workLifecycle } = await import('../services/queue/workLifecycle.js');
  const { SmartReframeService } = await import('../services/smartReframeService.js');
  const prior = SmartReframeService.checkReframeRuntime;
  let enter!: () => void;
  let release!: () => void;
  const entered = new Promise<void>(r => { enter = r; });
  const released = new Promise<void>(r => { release = r; });
  SmartReframeService.checkReframeRuntime = async () => {
    enter();
    await released;
    return { available: false, pythonPath: 'fixture' } as any;
  };
  t.after(async () => {
    release();
    setDatabaseBootstrapState('pending');
    SmartReframeService.checkReframeRuntime = prior;
    await closeMongo();
  });
  setDatabaseBootstrapState('ready');
  const { getReadinessStatus } = await import('../services/healthService.js');
  const pending = getReadinessStatus();
  await entered;
  workLifecycle.beginDrain();
  release();
  const result = await pending;
  assert.equal(result.status, 'not_ready');
  assert.equal(result.draining, true);
  const after = await getReadinessStatus();
  assert.equal(after.status, 'not_ready');
  assert.equal(after.draining, true);
});
