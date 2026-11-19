import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';import crypto from 'node:crypto';
const load=source=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64'));
class AppError extends Error{constructor(message,statusCode,code){super(message);this.statusCode=statusCode;this.code=code;}}
const repoSource=fs.readFileSync('server/src/db/repositories/renderSubmissionRepository.ts','utf8').replace(/^import .*;\n/gm,'');
const {repo}=await load(`export function repo(d:any){const {crypto,AppError,isValidUUID}=d;${repoSource.replace(/export /g,'')};return{findRenderSubmission,parseRenderSubmission,renderSubmissionKey};}`);
const helpers=repo({crypto,AppError,isValidUUID:v=>typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v)});
const source=fs.readFileSync('server/src/db/repositories/renderSubmissionCloseRepository.ts','utf8').replace(/^import .*;\n/gm,'');
const {make}=await load(`export function make(d:any){const {AppError,findRenderSubmission,renderSubmissionKey}=d;${source.replace(/export /g,'')};return closeUnadmittedRenderSubmission;}`);
const close=make({AppError,...helpers});
const key='11111111-1111-4111-8111-111111111111',jobId='22222222-2222-4222-8222-222222222222';
const intent=helpers.parseRenderSubmission({submission_id:key,expected_render_version:4,expected_editor_version:9},'clip');
const receiptRecord=()=>({version:1,clip_id:'clip',user_id:'owner',fingerprint:intent.fingerprint,receipt:{renderVersion:5,job:{id:jobId,clip_id:'clip',user_id:'owner',render_version:5,editor_version:9}}});
const closedRecord=()=>({version:1,clip_id:'clip',user_id:'owner',fingerprint:intent.fingerprint,state:'cancelled'});
function setup(options={}){
 const events=[];let record=options.record??null,ended=0,committed=false;
 const session={withTransaction:async(fn,contract)=>{events.push(['tx',contract]);if(options.transactionError)throw Error('transaction unavailable');const result=await fn();if(options.commitError)throw Error('unknown commit result');committed=true;return result},endSession:async()=>{ended++}};
 const db={collection:name=>({findOne:async(filter,opts)=>{events.push(['read',name,filter,opts]);if(options.readError)throw Error('read unavailable');return name==='render_submissions'?record:options.deleted?null:{id:'clip'}},updateOne:async(filter,update,opts)=>{assert.strictEqual(opts.session,session);events.push(['write',name,filter,update]);return{matchedCount:options.deleted?0:1}},insertOne:async(row,opts)=>{assert.strictEqual(opts.session,session);events.push(['insert',name,row]);if(options.raceReceipt){record=receiptRecord();throw Error('duplicate key')};if(options.raceClose){record=closedRecord();throw Error('duplicate key')};if(options.insertError)throw Error('insert unavailable');record=row;return{insertedId:row._id}}})};
 return{db,events,get record(){return record},get ended(){return ended},get committed(){return committed},run:()=>close({startSession:()=>session},db,'owner','clip',intent)};
}
test('closing an unadmitted key writes one owner-scoped tombstone transactionally without any render-job action',async()=>{
 const s=setup();const result=await s.run();assert.deepEqual(result,{cancelled:true,submissionId:key});assert(s.committed);assert.equal(s.ended,1);const write=s.events.find(e=>e[0]==='write');assert.deepEqual(write[2],{id:'clip',user_id:'owner'});const row=s.record;assert.equal(row._id,helpers.renderSubmissionKey('owner',key));assert.equal(row.state,'cancelled');assert.equal(row.fingerprint,intent.fingerprint);assert(!s.events.some(e=>e[1]==='render_jobs'));assert.equal(s.events[0][1].writeConcern.w,'majority');
});
test('an admitted receipt is recovered, never cancelled, changed or relaunched',async()=>{const record=receiptRecord(),s=setup({record});const result=await s.run();assert.equal(result.cancelled,false);assert.equal(result.receipt.job.id,jobId);assert.strictEqual(s.record,record);assert(!s.events.some(e=>['write','insert'].includes(e[0])))});
test('closing an already-closed matching key is idempotent and does not rewrite it',async()=>{const s=setup({record:closedRecord()});assert.deepEqual(await s.run(),{cancelled:true,submissionId:key});assert(!s.events.some(e=>['write','insert'].includes(e[0])))});
test('a delayed ordinary replay sees the tombstone and cannot turn it into admission permission',async()=>{const s=setup();await s.run();await assert.rejects(helpers.findRenderSubmission(s.db,'owner','clip',intent),{statusCode:409,code:'RENDER_SUBMISSION_CANCELLED'})});
test('same key with different inputs conflicts without cancelling another request',async()=>{const s=setup({record:{...closedRecord(),fingerprint:'different'}});await assert.rejects(s.run(),{code:'RENDER_SUBMISSION_CONFLICT'});assert(!s.events.some(e=>['write','insert'].includes(e[0])))});
test('deleted owner-scoped clip cannot create a new tombstone or job',async()=>{const s=setup({deleted:true});await assert.rejects(s.run(),{code:'CLIP_NOT_FOUND'});assert.equal(s.record,null);assert.equal(s.ended,1)});
test('simulated insert collision resolves only the same committed receipt or tombstone',async()=>{for(const options of [{raceReceipt:true},{raceClose:true}]){const s=setup(options);const result=await s.run();assert.equal(result.cancelled,!!options.raceClose);if(options.raceReceipt)assert.equal(result.receipt.job.id,jobId);assert.equal(s.ended,1)}});
test('unknown close commit outcome is acknowledged only after the exact durable tombstone is read',async()=>{const s=setup({commitError:true});assert.equal((await s.run()).cancelled,true);assert(s.events.filter(e=>e[0]==='read'&&e[1]==='render_submissions').length>=2);assert.equal(s.ended,1)});
test('unresolved database/transaction failures propagate without a guessed acknowledgement or new job',async()=>{for(const options of [{transactionError:true},{readError:true},{insertError:true}]){const s=setup(options);await assert.rejects(s.run());assert.equal(s.ended,1);assert(!s.committed);assert(!s.events.some(e=>e[1]==='render_jobs'));}});
test('close control is explicit, keyed and mutually exclusive with lookup-only recovery',()=>{for(const body of [{cancel_only:true},{cancel_only:false,submission_id:key},{cancel_only:true,recover_only:true,submission_id:key}])assert.throws(()=>helpers.parseRenderSubmission(body,'clip'),{code:'INVALID_RENDER_SUBMISSION'})});
// Fake transactions below do not establish actual Mongo rollback, duplicate-key
// contention or delayed-request ordering. Those remain release validation.

test('saved-request UI wiring and changed sources parse, without claiming rendered layout verification',()=>{
 for(const file of ['src/components/editor/ExportDialog.tsx','src/components/editor/EditorShell.tsx','src/hooks/useEditorRender.ts','src/lib/renderSubmissionRecovery.ts','server/src/controllers/clipController.ts','server/src/db/repositories/renderSubmissionCloseRepository.ts']){
  const result=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});assert.deepEqual((result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error),[],file);
 }
 const dialog=fs.readFileSync('src/components/editor/ExportDialog.tsx','utf8');assert.match(dialog,/onClick=\{onResolveSavedRequest\}/);assert.match(dialog,/does not cancel a queued render or start a new one/);
});
