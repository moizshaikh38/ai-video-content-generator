import{test}from'node:test';import assert from'node:assert/strict';import{bodyOnlyPortraitProposal as choose}from'../shared/bodyOnlyPortraitProposal.js';
const ss=()=>Array.from({length:5},(_,i)=>({time:i*.25,faces:[],persons:[{x:.4,y:.05,width:.2,height:.9,confidence:.6}]}));
test('persistent tall narrow body may propose fullheight without visible face',()=>{const p=choose(ss(),0,1.25,1920,1080);assert.ok(p);assert.equal(p.windowH,1);assert.equal(p.contextStatus,'unresolved-review-required')});
test('rejects widebody,multiplepeople,sparse,late or unstable evidence',()=>{for(const change of[(s:any[])=>s[0].persons[0].width=.5,(s:any[])=>s[1].persons.push(s[1].persons[0]),(s:any[])=>s.forEach((v,i)=>{if(i<3)v.persons=[]}),(s:any[])=>s.slice(0,2).forEach(v=>v.persons.splice(0)),(s:any[])=>s[1].persons[0].x=.1]){const s=ss();change(s);assert.equal(choose(s,0,1.25,1920,1080),null)}});

test('sample clock and independent side-context constraints remain binding',()=>{const s=ss();s[1].time=s[0].time;assert.equal(choose(s,0,1.25,1920,1080),null);assert.equal(choose(ss(),0,1.25,1920,1080,[{start:0,end:2,x:0,y:0,width:.2,height:.2,confidence:.9}]),null)});
