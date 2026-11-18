import{test}from'node:test';import assert from'node:assert/strict';
import{applyWordEnergyFusion}from'../utils/wordEnergyFusion.js';
import{SmartReframeService as S}from'../services/smartReframeService.js';
const k=(time:number,centerX:number,centerY=.38)=>({time,centerX,centerY});
test('transcript timing cannot stretch a millisecond hard-cut pair',()=>{
 const input=[k(0,.2),k(1.999,.2),k(2,.8),k(4,.8)];
 for(const words of[[{start:1.8,end:2.2}],[{start:1,end:3}],[]])assert.deepEqual(applyWordEnergyFusion(input,words),input);
});
test('both anchors of a changing trajectory hard cut remain exact',()=>{
 const input=[k(0,.2),k(1.9,.3),k(1.999,.45),k(2,.8),k(2.1,.81),k(4,.81)];
 const output=applyWordEnergyFusion(input,[{start:1.8,end:2.2}]);
 assert.deepEqual(output.find(x=>x.time===1.999),input[2]);assert.deepEqual(output.find(x=>x.time===2),input[3]);
 for(let i=1;i<output.length;i++)assert(output[i].time>output[i-1].time);
});
test('vertical step anchors and unsorted input keep cut geometry and source time',()=>{
 const input=[k(4,.2,.7),k(2,.2,.7),k(0,.2,.2),k(1.999,.2,.2)];
 const out=applyWordEnergyFusion(input,[{start:1.8,end:2.2}]);
 assert.deepEqual(out,[input[2],input[3],input[1],input[0]]);
});
test('ordinary wide-separated jump still aligns to word boundary and input is unchanged',()=>{
 const input=[k(0,.2),k(.2,.8),k(1,.8)];const before=structuredClone(input);const out=applyWordEnergyFusion(input,[{start:0,end:.4}]);
 assert.equal(out[1].time,.4);assert.deepEqual(input,before);
});
test('real shot smoother hard-cut pair survives fusion at its source cut',()=>{
 const samples=Array.from({length:16},(_,i)=>({time:i*.25,faces:[{track_id:i<8?'left':'right',x:i<8?.15:.7,y:.2,width:.1,height:.15,center_x:i<8?.2:.75,center_y:.275,confidence:.95}]}));
 const frames=S.smoothAndGenerateKeyframes({samples,dominantTrackId:'left',duration:4,sceneCuts:[2],sourceWidth:960,sourceHeight:540});
 assert(frames.some(x=>x.time===1.999));assert(frames.some(x=>x.time===2));
 const fused=applyWordEnergyFusion(frames,[{start:1.8,end:2.2}]);
 assert.deepEqual(fused.filter(x=>x.time>=1.999&&x.time<=2),frames.filter(x=>x.time>=1.999&&x.time<=2));
});
test('single vertical cut from real smoother keeps exact source time with measured context',()=>{
 const samples=Array.from({length:16},(_,i)=>({time:i*.25,faces:[{track_id:'same-x',x:.45,y:i<8?.1:.6,width:.1,height:.1,center_x:.5,center_y:i<8?.15:.65,confidence:.95}]}));
 const frames=S.smoothAndGenerateKeyframes({samples,dominantTrackId:'same-x',duration:4,sceneCuts:[2],sourceWidth:960,sourceHeight:540});
 assert(frames.some(x=>x.time===2));assert(frames.some(x=>x.time===1.999));
 const words=[{start:1.8,end:2.2}];
 const output=applyWordEnergyFusion(frames,words,{sourceCutTimes:[2]});
 assert.deepEqual(output.find(x=>x.time===2),frames.find(x=>x.time===2));
});
test('single small-horizontal source cut is protected without synthesizing a pair',()=>{
 const frames=[k(0,.2),k(1,.2),k(2,.25,.6),k(4,.25,.6)];const words=[{start:1.8,end:2.2}];
 assert(!applyWordEnergyFusion(frames,words).some(x=>x.time===2));
 assert.deepEqual(applyWordEnergyFusion(frames,words,{sourceCutTimes:[2]}),frames);
});
test('only existing millisecond-rounded measured cuts protected, malformed and nearby times do not invent anchors',()=>{
 const input=[k(0,.2),k(2.123,.8),k(4,.8)];const words=[{start:2,end:2.3}];
 assert.deepEqual(applyWordEnergyFusion(input,words,{sourceCutTimes:[2.12345]}),input);
 const baseline=applyWordEnergyFusion(input,words);
 for(const sourceCutTimes of[[NaN,Infinity,-1,0],[2.124],[1,3]])assert.deepEqual(applyWordEnergyFusion(input,words,{sourceCutTimes}),baseline);
 assert.equal(baseline[1].time,2);
});
