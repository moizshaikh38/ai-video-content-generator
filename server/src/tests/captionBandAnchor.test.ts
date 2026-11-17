/**
 * Caption band anchor + default style regression suite.
 *
 * User-reported defect (15 Nov 2026): on blur-fit layouts the captions
 * rendered below the sharp content band, over the large blurred fill -
 * "captions me blur background bohot aata hai, clean nhi lagta". The fix
 * anchors bottom captions to the content band, and clips with no explicit
 * caption style default to the karaoke preset (large word-by-word highlight).
 */

import assert from 'node:assert/strict';
import { CaptionService } from '../services/captionService.js';

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
  console.log('\n[CaptionBandAnchor] computeBlurFitBandAnchor');

  await it('16:9 source on 9:16 canvas anchors inside the centered band', () => {
    const y = CaptionService.computeBlurFitBandAnchor('9:16', 1280, 720)!;
    // fitH = 607.5, band 656.25-1263.75, target bottom edge ~1215 -> ~0.633
    assert.ok(Math.abs(y - 0.633) < 0.01, `expected ~0.633, got ${y}`);
    // And it must be inside the band (0.342..0.658), not on the blur below it.
    assert.ok(y > 0.342 && y < 0.658);
  });

  await it('portrait source on 9:16 canvas has no vertical band (undefined)', () => {
    assert.equal(CaptionService.computeBlurFitBandAnchor('9:16', 720, 1280), undefined);
  });

  await it('square source on 9:16 anchors to its band', () => {
    const y = CaptionService.computeBlurFitBandAnchor('9:16', 1080, 1080)!;
    // fitH = 1080, band 420-1500, target ~1414 -> ~0.736
    assert.ok(Math.abs(y - 0.736) < 0.01, `expected ~0.736, got ${y}`);
  });

  await it('16:9 source on 16:9 canvas fills the frame (undefined)', () => {
    assert.equal(CaptionService.computeBlurFitBandAnchor('16:9', 1280, 720), undefined);
  });

  await it('missing or invalid source dims return undefined', () => {
    assert.equal(CaptionService.computeBlurFitBandAnchor('9:16', undefined, undefined), undefined);
    assert.equal(CaptionService.computeBlurFitBandAnchor('9:16', 0, 720), undefined);
  });

  console.log('\n[CaptionBandAnchor] resolveDefaultCaptionStyle');

  await it('no explicit style -> house comic preset default', () => {
    const r = CaptionService.resolveDefaultCaptionStyle({ caption_style: null as any, caption_config: {} } as any);
    assert.equal(r.captionStyle, 'vireo_comic_default');
    assert.equal((r.captionConfig as any).presetId, 'vireo_comic_default');
  });

  await it('undefined style -> house comic preset default', () => {
    const r = CaptionService.resolveDefaultCaptionStyle({ caption_style: undefined as any, caption_config: undefined as any } as any);
    assert.equal(r.captionStyle, 'vireo_comic_default');
    assert.equal((r.captionConfig as any).presetId, 'vireo_comic_default');
  });

  await it("explicit 'clean' style is preserved untouched", () => {
    const r = CaptionService.resolveDefaultCaptionStyle({ caption_style: 'clean', caption_config: {} } as any);
    assert.equal(r.captionStyle, 'clean');
    assert.equal((r.captionConfig as any).presetId, undefined);
  });

  await it('explicit preset style is preserved untouched', () => {
    const r = CaptionService.resolveDefaultCaptionStyle({ caption_style: 'beasty', caption_config: { presetId: 'beasty' } } as any);
    assert.equal(r.captionStyle, 'beasty');
    assert.equal((r.captionConfig as any).presetId, 'beasty');
  });

  await it('unset style with an explicit presetId keeps that presetId', () => {
    const r = CaptionService.resolveDefaultCaptionStyle({ caption_style: null as any, caption_config: { presetId: 'mozi' } } as any);
    assert.equal(r.captionStyle, 'mozi');
    assert.equal((r.captionConfig as any).presetId, 'mozi');
  });

  console.log(`\n  ${passed}/${total} caption band anchor tests passed`);
  if (passed !== total) process.exitCode = 1;
}

run();
