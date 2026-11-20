import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import crypto from 'node:crypto';
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const load=source=>import('data:text/javascript;base64,'+Buffer.from(compile(source)).toString('base64'));
const strip=path=>fs.readFileSync(path,'utf8').replace(/^import\b.*;\n/gm,'');
const snapshot=await load(`import crypto from 'node:crypto';\n${strip('server/src/shared/editorRenderSnapshot.ts')}`);
const quota=await load(`import crypto from 'node:crypto';\nclass AppError extends Error{constructor(message:any,statusCode:any,code:any){super(message);this.statusCode=statusCode;this.code=code}}\n${strip('server/src/shared/renderQuotaSnapshot.ts')}${strip('server/src/db/repositories/renderQuotaRepository.ts')}`);
const {make}=await load(`export function make(d:any){const {findRenderSubmission,renderSubmissionKey,crypto,getMongoClient,getMongoDb,AppError,editorRenderSnapshot,selectionSourceReceiptMatches,assertPanelViewsAssigned,expandSceneLayoutProject,ensureRenderQuotaFence,assertTransactionalRenderQuota}=d;${strip('server/src/db/repositories/renderAdmissionRepository.ts').replace(/export /g,'')};return {admitRenderJob,enqueueRenderJob,assertRenderAdmissionEnabled};}`);
class AppError extends Error{constructor(message,statusCode,code){super(message);this.statusCode=statusCode;this.code=code;}}
function fixture(options={}){
 let clip={id:'clip',user_id:'owner',project_id:'project',render_version:4,editor_version:9,render_status:'ready',source_storage_path:'source',selection_source_receipt:{version:1}};
 let editor={id:'editor',clip_id:'clip',user_id:'owner',version:7,tracks:[],canvas:{duration:24},settings:{}};
 if(options.clip)Object.assign(clip,options.clip);
 if(options.editor)Object.assign(editor,options.editor);
 const events=[],jobs=[],fenceEvents=[];let ended=false,committed=false,fence=null;
 const session={withTransaction:async(fn,tx)=>{events.push(['tx',tx]);if(options.txUnsupported)throw Error('transactions unsupported');const result=await fn();if(options.commitError)throw Error('commit failed');committed=true;return result},endSession:async()=>{ended=true}};
 const client={startSession:()=>session};
 const db={collection:table=>({
  findOne:async(filter,opts)=>{assert.strictEqual(opts.session,session);events.push(['read',table,filter]);if(options.readError===table)throw Error('read failed');
   if(table==='clips')return options.missingClip?null:clip;
   if(table==='editor_projects')return options.noEditor?null:editor;
   if(table==='projects')return options.noProject?null:{id:'project',user_id:'owner',source_url:options.sourceChanged?'changed':'source'};
   if(table==='transcripts')return options.noTranscript?null:{id:'transcript'};
   if(table==='render_jobs')return options.activeJob&&filter.status?{id:'existing'}:null;
   throw Error('unexpected collection');},
  updateOne:async(filter,update,opts)=>{
   if(table==='render_quota_fences'&&!opts?.session){fenceEvents.push(['provision',filter]);if(!fence)fence={_id:filter._id,user_id:filter.user_id,...(update.$setOnInsert??{})};return{matchedCount:0,upsertedCount:1};}
   assert.strictEqual(opts.session,session);events.push(['write',table,filter,update]);
   if(table==='render_quota_fences'){if(!fence||fence._id!==filter._id||fence.user_id!==filter.user_id)return{matchedCount:0};fence.serial=(fence.serial??0)+(update.$inc?.serial??0);return{matchedCount:1};}
   return{matchedCount:options.casFailure===table?0:1}},
  insertOne:async(row,opts)=>{assert.strictEqual(opts.session,session);events.push(['insert',table,row]);if(options.insertError)throw Error('insert failed');jobs.push(row);return{insertedId:'id'};},
  countDocuments:async(filter,opts)=>{assert.strictEqual(opts.session,session);events.push(['count',table,filter]);return options.usageCount??0},
 })};
 const f=make({crypto,AppError,...snapshot,selectionSourceReceiptMatches:()=>!options.receiptChanged,assertPanelViewsAssigned:()=>{if(options.panelError)throw new AppError('unassigned',409,'PANEL_VIEW_REQUIRED')},expandSceneLayoutProject:p=>p,getMongoClient:async()=>client,getMongoDb:async()=>db,findRenderSubmission:async()=>options.replayedReceipt??null,renderSubmissionKey:()=> 'scoped-key',ensureRenderQuotaFence:quota.ensureRenderQuotaFence,assertTransactionalRenderQuota:quota.assertTransactionalRenderQuota});
 const input={clipId:'clip',userId:'owner',quotaPolicy:{kind:'limited',maximum:10,displayName:'Free'},expectedRenderVersion:4,expectedEditorVersion:9,expectedEditorProject:options.noEditor?null:snapshot.editorRenderSnapshot(editor),settings:{caption_enabled:false,render_resolution:'720p'}};
 if(options.input)Object.assign(input,options.input);
 return{events,jobs,fenceEvents,input,run:()=>f.admitRenderJob(client,db,input),get ended(){return ended},get committed(){return committed}};
}
test('shared admission shapes one transaction with owner-scoped reads, editor fence, clip CAS, pinned job and post-commit receipt',async()=>{
 const s=fixture(),result=await s.run();assert(s.ended);assert(s.committed);assert.equal(result.renderVersion,5);assert.equal(result.job.id,s.jobs[0].id);
 const job=s.jobs[0];assert.equal(job.admission_version,1);assert.equal(job.render_version,5);assert.equal(job.editor_version,9);assert.deepEqual(job.editor_project_snapshot,s.input.expectedEditorProject);assert.equal(job.status,'queued');assert.equal(job.attempts,0);assert.equal(job.worker_id,null);
 const writes=s.events.filter(e=>['write','insert'].includes(e[0]));assert.deepEqual(writes.map(e=>[e[0],e[1]]),[['write','editor_projects'],['write','render_quota_fences'],['write','clips'],['insert','render_jobs']]);
 assert.equal(s.fenceEvents.length,1);
 const clipWrite=writes[2];assert.equal(clipWrite[2].user_id,'owner');assert.equal(clipWrite[2].editor_project_sync_pending,null);assert(clipWrite[2].$expr.$and);assert.equal(clipWrite[3].$set.caption_enabled,false);assert.equal(clipWrite[3].$set.render_resolution,'720p');assert.equal(clipWrite[3].$set.render_version,5);assert.equal(clipWrite[3].$set.editor_version,9);
 assert.equal(s.events[0][1].readConcern.level,'snapshot');assert.equal(s.events[0][1].writeConcern.w,'majority');
 for(const e of s.events.filter(e=>e[0]==='read'))assert.equal(e[2].user_id,'owner');
});
test('active persisted job conflicts without a clip version change or second job',async()=>{const s=fixture({activeJob:true});await assert.rejects(s.run(),{code:'RENDER_ALREADY_ACTIVE',statusCode:409});assert(!s.events.some(e=>e[0]==='write'&&e[1]==='clips'));assert.equal(s.jobs.length,0);assert(s.ended);});
test('changed clip/editor revisions, pending editor sync and mismatching editor snapshot cannot admit',async()=>{
 for(const options of [{clip:{render_version:5}},{clip:{editor_version:10}},{clip:{editor_project_sync_pending:{id:'editor',version:8}}},{input:{expectedEditorProject:{id:'editor',version:6,digest:'old'}}}]){const s=fixture(options);await assert.rejects(s.run(),{code:'RENDER_INPUT_CHANGED'});assert.equal(s.jobs.length,0);assert(s.ended);}
});
test('source/transcript absence or mismatch refuses before clip CAS and insertion',async()=>{
 for(const options of [{noProject:true},{noTranscript:true},{sourceChanged:true},{receiptChanged:true}]){const s=fixture(options);await assert.rejects(s.run(),{code:'TRANSCRIPT_SOURCE_REVIEW_REQUIRED'});assert(!s.events.some(e=>e[0]==='write'&&e[1]==='clips'));assert.equal(s.jobs.length,0);assert(s.ended);}
});
test('missing owner clip, panel failure and failed conditional fences return no committed admission',async()=>{
 for(const options of [{missingClip:true},{panelError:true},{casFailure:'editor_projects'},{casFailure:'clips'}]){const s=fixture(options);await assert.rejects(s.run());assert.equal(s.jobs.length,0);assert.equal(s.committed,false);assert(s.ended);}
});
test('insert/commit/unsupported-transaction failures propagate, close session and do not attempt nontransactional fallback',async()=>{
 for(const options of [{insertError:true},{commitError:true},{txUnsupported:true},{readError:'transcripts'}]){const s=fixture(options);await assert.rejects(s.run());assert.equal(s.committed,false);assert(s.ended);assert.equal(s.events.filter(e=>e[0]==='tx').length,1);}
 // This fake session does NOT prove database rollback or write-conflict behavior.
});
test('legacy missing revisions normalize to1 but malformed/overflow preconditions are rejected',async()=>{
 const legacy=fixture({clip:{render_version:undefined,editor_version:undefined},input:{expectedRenderVersion:1,expectedEditorVersion:1}});assert.equal((await legacy.run()).renderVersion,2);assert.equal(legacy.events.find(e=>e[0]==='write'&&e[1]==='clips')[3].$set.editor_version,1);
 for(const input of [{expectedRenderVersion:Number.MAX_SAFE_INTEGER},{expectedRenderVersion:NaN},{expectedEditorVersion:0},{userId:''}]){const s=fixture({input});await assert.rejects(s.run(),{code:'RENDER_INPUT_CHANGED'});assert.equal(s.events.length,0);}
});
test('absence of an editor is admitted only when caller also validated its absence',async()=>{
 const s=fixture({noEditor:true});const {job}=await s.run();assert.equal(job.editor_project_snapshot,null);assert(!s.events.some(e=>e[0]==='write'&&e[1]==='editor_projects'));
 const wrong=fixture({input:{expectedEditorProject:null}});await assert.rejects(wrong.run(),{code:'RENDER_INPUT_CHANGED'});
});
const retry=await load(strip('server/src/shared/renderRetryBudget.ts'));
const {makeClaim}=await load(`export function makeClaim(renderBudgetAvailableExpr:any){${strip('server/src/services/queue/renderLeaseClaim.ts').replace(/export /g,'')};return claimRenderLease;}`);
test('actual worker claim filter pins new admissions to exact revisions while retaining explicit legacy compatibility',async()=>{
 let captured;const db={collection:()=>({findOneAndUpdate:async(...args)=>{captured=args;return null}})};
 await makeClaim(retry.renderBudgetAvailableExpr)(db,{jobId:'job',clipId:'clip',userId:'owner',workerId:'worker',renderVersion:5,editorVersion:9},new Date());
 const [filter,update]=captured;assert.deepEqual(filter.$and[0].$or,[{admission_version:null},{admission_version:1,render_version:5,editor_version:9}]);assert.equal(filter.user_id,'owner');assert.equal(filter.clip_id,'clip');assert.strictEqual(filter.$expr,retry.renderBudgetAvailableExpr);assert.equal(update[0].$set.render_version,5);assert.equal(update[0].$set.editor_version,9);
});
test('modified admission/controller/worker sources parse without syntax errors',()=>{
 for(const path of ['server/src/db/repositories/renderAdmissionRepository.ts','server/src/controllers/clipController.ts','server/src/controllers/proEditorController.ts','server/src/services/queue/renderLeaseClaim.ts','server/src/services/clipRenderService.ts']){const r=ts.transpileModule(fs.readFileSync(path,'utf8'),{reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});assert.deepEqual((r.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).map(d=>d.messageText),[],path);}
});

