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
test('new preset selection does not inherit an incompatible old animation override',()=>{
 const c=applyPresetToEditorCaption({cues:[cue],style:'vireo_comic_default',animation:'none'}as any,'compact_creator');assert.equal(c.animation,undefined);assert.equal(resolveEditorCaptionStyle(c)!.wordAnimation.type,'pop');
 const soft=applyPresetToEditorCaption({cues:[cue],style:'beasty',animation:'pop'}as any,'soft_build');assert.equal(soft.animation,undefined);assert.equal(resolveEditorCaptionStyle(soft)!.wordAnimation.type,'none');
});
test('reselecting same preset preserves a deliberate edit and stored input is not mutated',()=>{
 for(const animation of['none','pop','bounce']as const){const old={cues:[cue],style:'compact_creator',animation},before=JSON.stringify(old),out=applyPresetToEditorCaption(old as any,'compact_creator');assert.equal(out.animation,animation);assert.equal(JSON.stringify(old),before);}
});
