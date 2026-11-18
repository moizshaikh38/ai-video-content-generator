import{test}from'node:test';import assert from'node:assert/strict';import{needsAutomaticFitFallback as fallback}from'../shared/automaticPreviewFallback.js';
test('only explicit Auto without any usable camera channel invents review Fit',()=>{assert.equal(fallback(true,undefined,undefined,undefined),true);assert.equal(fallback(true,[],[],[]),true);assert.equal(fallback(false,[],[],[]),false)});
test('a legacy track must remain visible rather than being hidden by preview-only Fit',()=>{assert.equal(fallback(true,null,[{time:0,centerX:.3,centerY:.5}],null),false)});
test('server shot plans and group geometry keep precedence, including manual ownership',()=>{for(const auto of[true,false]){assert.equal(fallback(auto,[{}],[],[]),false);assert.equal(fallback(auto,[],[],[{}]),false)}});
