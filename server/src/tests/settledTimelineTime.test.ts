import {test} from 'node:test';import assert from 'node:assert/strict';
import {settledTimelineTime as settle,timelineToSourceTime as fwd} from '../../../src/lib/editorPlaybackTime.js';
const rip=[{timeline_start:0,timeline_end:1.1,source_start:10.99,source_end:12.09},{timeline_start:1.1,timeline_end:23.97,source_start:13.12,source_end:35.99}];
test('no slices: video time minus offset, rounded to ms, clamped to [0,duration]',()=>{
 assert.equal(settle([],28.8603,4.4,24.24,39.658,false),4.62);
 assert.equal(settle([],63.9,39,24.24,39.658,false),39.658,'clamped to duration');
 assert.equal(settle([],20,0,24.24,39.658,false),0,'before offset clamps to 0');});
test('mid-seek or unusable inputs return null so the caller keeps the playhead',()=>{
 assert.equal(settle([],28.8,4.4,24.24,39.658,true),null);assert.equal(settle([],NaN,4.4,24.24,39.658,false),null);
 assert.equal(settle([],28.8,4.4,24.24,0,false),null);assert.equal(settle([],28.8,4.4,24.24,NaN,false),null);});
test('ripple slices: round-trip through the forward map',()=>{const t=5.25;assert.ok(Math.abs((settle(rip,fwd(rip,t),t,0,23.97,false) as number)-t)<1e-3);});
test('duplicated or reordered source and speed: the hint selects the occurrence and speed is honored',()=>{
 const rep=[...rip,{timeline_start:23.97,timeline_end:25.97,source_start:10.99,source_end:14.99,speed:{speed:2}}];
 assert.equal(settle(rep,12.99,24,0,25.97,false),24.97,'second occurrence chosen by hint');
 assert.equal(settle(rep,12.25,0.97,0,25.97,false),1.1,'removed gap maps to the next slice start');
 const reordered=[{timeline_start:0,timeline_end:2,source_start:20,source_end:22},{timeline_start:2,timeline_end:4,source_start:10,source_end:12}];
 assert.equal(settle(reordered,10.5,3,0,4,false),2.5);assert.equal(settle(reordered,20.5,0.4,0,4,false),0.5);});
