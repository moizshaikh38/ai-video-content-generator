import test from 'node:test';import assert from 'node:assert/strict';import {initialPublishAccount as choose} from '../../../src/shared/publishAccountChoice.js';
const accounts=[{id:'youtube',provider:'youtube'},{id:'instagram',provider:'instagram'},{id:'tiktok',provider:'tiktok'}];
test('match requested platform despite order',()=>assert.equal(choose(accounts,'tiktok',()=>false),'tiktok'));
test('missing requested platform never falls back',()=>assert.equal(choose(accounts.slice(0,2),'tiktok',()=>false),''));
test('disabled requested account never falls back',()=>assert.equal(choose(accounts,'tiktok',a=>a.id==='tiktok'),''));
test('no platform retains existing eligible first choice',()=>assert.equal(choose(accounts,undefined,a=>a.id==='youtube'),'instagram'));
test('empty list clears previous choice',()=>assert.equal(choose([],'youtube',()=>false),''));
