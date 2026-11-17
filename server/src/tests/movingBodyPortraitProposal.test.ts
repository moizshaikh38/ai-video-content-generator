import test from 'node:test';
import assert from 'node:assert/strict';
import {movingBodyPortraitProposal as choose} from '../shared/movingBodyPortraitProposal.js';
import {SmartReframeService as S} from '../services/smartReframeService.js';
const rows=()=>Array.from({length:17},(_,i)=>({time:i*.25,faces:[],persons:[{x:.3+i*.02,y:.25,width:.1,height:.6,confidence:.65}]}));
test('moderate sampled body moving beyond one static portrait gets bounded full-height proposal',()=>{
 const ss=rows(),before=JSON.stringify(ss),p=choose(ss,0,4.25,1920,1080);assert(p);assert.equal(JSON.stringify(ss),before);assert.equal(p.windowH,1);assert.equal(p.keyframes.length,ss.length);assert(p.keyframes.at(-1)!.centerX>p.keyframes[0].centerX);assert.match(p.uncertainty,/between-sample/);
 for(let i=0;i<ss.length;i++){const k=p.keyframes[i],b=ss[i].persons[0];assert(k.centerX-p.windowW/2<=b.x-.01999);assert(k.centerX+p.windowW/2>=b.x+b.width+.01999);assert.equal(k.time,ss[i].time);if(i)assert(Math.abs(k.centerX-p.keyframes[i-1].centerX)/.25<=.2);}
});
test('stationary evidence is held, not chased; leading clock covers source start',()=>{const ss=rows().slice(0,5);ss.forEach((s,i)=>{s.persons[0].x=.45+(i%2)*.005;s.time+=.1});const p=choose(ss,0,1.3,1920,1080);assert(p);assert.equal(p.keyframes[0].time,0);assert.equal(new Set(p.keyframes.map(k=>k.centerX)).size,1)});
test('multi/weak/missing/invalid body, irregular clocks, uncovered boundaries, fast motion and tiny body abstain',()=>{
 const changes:Array<(s:any[])=>void>=[s=>s[3].persons.push({...s[3].persons[0]}),s=>s[4].persons=[],s=>s[4].persons[0].confidence=.39,s=>s[4].persons[0].confidence=NaN,s=>s[4].persons[0].x=-.01,s=>s[4].persons[0].height=.2,s=>s[4].persons[0].width=.4,s=>s[4].persons[0].x=.7,s=>s[4].time=s[3].time,s=>s[4].time=NaN,s=>s.forEach(x=>x.time+=.4),s=>s.splice(4,2),s=>s.reverse(),s=>s[4].persons[0].width=0];
 for(const change of changes){const ss=rows();change(ss);assert.equal(choose(ss,0,4.25,1920,1080),null);}
 assert.equal(choose(rows(),0,5,1920,1080),null);assert.equal(choose(rows(),0,4.25,720,1280),null);
});
test('independent side region between samples constrains the entire view and cannot be missed',()=>{
 const region={start:.12,end:.13,x:.02,y:.4,width:.1,height:.2,confidence:.9};assert.equal(choose(rows(),0,4.25,1920,1080,[region]),null);
 assert.equal(choose(rows(),0,4.25,1920,1080,[{...region,width:NaN}]),null);
 assert.equal(choose(rows(),0,4.25,1920,1080,[{...region,start:NaN}]),null);
});
test('competing/invalid face cannot be used as a single-body identity',()=>{for(const f of[{x:.85,y:.3,width:.1,height:.1,center_x:.9,confidence:.9},{x:.4,y:.3,width:NaN,height:.1,center_x:.42,confidence:.9}]){const ss:any[]=rows();ss[3].faces=[f];assert.equal(choose(ss,0,4.25,1920,1080),null);}});
test('planner only proposes moving body under existing explicit shot review opt-in',()=>{
 const o={rawSamples:rows(),duration:4.25,sourceWidth:1920,sourceHeight:1080,windowScope:'shot' as const,automaticFitAspect:'4:3' as const};const a=S.computeShotComposition(o),b=S.computeShotComposition({...o,bodyOnlyPortraitReview:true});assert(a[0].windowW>b[0].windowW);assert.match(b[0].uncertainty!,/Moving single-body/);assert(b[0].keyframes.length>1);assert.equal(b[0].windowH,1);
 const c=S.computeShotComposition({...o,bodyOnlyPortraitReview:true,windowScope:'clip'});assert(!c.some(s=>s.uncertainty?.includes('Moving single-body')));
});
