import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync('server/src/services/renderPlanPreflight.ts','utf8').replace(/^import .*;\n/gm,'');
const js=ts.transpileModule(`export function make(d:any){const {getMongoDb,AppError,EntitlementService,Date}=d;${source.replace('export async function','async function')};return assertRenderPlanPreflight;}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {make}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
function setup(options={}){
 const calls=[];const plan={displayName:'Free',isUnlimited:false,limits:{maxClipRenders:10},...options.plan};
 class AppError extends Error{constructor(message,statusCode,code){super(message);this.statusCode=statusCode;this.code=code;}}
 class FixedDate extends Date{constructor(...args){super(...(args.length?args:['2026-11-19T09:12:00Z']))}}
 const run=make({AppError,Date:FixedDate,EntitlementService:{resolveUserEntitlements:async(...args)=>{calls.push(['entitlements',...args]);if(options.entitlementError)throw options.entitlementError;return plan},isPresetAllowed:(entitlements,preset)=>{assert.strictEqual(entitlements,plan);calls.push(['preset',preset]);return options.allowed!==false}},getMongoDb:async()=>{calls.push(['db']);return{collection:name=>{assert.equal(name,'render_jobs');return{countDocuments:async filter=>{calls.push(['count',filter]);if(options.countError)throw options.countError;return Object.hasOwn(options,'count')?options.count:3}}}}}});
 return{calls,run:(preset='clean')=>run('owner','owner@example.invalid',preset)};
}
test('baseline Studio preflight uses authenticated owner and UTC month boundary for Date and legacy ISO rows',async()=>{
 const s=setup();await s.run();assert.deepEqual(s.calls[0],['entitlements','owner','owner@example.invalid']);const filter=s.calls.find(c=>c[0]==='count')[1];assert.equal(filter.user_id,'owner');assert.equal(filter.$or[0].created_at.$gte.toISOString(),'2026-11-01T00:00:00.000Z');assert.equal(filter.$or[1].created_at.$gte,'2026-11-01T00:00:00.000Z');assert.deepEqual(s.calls.at(-1),['preset','clean']);
});
test('at or beyond the existing plan render limit is denied without a preset decision',async()=>{
 for(const count of [10,11]){const s=setup({count});await assert.rejects(s.run(),{statusCode:403,code:'MONTHLY_RENDER_LIMIT_EXCEEDED'});assert(!s.calls.some(c=>c[0]==='preset'));}
});
test('zero render allowance is denied and malformed allowance/count fails closed',async()=>{
 const zero=setup({plan:{limits:{maxClipRenders:0}},count:0});await assert.rejects(zero.run(),{code:'MONTHLY_RENDER_LIMIT_EXCEEDED'});
 for(const maxClipRenders of [NaN,Infinity,-1,1.5,'10']){const s=setup({plan:{limits:{maxClipRenders}}});await assert.rejects(s.run(),{statusCode:503,code:'RENDER_PLAN_UNAVAILABLE'});assert(!s.calls.some(c=>c[0]==='db'));}
 for(const count of [null,NaN,-1,1.5,'3']){const s=setup({count});await assert.rejects(s.run(),{statusCode:503,code:'RENDER_USAGE_UNAVAILABLE'});}
});
test('unlimited plans skip monthly counting but still use the preset policy function',async()=>{
 const s=setup({plan:{isUnlimited:true}});await s.run();assert(!s.calls.some(c=>c[0]==='db'));assert.deepEqual(s.calls.at(-1),['preset','clean']);
});
test('restricted saved-clip baseline preset is denied before admission',async()=>{
 const s=setup({allowed:false});await assert.rejects(s.run('restricted'),{statusCode:403,code:'PRESET_RESTRICTED'});
});
test('missing baseline preset does not invent a style or a restriction',async()=>{
 const s=setup();await s.run(null);assert(!s.calls.some(c=>c[0]==='preset'));
});
test('entitlement and count-source errors propagate, never as zero usage or an unlimited plan',async()=>{
 const error=Object.assign(Error('unavailable'),{code:'DATABASE_UNAVAILABLE'});
 for(const options of [{entitlementError:error},{countError:error}]){const s=setup(options);await assert.rejects(s.run(),e=>e===error);}
});
