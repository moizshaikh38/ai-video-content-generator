import test from 'node:test';import assert from 'node:assert/strict';import {SmartReframeService as S}from '../services/smartReframeService.js';
const face=(x:number)=>({track_id:'a',x:x-.05,y:.35,width:.1,height:.1,center_x:x,center_y:.4,confidence:.95});
const samples=[{time:1,faces:[face(.2)]},{time:3.1,faces:[face(.5)]},{time:3.5,faces:[face(.8)]},{time:6,faces:[face(.8)]}];
const keys=(cuts:number[],fps=30)=>S.smoothAndGenerateKeyframes({samples,dominantTrackId:'a',duration:10,sourceFps:fps,sceneCuts:cuts});
test('Antigravity sanitizer port sorts before choosing the earliest duplicate',()=>{const a=keys([5.58,5.5]),b=keys([5.5,5.58]);assert.deepEqual(a,b);assert(a.some(k=>k.time===5.5));assert(!a.some(k=>k.time===5.58))});
test('rapid genuine 24fps cuts retain both instantaneous clock boundaries',()=>{const k=keys([3,3.35],24);for(const time of [2.999,3,3.349,3.35])assert(k.some(k=>Math.abs(k.time-time)<.00001))});
test('source frame rate determines duplicate threshold; invalid rate uses 30fps',()=>{assert(keys([3,3.2],30).some(k=>k.time===3.2));assert(!keys([3,3.2],10).some(k=>k.time===3.2));for(const fps of [0,-1,NaN,Infinity])assert.deepEqual(keys([3,3.2],fps),keys([3,3.2],30))});
test('bounds, duplicates and nonfinite cuts are rejected without mutating source measurements',()=>{const before=JSON.stringify(samples),cuts=[0,.25,9.75,10,NaN,Infinity,3,3];assert.deepEqual(keys(cuts),keys([3]));assert.equal(JSON.stringify(samples),before);assert.equal(cuts.length,8)});
