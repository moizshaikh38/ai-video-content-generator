import test from 'node:test';
import assert from 'node:assert/strict';
import { errorHandler } from '../middleware/errorHandler.js';
import { AppError } from '../types/index.js';

function responseFor(error: AppError) {
  let status = 0;
  let body: any;
  const res = {
    status(value: number) { status = value; return res; },
    json(value: unknown) { body = value; },
  };
  errorHandler(error, { method: 'GET', originalUrl: '/fixture', headers: {} } as any, res as any, (() => {}) as any);
  return { status, body };
}

test('application wrappers cannot expose server diagnostics in either error envelope', () => {
  for (const status of [500, 502, 503]) {
    const result = responseFor(new AppError('Synthetic downstream diagnostic', status, 'DOWNSTREAM_FAILURE'));
    assert.equal(result.status, status);
    assert.deepEqual(result.body, {
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  }
});

test('explicit application client errors keep actionable details', () => {
  for (const status of [400, 403, 404, 409, 422]) {
    const result = responseFor(new AppError('Actionable fixture message', status, 'KNOWN_CLIENT_ERROR'));
    assert.equal(result.status, status);
    assert.equal(result.body.code, 'KNOWN_CLIENT_ERROR');
    assert.equal(result.body.message, 'Actionable fixture message');
    assert.equal(result.body.error.message, 'Actionable fixture message');
  }
});
