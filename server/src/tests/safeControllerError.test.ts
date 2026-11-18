import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sendSafeControllerError } from '../utils/safeControllerError.js';
import { AppError } from '../types/index.js';

function project(error: unknown, fallback: { status?: number; code?: string; message: string } = { message: 'Operation failed.' }) {
  let status = 0, body: any;
  const response = { status(value: number) { status = value; return response; }, json(value: unknown) { body = value; } };
  sendSafeControllerError(response as any, error, fallback);
  return { status, body };
}

test('controller server failures stay private including explicitly wrapped downstream details', () => {
  for (const error of [new Error('Synthetic private detail'), Object.assign(new Error('/private/fixture'), { code: 'ENOENT' }), new AppError('Synthetic driver connection detail', 503, 'DATABASE_ERROR')]) {
    const response = project(error);
    assert.ok(response.status >= 500);
    assert.deepEqual(response.body, { status: 'error', code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

test('controller validation ownership conflict and inferred legacy statuses remain actionable', () => {
  for (const status of [400, 404, 409, 422]) {
    const response = project(new AppError('Actionable fixture message', status, 'KNOWN_FIXTURE'));
    assert.equal(response.status, status);
    assert.equal(response.body.code, 'KNOWN_FIXTURE');
    assert.equal(response.body.message, 'Actionable fixture message');
  }
  assert.equal(project({ code: 'NO_WORD_TIMINGS', message: 'No timings yet.' }, { status: 400, code: 'FILLER_REMOVAL_FAILED', message: 'Missing timings' }).status, 400);
});

test('invalid supplied status and non-errors cannot break response construction', () => {
  for (const error of [null, undefined, 'private text', { statusCode: NaN, message: 'private' }, { statusCode: 200, message: 'private' }, { statusCode: '404', message: 'private' }]) {
    assert.deepEqual(project(error), { status: 500, body: { status: 'error', code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
});

test('all editor-controller local error catches route through the safe projection', () => {
  const source = fs.readFileSync(new URL('../controllers/proEditorController.ts', import.meta.url), 'utf8');
  assert.equal((source.match(/catch \(err: any\)/g) || []).length, 11);
  assert.equal((source.match(/sendSafeControllerError\(res, err,/g) || []).length, 11);
  assert.doesNotMatch(source, /message:\s*err\.message/);
});
