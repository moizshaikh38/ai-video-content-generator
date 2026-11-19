import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const load=source=>import('data:text/javascript;base64,'+Buffer.from(compile(source)).toString('base64'));
const retry=await load(fs.readFileSync('server/src/shared/renderRetryBudget.ts','utf8'));
const source=fs.readFileSync('server/src/services/queue/renderQueueRecovery.ts','utf8').replace(/^import .*;\n/gm,'');
const {make}=await load(`export function make(d:any){const {renderRetryBudget,renderBudgetExhaustedExpr}=d;${source.replace('export async function','async function')};return recoverRenderQueue;}`);
const recover=make(retry),now=new Date('2026-11-19T10:00:00Z'),old=new Date('2026-11-19T09:40:00Z');
function matches(row,filter){return Object.entries(filter).every(([key,value])=>{
 if(key==='$or')return value.some(branch=>matches(row,branch));
 if(key==='$expr')return !retry.renderRetryBudget(row).available;
 if(value&&typeof value==='object'&&!(value instanceof Date)){
  if(value.$type&&typeof row[key]!==value.$type)return false;
  if(value.$regex&&!value.$regex.test(row[key]))return false;
  if(value.$in&&!value.$in.includes(row[key]))return false;
  if(value.$lt&&!(row[key] instanceof Date&&row[key]<value.$lt))return false;
  return true;
 }
 if(value instanceof Date)return row[key] instanceof Date&&row[key].getTime()===value.getTime();
 return value===null?row[key]==null:row[key]===value;
})}
function setup(options={}){
 const snapshot={id:'job',clip_id:'clip',user_id:'owner',status:'processing',worker_id:'worker',locked_at:old,attempts:1,max_attempts:3,render_version:5,editor_version:9,...options.job};
 const job={...snapshot,...options.current};const clip={id:'clip',user_id:'owner',render_status:'rendering',render_version:5,editor_version:9,...options.clip};
 const events=[];let closed=0,limit,query,committed=false;
 const session={withTransaction:async(fn,contract)=>{events.push(['tx',contract]);if(options.unsupported)throw Error('transactions unavailable');await fn();if(options.commitError)throw Error('commit uncertain');committed=true},endSession:async()=>{closed++}};
 const client={startSession:()=>session};const db={collection:table=>({
  find:filter=>{query=filter;const chain={sort:()=>chain,limit:n=>{limit=n;return chain},toArray:async()=>options.forceCandidates||matches(snapshot,filter)?[snapshot]:[]};return chain},
  findOne:async(filter,opts)=>{assert.strictEqual(opts.session,session);events.push(['read',table,filter,opts]);if(options.readError)throw Error('read unavailable');if(filter.id)return matches(job,filter)?job:null;return options.newerJob?{id:'newer'}:job},
  updateOne:async(filter,update,opts)=>{assert.strictEqual(opts.session,session);events.push(['write',table,filter,update]);if(options.writeError)throw Error('write unavailable');if(options.casLost)return{matchedCount:0};const row=table==='render_jobs'?job:clip;const matched=matches(row,filter);if(matched)Object.assign(row,update.$set);return{matchedCount:matched?1:0}},
 })};
 return{events,job,clip,run:n=>recover(client,db,now,n),get query(){return query},get limit(){return limit},get closed(){return closed},get committed(){return committed}};
}
test('stale processing and uploading leases requeue under the exact owner/token/heartbeat snapshot without spending another render attempt',async()=>{
 for(const status of ['processing','uploading']){const s=setup({job:{status},clip:{render_status:status==='uploading'?'uploading':'rendering'}});assert.equal(await s.run(),1);assert.equal(s.job.status,'queued');assert.equal(s.job.worker_id,null);assert.equal(s.job.locked_at,null);assert.equal(s.job.attempts,1);assert.equal(s.clip.render_status,'queued');assert.equal(s.clip.render_error_code,'RENDER_LEASE_EXPIRED');assert(s.committed);assert.equal(s.closed,1);const write=s.events.find(e=>e[0]==='write');assert.deepEqual(write[2],{id:'job',clip_id:'clip',user_id:'owner',status,worker_id:'worker',locked_at:old});}
});
test('fresh uploading lease is neither selected nor cleared',async()=>{const s=setup({job:{status:'uploading',locked_at:now}});assert.equal(await s.run(),0);assert.equal(s.closed,0);assert.equal(s.job.status,'uploading');assert.equal(s.events.length,0)});
test('fresh or replaced heartbeat/token recheck cannot reset a lease',async()=>{
 for(const options of [{current:{locked_at:now}},{current:{worker_id:'replacement'}},{job:{status:'uploading',locked_at:now},forceCandidates:true}]){const s=setup(options);assert.equal(await s.run(),0);assert.equal(s.events.filter(e=>e[0]==='write').length,0);assert.equal(s.closed,1);}
});
test('exhausted stale held leases and unclaimed queued jobs fail instead of reviving',async()=>{
 for(const status of ['processing','uploading','queued']){const s=setup({job:{status,attempts:3,...(status==='queued'?{worker_id:null,locked_at:null}:{})}});assert.equal(await s.run(),1);assert.equal(s.job.status,'failed');assert.equal(s.clip.render_status,'failed');assert.equal(s.job.error_code,'MAX_ATTEMPTS_EXCEEDED');}
});
test('queued work with remaining budget is not terminalized even if returned as a candidate',async()=>{const s=setup({job:{status:'queued',worker_id:null,locked_at:null},forceCandidates:true});assert.equal(await s.run(),0);assert.equal(s.events.filter(e=>e[0]==='write').length,0)});
test('superseding clip revisions, pending sync and ready output keep their displayed state',async()=>{
 for(const clip of [{render_version:6},{editor_version:10},{editor_project_sync_pending:{id:'editor',version:8}},{render_status:'ready'}]){const s=setup({clip});const before={...s.clip};assert.equal(await s.run(),1);assert.equal(s.job.status,'queued');assert.deepEqual(s.clip,before);const filter=s.events.find(e=>e[0]==='write'&&e[1]==='clips')[2];assert.equal(filter.editor_version,9);assert.equal(filter.editor_project_sync_pending,null);}
});
test('legacy missing revisions and a newer job cannot authorize a displayed-clip write',async()=>{
 for(const options of [{job:{render_version:undefined}},{job:{editor_version:undefined}},{newerJob:true}]){const s=setup(options);assert.equal(await s.run(),1);assert.equal(s.events.filter(e=>e[0]==='write'&&e[1]==='clips').length,0);}
});
test('invalid owner identities are filtered before batch selection and refused again before a transaction',async()=>{
 for(const job of [{user_id:''},{clip_id:null},{id:17},{user_id:'   '}]){const s=setup({job});assert.equal(await s.run(),0);assert.equal(s.closed,0);const forced=setup({job,forceCandidates:true});assert.equal(await forced.run(),0);assert.equal(forced.closed,0);}
});
test('recovery batch stays bounded for oversized, zero and malformed requested limits',async()=>{
 for(const [input,expected] of [[100,25],[0,1],[NaN,25],[1.5,25]]){const s=setup();await s.run(input);assert.equal(s.limit,expected);}
});
test('transaction failures propagate, close the session and have no alternate write path',async()=>{
 for(const options of [{unsupported:true},{readError:true},{writeError:true},{commitError:true}]){const s=setup(options);await assert.rejects(s.run());assert.equal(s.closed,1);assert(!s.committed);assert.equal(s.events.filter(e=>e[0]==='tx').length,1);}
 // Stub transactions do not roll back writes or prove real Mongo concurrency.
});
test('lost conditional update does not report a recovered job or update the clip',async()=>{const s=setup({casLost:true});assert.equal(await s.run(),0);assert.equal(s.events.filter(e=>e[0]==='write'&&e[1]==='clips').length,0)});
