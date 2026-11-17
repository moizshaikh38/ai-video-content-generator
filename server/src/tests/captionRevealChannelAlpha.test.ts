import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPresetCueEvents,resolveCaptionPreset} from '../shared/captionPresets.js';
const cue={start:0,end:2,text:'Hello world',words:[{text:'Hello',start:0,end:.8},{text:'world',start:.8,end:2}]};
test('Soft Build visible words retain 22 percent shadow opacity',()=>{
 const s=resolveCaptionPreset('soft_build'),e=buildPresetCueEvents(cue,s).join('\n');
 assert.ok(e.includes(String.raw`\1a&H00&\2a&H00&\3a&H00&\4a&HC7&}Hello`));
 assert.ok(e.includes(String.raw`\1a&HCC&\2a&HCC&\3a&HCC&\4a&HF4&}Hello`));
});
test('manual reveal box and shadow opacities stay separate from fill',()=>{
 const s=resolveCaptionPreset('soft_build',{boxEnabled:true,boxOpacity:.4,shadowEnabled:true,shadowOpacity:.5});
 const e=buildPresetCueEvents(cue,s).join('\n');
 assert.ok(e.includes(String.raw`\1a&H00&\2a&H00&\3a&H99&\4a&HFF&}Hello`));
});
test('Typewriter still suppresses unshown characters with global hidden alpha',()=>{
 const e=buildPresetCueEvents(cue,resolveCaptionPreset('typewriter')).join('\n');
 assert.ok(e.includes(String.raw`\alpha&HFF&`));assert.ok(e.includes(String.raw`\1a&H00&\2a&H00&\3a&H00&\4a&HFF&`));
});
