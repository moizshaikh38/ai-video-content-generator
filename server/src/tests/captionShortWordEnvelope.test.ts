import test from 'node:test';import assert from 'node:assert/strict';
import {enforceZeroOverlap,computeCueWordSlices,buildPresetAssScript,resolveCaptionPreset}from'../shared/captionPresets.js';
const pair=(end=.04,next=.01)=>[{id:'first',start:0,end,text:'ONE',words:[{text:'ONE',start:0,end}]},{id:'second',start:next,end:.2,text:'TWO',words:[{text:'TWO',start:next,end:.2}]}];
test('a short exact-word cue yields its display envelope to the next measured onset',()=>{
 const input=pair(),words=structuredClone(input.map(c=>c.words));const out=enforceZeroOverlap(input);assert.equal(out[0].end,.01);assert.deepEqual(out.map(c=>c.words),words);assert.equal(out[0].words[0].end,.04);assert.deepEqual(computeCueWordSlices(out[0]),[{start:0,end:.01,activeIdx:0,progressIdx:0}]);
});
test('a10ms source word is not stretched by the50ms envelope floor',()=>{
 const input=pair(.01,.005),words=structuredClone(input[0].words);const out=enforceZeroOverlap(input);assert.equal(out[0].end,.005);assert.deepEqual(out[0].words,words);
});
test('manual held envelopes keep their established legacy handling',()=>{
 const input=pair();input[0].words[0].end=.02;const out=enforceZeroOverlap(input);assert.equal(out[0].end,.05);
});
test('equal onsets and larger unrepresentable overlaps are not silently shifted by the narrow repair',()=>{
 for(const input of[pair(.04,0),pair(.2,.01)]){const out=enforceZeroOverlap(input);assert.equal(out[0].end,.05);}
});
test('actual Comic ASS no longer places the first short cue over the second one',()=>{
 const ass=buildPresetAssScript(pair(),resolveCaptionPreset('vireo_comic_default',{},'9:16'));const lines=ass.split('\n').filter(x=>x.startsWith('Dialogue:'));const first=lines.filter(x=>x.includes('ONE')),second=lines.filter(x=>x.includes('TWO'));assert(first.length);assert(second.length);for(const line of first)assert(line.split(',')[2]<='0:00:00.01');for(const line of second)assert(line.split(',')[1]>='0:00:00.01');
});
test('every preset keeps generated events inside the shortened exact-word envelope',async()=>{
 const M=await import('../shared/captionPresets.js');for(const id of M.CAPTION_PRESET_IDS){if(id==='none')continue;const [cue]=enforceZeroOverlap(pair());const events=M.buildPresetCueEvents(cue,resolveCaptionPreset(id,{},'9:16'));assert(events.length,id);for(const event of events){const[h,m,s]=event.split(',')[2].split(':').map(Number);assert(h*3600+m*60+s<=.010001,id);}}
});
test('legacy multi-word overlap handling and all text tokens remain unchanged',()=>{
 const cues:any=[{id:'a',start:0,end:2,text:'Hello world today',words:[{text:'Hello',start:0,end:.5},{text:'world',start:.5,end:1},{text:'today',start:1.6,end:2}]},{id:'b',start:1.5,end:3,text:'we are here',words:[{text:'we',start:1.5,end:1.9},{text:'are',start:1.9,end:2.4},{text:'here',start:2.4,end:3}]}];const out=enforceZeroOverlap(cues);assert.equal(out[0].end,1.5);assert.deepEqual(out[0].words.map((w:any)=>w.text),['Hello','world','today']);assert(out[0].words.every((w:any)=>w.end<=1.501&&w.end>w.start));
});
test('the80ms repair boundary is compared at saved millisecond precision',()=>{
 const cues=pair(.09,.01).map(c=>({...c,start:c.start+4.11,end:c.end+4.11,words:c.words.map(w=>({...w,start:w.start+4.11,end:w.end+4.11}))}));for(const c of cues){c.start=Number(c.start.toFixed(3));c.end=Number(c.end.toFixed(3));for(const w of c.words){w.start=Number(w.start.toFixed(3));w.end=Number(w.end.toFixed(3));}}const before=structuredClone(cues[0].words);const out=enforceZeroOverlap(cues);assert.equal(out[0].end,4.12);assert.deepEqual(out[0].words,before);
});
test('export preparation leaves saved cue and word payloads unchanged',()=>{
 const cues=pair(),before=structuredClone(cues);buildPresetAssScript(cues,resolveCaptionPreset('vireo_comic_default',{},'9:16'));assert.deepEqual(cues,before);
});
