import {assessTranscriptQuality,assertTranscriptUsable} from '../services/transcription/transcriptQuality.js';
import test from 'node:test';import assert from 'node:assert/strict';
import {CaptionService} from '../services/captionService.js';
import {normalizeProviderTiming} from '../services/transcription/providerTiming.js';
import {reliableOrderedClocks} from '../shared/orderedTranscriptTiming.js';
const segments=[{start:0,end:2,text:'Alpha beta.'},{start:2,end:4,text:'Gamma delta.'}];
const words=[{start:0,end:1,word:'Alpha'},{start:1,end:2.8,word:'beta.'},{start:1.8,end:3,word:'Gamma'},{start:3,end:4,word:'delta.'}];
test('overlapping cross-utterance clocks use genuine segment text without invented word timing',()=>{
 const t={segments,words};const before=JSON.stringify(t);const out=CaptionService.extractClipCues(t,0,4);
 assert.equal(out.timingMode,'segment');assert.deepEqual(out.cues.map(c=>c.text),segments.map(s=>s.text));assert(out.cues.every(c=>!c.words?.length));assert.equal(JSON.stringify(t),before);
});
test('backward word clocks never become reordered spoken phrases',()=>{
 const out=CaptionService.extractClipCues({segments,words:[words[0],words[2],words[1],words[3]]},0,4);
 assert.equal(out.timingMode,'segment');assert.deepEqual(out.cues.map(c=>c.text),['Alpha beta.','Gamma delta.']);
});
test('ordered word clocks retain word mode; tiny overlap tolerance does not reorder',()=>{
 const ordered=[{start:0,end:1,word:'Alpha'},{start:.98,end:2,word:'beta.'}];
 assert.equal(CaptionService.extractClipCues({segments,words:ordered},0,4).timingMode,'word');
});
test('unreliable words without a valid ordered segment fallback require review',()=>{
 for(const fallback of [[],[{start:2,end:1,text:'Bad'}],[segments[1],segments[0]]])assert.throws(()=>CaptionService.extractClipCues({segments:fallback,words},0,4),{code:'CAPTION_TIMING_REVIEW_REQUIRED'});
});
test('provider normalization records order issue without modifying actual words',()=>{
 const result=normalizeProviderTiming({segments,words});assert.deepEqual(result.words,words.map(w=>({...w})));assert(result.timingIssues.some(i=>i.reason==='unordered-or-overlapping-provider-clock'));
});
test('invalid nonfinite/missing clocks cannot pass the word gate',()=>{
 for(const items of [[{start:0,end:Infinity}],[{start:'0',end:1}],[{start:0,end:0}]])assert.equal(reliableOrderedClocks(items),false);
});

test('only ordered segment fallback clears the narrow caption quality guard; other flags remain blocked',()=>{
 const n:any={...normalizeProviderTiming({words,segments}),text:'Alpha beta. Gamma delta.',language:'en'};
 const quality_assessment=assessTranscriptQuality(n);assert.equal(quality_assessment.status,'needs_review');
 assert.throws(()=>assertTranscriptUsable({quality_assessment,segments}),{code:'TRANSCRIPT_REVIEW_REQUIRED'});
 assert.doesNotThrow(()=>assertTranscriptUsable({quality_assessment,segments},{allowOrderedSegmentFallback:true}));
 assert.throws(()=>assertTranscriptUsable({quality_assessment,segments:[]},{allowOrderedSegmentFallback:true}),{code:'TRANSCRIPT_REVIEW_REQUIRED'});
 const bad:any={...quality_assessment,issues:[...quality_assessment.issues,{code:'language_mismatch'}]};
 assert.throws(()=>assertTranscriptUsable({quality_assessment:bad,segments},{allowOrderedSegmentFallback:true}),{code:'TRANSCRIPT_REVIEW_REQUIRED'});
});
