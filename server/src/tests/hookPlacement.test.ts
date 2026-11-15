import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ClipRenderService } from '../services/clipRenderService.js';

const H = 1920;

describe('Hook headline placement (OpenShorts: away from faces/captions)', () => {
  it('defaults to the legacy top zone', () => {
    const p = ClipRenderService.resolveHeadlinePlacement({ captionPosition: 'bottom', canvasHeight: H });
    assert.equal(p.zone, 'top');
    assert.equal(p.yBase, 150);
    assert.equal(p.reason, 'default_top');
  });

  it('moves to the lower zone when captions occupy the top', () => {
    const p = ClipRenderService.resolveHeadlinePlacement({ captionPosition: 'top', canvasHeight: H });
    assert.equal(p.zone, 'bottom');
    assert.equal(p.reason, 'caption_band_top');
    // 0.72 * 1920 = 1382 - above the bottom safe area
    assert.equal(p.yBase, 1382);
  });

  it('moves to the lower zone when the followed face is in the top 40%', () => {
    const p = ClipRenderService.resolveHeadlinePlacement({ captionPosition: 'bottom', canvasHeight: H, faceCenterY01: 0.3 });
    assert.equal(p.zone, 'bottom');
    assert.equal(p.reason, 'face_in_top_zone');
  });

  it('stays top when the face is low and captions are at the bottom', () => {
    const p = ClipRenderService.resolveHeadlinePlacement({ captionPosition: 'bottom', canvasHeight: H, faceCenterY01: 0.7 });
    assert.equal(p.zone, 'top');
  });

  it('drops to upper-middle when top captions AND a low face block both zones', () => {
    const p = ClipRenderService.resolveHeadlinePlacement({ captionPosition: 'top', canvasHeight: H, faceCenterY01: 0.8 });
    assert.equal(p.zone, 'upper_middle');
    assert.equal(p.yBase, Math.round(H * 0.3));
    assert.equal(p.reason, 'top_caption_plus_low_face');
  });

  it('ignores non-finite face data instead of misfiring', () => {
    const p = ClipRenderService.resolveHeadlinePlacement({ captionPosition: 'bottom', canvasHeight: H, faceCenterY01: Number.NaN });
    assert.equal(p.zone, 'top');
  });

  it('scales with canvas height (16:9)', () => {
    const p = ClipRenderService.resolveHeadlinePlacement({ captionPosition: 'top', canvasHeight: 1080 });
    assert.equal(p.yBase, Math.round(1080 * 0.72));
  });
});
