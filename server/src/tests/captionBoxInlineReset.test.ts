import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPresetCueEvents,resolveCaptionPreset,hexToAssColor} from '../shared/captionPresets.js';
const cue={start:0,end:2,text:'I need you to',words:[{text:'I',start:0,end:.3},{text:'need',start:.3,end:.7},{text:'you',start:.7,end:1.1},{text:'to',start:1.1,end:2}]};
for(const id of ['soft_backdrop','think_media','vireo_capsule','vireo_editorial'] as const)test(id+' inline reset restores box instead of black glyph outline',()=>{
 const s=resolveCaptionPreset(id,{outlineColor:'#EE1122'}),events=buildPresetCueEvents(cue,s).join('\n');
 assert.ok(s.box);assert.ok(events.includes(String.raw`\3c${hexToAssColor(s.box!.color)}\bord${s.box!.padding}`));
 assert.ok(!events.includes(String.raw`\3c${hexToAssColor(s.outlineColor)}\bord${s.outlineWidth}`));
});
test('explicit background color wins and custom glow/pill resets return to it',()=>{
 const s=resolveCaptionPreset('soft_backdrop',{boxColor:'#13579B',boxOpacity:.43});
 for(const effect of ['pill','glow'] as const){const c={...cue,words:cue.words.map((w,i)=>({...w,...(i===1?{customStyle:{effect,color:'#FF1177'}}:{})}))};
 const events=buildPresetCueEvents(c,s).join('\n');assert.ok(events.includes(String.raw`\3c${hexToAssColor('#13579B')}\bord${s.outlineWidth}`));}
});
test('no-box inline reset retains the original glyph outline channel',()=>{
 const s=resolveCaptionPreset('editorial'),events=buildPresetCueEvents(cue,s).join('\n');assert.equal(s.box,null);
 assert.ok(events.includes(String.raw`\3c${hexToAssColor(s.outlineColor)}\bord${s.outlineWidth}`));
});
