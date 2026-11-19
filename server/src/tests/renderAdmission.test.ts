import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ClipRenderService,
  launchInlineRender,
  tryReserveRenderSlot,
  releaseRenderSlot,
  renderOccupancy,
  maxConcurrentRenders,
  isClipRenderActive,
} from '../services/clipRenderService.js';

type RenderFn = typeof ClipRenderService.renderClipJob;

describe('Render admission: one shared slot pool for inline launches and the sweep', () => {
  const original: RenderFn = ClipRenderService.renderClipJob;
  const reserved: string[] = [];

  afterEach(() => {
    (ClipRenderService as any).renderClipJob = original;
    for (const id of reserved.splice(0)) releaseRenderSlot(id);
  });

  it('reserves synchronously: a second clip cannot pass a cap of 1 in the same tick', () => {
    assert.equal(tryReserveRenderSlot('adm-a', 1), true);
    reserved.push('adm-a');
    assert.equal(tryReserveRenderSlot('adm-b', 1), false, 'different clip must be refused at cap 1');
    assert.equal(renderOccupancy(), 1);
    releaseRenderSlot('adm-a');
    assert.equal(tryReserveRenderSlot('adm-b', 1), true);
    reserved.push('adm-b');
  });

  it('refuses a clip that already holds a slot even when capacity remains', () => {
    assert.equal(tryReserveRenderSlot('adm-same', 4), true);
    reserved.push('adm-same');
    assert.equal(tryReserveRenderSlot('adm-same', 4), false);
    assert.equal(isClipRenderActive('adm-same'), true);
  });

  it('inline launches racing on different clips never exceed the cap', async () => {
    const cap = maxConcurrentRenders();
    let active = 0;
    let maxActive = 0;
    const gates: Array<() => void> = [];
    (ClipRenderService as any).renderClipJob = async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((resolve) => gates.push(resolve));
      active -= 1;
    };
    const ids = Array.from({ length: cap + 3 }, (_, i) => `adm-race-${i}`);
    const results = ids.map((id) => launchInlineRender(id, 'user-x', undefined));
    assert.equal(results.filter(Boolean).length, cap, 'exactly cap launches admitted');
    assert.equal(renderOccupancy(), cap);
    await new Promise((r) => setImmediate(r));
    assert.ok(maxActive <= cap, `max active ${maxActive} exceeded cap ${cap}`);
    gates.splice(0).forEach((g) => g());
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(renderOccupancy(), 0, 'slots released after completion');
  });

  it('releases the slot when the render fails', async () => {
    (ClipRenderService as any).renderClipJob = async () => {
      throw new Error('boom');
    };
    assert.equal(launchInlineRender('adm-fail', 'user-x', undefined), true);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(renderOccupancy(), 0);
    assert.equal(isClipRenderActive('adm-fail'), false);
  });

  it('skips a clip already holding a slot instead of starting a duplicate', () => {
    let calls = 0;
    (ClipRenderService as any).renderClipJob = () => {
      calls += 1;
      return new Promise<void>(() => {});
    };
    assert.equal(launchInlineRender('adm-dup', 'user-x', undefined), true);
    reserved.push('adm-dup');
    assert.equal(launchInlineRender('adm-dup', 'user-x', undefined), false);
    assert.equal(calls, 1);
  });

  it('sweep wiring: processDueRenderJobs checks the cap, skips busy clips and releases in finally', () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), 'src/services/clipRenderService.ts'), 'utf8');
    const start = src.indexOf('public static async processDueRenderJobs');
    const body = src.slice(start, src.indexOf('public static async getProjectClips'));
    assert.match(body, /renderOccupancy\(\) >= maxConcurrentRenders\(\)\) return 0/);
    assert.match(body, /nextOwnerFairRenderJob\(db,now,\{busyClipIds\}\)/);
    const selector=fs.readFileSync(path.resolve(process.cwd(),'src/services/queue/ownerFairRenderQueue.ts'),'utf8');
    assert.match(selector,/clip_id:\{\$nin:options.busyClipIds\}/);
    assert.match(body, /tryReserveRenderSlot\(dueJob\.clip_id\)/);
    assert.match(body, /finally \{\s*releaseRenderSlot\(dueJob\.clip_id,queueAdvanced\)/);
    assert.ok(body.indexOf('tryReserveRenderSlot') < body.indexOf('this.renderClipJob'), 'reserve before render');
  });
});
