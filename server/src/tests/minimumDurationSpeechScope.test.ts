import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ShotBoundaryFusionService as Fusion} from '../services/intelligence/shotBoundaryFusionService.js';
import {compareFinalSpeechScope as compare,narrativeRankingInvalidationReason as reason} from '../shared/finalSpeechScope.js';
// Synthetic duration/scope contracts only. Terminal punctuation is lexical evidence,
// not an assertion that the window contains a complete idea or accurate ASR.
const words=Array.from({length:70},(_,i)=>({word:i%10===9?'sentence.':`word${i}`,start:i*.6,end:i*.6+.5}));
const fuse=(w=words)=>Fusion.optimizeBoundaries({rawStart:0,rawEnd:10,words:w,segments:[],sceneCuts:[],silenceIntervals:[],faceIntervals:[],totalVideoDuration:42,targetDuration:{min:20,max:30,optimal:25},preferShotCutAlignment:true});
test('minimum-duration expansion retains word clocks and cannot inherit original narrative ranking',()=>{
 const before=structuredClone(words),r=fuse();assert.deepEqual(words,before);assert(r.duration>=20&&r.duration<=30);assert.equal(r.boundaryOptimization.wordBoundarySafe,true);
 const b={originalStart:0,originalEnd:10,finalStart:r.start,finalEnd:r.end},s=compare({words,...b});assert.equal(s.status,'changed');assert.equal(reason(s,b),'spoken-content-changed-after-proposal');assert.equal(s.finalWordBoundarySafe,true);
});
test('a punctuated expanded ending does not restore the original proposal score',()=>{
 const w=words.map(x=>({...x,word:x.word+'.'})),r=fuse(w),b={originalStart:0,originalEnd:10,finalStart:r.start,finalEnd:r.end},s=compare({words:w,...b});assert.equal(s.finalEndingPunctuation,true);assert.equal(reason(s,b),'spoken-content-changed-after-proposal');
});
test('changed intervals without usable word evidence cannot claim verified silent padding',()=>{
 const b={originalStart:0,originalEnd:10,finalStart:0,finalEnd:20},s=compare({words:[],...b});assert.equal(s.status,'unavailable');assert.equal(reason(s,b),'changed-interval-speech-scope-unverified');
});
test('impossible whole-word duration remains rejectable rather than splitting a word',()=>{
 const r=Fusion.optimizeBoundaries({rawStart:0,rawEnd:10,words:[{word:'unbroken.',start:0,end:35}],segments:[],sceneCuts:[],silenceIntervals:[],faceIntervals:[],totalVideoDuration:40,targetDuration:{min:20,max:30,optimal:25},preferShotCutAlignment:true});assert.equal(r.boundaryOptimization.wordBoundarySafe,false);
});
test('live caller retains word rejection and zero/null unranked output after scope changes',()=>{
 const s=fs.readFileSync(new URL('../services/clipAnalysisService.ts',import.meta.url),'utf8');assert(s.includes('shotBoundary.boundaryOptimization.wordBoundarySafe === false'));assert(s.includes('narrativeRankingInvalidationReason(finalSpeechScope'));assert(s.includes('const engagement_score = isUnranked ? 0 : scored.vireo_score'));assert(s.includes('explanation: usedShortSourceFallback || narrativeRankingInvalidated ? null : scored.explanation'));
});
