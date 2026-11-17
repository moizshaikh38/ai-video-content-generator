import{test}from'node:test';import assert from'node:assert/strict';import{pairFocusPresentation as choose}from'../shared/pairFocusPresentation.js';
const samples=()=>Array.from({length:5},(_,i)=>({time:i*.2,faces:[.3,.65].map((x,j)=>({x,y:.2,width:.05,height:.1,center_x:x+.025,center_y:.25,confidence:.95,track_id:String(j)}))}));
test('two stable bounded views propose focus, not scene semantics',()=>{const p=choose(samples(),0,1,1920,1080);assert.ok(p);assert.equal(p.panels.layout,'split2');assert.equal(p.panels.slots.length,2);for(const v of p.panels.slots){assert.ok(v.sourceRect);assert.ok(v.set)}});
test('missing/competing face, identity swap, tight pair and cut gap abstain',()=>{for(const alter of[(s:any[])=>s[1].faces.pop(),(s:any[])=>s[1].faces.push(s[1].faces[0]),(s:any[])=>s[1].faces[0].track_id='other',(s:any[])=>s.forEach(q=>q.faces[1].x=.36),(s:any[])=>s.splice(0,2)]){const s=samples();alter(s);assert.equal(choose(s,0,1,1920,1080),null)}});

test('invalid numeric evidence and repeated times abstain',()=>{for(const change of[(s:any[])=>s[1].time=NaN,(s:any[])=>s[1].time=s[0].time,(s:any[])=>s[0].faces[0].center_x=NaN]){const s=samples();change(s);assert.equal(choose(s,0,1,1920,1080),null)}});

test('out-of-shot samples and inconsistent face centers are not framing evidence',()=>{
 for(const change of[(s:any[])=>s[0].time=-.1,(s:any[])=>s[4].time=1,(s:any[])=>s[1].faces[0].confidence=1.2,(s:any[])=>s[1].faces[0].center_x=.1,(s:any[])=>s[1].faces[0].center_y=.8]){const s=samples();change(s);assert.equal(choose(s,0,1,1920,1080),null);}
});

test('structured assessment distinguishes abstention without claiming semantic safety',async()=>{
 const {assessPairFocus}=await import('../shared/pairFocusPresentation.js');
 const good=assessPairFocus(samples(),0,1,1920,1080);assert.equal(good.status,'proposal-requires-review');assert.equal(good.reason,'proposal-only');assert.equal(good.pairedSamples,5);assert.ok(good.unknowns.includes('disconnected hands and body action'));assert.deepEqual(good.proposal,choose(samples(),0,1,1920,1080));
 const missing=samples();missing[2].faces=[];const gap=assessPairFocus(missing,0,1,1920,1080);assert.equal(gap.reason,'not-exactly-two-faces');assert.equal(gap.pairedSamples,4);assert.equal(gap.status,'abstained');assert.equal(gap.proposal,null);
 const changed=samples();changed[2].faces[0].track_id='new';assert.equal(assessPairFocus(changed,0,1,1920,1080).reason,'inconsistent-track-evidence');
});
