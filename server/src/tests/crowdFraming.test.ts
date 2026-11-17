process.env.SMART_REFRAME_CONTENT_AWARE='1';
import {test} from 'node:test';import assert from 'node:assert/strict';import {SmartReframeService as S} from '../services/smartReframeService.js';
const face=(id:string,x:number,w=.02,h=.03)=>({track_id:id,x:x-w/2,y:.4,width:w,height:h,center_x:x,center_y:.4+h/2,confidence:.95});
const samples=(faces:any[])=>Array.from({length:20},(_,i)=>({time:i*.25,faces:faces.map(f=>({...f}))}));
test('walking/crowd geometry is not a two-person conversation or facecam',()=>{
 const a=samples(Array.from({length:11},(_,i)=>face('crowd'+i,.04+i*.09)));
 assert.equal(S.isCrowdScene(a),true);assert.equal(S.determineOptimalLayoutMode(a).layoutMode,'blur');assert.equal(S.findStaticFacecamTrack(a),null);
 const p=S.computeShotComposition({rawSamples:a,duration:5,sourceWidth:1920,sourceHeight:1080});assert.equal(p[0].kind,'fit');assert.equal(p[0].windowW,.75);assert.equal(p[0].contextStatus,'unresolved-review-required');assert.equal(p[0].split,undefined);
});
test('two persistent interview faces still split, explicit user choice preserved',()=>{
 const a=samples([face('left',.25,.12,.18),face('right',.75,.12,.18)]);assert.equal(S.determineOptimalLayoutMode(a).layoutMode,'split');assert.equal(S.findStaticFacecamTrack(a),null);
 const crowd=samples(Array.from({length:5},(_,i)=>face('c'+i,.1+i*.2)));assert.equal(S.determineOptimalLayoutMode(crowd,{preferredMode:'track'}).layoutMode,'track');
});
test('tiny static distant face rejected, supported small facecam retained as suggestion',()=>{
 assert.equal(S.findStaticFacecamTrack(samples([face('distant',.88,.012,.026)])),null);
 assert.ok(S.findStaticFacecamTrack(samples([face('cam',.88,.055,.10)])));
});

test('content-aware gate off retains default selection for existing cached behavior',()=>{
 delete process.env.SMART_REFRAME_CONTENT_AWARE;
 const crowd=samples(Array.from({length:5},(_,i)=>face('c'+i,.1+i*.2)));assert.equal(S.determineOptimalLayoutMode(crowd).layoutMode,'split');
 process.env.SMART_REFRAME_CONTENT_AWARE='1';
});
