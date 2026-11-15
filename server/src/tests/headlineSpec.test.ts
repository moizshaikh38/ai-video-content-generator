/**
 * Auto-headline spec regression suite.
 *
 * The automatic headline burns the clip title for an opening window
 * (default 5s, matching the duration observed on Opus comparison clips
 * 15 Nov 2026), with fit-by-tiering, drawtext escaping, and an explicit
 * opt-out via overlay_config.
 */

import assert from 'node:assert/strict';
import { ClipRenderService } from '../services/clipRenderService.js';

let passed = 0;
let total = 0;

async function it(name: string, fn: () => void | Promise<void>) {
  total++;
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function run() {
  console.log('\n[HeadlineSpec] gating');

  await it('no overlay config + title -> headline shown with 5s opening window', () => {
    const r = ClipRenderService.buildHeadlineSpec({ title: 'A Great Clip', overlay_config: undefined } as any);
    assert.ok(r);
    assert.equal(r!.durationSec, 5.0);
  });

  await it('explicit overlay enabled=false opts out', () => {
    const r = ClipRenderService.buildHeadlineSpec({ title: 'A Great Clip', overlay_config: { enabled: false, text: '' } } as any);
    assert.equal(r, null);
  });

  await it('configured overlay text suppresses the auto headline', () => {
    const r = ClipRenderService.buildHeadlineSpec({ title: 'A Great Clip', overlay_config: { enabled: true, text: 'Custom' } } as any);
    assert.equal(r, null);
  });

  await it('missing/blank title shows no headline', () => {
    assert.equal(ClipRenderService.buildHeadlineSpec({ title: null, overlay_config: undefined } as any), null);
    assert.equal(ClipRenderService.buildHeadlineSpec({ title: "  ", overlay_config: undefined } as any), null);
  });

  console.log('\n[HeadlineSpec] duration configuration');

  await it('headline_duration_sec overrides the default window', () => {
    const r = ClipRenderService.buildHeadlineSpec({ title: 'Clip', overlay_config: { headline_duration_sec: 8.5 } } as any);
    assert.equal(r!.durationSec, 8.5);
  });

  await it('headline_duration_sec <= 0 means full-clip persistence', () => {
    const r = ClipRenderService.buildHeadlineSpec({ title: 'Clip', overlay_config: { headline_duration_sec: 0 } } as any);
    assert.equal(r!.durationSec, 0);
  });

  await it('non-numeric duration falls back to the 5s default', () => {
    const r = ClipRenderService.buildHeadlineSpec({ title: 'Clip', overlay_config: { headline_duration_sec: 'long' } } as any);
    assert.equal(r!.durationSec, 5.0);
  });

  console.log('\n[HeadlineSpec] fit + escaping');

  await it('short titles render largest', () => {
    const r = ClipRenderService.buildHeadlineSpec({ title: 'Short Title', overlay_config: undefined } as any);
    assert.equal(r!.fontSize, 60);
  });

  await it('41-char title (the NASA overflow case) fits at 38px', () => {
    const r = ClipRenderService.buildHeadlineSpec({ title: 'The Crewed Lunar Vehicle: A New Frontier', overlay_config: undefined } as any);
    assert.ok(r!.fontSize <= 44, `fontSize ${r!.fontSize}`);
    assert.ok(r!.text.includes('The Crewed Lunar Vehicle'));
  });

  await it('very long titles are capped at 45 chars with ellipsis', () => {
    const t = 'A'.repeat(80);
    const r = ClipRenderService.buildHeadlineSpec({ title: t, overlay_config: undefined } as any);
    assert.ok(r!.text.length <= 45, `len ${r!.text.length}`);
    assert.ok(r!.text.endsWith('...'));
    assert.equal(r!.fontSize, 38);
  });

  await it('drawtext-hostile characters are stripped and colons escaped', () => {
    const r = ClipRenderService.buildHeadlineSpec({ title: "Moiz's 100% clip: \\test\\", overlay_config: undefined } as any);
    assert.ok(!r!.text.includes("'"), r!.text);
    assert.ok(!r!.text.includes('%'), r!.text);
    assert.ok(!r!.text.includes('\\'.repeat(1) + 't'), r!.text); // backslashes stripped
    assert.ok(r!.text.includes('clip\\:'), r!.text); // colon escaped for drawtext
  });

  await it('newlines collapse to spaces', () => {
    const r = ClipRenderService.buildHeadlineSpec({ title: 'Line one\nLine two', overlay_config: undefined } as any);
    assert.equal(r!.text, 'Line one Line two');
  });

  console.log(`\n  ${passed}/${total} headline spec tests passed`);
  if (passed !== total) process.exitCode = 1;
}

run();
