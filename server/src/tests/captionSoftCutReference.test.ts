import{describe,it}from'node:test';import assert from'node:assert/strict';import{resolveCaptionPreset,regroupCuesForPreset}from'../shared/captionPresets';
const style=resolveCaptionPreset('soft_cut');const cue={id:'manual',start:0,end:2,text:'hay in',position_x:.5,position_y:.8,position_anchor:'center' as const,words:[{text:'hay',start:0,end:.3},{text:'in',start:.6,end:.8}]};
describe('Soft Cut separately observed short-gap behavior',()=>{
 it('holds a word through a short silence without retiming speech or extending tail',()=>{const{cues}=regroupCuesForPreset([cue],style);assert.equal(cues[0].end,.6);assert.equal(cues[0].words![0].end,.3);assert.equal(cues[1].end,.8);assert.equal(cues[0].position_anchor,'center');});
 it('keeps originalcueboundaries and long pauses unbridged',()=>{const separate=[{...cue,end:.4,words:[cue.words[0]]},{...cue,id:'other',start:.6,words:[cue.words[1]]}];assert.equal(regroupCuesForPreset(separate,style).cues[0].end,.3);assert.equal(regroupCuesForPreset([{...cue,words:[cue.words[0],{...cue.words[1],start:1,end:1.2}]}],style).cues[0].end,.3);});
 it('does not treat explicitdifferentpreset as SoftCut',()=>{assert.equal(regroupCuesForPreset([{...cue,presetOverride:'word_cut'}],style).cues[0].end,.3);});
 it('does not blindly copy WordCutsizecalibration',()=>{assert.equal(style.fontSize,88);assert.equal(style.fontFamily,'Figtree');assert.equal(style.fontWeight,600);});
});
