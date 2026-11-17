import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {resolveCaptionPreset,getPreviewCss,getPreviewFrame,buildPresetAssStyleLine} from '../shared/captionPresets.js';
describe('Typewriter optional dark edge',()=>{
 it('does not silently change the reference default or explicit saved stroke',()=>{
  assert.equal(resolveCaptionPreset('typewriter').outlineWidth,0);
  assert.equal(resolveCaptionPreset('typewriter',{outlineWidth:0}).outlineWidth,0);
  assert.equal(resolveCaptionPreset('typewriter',{outlineWidth:7,outlineColor:'#123456'}).outlineWidth,7);
 });
 it('keeps CSS and ASS stroke sizes consistent at native720 while retaining white fill',()=>{
  const s=resolveCaptionPreset('typewriter',{outlineWidth:3,outlineColor:'#000000'});
  assert.equal(s.outlineWidth,3); assert.equal(s.textColor,'#FFFFFF');
  assert.equal(getPreviewCss(s,720/1080).word(getPreviewFrame({id:'edge',start:0,end:1,text:'hit'},.5,s).words[0]).WebkitTextStroke,'4px #000000');
  const ass=buildPresetAssStyleLine(s);
  assert.match(ass,/,1,3,0,/);
 });
 it('does not change timed words or typing behavior',()=>{
  const cue={id:'seam',start:0,end:4,text:'hit the hay in',words:[{text:'hit',start:0,end:.4},{text:'the',start:.4,end:.8},{text:'hay',start:.8,end:1.2},{text:'in',start:1.2,end:1.6}]};
  const a=resolveCaptionPreset('typewriter'),b=resolveCaptionPreset('typewriter',{outlineWidth:3,outlineColor:'#000000'});
  for(const t of[0,.3,.7,1.3,1.8,3.5])assert.deepEqual(getPreviewFrame(cue,t,a),getPreviewFrame(cue,t,b));
 });
});
