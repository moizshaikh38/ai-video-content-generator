import test from 'node:test';import assert from 'node:assert/strict';
import {chooseAutopilotHook as choose} from '../shared/autopilotHookChoice.js';
const candidate=(id:string,score:number,extra:any={})=>({id,overall_hook_fit:score,delivery_mode:'SPOKEN_REWRITE',...extra});
test('rank actual scores rather than generator insertion order',()=>{assert.equal(choose([candidate('first',38),candidate('last',90)]).chosen.id,'last')});
test('unsupported highest mode is not replaced by lower supported overlay',()=>{assert.equal(choose([candidate('overlay',60,{delivery_mode:'TEXT_OVERLAY'}),candidate('spoken',90)]).chosen.id,'spoken')});
test('existing locked choice is preserved despite lower score',()=>{const result=choose([candidate('high',95),candidate('locked',20,{locked:true})]);assert.equal(result.chosen.id,'locked');assert(result.locked)});
test('equal scores preserve original deterministic order',()=>assert.equal(choose([candidate('first',80),candidate('second',80)]).chosen.id,'first'));
for(const score of [NaN,Infinity,-1,101])test('invalid score refuses '+String(score),()=>assert.throws(()=>choose([candidate('bad',score)]),{code:'HOOK_SCORE_REVIEW_REQUIRED'}));
test('empty candidates refuse',()=>assert.throws(()=>choose([]),{code:'HOOK_GENERATION_FAILED'}));
