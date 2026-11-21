import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type {AddressInfo} from 'node:net';
import {expensiveLimiter} from '../middleware/rateLimiter.js';

test('random unverified bearer subjects do not reset the expensive-operation IP bucket', async () => {
  const app = express(); let reached = 0;
  app.use(expensiveLimiter);
  app.post('/synthetic-expensive-operation', (_req, res) => {reached++; res.json({fixture: true});});
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise<void>(resolve => server.once('listening', resolve));
    const origin = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
    for (let i = 0; i < 18; i++) {
      const payload = Buffer.from(JSON.stringify({sub: 'forged-fixture-' + i})).toString('base64url');
      const response = await fetch(origin + '/synthetic-expensive-operation', {method: 'POST', headers: {Authorization: `Bearer header.${payload}.not-a-signature`}});
      assert.equal(response.status, i < 15 ? 200 : 429, `attempt ${i + 1}`);
      const body = await response.json() as any;
      if (i >= 15) {
        assert.equal(body.code, 'RATE_LIMITED');
        assert(Number(response.headers.get('retry-after')) > 0);
        assert.equal(response.headers.get('ratelimit-remaining'), '0');
      }
    }
    assert.equal(reached, 15, 'throttled requests must not reach the operation handler');
  } finally {await new Promise<void>(resolve => server.close(() => resolve()));}
});
