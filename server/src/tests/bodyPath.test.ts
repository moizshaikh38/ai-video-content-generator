import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {anchoredSingleBodyPath} from '../shared/bodyContext.js';
import {SmartReframeService as S} from '../services/smartReframeService.js';
const e=JSON.parse(fs.readFileSync(new URL('./fixtures/walking-sands-detections.json',import.meta.url),'utf8'));
const get=(samples=e.samples)=>anchoredSingleBodyPath(samples,'subject_2',854,480);
const at=(p:NonNullable<ReturnType<typeof get>>,t:number)=>{let i=0;while(i+1<p.keyframes.length&&p.keyframes[i+1].time<=t)i++;const a=p.keyframes[i],b=p.keyframes[Math.min(i+1,p.keyframes.length-1)],f=b.time>a.time?Math.max(0,Math.min(1,(t-a.time)/(b.time-a.time))):0;return {x:a.centerX+(b.centerX-a.centerX)*f,y:a.centerY+(b.centerY-a.centerY)*f};};
test('real walking path bridges fragmented face anchors while retaining one fixed-size view',()=>{
 const p=get()!;assert.ok(p);assert.ok(p.keyframes.length>1&&p.keyframes.length<=32);
 assert.ok(p.windowW<.3);assert.ok(p.windowH>.8);
 assert.ok(p.windowW*854/(p.windowH*480)>=9/16-1e-9,'foreground cannot overflow vertical canvas');
 for(const s of e.samples){const c=at(p,s.time);for(const b of s.persons){assert.ok(c.x-p.windowW/2<=b.x);assert.ok(c.x+p.windowW/2>=b.x+b.width);assert.ok(c.y-p.windowH/2<=b.y);assert.ok(c.y+p.windowH/2>=b.y+b.height);}}
 const plan=S.computeShotComposition({rawSamples:e.samples,duration:12,sourceWidth:854,sourceHeight:480});
 assert.equal(plan[0].kind,'solo');assert.deepEqual(plan[0].keyframes,p.keyframes);
});
test('path needs reliable face association, continuous single body and plausible movement',()=>{
 assert.equal(get(e.samples.map((s:any)=>({...s,faces:[]}))),null);
 assert.equal(get(e.samples.map((s:any,i:number)=>({...s,persons:i===4?[]:s.persons}))),null);
 assert.equal(get(e.samples.map((s:any,i:number)=>({...s,persons:i===4?[...s.persons,{...s.persons[0],x:0}]:s.persons}))),null);
 assert.equal(get(e.samples.filter((s:any)=>s.time<1||s.time>3)),null);
 assert.equal(get(e.samples.map((s:any,i:number)=>({...s,persons:i===4?[{...s.persons[0],x:.8}]:s.persons}))),null);
});
test('stationary complete body path stays locked, without manufactured camera motion',()=>{
 const face={track_id:'subject_2',x:.44,y:.2,width:.06,height:.1,center_x:.47,center_y:.25,confidence:.95};
 const p=get(Array.from({length:8},(_,i)=>({time:i*.25,faces:[face],persons:[{x:.35,y:.17,width:.25,height:.7,confidence:.9}]})))!;
 assert.ok(p);assert.equal(p.keyframes.length,1);
});
test('shot-wide fixed dimensions survive a later unresolved shot',()=>{
 const samples=[...e.samples,...e.samples.slice(0,8).map((s:any)=>({...s,time:s.time+12,faces:[],persons:[]}))];
 const p=S.computeShotComposition({rawSamples:samples,sceneCuts:[12],duration:14,sourceWidth:854,sourceHeight:480});
 assert.ok(p.every(s=>s.windowW===1&&s.windowH===1));
});
