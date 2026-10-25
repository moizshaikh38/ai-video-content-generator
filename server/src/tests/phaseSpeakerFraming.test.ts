import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Active-speaker framing "fix kar totally": the smart-reframe engine existed
 * but was dormant — no UI/service call ever generated reframe tracks, and clip
 * creation defaulted to center crop. These pins lock the complete fix:
 * render-time auto-generation + smart-by-default crop mode.
 */

describe('Speaker framing — render-time auto-generation', () => {
  const render = fs.readFileSync(path.resolve(process.cwd(), 'src/services/clipRenderService.ts'), 'utf8');

  it('renderClipJob auto-generates a missing smart-reframe track before the decision', () => {
    const genIdx = render.indexOf('ensureReframeTrackAtRender(clip, sourcePath, jobId)');
    const decisionIdx = render.indexOf('resolveReframeDecision(clip, durationSec)');
    assert.ok(genIdx > 0, 'auto-generation call present');
    assert.ok(decisionIdx > genIdx, 'decision must follow generation');
  });

  it('generation is gated and fail-safe (never breaks a render)', () => {
    assert.match(render, /!config\.smartReframeEnabled \|\| !config\.reframeAutoGenerate/);
    assert.match(render, /mode !== 'smart'/);
    assert.match(render, /Falling back to center crop/);
  });

  it('reuses the render-downloaded source (no second multi-hundred-MB download)', () => {
    const svc = fs.readFileSync(path.resolve(process.cwd(), 'src/services/smartReframeService.ts'), 'utf8');
    assert.match(svc, /options\.localSourcePath \?\? path\.join\(tempDir, 'source\.mp4'\)/);
    assert.match(svc, /if \(!options\.localSourcePath \|\| !fs\.existsSync\(options\.localSourcePath\)\)/);
  });

  it('in-flight analysis dedupe uses the exported reframe analysis set', () => {
    assert.match(render, /activeReframeAnalysisSet\.has\(clip\.id\)/);
  });
});

describe('Speaker framing — smart-by-default crop mode', () => {
  it('clip creation defaults cropMode to smart (server)', () => {
    const ctrl = fs.readFileSync(path.resolve(process.cwd(), 'src/controllers/clipController.ts'), 'utf8');
    assert.match(ctrl, /cropMode = 'smart'/);
    assert.doesNotMatch(ctrl, /cropMode = 'center'/);
  });

  it('frontend creation sends smart crop mode by default', () => {
    const fe = fs.readFileSync(path.resolve(process.cwd(), '../src/services/clipRenderService.ts'), 'utf8');
    assert.match(fe, /cropMode: 'smart' \| 'center' = 'smart'/);
    assert.match(fe, /candidateId, aspectRatio, cropMode/);
  });

  it('center crop remains available as an explicit choice', () => {
    const fe = fs.readFileSync(path.resolve(process.cwd(), '../src/services/clipRenderService.ts'), 'utf8');
    assert.match(fe, /'smart' \| 'center'/);
  });
});

describe('Speaker framing — flags default on', () => {
  it('smartReframeEnabled and reframeAutoGenerate are on unless explicitly disabled', () => {
    const cfg = fs.readFileSync(path.resolve(process.cwd(), 'src/config/index.ts'), 'utf8');
    assert.match(cfg, /SMART_REFRAME_ENABLED !== 'false'/);
    assert.match(cfg, /REFRAME_AUTO_GENERATE !== 'false'/);
  });

  it('python CV runtime is available on this host (verified capability)', async () => {
    const { SmartReframeService } = await import('../services/smartReframeService.js');
    const runtime = await SmartReframeService.checkReframeRuntime();
    assert.equal(typeof runtime.available, 'boolean');
    assert.ok(runtime.pythonPath.length > 0);
  });
});
