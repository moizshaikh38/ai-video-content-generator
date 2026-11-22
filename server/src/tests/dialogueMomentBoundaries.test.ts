import test from 'node:test';
import assert from 'node:assert/strict';
import {findDialogueMoments, type MomentStructurerInput} from '../services/momentStructurer.js';
const text = ['Why','did','that','fail?','Because','the','old','system','dropped','every','other','packet.'];
const words = (tokens = text) => tokens.map((word,i)=>({word,start:i*.5,end:i*.5+.38}));
const input = (w:any[]):MomentStructurerInput => ({durationSec:30,words:w,energySegments:[],spikes:[],sceneCuts:[],faceIntervals:[],genre:'podcast_interview'});
test('question punctuation recognizes a quick answer without requiring a long pause',()=>{
 const r=findDialogueMoments(input(words()));assert.equal(r.length,1);assert.equal(r[0].structure.event_at,1.88);assert.equal(r[0].structure.payoff_at,5.88);
});
test('supported text-shaped words detect the same question and answer sentence',()=>{
 const w=words().map(({word,...span})=>({...span,text:word}));assert.deepEqual(findDialogueMoments(input(w)),findDialogueMoments(input(words())));assert.equal(findDialogueMoments(input(w)).length,1);
});
test('a prior complete sentence is not part of the question despite no long pause',()=>{
 const w=words(['Here','is','the','introduction.',...text]);const [r]=findDialogueMoments(input(w));assert(r);assert.equal(r.structure.setup_at,2);assert.equal(r.start,1.88);
});
test('answer padding stops before the next spoken word instead of cutting into it',()=>{
 const w=words([...text,'Another','sentence','starts','here.']);const [r]=findDialogueMoments(input(w));assert(r);assert.equal(r.end,6);assert.equal(r.structure.payoff_at,5.88);
});
test('terminal quoted question punctuation is recognized',()=>{
 const w=words(text.map(x=>x==='fail?'?'fail?"':x));assert.equal(findDialogueMoments(input(w)).length,1);
});
test('Arabic question mark is a terminal question boundary',()=>{
 const w=words(text.map(x=>x==='fail?'?'fail؟':x));assert.equal(findDialogueMoments(input(w)).length,1);
});
test('a question with no following answer does not invent a moment',()=>{
 assert.deepEqual(findDialogueMoments(input(words(['Why','did','that','fail?']))),[]);
});
test('a nonterminal question mark inside a token does not become a question',()=>{
 const w=words(text.map(x=>x==='fail?'?'fail?maybe':x));for(let i=4;i<w.length;i++){w[i].start+=.5;w[i].end+=.5;}assert.deepEqual(findDialogueMoments(input(w)),[]);
});
test('blank word fields fall back to text without mutating source rows or clocks',()=>{
 const w=words().map(({word,...span})=>({...span,word:' ',text:word}));const before=structuredClone(w);assert.equal(findDialogueMoments(input(w)).length,1);assert.deepEqual(w,before);
});
test('original long-pause question-answer recognition is retained',()=>{
 const w=words();for(let i=4;i<w.length;i++){w[i].start+=.5;w[i].end+=.5;}assert.equal(findDialogueMoments(input(w)).length,1);
});
test('unusable overlong answer does not invent an answer end at its start',()=>{
 const w=words();w[4].end=49;assert.deepEqual(findDialogueMoments(input(w.slice(0,5))),[]);
});
