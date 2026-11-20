import fs from'node:fs';
import test from 'node:test';import assert from 'node:assert/strict';import {compareFinalSpeechScope as compare,narrativeRankingInvalidationReason as reason}from'../shared/finalSpeechScope.js';
const bounds={originalStart:10,originalEnd:40,finalStart:10,finalEnd:40};
test('unchanged segment-only proposal keeps existing ranking, not a speech-verification claim',()=>{const s=compare({words:[],...bounds});assert.equal(s.status,'unavailable');assert.equal(reason(s,bounds),undefined);});
test('changed no-word interval cannot retain provider ranking as if speech were unchanged',()=>{for(const b of[{...bounds,finalStart:0},{...bounds,finalEnd:45},{...bounds,finalStart:11},{...bounds,finalEnd:39}]){const s=compare({words:[],...b});assert.equal(reason(s,b),'changed-interval-speech-scope-unverified');}});
test('millisecond float noise does not invalidate an identical persisted interval',()=>{const b={...bounds,finalStart:10.0000001,finalEnd:39.9999999};assert.equal(reason(compare({words:[],...b}),b),undefined);});
test('complete word evidence can verify that only silent padding changed',()=>{const b={...bounds,finalStart:9,finalEnd:41},s=compare({words:[{word:'Complete.',start:12,end:39}],...b});assert.equal(s.status,'unchanged');assert.equal(reason(s,b),undefined);});
test('a new question word invalidates ranking without deleting useful question footage',()=>{const b={...bounds,finalStart:0},s=compare({words:[{word:'Why?',start:1,end:3},{word:'Because.',start:12,end:39}],...b});assert.equal(s.status,'changed');assert.equal(reason(s,b),'spoken-content-changed-after-proposal');assert.equal(s.finalWordCount,2);});
test('a changed interval missing nearby valid words stays unknown, not verified silence',()=>{const b={...bounds,finalStart:0},s=compare({words:[{word:'elsewhere',start:90,end:91}],...b});assert.equal(s.status,'unavailable');assert.equal(reason(s,b),'changed-interval-speech-scope-unverified');});
test('nonfinite unavailable bounds cannot preserve old scores',()=>{assert.equal(reason(compare({words:[],...bounds}),{...bounds,finalStart:NaN}),'changed-interval-speech-scope-unverified');});
test('word-verified potentially dependent opening is review-only even with unchanged complete words',()=>{
 for(const tokens of [['Because','I','was','there.'],["That's",'why','it','worked.'],['That','is','why','it','worked.']]){const words=tokens.map((word,i)=>({word,start:10+i,end:10.5+i})),s=compare({words,...bounds});assert.equal(s.status,'unchanged');assert.equal(s.finalOpeningReviewReason,'potential-dependent-opening');assert.equal(reason(s,bounds),'dependent-opening-needs-review')}
 for(const tokens of [['Why?','Because','it','worked.'],['Becauseway','is','a','name.'],['I','love','this','game.']]){const s=compare({words:tokens.map((word,i)=>({word,start:10+i,end:10.5+i})),...bounds});assert.equal(s.finalOpeningReviewReason,undefined);assert.equal(reason(s,bounds),undefined)}
});
test('live selection may include actual adjacent question for dependent answer outside interview genre, never grants a new score',()=>{
 const source=fs.readFileSync(new URL('../services/clipAnalysisService.ts',import.meta.url),'utf8');assert(source.includes('(isQaCriticalGenre(genreProfile.genre) || potentialDependentOpening(candidateText)) && precedingSeg'));assert(source.includes('narrativeRankingInvalidationReason(finalSpeechScope'));
});
