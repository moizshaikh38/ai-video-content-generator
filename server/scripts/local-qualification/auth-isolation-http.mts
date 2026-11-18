import fs from 'node:fs';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import express from 'express';

const out = '/downloads/vireo-auth-isolation-0234';
fs.mkdirSync(out, { recursive: true });
const owners = [crypto.randomUUID(), crypto.randomUUID()];
const authRequests: Array<{ kind: string; at: number }> = [];
const auth = http.createServer(async (req, res) => {
  const token = req.headers.authorization;
  const kind = token === 'Bearer fixture-alpha' ? 'alpha' : token === 'Bearer fixture-beta' ? 'beta' : 'outage';
  authRequests.push({ kind, at: Date.now() });
  await new Promise(r => setTimeout(r, kind === 'alpha' ? 20 : 3));
  res.setHeader('content-type', 'application/json');
  if (kind === 'outage') {
    res.writeHead(503);
    res.end(JSON.stringify({ code: 'fixture_unavailable', message: 'Synthetic authentication outage' }));
    return;
  }
  res.end(JSON.stringify({ id: owners[kind === 'alpha' ? 0 : 1], aud: 'authenticated', role: 'authenticated', email: 'fixture@example.invalid', created_at: new Date().toISOString() }));
});
await new Promise<void>(r => auth.listen(0, '127.0.0.1', r));
const address = auth.address() as any;
Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: '', SUPABASE_URL: `http://127.0.0.1:${address.port}`, SUPABASE_SECRET_KEY: 'synthetic-service-key', OPENROUTER_API_KEY: '', GROQ_API_KEY: '' });
const originalFetch = globalThis.fetch;
globalThis.fetch = ((input: any, init: any) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  assert.equal(url.hostname, '127.0.0.1', 'External network forbidden in fixture');
  return originalFetch(input, init);
}) as any;
const { requireAuth } = await import('../../src/middleware/authMiddleware.js');
const { ownerContext } = await import('../../src/db/repositories/dataRepository.js');
const app = express();
let downstreamCalls = 0;
app.use(requireAuth as any);
app.get('/context', async (req: any, res) => {
  downstreamCalls++;
  const before = ownerContext.getStore();
  await new Promise(r => setTimeout(r, req.user.id === owners[0] ? 3 : 25));
  const after = ownerContext.getStore();
  res.json({ requestOwner: req.user.id, before, after });
});
const server = http.createServer(app);
await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
const api = server.address() as any;
const url = `http://127.0.0.1:${api.port}/context`;
try {
  const rows = await Promise.all(Array.from({ length: 20 }, async (_, index) => {
    const token = index % 2 ? 'fixture-beta' : 'fixture-alpha';
    const expected = owners[index % 2];
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    const body: any = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.requestOwner, expected);
    assert.equal(body.before, expected);
    assert.equal(body.after, expected);
    return { case: index % 2 ? 'beta' : 'alpha', status: response.status, contextRetainedAcrossAwait: true };
  }));
  assert.equal(ownerContext.getStore(), undefined, 'No request identity may leak to the caller context');
  const callsBeforeOutage = downstreamCalls;
  const unavailable = await fetch(url, { headers: { authorization: 'Bearer fixture-outage' } });
  const unavailableBody: any = await unavailable.json();
  assert.equal(unavailable.status, 401);
  assert.equal(unavailableBody.code, 'AUTH_INVALID');
  assert.equal(downstreamCalls, callsBeforeOutage, 'Authentication outage must never reach downstream route');
  fs.writeFileSync(out + '/result.json', JSON.stringify({ status: 'passed', concurrentRequests: rows.length, distinctOwners: owners.length, rows, authServiceRequests: authRequests.length, outageStatus: unavailable.status, outageCode: unavailableBody.code, outageReachedDownstream: false, callerOwnerContextUndefined: true, realAuthMiddleware: true, realSupabaseSdkHttp: true, localAuthServiceDouble: true, noDatabaseMutation: true, noExternalNetwork: true, hostedJwtCryptographyQualified: false }, null, 2));
  console.log('AUTH_ISOLATION_PASS', out);
} finally {
  globalThis.fetch = originalFetch;
  server.closeAllConnections(); auth.closeAllConnections();
  await new Promise<void>(r => server.close(() => r()));
  await new Promise<void>(r => auth.close(() => r()));
}