test('deployment admission defaults closed before any database access; only exact opt-in enables wrapper',async()=>{
 const original=process.env.VIREO_RENDER_ADMISSION_V1;let accesses=0;
 const boundary=make({AppError,getMongoClient:async()=>{accesses++;throw Error('database sentinel')},getMongoDb:async()=>{accesses++;throw Error('database sentinel')}});
 try{
  for(const value of [undefined,'','0','true',' 1','2']){
   if(value===undefined)delete process.env.VIREO_RENDER_ADMISSION_V1;else process.env.VIREO_RENDER_ADMISSION_V1=value;
   await assert.rejects(()=>boundary.enqueueRenderJob({}),{code:'RENDER_ADMISSION_NOT_ENABLED',statusCode:503});
  }
  assert.equal(accesses,0);process.env.VIREO_RENDER_ADMISSION_V1='1';
  await assert.rejects(()=>boundary.enqueueRenderJob({}),/database sentinel/);assert.equal(accesses,1);
 }finally{if(original===undefined)delete process.env.VIREO_RENDER_ADMISSION_V1;else process.env.VIREO_RENDER_ADMISSION_V1=original;}
});

test('same submission replay returns its committed receipt before revision/editor/source/quota-independent admission reads',async()=>{
 const prior={job:{id:'original-job',editor_version:9},renderVersion:5,replayed:true};const s=fixture({replayedReceipt:prior,input:{submission:{id:'key',fingerprint:'a'.repeat(64),expectedRenderVersion:4,expectedEditorVersion:9}}});assert.strictEqual(await s.run(),prior);assert.equal(s.events.filter(e=>e[0]==='read'||e[0]==='write'||e[0]==='insert').length,0);
});
test('new submission receipt is written in the same session after job insertion and before commit',async()=>{
 const s=fixture({input:{submission:{id:'key',fingerprint:'a'.repeat(64),expectedRenderVersion:4,expectedEditorVersion:9}}});const result=await s.run();const inserts=s.events.filter(e=>e[0]==='insert');assert.deepEqual(inserts.map(e=>e[1]),['render_jobs','render_submissions']);assert.equal(inserts[1][2].user_id,'owner');assert.equal(inserts[1][2].clip_id,'clip');assert.equal(inserts[1][2].receipt.job.id,result.job.id);assert.equal(inserts[1][2].receipt.renderVersion,5);
});
