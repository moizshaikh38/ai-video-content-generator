import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {CAPTION_PRESETS,FONT_EM_PER_ASS_SIZE,resolveCaptionPreset,getPreviewCss,getPreviewFrame,getCaptionCaret,buildPresetAssScript,type PresetTimedCue} from '../shared/captionPresets.js';

// Measured candidate only. This fixture must not silently promote a default.
// Same visible Opus Copy phrase: JetBrains Mono Bold, 47px in its Font panel,
// native 720px-wide canvas. Timing is a local fixture, not a reference timing claim.
const words=[{text:'hit',start:.321,end:.421},{text:'the',start:.441,end:.521},{text:'hay',start:.561,end:.821},{text:'in',start:1.122,end:1.182}];
const cue:PresetTimedCue={id:'real-phrase',start:.321,end:1.3,text:'hit the hay in',words};
describe('Typewriter size calibration remains an editable candidate',()=>{
 it('keeps the existing default separate from the measured 87 candidate and saved 75 override',()=>{
  assert.equal(CAPTION_PRESETS.typewriter.font.size,74);
  assert.equal(CAPTION_PRESETS.typewriter.qualification,'candidate');
  assert.equal(resolveCaptionPreset('typewriter',{fontSize:75}).fontSize,75);
  assert.equal(resolveCaptionPreset('typewriter',{fontSize:87}).fontSize,87);
 });
 it('applies the same explicit size to CSS line, glyph spans and ASS without changing the font',()=>{
  for(const fontSize of[74,75,86,87,88]){
   const style=resolveCaptionPreset('typewriter',{fontSize});
   const frame=getPreviewFrame(cue,1.2,style);
   for(const scale of[.25,720/1080,1]){
    const css=getPreviewCss(style,scale);
    assert.equal(css.line.fontSize,`${Number((fontSize*FONT_EM_PER_ASS_SIZE['JetBrains Mono']*scale).toFixed(3))}px`);
    for(const word of frame.words)assert.equal(css.word(word).fontSize,css.line.fontSize);
   }
   assert.equal(style.fontFamily,'JetBrains Mono');
   assert.match(buildPresetAssScript([cue],style),new RegExp(`Style: Default,JetBrains Mono,${fontSize},`));
  }
 });
 it('changes only geometry, retaining source word timing, reveal state and deterministic caret seeking',()=>{
  const before=JSON.stringify(cue);
  for(const time of[.321,.35,.5,.7,1.15,1.2]){
   const oldStyle=resolveCaptionPreset('typewriter',{fontSize:75});
   const candidate=resolveCaptionPreset('typewriter',{fontSize:87});
   const oldFrame=getPreviewFrame(cue,time,oldStyle),nextFrame=getPreviewFrame(cue,time,candidate);
   assert.deepEqual(nextFrame.words,oldFrame.words);
   const first=getCaptionCaret(cue,time,candidate);
   getCaptionCaret(cue,1.29,candidate);
   assert.deepEqual(getCaptionCaret(cue,time,candidate),first);
  }
  assert.equal(JSON.stringify(cue),before);
 });
 it('retains explicit two-line/manual-center placement at the calibrated size',()=>{
  const style=resolveCaptionPreset('typewriter',{fontSize:87});
  const manual={...cue,text:'hit the hay\\Nin',position_x:.4,position_y:.6,position_anchor:'center' as const};
  const bottom=getCaptionCaret({...manual,position_anchor:'bottom'},1.2,style)!;
  const center=getCaptionCaret(manual,1.2,style)!;
  assert.equal(center.x,bottom.x);
  assert.equal(center.y-bottom.y,87);
  assert.match(buildPresetAssScript([manual],style),/\\pos\(/);
 });
});
