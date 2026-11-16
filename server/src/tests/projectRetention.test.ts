import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createProjectRetention, projectRetentionNotice, FREE_PROJECT_RETENTION_MS } from '../shared/projectRetention.js';

test('new Free projects stage exactly 72 hours, with enforcement disabled', () => {
  const p = createProjectRetention('free', '2026-11-17T00:00:00Z');
  assert.equal(p.proposedExpiresAt, '2026-11-20T00:00:00.000Z');
  assert.equal(Date.parse(p.proposedExpiresAt!) - Date.parse(p.createdAt), FREE_PROJECT_RETENTION_MS);
  assert.equal(p.enforcement, 'disabled');
  assert.match(projectRetentionNotice(p, Date.parse('2026-11-19'))!, /not enabled/);
  assert.match(projectRetentionNotice(p, Date.parse(p.proposedExpiresAt!))!, /remains available/);
});
test('paid/developer projects have no Free deadline; no retroactive legacy policy', () => {
  for (const plan of ['creator', 'pro', 'studio', 'developer']) {
    const p = createProjectRetention(plan, '2026-11-17T00:00:00Z');
    assert.equal(p.proposedExpiresAt, null);
    assert.equal(projectRetentionNotice(p), null);
  }
  assert.equal(projectRetentionNotice(undefined), null);
  assert.equal(projectRetentionNotice(null), null);
  assert.throws(() => createProjectRetention('free', 'bad date'));
});
test('notice is not an entitlement change, deletion command or downgrade deadline', () => {
  const p = createProjectRetention('free', '2026-11-17T00:00:00Z');
  const before = JSON.stringify(p);
  projectRetentionNotice(p, Number.MAX_SAFE_INTEGER);
  assert.equal(JSON.stringify(p), before);
  assert.equal(projectRetentionNotice({ ...p, proposedExpiresAt: 'broken' }), null);
});
test('project listing has no write/filter side effect and counts retained failed records', () => {
  const source = fs.readFileSync(new URL('../controllers/projectController.ts', import.meta.url), 'utf8');
  const list = source.slice(source.indexOf('export const listProjects'), source.indexOf('export const getProject ='));
  assert.ok(list.includes('rawList.map(withPosterUrl)'));
  assert.ok(list.includes('total: count ?? rawList.length'));
  assert.ok(!/\.delete\(|\.update\(|failedList|cleanProjects/.test(list));
});
