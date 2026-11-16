import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {getPreviewCss,getCaptionCaret,getPreviewFrame,resolveCaptionPreset,buildPresetCueEvents,type PresetTimedCue} from '../shared/captionPresets.js';
const cue:PresetTimedCue={id:'q',start:0,end:2.4,text:'To get started',words:[{text:'To',start:0,end:.5},{text:'get',start:.5,end:1},{text:'started',start:1,end:2.4}]};
describe('Shared Typewriter caret geometry',()=>{
 it('uses the observed yellow color and reveals only one caret',()=>{
  const s=resolveCaptionPreset('typewriter');const f=getPreviewFrame(cue,1.16,s);
  assert.equal(f.caret?.color,'#F7C204');assert.equal(f.words.filter(w=>w.caretActive).length,1);assert.equal(f.words[2].caretActive,true);
 });
 it('tracks manual translation, not a competing default anchor',()=>{
  const s=resolveCaptionPreset('typewriter');const a=getCaptionCaret(cue,1.16,s)!;
  const b=getCaptionCaret({...cue,position_x:.7,position_y:.8},1.16,s)!;
  assert.ok(Math.abs((b.x-a.x)-.2*s.playResX)<.001);
  assert.ok(Math.abs((b.y-a.y)-(.8*s.playResY-(s.playResY-s.marginV)))<.001);
 });
 it('moves to the second line at a timed line break',()=>{
  const s=resolveCaptionPreset('typewriter');const c={...cue,text:'To get\\Nstarted'};
  const a=getCaptionCaret(c,.56,s)!;const b=getCaptionCaret(c,1.16,s)!;
  assert.ok(Math.abs((b.y-a.y)-s.fontSize)<.001);
 });
 it('stays absent with segment timing or a proportional font override',()=>{
  assert.equal(getCaptionCaret({...cue,words:undefined},1,resolveCaptionPreset('typewriter')),null);
  assert.equal(getCaptionCaret(cue,1,resolveCaptionPreset('typewriter',{fontFamily:'Arial'})),null);
  assert.equal(getCaptionCaret({...cue,words:[{text:'नमस्ते',start:0,end:2}]},1,resolveCaptionPreset('typewriter')),null);
 });
 it('has deterministic seek and no wall clock animation',()=>{
  const s=resolveCaptionPreset('typewriter');const a=getCaptionCaret(cue,.56,s);getCaptionCaret(cue,2.1,s);assert.deepEqual(getCaptionCaret(cue,.56,s),a);
 });
 it('emits separate vector layers without moving or reflowing the text',()=>{
  const events=buildPresetCueEvents(cue,resolveCaptionPreset('typewriter'));
  assert.ok(events.filter(e=>e.startsWith('Dialogue: 1,')).every(e=>e.includes('\\an7')&&e.includes('\\bord0\\shad0')));
  assert.equal(events.filter(e=>e.startsWith('Dialogue: 1,')).length,events.filter(e=>e.startsWith('Dialogue: 0,')).length);
 });
});

// Explicit glyph sizing prevents nested generic-monospace spans from shrinking in the gallery.
it('pins Typewriter glyph em size to the shared line size',()=>{
 const style=resolveCaptionPreset('typewriter');const css=getPreviewCss(style,.5);
 const frame=getPreviewFrame({id:'q',start:0,end:1,text:'Hi',words:[{text:'Hi',start:0,end:1}]},.2,style)!;
 assert.equal(css.word(frame.words[0]).fontSize,css.line.fontSize);
});
