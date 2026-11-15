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

  console.log('\n[HeadlineSpec] fit + wrapping');

  await it('short titles stay one line at the largest size', () => {
    const r = ClipRenderService.buildHeadlineSpec({ title: 'Short Title', overlay_config: undefined } as any);
    assert.equal(r!.fontSize, 64);
    assert.ok(!r!.text.includes('\n'));
  });

  await it('long titles wrap to two balanced lines at a word boundary', () => {
    const r = ClipRenderService.buildHeadlineSpec({ title: 'The Crewed Lunar Vehicle: A New Frontier', overlay_config: undefined } as any);
    const lines = r!.text.split('\n');
    assert.equal(lines.length, 2);
    assert.ok(lines.every((l) => l.length > 0 && l.length <= 34), JSON.stringify(lines));
    assert.ok(r!.text.includes('Vehicle:')); // colon preserved via textfile transport
  });

  await it('very long titles are capped at 60 chars with ellipsis', () => {
    const t = 'A '.repeat(50).trim();
    const r = ClipRenderService.buildHeadlineSpec({ title: t, overlay_config: undefined } as any);
    const total = r!.text.replace('\n', ' ').length;
    assert.ok(total <= 60, `len ${total}`);
    assert.ok(r!.text.endsWith('...'));
    // Two-line wrap keeps the longest wrapped line in the 48px tier.
    const longest = Math.max(...r!.text.split('\n').map((l) => l.length));
    assert.ok(longest <= 34, `longest ${longest}`);
    assert.equal(r!.fontSize, 48);
  });

  await it('user text is preserved byte-for-byte (apostrophes, percent, backslashes)', () => {
    const title = "Moiz's 100% clip: \\test\\";
    const r = ClipRenderService.buildHeadlineSpec({ title, overlay_config: undefined } as any);
    assert.equal(r!.text, title);
  });

  await it('existing newlines collapse to single spaces before wrapping', () => {
    const r = ClipRenderService.buildHeadlineSpec({ title: 'Line one\nLine two', overlay_config: undefined } as any);
    assert.equal(r!.text, 'Line one Line two');
  });

  console.log(`\n  ${passed}/${total} headline spec tests passed`);
  if (passed !== total) process.exitCode = 1;
}

run();
