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
