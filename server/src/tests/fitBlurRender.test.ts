import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ClipRenderService, buildBlurFitChain, composeQuickVideoGraph } from '../services/clipRenderService.js';

describe('fit_blur quick-render layout (Opus-style blur-pad)', () => {
  it('resolveReframeDecision returns the chain-safe blur-pad graph for fit_blur', async () => {
    const clip: any = {
      id: 'c1', user_id: 'u1', aspect_ratio: '9:16',
      crop_config: { mode: 'fit_blur', focusX: 0.5, focusY: 0.5 },
      start_seconds: 0, end_seconds: 10, duration_seconds: 10,
    };
    const d = await (ClipRenderService as any).resolveReframeDecision(clip, 10);
    assert.ok(d.cropFilter.includes('boxblur'), 'blurred background fill present');
    assert.ok(d.cropFilter.includes('split=2[vcb_bgs][vcb_fgs]'), 'split stage present');
    assert.ok(d.cropFilter.includes('scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920'), 'bg covers canvas');
    assert.ok(d.cropFilter.includes('scale=1080:-2'), 'fg contained at canvas width');
    assert.ok(d.cropFilter.trimEnd().endsWith('overlay=(W-w)/2:(H-h)/2'), 'ends on unlabeled overlay for chaining');
  });

  it('composeQuickVideoGraph wraps the labeled chain with trailing filters into a valid filter_complex', () => {
    const { graph } = composeQuickVideoGraph([buildBlurFitChain('9:16', 1, 'vcb'), "drawtext=text='x':x=0:y=0"]);
    assert.ok(graph.startsWith('[0:v]split=2[vcb_bgs][vcb_fgs];'), 'input pad on first chain');
    assert.ok(graph.includes('[vcb_bg][vcb_fg]overlay=(W-w)/2:(H-h)/2,drawtext='), 'trailing filters chain from overlay output');
    assert.ok(graph.trimEnd().endsWith('[out_v]'), 'final output labeled once');
    // every declared label is consumed exactly once
    for (const lbl of ['vcb_bgs', 'vcb_fgs', 'vcb_bg', 'vcb_fg']) {
      assert.equal(graph.split(`[${lbl}]`).length - 1, 2, `${lbl} declared+consumed`);
    }
  });

  it('black-bar fit mode is unchanged', async () => {
    const clip: any = {
      id: 'c2', user_id: 'u1', aspect_ratio: '9:16',
      crop_config: { mode: 'fit', focusX: 0.5, focusY: 0.5 },
      start_seconds: 0, end_seconds: 10, duration_seconds: 10,
    };
    const d = await (ClipRenderService as any).resolveReframeDecision(clip, 10);
    assert.ok(d.cropFilter.includes('pad=1080:1920'), 'black pad retained');
    assert.ok(!d.cropFilter.includes('boxblur'), 'no blur in plain fit');
  });
});
