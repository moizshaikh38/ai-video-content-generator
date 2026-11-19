import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const file='server/src/services/queue/renderPreleaseOutcome.ts';
const source=fs.readFileSync(file,'utf8').replace(/^import .*;\n/gm,'');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},reportDiagnostics:true});
const {failQueuedRenderJob,queuedRenderSnapshotFilter}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputText).toString('base64'));
const now=new Date('2026-11-19T09:00:00Z');
const failure={code:'DATABASE_UNAVAILABLE',message:'Saved source could not be read.'};
function setup(options={}){
 const snapshot={id:'job',clip_id:'clip',user_id:'owner',prelease_failures:2,attempts:0,next_retry_at:null,...options.snapshot};
 const job={...snapshot,render_version:5,editor_version:9,...options.job};
 const clip={id:'clip',user_id:'owner',render_version:5,editor_version:9,render_status:'queued',...options.clip};
 const events=[];let ended=false,committed=false,started=0;
 const session={withTransaction:async(fn,contract)=>{events.push(['tx',contract]);if(options.unsupported)throw Error('unsupported topology');const value=await fn();if(options.commitFailure)throw Error('commit uncertain');committed=true;return value},endSession:async()=>{ended=true}};
 const client={startSession:()=>{started++;return session}};
 const db={collection:name=>({
  findOne:async(filter,opts)=>{assert.strictEqual(opts.session,session);events.push(['read',name,filter,opts]);if(options.readFailure)throw Error('read unavailable');if(filter.id)return options.replaced?null:job;return options.newer?{id:'newer'}:job;},
  updateOne:async(filter,update,opts)=>{assert.strictEqual(opts.session,session);events.push(['write',name,filter,update]);if(options.writeFailure)throw Error('write unavailable');if(name==='render_jobs')return{matchedCount:options.casLost?0:1};const matched=!options.noClip&&Object.entries(filter).every(([key,value])=>value===null?clip[key]==null:clip[key]===value);if(matched)Object.assign(clip,update.$set);return{matchedCount:matched?1:0};},
 })};
 return{snapshot,events,clip,run:()=>failQueuedRenderJob(client,db,snapshot,failure,now),get ended(){return ended},get committed(){return committed},get started(){return started}};
}
test('actual terminal helper makes owner, clip, both revisions and latest-job checks within one transaction',async()=>{
 const s=setup();assert.equal(await s.run(),true);assert(s.committed);assert(s.ended);
 const writes=s.events.filter(e=>e[0]==='write');assert.equal(writes.length,2);
 assert.deepEqual(writes[0][2],{id:'job',clip_id:'clip',user_id:'owner',status:'queued',worker_id:null,locked_at:null,prelease_failures:{$eq:2},attempts:{$eq:0},next_retry_at:{$eq:null}});
 assert.deepEqual(writes[1][2],{id:'clip',user_id:'owner',render_version:5,editor_version:9,editor_project_sync_pending:null,render_status:'queued'});
 assert.equal(writes[0][3].$set.next_retry_at,null);assert.equal(writes[1][3].$set.render_status,'failed');assert.equal(writes[1][3].$set.render_error_code,failure.code);assert.equal(writes[1][3].$set.render_error_message,failure.message);
 const tx=s.events[0][1];assert.equal(tx.readConcern.level,'snapshot');assert.equal(tx.writeConcern.w,'majority');
 const latest=s.events.find(e=>e[0]==='read'&&!e[2].id);assert.deepEqual(latest[2],{clip_id:'clip',user_id:'owner'});assert.deepEqual(latest[3].sort,{created_at:-1,_id:-1});
});
test('latest different job prevents all displayed-clip writes',async()=>{const s=setup({newer:true});assert.equal(await s.run(),true);assert.equal(s.events.filter(e=>e[0]==='write'&&e[1]==='clips').length,0)});
test('legacy or malformed job revisions cannot authorize a displayed-clip update',async()=>{
 for(const job of [{render_version:undefined},{editor_version:undefined},{render_version:0},{editor_version:NaN},{render_version:'5'}]){const s=setup({job});assert.equal(await s.run(),true);assert.equal(s.events.filter(e=>e[0]==='write'&&e[1]==='clips').length,0);}
});
test('replaced lease or competing pre-lease outcome cannot authorize any clip write',async()=>{
 for(const options of [{replaced:true},{casLost:true}]){const s=setup(options);assert.equal(await s.run(),false);assert.equal(s.events.filter(e=>e[0]==='write'&&e[1]==='clips').length,0);assert(s.ended);}
});
test('superseding edits, pending sync, ready output and missing clip keep their displayed state',async()=>{
 for(const options of [{clip:{render_version:6}},{clip:{editor_version:10}},{clip:{editor_project_sync_pending:{id:'editor',version:8}}},{clip:{render_status:'ready'}},{noClip:true}]){
  const s=setup(options);const before={...s.clip};await s.run();assert.deepEqual(s.clip,before);const write=s.events.find(e=>e[0]==='write'&&e[1]==='clips');assert(write);assert.equal(write[2].render_version,5);assert.equal(write[2].editor_version,9);assert.equal(write[2].render_status,'queued');assert.equal(write[2].editor_project_sync_pending,null);
 }
 // The stub above applies filter matching only. It is not database race proof.
});
test('transaction/read/write/commit failures propagate and close the session without fallback',async()=>{
 for(const options of [{unsupported:true},{readFailure:true},{writeFailure:true},{commitFailure:true}]){const s=setup(options);await assert.rejects(s.run());assert(!s.committed);assert(s.ended);assert.equal(s.events.filter(e=>e[0]==='tx').length,1);}
 // This fake transaction does not roll back stub writes. Actual DB rollback is unverified.
});
test('missing owner identity is refused before opening a session',async()=>{
 for(const snapshot of [{id:''},{clip_id:''},{user_id:''}]){const s=setup({snapshot});await assert.rejects(s.run(),/owner identity/);assert.equal(s.started,0);assert.equal(s.events.length,0);}
});
test('legacy absent count is fenced as null, while observed counts are retained exactly',()=>{
 assert.equal(queuedRenderSnapshotFilter({id:'j',clip_id:'c',user_id:'u'}).prelease_failures.$eq,null);
 for(const count of [0,1,2,NaN,'bad'])assert(Object.is(queuedRenderSnapshotFilter({id:'j',clip_id:'c',user_id:'u',prelease_failures:count}).prelease_failures.$eq,count));
});
test('new helper parses without syntax diagnostics',()=>{assert.deepEqual((compiled.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error),[])});

test('snapshot filter uses literal equality operands and pins attempt/retry epoch',()=>{
 const object={$ne:null};const retryAt=new Date('2026-11-19T09:02:00Z');const filter=queuedRenderSnapshotFilter({id:'j',clip_id:'c',user_id:'u',prelease_failures:object,attempts:2,next_retry_at:retryAt});
 assert.deepEqual(filter.prelease_failures,{$eq:object});assert.deepEqual(filter.attempts,{$eq:2});assert.deepEqual(filter.next_retry_at,{$eq:retryAt});
});
