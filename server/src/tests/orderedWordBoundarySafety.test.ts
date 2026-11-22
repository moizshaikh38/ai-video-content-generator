import test from 'node:test';
import assert from 'node:assert/strict';
import {createOrderedWordBoundarySafety as index} from '../shared/orderedWordBoundarySafety.js';
import {ShotBoundaryFusionService as S} from '../services/intelligence/shotBoundaryFusionService.js';
test('strict interiors block cuts while exact and touching edges remain safe',()=>{
 const safe=index([{start:1,end:2},{start:2,end:3},{start:4,end:5}]);for(const t of[0,1,2,3,3.5,4,5,6])assert.equal(safe(t),true,String(t));for(const t of[1.001,1.5,2.5,4.9])assert.equal(safe(t),false,String(t));
});
test('nested overlapping words keep an earlier long word active',()=>{
 const safe=index([{start:1,end:9},{start:2,end:3},{start:3,end:4}]);for(const t of[2,3,4,8.99])assert.equal(safe(t),false);assert.equal(safe(1),true);assert.equal(safe(9),true);
});
test('same-start and empty clocks retain scanner semantics',()=>{
 const safe=index([{start:1,end:2},{start:1,end:5}]);assert.equal(safe(1),true);assert.equal(safe(2),false);assert.equal(safe(5),true);for(const t of[-1,0,1,Infinity,NaN])assert.equal(index([])(t),true);
});
test('deterministic varied intervals match the former full scan without changing input',()=>{
 let seed=71;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);let start=0;const words=Array.from({length:1000},()=>{start+=Math.floor(random()*4)/10;return{start,end:start+.01+random()*3};});const before=structuredClone(words),safe=index(words);const points=[...words.flatMap(w=>[w.start,w.end]),...Array.from({length:1000},()=>random()*(start+5))];for(const t of points)assert.equal(safe(t),!words.some(w=>w.start<t&&w.end>t),String(t));assert.deepEqual(words,before);
});
test('real optimizer keeps long-source expansion and contraction boundaries',()=>{
 const words=Array.from({length:20000},(_,i)=>({word:i%16===15?'done.':'word',start:i*.25,end:i*.25+.18}));for(const [rawStart,rawEnd,start,end]of[[4000,4003,4000,4031.93],[3900,4100,3900,3959.93]]){const r=S.optimizeBoundaries({rawStart,rawEnd,words,totalVideoDuration:5000,targetDuration:{min:30,max:60},preferShotCutAlignment:false});assert.equal(r.start,start);assert.equal(r.end,end);assert.equal(r.boundaryOptimization.wordBoundarySafe,true);}
});
