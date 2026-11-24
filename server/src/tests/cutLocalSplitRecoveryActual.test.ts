import{test}from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import{SmartReframeService as S}from'../services/smartReframeService.js';
const fixture=(name:string)=>JSON.parse(fs.readFileSync(new URL('./fixtures/'+name,import.meta.url),'utf8'));
const config={mode:'smart',layout_mode_source:'auto'};
test('actual source-bound mixed CV recovers only one existing cut-local pair without changing other baseline windows',()=>{
 const t=fixture('mixed-yunet-nanodet-cut-local.json'),before=JSON.stringify(t),baseline=S.explicitAutoLayoutPlan({...t,metadata:{...t.metadata,person_detector:null}},config,35.729,'9:16')!,p=S.explicitAutoLayoutPlan(t,config,35.729,'9:16')!;
 assert.equal(p.length,8);assert.deepEqual(p.filter(s=>s.split).map(s=>[s.start,s.end]),[[2.631,6.231]]);p.forEach((s,i)=>{if(!s.split)assert.deepEqual(s,baseline[i])});assert.equal(p[1].contextStatus,'unresolved-review-required');assert.equal(JSON.stringify(t),before);
 for(const patch of[{sourceObjectVerified:false},{isStale:true},{metadata:{...t.metadata,person_detector:null}},{metadata:{...t.metadata,content_framing_decision:{policy:'action_context'}}},{metadata:{...t.metadata,content_framing_decision:{evidence:{possibleEmbeddedCamera:true}}}}])assert(!S.explicitAutoLayoutPlan({...t,...patch},config,35.729,'9:16')?.some(s=>s.split));
 assert(!S.explicitAutoLayoutPlan(t,{...config,layoutPolicy:{defaultLayout:'auto',allowed:['fit']}},35.729,'9:16')?.some(s=>s.split));assert(!S.explicitAutoLayoutPlan(t,{...config,layout_mode_source:'user'},35.729,'9:16')?.some(s=>s.split));
});
test('actual photoreal-game DEV geometry is not a qualified shot split despite person/face detections',()=>{const options=fixture('photoreal-game-yunet-nanodet.json');assert(options.rawSamples.some((s:any)=>s.faces.length>=2&&s.persons.length>=2));assert(S.computeShotComposition(options).every(s=>!s.split));});

test('declared synthetic cut-boundary stress exercises existing photoreal geometry without calling it natural-cut evidence',()=>{const options=fixture('photoreal-game-yunet-nanodet.json');for(const sceneCuts of[[10],[4,8,12,16]]){const plan=S.computeShotComposition({...options,sceneCuts});assert.equal(plan.length,sceneCuts.length+1);assert(plan.every(s=>!s.split));}});
