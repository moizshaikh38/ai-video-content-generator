import {test} from 'node:test';import assert from 'node:assert/strict';
import {timelineToSourceTime as forward,sourceToTimelineTime as inverse} from '../../../src/lib/editorPlaybackTime.js';
const slices=[{timeline_start:0,timeline_end:1.1,source_start:10.99,source_end:12.09},{timeline_start:1.1,timeline_end:23.97,source_start:13.12,source_end:35.99}];
test('ripple boundaries are right-open and removed pauses do not feed forward into playhead',()=>{
 assert.equal(forward(slices,1.1),13.12);assert.equal(inverse(slices,12.25,.97),1.1);
 assert.ok(Math.abs(inverse(slices,13.32,1.1)-1.3)<1e-9);
 let t=1.1;for(let i=0;i<20;i++)t=inverse(slices,forward(slices,t),t);assert.equal(t,1.1);
});
test('inverse selects timeline occurrence for duplicated/reordered source and honors speed',()=>{
 const repeated=[...slices,{timeline_start:23.97,timeline_end:25.97,source_start:10.99,source_end:14.99,speed:{speed:2}}];
 assert.equal(forward(repeated,24.97),12.99);assert.equal(inverse(repeated,12.99,24),24.97);
});
