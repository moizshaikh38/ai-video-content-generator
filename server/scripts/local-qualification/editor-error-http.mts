import fs from 'node:fs';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import express from 'express';
Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: '', OPENROUTER_API_KEY: '', GROQ_API_KEY: '' });
const { ProEditorService } = await import('../../src/services/proEditorService.js');
const { getEditorProject } = await import('../../src/controllers/proEditorController.js');
const { AppError } = await import('../../src/types/index.js');
const original = ProEditorService.getEditorProject;
const owner = crypto.randomUUID(), project = crypto.randomUUID();
(ProEditorService as any).getEditorProject = async () => { throw Object.assign(new Error('Synthetic internal DB path /private/tenant/editor.json'), { code: 'DATABASE_DRIVER_ERROR' }); };
const out = process.env.QUALIFICATION_ERROR_OUT || '/downloads/vireo-editor-error-before-0240';
fs.mkdirSync(out, { recursive: true });
const app = express();
app.use((req: any, _res, next) => { req.user = { id: owner }; next(); });
app.get('/editor/:id', getEditorProject as any);
const server = http.createServer(app);
await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
const address = server.address() as any;
try {
  const response = await fetch(`http://127.0.0.1:${address.port}/editor/${project}`);
  const body: any = await response.json();
  if (process.env.QUALIFICATION_EXPECT_SAFE === '1') { assert.equal(response.status, 500); assert.equal(body.code, 'INTERNAL_ERROR'); assert.equal(body.message, 'Internal server error'); }
  (ProEditorService as any).getEditorProject = async () => { throw new AppError('Editor project not found.', 404, 'PROJECT_NOT_FOUND'); };
  const missing = await fetch(`http://127.0.0.1:${address.port}/editor/${project}`);
  const missingBody: any = await missing.json();
  assert.equal(missing.status, 404); assert.equal(missingBody.code, 'PROJECT_NOT_FOUND'); assert.equal(missingBody.message, 'Editor project not found.');
  fs.writeFileSync(out + '/result.json', JSON.stringify({ status: 'observed', realEditorControllerHttp: true, downstreamServiceFaultIsSynthetic: true, authenticationNotUnderTest: true, responseStatus: response.status, body, missingStatus: missing.status, missingBody, safeExpectationsEnforced: process.env.QUALIFICATION_EXPECT_SAFE === '1', noDatabaseMutation: true, noExternalNetwork: true }, null, 2));
  console.log('EDITOR_ERROR_HTTP_OBSERVED', out);
} finally { ProEditorService.getEditorProject = original; server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); }
