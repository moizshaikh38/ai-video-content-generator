import {test} from 'node:test';import assert from 'node:assert/strict';
import {applyPresetToEditorCaption,resolveEditorCaptionStyle,getPreviewFrame,buildPresetAssScript} from '../../../src/lib/captionPresets.js';
const cue={id:'a',start:0,end:1,text:'MAKE',words:[{text:'MAKE',start:0,end:1}]};
test('selecting a self-animated preset clears incompatible inherited pop, preserving caption cues and position',()=>{
 for(const id of['vireo_prism_stamp','vireo_echo_slide','vireo_comic_punch']as const)for(const animation of['pop','karaoke','bounce'] as const){
  const caption=applyPresetToEditorCaption({cues:[cue],position:'center',animation}as any,id);
  assert.equal(caption.animation,'none');assert.equal(caption.position,'center');assert.deepEqual(caption.cues,[cue]);
  const loaded=JSON.parse(JSON.stringify(caption)),style=resolveEditorCaptionStyle(loaded,'9:16')!;
  assert.ok(getPreviewFrame(cue,.12,style).stampMotion);assert.match(buildPresetAssScript([cue],style),/\\frz/);
 }
});
test('unrelated existing presets retain their historical animation-selection behavior',()=>{
 const c=applyPresetToEditorCaption({cues:[cue],animation:'pop'}as any,'soft_build');assert.equal(c.animation,'pop');
});
