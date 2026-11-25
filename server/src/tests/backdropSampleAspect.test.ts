import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBackdropFitChain} from '../services/clipRenderService.js';

// The backdrop branch is scaled with force_original_aspect_ratio=increase (or a plain scale), which
// rounds the width and leaves a non-1:1 sample aspect ratio (observed 10240:10239 blur, 256:81 colour
// on a 1280x720 source). The overlay output inherits the backdrop SAR, so it must be reset to 1.
for(const [name,spec] of [['blur band',{kind:'blur',bandAspect:4/3,bandPlaceY:0.42}],['blur full',{kind:'blur'}],['colour',{kind:'color',color:'#112233'}]] as const){
  test(`backdrop chain (${name}) resets the backdrop sample aspect ratio to 1 before overlay`,()=>{
    const chain=buildBackdropFitChain('9:16',1,spec as any,'t',1);
    assert.match(chain,/\[t_bg\]/);
    assert.match(chain,/setsar=1\[t_bg\]/);
  });
}

test('legacy blur-fit chain also resets the backdrop sample aspect ratio to 1',async()=>{
  const {buildBlurFitChain}=await import('../services/clipRenderService.js');
  const chain=buildBlurFitChain('9:16',1,'t',1);
  assert.match(chain,/setsar=1\[t_bg\]/);
});
