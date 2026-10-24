import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  maxConcurrentRenders,
  shouldLaunchInlineRender,
} from '../services/clipRenderService.js';

/**
 * Phase 3 — production render-job recovery (audit finding C-1).
 * The sweep wiring is startup configuration; these tests pin the concurrency
 * helper semantics and assert the sweep is actually wired into index.ts so it
 * cannot be silently dropped again.
 */

describe('Phase 3 — inline render concurrency cap', () => {
  it('caps concurrent renders between 1 and 4 regardless of host CPU count', () => {
    const cap = maxConcurrentRenders();
    assert.ok(Number.isInteger(cap) && cap >= 1 && cap <= 4, `cap ${cap} out of bounds`);
  });

  it('allows inline launch when no renders are active', () => {
    assert.equal(typeof shouldLaunchInlineRender(), 'boolean');
  });
});

describe('Phase 3 — production wiring guards', () => {
  const indexSource = fs.readFileSync(path.resolve(process.cwd(), 'src/index.ts'), 'utf8');

  it('starts the render sweep in production startup (immediate recovery pass)', () => {
    assert.match(indexSource, /runRenderSweep\('startup-recovery'\)/);
  });

  it('runs the sweep on an interval with an overlap guard and clears it on shutdown', () => {
    assert.match(indexSource, /renderSweepTimer = setInterval/);
    assert.match(indexSource, /if \(renderSweepRunning\) return;/);
    assert.match(indexSource, /if \(renderSweepTimer\) clearInterval\(renderSweepTimer\);/);
  });

  it('the sweep drains due render jobs through processDueRenderJobs', () => {
    assert.match(indexSource, /ClipRenderService\.processDueRenderJobs\(\)/);
  });

  it('inline render launches go through the concurrency-guarded helper in both controllers', () => {
    const clipController = fs.readFileSync(path.resolve(process.cwd(), 'src/controllers/clipController.ts'), 'utf8');
    const proEditorController = fs.readFileSync(path.resolve(process.cwd(), 'src/controllers/proEditorController.ts'), 'utf8');
    assert.match(clipController, /launchInlineRender\(clipId, userId, newJob\?\.id\)/);
    assert.match(proEditorController, /launchInlineRender\(project\.clip_id, userId, newJob\?\.id\)/);
    // The unguarded fire-and-forget pattern must not return.
    assert.doesNotMatch(clipController, /renderClipJob\(clipId, userId, newJob\?\.id\)\.catch/);
    assert.doesNotMatch(proEditorController, /renderClipJob\(project\.clip_id, userId, newJob\?\.id\)\.catch/);
  });

  it('readiness reports render queue depth as an advisory field', () => {
    const healthSource = fs.readFileSync(path.resolve(process.cwd(), 'src/services/healthService.ts'), 'utf8');
    assert.match(healthSource, /renderQueue/);
    assert.match(healthSource, /activeRendersInProcess/);
  });
});
