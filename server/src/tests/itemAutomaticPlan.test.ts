import test from 'node:test';import assert from 'node:assert/strict';import{resolveItemAutomaticPlan as resolve,acceptItemAutomaticPlan as accept,sameAutomaticPlanIdentity as same,validAutomaticPlanIdentity as valid,type ItemAutomaticPlanInput,type AutomaticShotPlan}from '../shared/itemAutomaticPlan.js';
const fixture=():ItemAutomaticPlanInput=>({item:{id:'item-a',source_start:12,source_end:18,source_asset_id:'asset-a'},identity:{schemaVersion:1,itemId:'item-a',sourceAssetId:'asset-a',sourceVersion:'source-sha-a',analysisVersion:1,sourceStart:12,sourceEnd:18,analysisSourceStart:10,analysisSourceEnd:20,sourceWidth:1920,sourceHeight:1080,outputAspect:'9:16',configurationFingerprint:'exact-options-a'},analysisFresh:true,options:{sourceWidth:1920,sourceHeight:1080,duration:10,rawSamples:[]}});
const plan=():AutomaticShotPlan=>[{start:0,end:10,kind:'fit',windowW:.75,windowH:1,keyframes:[{time:0,centerX:.5,centerY:.5}]}];
test('same valid effective item resolution can be consumed by identical identity',()=>{const f=fixture(),p=plan();assert.deepEqual(accept(resolve(f,()=>p),f.identity),p)});
test('result for item A cannot be consumed by item B',()=>{const f=fixture(),r=resolve(f,plan);assert.equal(accept(r,{...f.identity,itemId:'item-b'}),null)});
test('all load-bearing identity fields invalidate mismatched consumption',()=>{const f=fixture(),r=resolve(f,plan);for(const key of['sourceAssetId','sourceVersion','configurationFingerprint','outputAspect']as const)assert.equal(accept(r,{...f.identity,[key]:'different'}),null);for(const key of['analysisVersion','sourceStart','sourceEnd','analysisSourceStart','analysisSourceEnd','sourceWidth','sourceHeight']as const)assert.equal(accept(r,{...f.identity,[key]:f.identity[key]+.5}),null)});
test('manual crop panel accepted window tracker and user layout bypass computation',()=>{for(const patch of[{crop:{}},{panels:{}},{framing_window:{}},{tracker:{enabled:true}},{crop_config:{layout_mode_source:'user'}}]){const f=fixture();Object.assign(f.item,patch);let calls=0;const r=resolve(f,()=>{calls++;return plan()});assert.equal(r.status,'bypassed');assert.equal(calls,0)}});
test('stale unknown analysis cannot compute a plan',()=>{const f=fixture();f.analysisFresh=false;let calls=0;assert.equal(resolve(f,()=>{calls++;return plan()}).status,'unavailable');assert.equal(calls,0)});
test('effective range and asset must match source context',()=>{for(const patch of[{source_start:11},{source_end:19},{id:'item-b'},{source_asset_id:'asset-b'}]){const f=fixture();Object.assign(f.item,patch);assert.equal(resolve(f,plan).status,'unavailable')}});
test('range outside analysis and missing source version cannot be treated as valid identity',()=>{const f=fixture();assert.equal(valid({...f.identity,sourceStart:9}),false);assert.equal(valid({...f.identity,sourceEnd:21}),false);assert.equal(valid({...f.identity,sourceVersion:''}),false)});
test('computed malformed geometry rejected',()=>{for(const p of[[],[{...plan()[0],windowW:2}],[{...plan()[0],keyframes:[{time:0,centerX:0,centerY:.5}]}],[{...plan()[0],end:11}]])assert.equal(resolve(fixture(),()=>p).status,'unavailable')});
test('layout output aspect gate separate from analysis dimensions',()=>{const f=fixture();f.identity.outputAspect='1:1';assert.equal(resolve(f,plan).status,'bypassed');const g=fixture();g.options.sourceWidth=1280;assert.equal(resolve(g,plan).status,'unavailable')});
test('no freeze speed or unrelated project version enters identity contract',()=>{const f=fixture();assert.equal(same(f.identity,structuredClone(f.identity)),true);assert.equal('freeze_source_time'in f.identity,false);assert.equal('speed'in f.identity,false);assert.equal('projectVersion'in f.identity,false)});
test('resolver and consumer clone protects the saved decision from caller mutation',()=>{const f=fixture(),p=plan(),r=resolve(f,()=>p);p[0].windowW=1;assert.equal(accept(r,f.identity)![0].windowW,.75);const a=accept(r,f.identity)!;a[0].keyframes[0].centerX=.4;assert.equal(accept(r,f.identity)![0].keyframes[0].centerX,.5)});

test('leading, internal and trailing uncovered source intervals cannot be accepted as a full plan',()=>{
 for(const shots of[
  [{...plan()[0],start:1,keyframes:[{time:1,centerX:.5,centerY:.5}]}],
  [{...plan()[0],end:9}],
  [{...plan()[0],end:4},{...plan()[0],start:5,keyframes:[{time:5,centerX:.5,centerY:.5}]}],
 ])assert.equal(resolve(fixture(),()=>shots).status,'unavailable');
 const contiguous=[{...plan()[0],end:4},{...plan()[0],start:4,keyframes:[{time:4,centerX:.5,centerY:.5}]}];
 assert.equal(resolve(fixture(),()=>contiguous).status,'ready');
});
