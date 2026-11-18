import test from 'node:test';
import assert from 'node:assert/strict';
import { errorHandler } from '../middleware/errorHandler.js';
import { AppError } from '../types/index.js';

function responseFor(error: Error) {
  let status = 0;
  let body: any;
  const response = { status(value: number) { status = value; return response; }, json(value: unknown) { body = value; } };
  const request = { method: 'GET', originalUrl: '/synthetic-fixture', headers: {}, requestId: 'safe-request-id' };
  errorHandler(error, request as any, response as any, (() => {}) as any);
  return { status, body };
}

test('unexpected coded server errors never expose driver messages or codes', () => {
  for (const [code, status] of [['ENOENT', 500], ['DATABASE_UNAVAILABLE', 503], ['ECONNREFUSED', 502]] as const) {
    const error = Object.assign(new Error('Synthetic secret path /private/customer/input.mp4'), { code, status });
    const response = responseFor(error);
    assert.equal(response.status, status);
    assert.equal(response.body.code, 'INTERNAL_ERROR');
    assert.equal(response.body.message, 'Internal server error');
    assert.equal(response.body.error.code, 'INTERNAL_ERROR');
    assert.equal(response.body.error.message, 'Internal server error');
    assert.equal(response.body.requestId, 'safe-request-id');
    assert.ok(!JSON.stringify(response.body).includes('/private/'));
  }
});

test('plain unexpected failure is generic, explicit application conflict remains actionable', () => {
  assert.equal(responseFor(new Error('Synthetic private detail')).body.message, 'Internal server error');
  const expected = responseFor(new AppError('This clip changed. Reload it.', 409, 'REVISION_CONFLICT'));
  assert.equal(expected.status, 409);
  assert.equal(expected.body.code, 'REVISION_CONFLICT');
  assert.equal(expected.body.message, 'This clip changed. Reload it.');
});
