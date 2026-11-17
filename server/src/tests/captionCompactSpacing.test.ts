import test from 'node:test';import assert from 'node:assert/strict';
import{resolveCaptionPreset,getPreviewCss,buildPresetAssScript}from '../shared/captionPresets.js';
const word={text:'MOMENT',highlighted:true,active:true,scale:1.18,breakAfter:false};
test('Compact Creator reserves scaled inline advance, outline and shadow',()=>{const css=getPreviewCss(resolveCaptionPreset('compact_creator'),238/1080).word(word);assert.equal(css.zoom,1.18);assert.equal(css.transform,'none');assert.equal(css.transition,'none');});
test('compact inactive words remain unscaled and custom word size composes',()=>{const css=getPreviewCss(resolveCaptionPreset('compact_creator'),1);assert.equal(css.word({...word,scale:1}).zoom,1);assert.equal(css.word({...word,customStyle:{fontSizeMultiplier:1.1}}).zoom,1.298);});
test('other saved pop styles keep their existing renderer',()=>{const css=getPreviewCss(resolveCaptionPreset('beasty'),1).word(word);assert.equal(css.zoom,undefined);assert.equal(css.transform,'scale(1.180)');});
test('Compact Creator export continues to use scaled ASS advance',()=>{const ass=buildPresetAssScript([{id:'a',start:0,end:1,text:'Moment worth',words:[{text:'Moment',start:0,end:.5},{text:'worth',start:.5,end:1}]}],resolveCaptionPreset('compact_creator'));assert.match(ass,/fscx118\\fscy118/);});
