import test from'node:test';import assert from'node:assert/strict';import{hookTranscriptScope as scope,exactHookEvidence as evidence}from'../shared/hookGenerationScope.js';
const clip={start_seconds:10,end_seconds:24,trim_start_offset:3,trim_end_offset:3};
const tx={duration_seconds:30,segments:[{start:11,end:11.5,text:'money'},{start:15,end:15.5,text:'never'},{start:19,end:19.5,text:'million'},{start:22,end:22.5,text:'profit'}]};
test('removed words cannot enter candidate input',()=>{const s=scope(clip,tx);assert.equal(s.speech,'never million');assert.equal(s.start,13);assert.deepEqual(evidence(s,s.segments[0],'Exact source support'),{start_seconds:2,end_seconds:2.5,text:'never',segment_id:'source-segment-1',reason:'Exact source support'});});
test('whole overlapping segment not copied into scopedtext',()=>assert.throws(()=>scope(clip,{duration_seconds:30,segments:[{start:11,end:23.5,text:'OUTSIDE INSIDE OUTSIDE'}]})));
test('exact timed words can scope an overlappingsegment',()=>{const s=scope(clip,{duration_seconds:30,segments:[{start:11,end:23.5,text:'OUTSIDE INSIDE OUTSIDE'}],words:[{start:11,end:12,word:'OUTSIDE'},{start:14,end:15,word:'INSIDE'},{start:22,end:23,word:'OUTSIDE'}]});assert.equal(s.speech,'INSIDE');assert.equal(s.segments[0].start,14);});
test('partial word cannot be claimed complete',()=>assert.throws(()=>scope(clip,{duration_seconds:30,segments:[{start:11,end:22,text:'WORD'}],words:[{start:12.9,end:13.1,word:'WORD'}]})));
test('negative endextension retained, not silently clamped',()=>{const s=scope({...clip,trim_end_offset:-1},tx);assert.equal(s.end,25);assert.equal(s.speech,'never million profit');});
test('no evidence from another source',()=>{const s=scope(clip,tx);assert.throws(()=>evidence(s,{...s.segments[0]},'bad'));});

test('unknown partial boundary cannot silently drop while claiming complete input',()=>assert.throws(()=>scope(clip,{duration_seconds:30,segments:[{start:11,end:15,text:'UNKNOWN outside and inside'},{start:16,end:17,text:'KNOWN inside'}]}),/incomplete transcript coverage|not fully covered/));
test('overlapping transcript segments need review, not duplicatewords',()=>assert.throws(()=>scope(clip,{duration_seconds:30,segments:[{start:14,end:16,text:'first'},{start:15,end:17,text:'second'}]}),/overlapping-segment-evidence/));
test('mismatched timed word text cannot narrow a broad segment',()=>assert.throws(()=>scope(clip,{duration_seconds:30,segments:[{start:11,end:22,text:'outside actual text'}],words:[{start:11,end:12,word:'outside'},{start:14,end:15,word:'INVENTED'},{start:21,end:22,word:'text'}]}),/incomplete transcript coverage|not fully covered/));

test('end extension cannot exceed verified transcript duration',()=>assert.throws(()=>scope({...clip,trim_end_offset:-10},tx)));
test('unknown duration is not source coverage',()=>assert.throws(()=>scope(clip,{...tx,duration_seconds:null})));

test('orphan timed words cannot silently disappear',()=>assert.throws(()=>scope(clip,{duration_seconds:30,segments:[{start:14,end:15,text:'known'}],words:[{start:14,end:15,word:'known'},{start:18,end:19,word:'orphan'}]})));
