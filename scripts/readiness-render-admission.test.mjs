import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// Execute the actual readiness function with local dependency doubles.
// This proves payload/status semantics, not live Mongo or render capability.
const source=fs.readFileSync('server/src/services/healthService.ts','utf8');
const ast=ts.createSourceFile('healthService.ts',source,ts.ScriptTarget.Latest,true);
const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='getReadinessStatus');
assert(fn);
const compiled=ts.transpileModule(`export function make(d:any){const {workLifecycle,isMongoHealthy,isServerSupabaseConfigured,config,getRenderQueueStats,getReframeRuntimeStats}=d;${fn.getText(ast).replace('export ','')};return getReadinessStatus;}`,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {make}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
function fixture(draining=false,connected=true){let reads=0;const run=make({workLifecycle:{isDraining:()=>draining},isMongoHealthy:async()=>{reads++;return connected},isServerSupabaseConfigured:true,config:{r2AccountId:'local',r2AccessKeyId:'local',r2SecretAccessKey:'local',openrouterApiKey:'local'},getRenderQueueStats:async()=>null,getReframeRuntimeStats:async()=>null});return{run,reads:()=>reads};}
test('readiness exposes exact admission gate without changing dependency readiness',async()=>{
 const original=process.env.VIREO_RENDER_ADMISSION_V1;
 try{for(const value of [undefined,'','0','true',' 1','1']){
  if(value===undefined)delete process.env.VIREO_RENDER_ADMISSION_V1;else process.env.VIREO_RENDER_ADMISSION_V1=value;
  const r=await fixture().run();assert.equal(r.status,'ready');assert.deepEqual(r.renderAdmission,{enabled:value==='1'});assert(!JSON.stringify(r).includes('r2SecretAccessKey'));
 }}finally{if(original===undefined)delete process.env.VIREO_RENDER_ADMISSION_V1;else process.env.VIREO_RENDER_ADMISSION_V1=original;}
});
test('draining readiness keeps gate visible without reading dependencies',async()=>{const s=fixture(true);const r=await s.run();assert.equal(r.status,'not_ready');assert.equal(r.draining,true);assert.equal(typeof r.renderAdmission.enabled,'boolean');assert.equal(s.reads(),0);});
test('an enabled admission flag does not make disconnected dependencies ready',async()=>{const original=process.env.VIREO_RENDER_ADMISSION_V1;try{process.env.VIREO_RENDER_ADMISSION_V1='1';const r=await fixture(false,false).run();assert.equal(r.status,'not_ready');assert.equal(r.renderAdmission.enabled,true);assert.equal(r.checks.mongodb,false);}finally{if(original===undefined)delete process.env.VIREO_RENDER_ADMISSION_V1;else process.env.VIREO_RENDER_ADMISSION_V1=original;}});
