import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import express from 'express';

const out = '/downloads/vireo-http-rate-boundary-0235';
fs.mkdirSync(out, { recursive: true });
const { expensiveLimiter } = await import('../../src/middleware/rateLimiter.js');
const app = express();
// Same default as the real app when TRUST_PROXY is not explicitly enabled.
assert.equal(app.get('trust proxy'), false);
let reachedDownstream = 0;
app.use(expensiveLimiter);
app.get('/fixture', (req, res) => { reachedDownstream++; res.json({ ip: req.ip }); });
const server = http.createServer(app);
await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
const address = server.address() as any;
const rows: Array<{ request: number; status: number; retryAfter: string | null }> = [];
try {
  for (let index = 0; index < 17; index++) {
    const fakeJwt = `fixture.${Buffer.from(JSON.stringify({ sub: `invented-owner-${index}` })).toString('base64url')}.unsigned`;
    const response = await fetch(`http://127.0.0.1:${address.port}/fixture`, { headers: { authorization: `Bearer ${fakeJwt}`, 'x-forwarded-for': `198.51.100.${index + 1}` } });
    const body: any = await response.json();
    assert.equal(response.status, index < 15 ? 200 : 429);
    if (index < 15) assert.equal(body.ip, '127.0.0.1');
    else { assert.equal(body.code, 'RATE_LIMITED'); assert.ok(Number(response.headers.get('retry-after')) > 0); }
    rows.push({ request: index + 1, status: response.status, retryAfter: response.headers.get('retry-after') });
  }
  assert.equal(reachedDownstream, 15);
  fs.writeFileSync(out + '/result.json', JSON.stringify({ status: 'passed', realHttpServer: true, actualExpensiveLimiter: true, trustProxy: false, distinctForgedJwtSubjects: 17, distinctSpoofedForwardedAddresses: 17, downstreamRequests: reachedDownstream, blockedRequests: rows.filter(r => r.status === 429).length, rows, noProviderCalls: true, noDatabaseMutation: true, noExternalNetwork: true, productionProxyConfigurationQualified: false, distributedLimiterQualified: false }, null, 2));
  console.log('HTTP_RATE_BOUNDARY_PASS', out);
} finally {
  server.closeAllConnections();
  await new Promise<void>(r => server.close(() => r()));
}
