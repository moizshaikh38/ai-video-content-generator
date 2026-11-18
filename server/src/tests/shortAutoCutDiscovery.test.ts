import{test}from'node:test';import assert from'node:assert/strict';import{shortAutoCutDiscovery as enabled}from'../shared/shortAutoCutDiscovery.js';
const clip={aspect_ratio:'9:16',crop_config:{mode:'smart',layout_mode_source:'auto'}};
test('new bounded explicit smartAuto analyses request cut evidence',()=>{for(const d of[.1,12,24,30])assert.equal(enabled(clip,d),true)});
test('manual, unknown, genre, nonportrait and fixed-mode ownership do not opt in',()=>{for(const source of['user','genre_recommendation',undefined])assert.equal(enabled({...clip,crop_config:{...clip.crop_config,layout_mode_source:source}},12),false);for(const mode of['manual','fit','fit_blur',undefined])assert.equal(enabled({...clip,crop_config:{...clip.crop_config,mode}},12),false);for(const aspect_ratio of['16:9','1:1',undefined])assert.equal(enabled({...clip,aspect_ratio},12),false)});
test('invalid/unbounded durations never request work',()=>{for(const d of[0,-1,NaN,Infinity,30.001,180])assert.equal(enabled(clip,d),false)});

test('only frame-evidenced boundaries keep brief edge scenes, coarse behavior stays',async()=>{
 const{mergeDetectedSceneCuts:merge}=await import('../shared/shortAutoCutDiscovery.js');const evidence=(time:number)=>({time,method:'dense-luma-discontinuity',refined:true,uncertainty_seconds:1/30});
 assert.deepEqual(merge([],[.133333,11.945267],12,[evidence(.133333),evidence(11.945267)]),[.133333,11.945267]);
 for(const e of[[],[{...evidence(.133333),refined:false}],[{...evidence(.133333),method:'coarse'}],[{...evidence(.133333),uncertainty_seconds:NaN}],[{...evidence(.133333),uncertainty_seconds:.2}]])assert.deepEqual(merge([],[.133333],12,e),[]);
 assert.deepEqual(merge([],[.02,11.99],12,[evidence(.02),evidence(11.99)]),[]);
 assert.deepEqual(merge([3],[3.04,6,NaN,Infinity],12,[evidence(3.04),evidence(6)]),[3,6]);
});
