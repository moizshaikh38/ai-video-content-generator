import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveSelectionSegments as derive, newTranscriptSelectionFields} from '../services/transcription/selectionSegments.js';
const words=[{word:'First.',start:.1,end:.7},{word:'Second',start:1,end:1.3},{word:'sentence!',start:1.4,end:2},{word:'Unfinished',start:2.2,end:2.6}];
const segments=[{start:0,end:3,text:'First. Second sentence! Unfinished',avg_logprob:-.4,no_speech_prob:.1,compression_ratio:1.2}];
test('new selection units keep all words, clocks, diagnostics, outer bounds and unfinished tail without mutating input',()=>{
 const before=JSON.stringify({segments,words}),r=derive(segments,words);assert(r.changed);assert.deepEqual(r.providerSegmentIndexes,[0,0,0]);assert.deepEqual(r.segments.map(s=>[s.start,s.end,s.text]),[[0,.7,'First.'],[1,2,'Second sentence!'],[2.2,3,'Unfinished']]);assert.equal(r.segments.map(s=>s.text).join(' '),segments[0].text);assert(r.segments.every(s=>!s.words));for(const s of r.segments){assert.equal(s.avg_logprob,-.4);assert.equal(s.no_speech_prob,.1);assert.equal(s.compression_ratio,1.2);}assert.equal(JSON.stringify({segments,words}),before);
});
test('multiple provider segments retain their own index and diagnostics',()=>{
 const a={start:0,end:1,text:'Keep original',avg_logprob:-.1},b={start:2,end:4,text:'Two. More.',avg_logprob:-.9};const r=derive([a,b],[{word:'Keep',start:.1,end:.4},{word:'original',start:.5,end:.9},{word:'Two.',start:2.1,end:2.5},{word:'More.',start:3,end:3.5}]);assert(r.changed);assert.equal(r.segments[0],a);assert.deepEqual(r.providerSegmentIndexes,[0,1,1]);assert.equal(r.segments[1].avg_logprob,-.9);
});
for(const [name,ss,ww] of [
 ['missing words',segments,[]],['text mismatch',[{...segments[0],text:'First. Second sentence!'}],words],['punctuation mismatch',[{...segments[0],text:'First Second sentence Unfinished'}],words],['case mismatch',[{...segments[0],text:'first. Second sentence! Unfinished'}],words],['word outside',segments,[{...words[0],start:-.1},...words.slice(1)]],['crossing segment end',segments,[...words.slice(0,3),{...words[3],end:3.1}]],['overlap',segments,[words[0],{...words[1],start:.6},...words.slice(2)]],['annotation',segments,[{...words[0],kind:'audio_event'},...words.slice(1)]],['unassigned trailing word',segments,[...words,{word:'Extra',start:4,end:5}]],['unassigned leading word',segments,[{word:'Extra',start:0,end:.05},...words]],['unordered segments',[segments[0],{start:2,end:4,text:'Other.'}],words],['malformed text',[{...segments[0],text:null}],words],['malformed token',segments,[{...words[0],word:1},...words.slice(1)]],
] as any[])test('ambiguous '+name+' preserves original segmentation',()=>{const r=derive(ss,ww);assert.equal(r.changed,false);assert.equal(r.segments,ss);});
test('no terminal punctuation preserves existing units; repeated speech is not deduplicated',()=>{
 const s=[{start:0,end:3,text:'Go go again'}],w=[{word:'Go',start:.1,end:.3},{word:'go',start:.4,end:.6},{word:'again',start:.8,end:1}];assert.equal(derive(s,w).segments,s);
 const r=derive([{start:0,end:2,text:'Go. Go.'}],[{word:'Go.',start:.1,end:.4},{word:'Go.',start:1,end:1.4}]);assert(r.changed);assert.equal(r.segments.map(s=>s.text).join(' '),'Go. Go.');
});
test('punctuation in numbers is not a terminal boundary and Hindi punctuation is supported',()=>{
 const r=derive([{start:0,end:4,text:'Value 1.25 ठीक। फिर?'}],[{word:'Value',start:0,end:.4},{word:'1.25',start:.5,end:1},{word:'ठीक।',start:1.1,end:2},{word:'फिर?',start:3,end:3.5}]);assert(r.changed);assert.equal(r.segments.length,2);assert.equal(r.segments[0].text,'Value 1.25 ठीक।');
});

test('storage fields retain provider units only when deriving new units',()=>{const fields=newTranscriptSelectionFields(segments,words);assert.equal(fields.provider_segments,segments);assert.deepEqual(fields.selection_segmentation?.provider_segment_indexes,[0,0,0]);assert.equal(fields.segments.length,3);const raw=newTranscriptSelectionFields(segments,[]);assert.equal(raw.segments,segments);assert.equal(raw.provider_segments,undefined);});

