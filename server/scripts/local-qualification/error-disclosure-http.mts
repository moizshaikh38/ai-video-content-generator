import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import express from 'express';
process.env.NODE_ENV = 'production';
const { errorHandler } = await import('../../src/middleware/errorHandler.js');
const { AppError } = await import('../../src/types/index.js');
const out = process.env.QUALIFICATION_ERROR_OUT || '/downloads/vireo-error-disclosure-0238';
fs.mkdirSync(out, { recursive: true });
const app = express();
app.get('/coded', (_req, _res, next) => { const e: any = new Error('Synthetic private path /private/customer/source.mp4 and internal connection detail'); e.code = 'ENOENT'; next(e); });
app.get('/plain', (_req, _res, next) => next(new Error('Synthetic internal failure')));
app.get('/known', (_req, _res, next) => next(new AppError('This clip changed. Reload it.', 409, 'REVISION_CONFLICT')));
app.use(errorHandler);
const server = http.createServer(app);
await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
const address = server.address() as any;
try {
  const rows: any[] = [];
  for (const route of ['coded', 'plain', 'known']) {
    const response = await fetch(`http://127.0.0.1:${address.port}/${route}`);
    const body: any = await response.json();
    rows.push({ route, status: response.status, body });
    if (route === 'known') { assert.equal(response.status, 409); assert.equal(body.code, 'REVISION_CONFLICT'); assert.equal(body.message, 'This clip changed. Reload it.'); }
    else if (process.env.QUALIFICATION_EXPECT_SAFE === '1') { assert.equal(response.status, 500); assert.equal(body.code, 'INTERNAL_ERROR'); assert.equal(body.message, 'Internal server error'); assert.equal(body.error.message, 'Internal server error'); assert.ok(!JSON.stringify(body).includes('/private/')); }
  }
  fs.writeFileSync(out + '/result.json', JSON.stringify({ status: 'observed', realLoopbackHttp: true, realErrorHandler: true, productionMode: true, rows, safeExpectationsEnforced: process.env.QUALIFICATION_EXPECT_SAFE === '1', noExternalNetwork: true, noDatabaseMutation: true }, null, 2));
  console.log('ERROR_DISCLOSURE_OBSERVED', out);
} finally { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); }
