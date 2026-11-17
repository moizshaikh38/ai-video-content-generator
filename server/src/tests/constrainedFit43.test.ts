import{test}from'node:test';import assert from'node:assert/strict';import{constrainedFit43 as fit}from'../shared/constrainedFit43.js';
const box=(x:number,w:number)=>({x,y:.1,width:w,height:.8,confidence:.9});
const person=(x:number,w:number)=>({time:0,faces:[],persons:[box(x,w)]});
test('recenter full-height4:3 to include side text and every observed body',()=>{const samples=[person(.4,.28)],regions=[box(.015,.2)];const r=fit(samples,regions,854,480,.5);assert.ok(r);assert.equal(r.windowH,1);assert.ok(Math.abs(r.windowW*854/480-4/3)<1e-9);for(const b of[...regions,...samples[0].persons]){assert.ok(b.x>=r.centerX-r.windowW/2);assert.ok(b.x+b.width<=r.centerX+r.windowW/2)}assert.ok(r.centerX<.5)});
test('truly incompatible side people remain a conflict, not silently dropped',()=>{assert.equal(fit([person(.8,.2)],[box(0,.1)],854,480),null)});
test('no evidence, invalid evidence and nonwide source abstain',()=>{assert.equal(fit([],[],854,480),null);assert.equal(fit([],[{...box(.2,.2),x:NaN}],854,480),null);assert.equal(fit([],[box(.2,.2)],480,854),null)});
test('all sampled bodies including peripheral ones constrain the view',()=>{assert.equal(fit([{time:0,faces:[],persons:[box(.2,.2),box(.9,.1)]}],[box(0,.1)],854,480),null)});