test('one millisecond provider boundary rounding uses unchanged word clocks, never shifts text or overlaps a neighbor',()=>{
 const s=[{start:.101,end:2.999,text:'First. Second.'}],w=[{word:'First.',start:.1,end:1},{word:'Second.',start:2,end:3}];const before=JSON.stringify({s,w});const r=derive(s,w);assert(r.changed);assert.deepEqual(r.segments.map(s=>[s.start,s.end]),[[.1,1],[2,3]]);assert.equal(JSON.stringify({s,w}),before);
 assert.equal(derive([{...s[0],end:2.998}],w).changed,false);
 const ss=[{start:0,end:.999,text:'First.'},{start:.999,end:2,text:'Second.'}],ww=[{word:'First.',start:0,end:1},{word:'Second.',start:1,end:2}];assert.equal(derive(ss,ww).changed,false,'expanded word envelope may not overlap the next provider segment');
 const overlapping=[{...ss[0]},{...ss[1],start:.999, text:'Second.'}];const ow=[ww[0],{...ww[1],start:.999}];assert.equal(derive(overlapping,ow).changed,false,'real word overlap is never repaired');
});

test('selection-time bounded envelope splits coarse Whisper segments with 100ms end skew while rejecting neighbor overlap',()=>{
 const coarse=[
  {start:0,end:18.22,text:'First sentence. Second sentence!'},
  {start:30,end:50.94,text:'Third sentence. Unfinished tail'},
 ];
 const coarseWords=[
  {word:'First',start:0.78,end:1.1},
  {word:'sentence.',start:1.1,end:2.12},
  {word:'Second',start:14.8,end:15.3},
  {word:'sentence!',start:17.8,end:18.32},
  {word:'Third',start:30,end:30.5},
  {word:'sentence.',start:30.5,end:47.54},
  {word:'Unfinished',start:49.48,end:49.9},
  {word:'tail',start:49.9,end:50.48},
 ];
 // Default 1ms persistence contract remains unchanged
 assert.equal(derive(coarse,coarseWords).changed,false);
 // Bounded selection-time reconciliation splits into 4 sentence units
 const refined=derive(coarse,coarseWords,{maxBoundarySkewSec:0.5});
 assert.equal(refined.changed,true);
 assert.deepEqual(refined.segments.map(s=>[s.start,s.end,s.text]),[
  [0,2.12,'First sentence.'],
  [14.8,18.32,'Second sentence!'],
  [30,47.54,'Third sentence.'],
  [49.48,50.94,'Unfinished tail'],
 ]);
 // Still rejects if expanding past segment.end would overlap the next segment
 const colliding=[coarse[0],{...coarse[1],start:18.25}];
 assert.equal(derive(colliding,coarseWords,{maxBoundarySkewSec:0.5}).changed,false);
});

test('0.5s boundary-skew tolerance enforces exact limits, ordering, missing words, and leading-word bounds',()=>{
 const baseSeg=[{start:1.0,end:5.0,text:'Alpha. Beta.'}];
 // 250ms and exact 500ms trailing skew pass; 501ms fails
 assert.equal(derive(baseSeg,[{word:'Alpha.',start:1.0,end:2.0},{word:'Beta.',start:3.0,end:5.25}],{maxBoundarySkewSec:0.5}).changed,true);
 assert.equal(derive(baseSeg,[{word:'Alpha.',start:1.0,end:2.0},{word:'Beta.',start:3.0,end:5.5}],{maxBoundarySkewSec:0.5}).changed,true);
 assert.equal(derive(baseSeg,[{word:'Alpha.',start:1.0,end:2.0},{word:'Beta.',start:3.0,end:5.501}],{maxBoundarySkewSec:0.5}).changed,false);
 // Leading-word skew: 500ms before segment.start passes; 501ms fails
 assert.equal(derive(baseSeg,[{word:'Alpha.',start:0.5,end:2.0},{word:'Beta.',start:3.0,end:5.0}],{maxBoundarySkewSec:0.5}).changed,true);
 assert.equal(derive(baseSeg,[{word:'Alpha.',start:0.499,end:2.0},{word:'Beta.',start:3.0,end:5.0}],{maxBoundarySkewSec:0.5}).changed,false);
 // Incorrect word ordering fails even within 0.5s
 assert.equal(derive(baseSeg,[{word:'Alpha.',start:2.5,end:3.5},{word:'Beta.',start:2.0,end:4.0}],{maxBoundarySkewSec:0.5}).changed,false);
 // Missing word in words array fails exact text agreement
 assert.equal(derive(baseSeg,[{word:'Alpha.',start:1.0,end:2.0}],{maxBoundarySkewSec:0.5}).changed,false);
});
