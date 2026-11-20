import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const load=async source=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
function methods(path,names){const text=fs.readFileSync(path,'utf8'),ast=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true),out=[];function visit(n){if(ts.isMethodDeclaration(n)&&names.includes(n.name.getText(ast)))out.push(n.getText(ast));ts.forEachChild(n,visit);}visit(ast);assert.equal(out.length,names.length);return out.join('\n');}
const workerMethods=methods('server/src/services/clipRenderService.ts',['executeRenderClipJob','processDueRenderJobs']);
const dependencies=['failQueuedRenderJob','queuedRenderSnapshotFilter','activeRenderSet','dataRepository','workLifecycle','isMongoConfigured','getMongoDb','getMongoClient','recoverRenderQueue','renderOccupancy','maxConcurrentRenders','occupiedRenderClipIds','renderBudgetAvailableExpr','tryReserveRenderSlot','ownerContext','releaseRenderSlot','logger','JobReliabilityService','renderRetryBudget','AppError','crypto','claimRenderLease','runsBackgroundWorkers','nextOwnerFairRenderJob','notifyRenderCapacityAvailable'];
const typesText=fs.readFileSync('server/src/types/index.ts','utf8');
const uuidHelpers=typesText.match(/const UUID_REGEX\s*=[^;]+;/)[0]+'\n'+typesText.match(/export function isValidUUID[\s\S]*?\n}/)[0].replace('export ','');
const runtimePolicy=await load(fs.readFileSync('server/src/services/runtimePolicy.ts','utf8'));
const capacitySignal=await load(fs.readFileSync('server/src/services/queue/renderCapacitySignal.ts','utf8'));
const {make}=await load(`${uuidHelpers}\nexport function make(d:any){const {${dependencies}}=d;return class{${workerMethods}\nstatic renderClipJob(...args:any[]){return this.executeRenderClipJob(...args);}}}`);
const prelease=await load(fs.readFileSync('server/src/services/queue/renderPreleaseOutcome.ts','utf8').replace(/^import .*;\n/gm,''));
const retryHelpers=await load(fs.readFileSync('server/src/shared/renderRetryBudget.ts','utf8'));
const classifierMethods=methods('server/src/services/queue/jobReliabilityService.ts',['isTransientError','computeBackoffDelayMs']);
const {JobReliabilityService}=await load(`export class JobReliabilityService{${classifierMethods}\nstatic sanitizeErrorMessage(message:any){return String(message)}}`);
const jobId='55555555-5555-4555-8555-555555555555';
function setup({error=null,clip=null,preleaseFailures=0,queryThrows=null,jobFields={}}={}){
  const writes=[],scopes=[],events=[];
  const job={id:jobId,clip_id:'clip',user_id:'owner',status:'queued',attempts:0,max_attempts:3,worker_id:null,locked_at:null,prelease_failures:preleaseFailures,...jobFields};
  const db={collection:name=>{assert(['render_jobs','clips'].includes(name));return{findOne:async()=>job,updateOne:async(filter,update)=>{
   if(name==='clips'&&(!clip||clip.render_version!==filter.render_version||clip.editor_version!==filter.editor_version||clip.render_status!=='queued'||clip.editor_project_sync_pending))return{matchedCount:0};
   writes.push({filter,update});return{matchedCount:1};
  }}}};
  class AppError extends Error{constructor(message,statusCode,code){super(message);this.statusCode=statusCode;this.code=code;}}
  const d={...prelease,AppError,crypto:{randomBytes:()=>({toString:()=> 'fake'}),randomUUID:()=> 'attempt'},claimRenderLease:async()=>null,activeRenderSet:new Set(),workLifecycle:{isDraining:()=>false},isMongoConfigured:true,getMongoDb:async()=>db,getMongoClient:async()=>({startSession:()=>({withTransaction:async fn=>fn(),endSession:async()=>{}})}),recoverRenderQueue:async()=>{},renderOccupancy:()=>0,maxConcurrentRenders:()=>1,occupiedRenderClipIds:()=>[],renderBudgetAvailableExpr:retryHelpers.renderBudgetAvailableExpr,tryReserveRenderSlot:id=>{events.push(['reserve',id]);return true},ownerContext:{run:async(owner,fn)=>{scopes.push(owner);return fn()}},releaseRenderSlot:id=>events.push(['release',id]),logger:{warn:()=>{},error:()=>{}},JobReliabilityService,renderRetryBudget:retryHelpers.renderRetryBudget,runsBackgroundWorkers:runtimePolicy.runsBackgroundWorkers,notifyRenderCapacityAvailable:capacitySignal.notifyRenderCapacityAvailable,
    nextOwnerFairRenderJob:async(_db,now,{busyClipIds}={})=>{
      if((busyClipIds??[]).includes(job.clip_id))return null;
      if(job.status!=='queued'||job.worker_id!==null||job.locked_at!==null)return null;
      if(job.next_retry_at&&new Date(job.next_retry_at)>now)return null;
      return job;
    },
    dataRepository:{from:table=>{assert.equal(table,'clips');const q={select:()=>q,eq:(field,value)=>{scopes.push([field,value]);return q},maybeSingle:async()=>{if(queryThrows)throw queryThrows;return{data:clip,error}}};return q}},
  };
  const worker=make(d);return{worker,writes,scopes,events,run:()=>worker.processDueRenderJobs()};
}
test('actual worker preserves repository read failure instead of calling a clip missing',async()=>{
  const s=setup({error:{message:'Database operation failed.',code:'DATABASE_UNAVAILABLE'}});
  await assert.rejects(s.worker.executeRenderClipJob('clip','owner',jobId),{code:'DATABASE_UNAVAILABLE'});assert.deepEqual(s.writes,[]);
});
test('actual sweep schedules bounded pre-lease retry after worker database read failure, not permanent clip deletion failure',async()=>{
  const s=setup({error:{message:'Database operation failed.',code:'DATABASE_UNAVAILABLE'}});assert.equal(await s.run(),1);
  assert.equal(s.writes.length,1);const {filter,update}=s.writes[0];assert.equal(update.$set.status,undefined);assert(update.$set.next_retry_at instanceof Date);assert.equal(update.$set.prelease_failures,1);assert.equal(update.$set.attempts,undefined);
  assert.deepEqual(filter,{id:jobId,clip_id:'clip',user_id:'owner',status:'queued',worker_id:null,locked_at:null,prelease_failures:{$eq:0},attempts:{$eq:0},next_retry_at:{$eq:null}});assert(s.scopes.includes('owner'));assert.deepEqual(s.events,[['reserve','clip'],['release','clip']]);
});
test('a read error with no code receives the database-unavailable fallback and is retried',async()=>{
  const s=setup({error:{message:'read failed'}});await s.run();assert.equal(s.writes[0].update.$set.status,undefined);assert.equal(s.writes[0].update.$set.prelease_failures,1);
});
test('a confirmed missing clip remains permanent, with exact queued owner/lease filter',async()=>{
  const s=setup();await s.run();assert.equal(s.writes[0].update.$set.status,'failed');assert.equal(s.writes[0].update.$set.error_code,'CLIP_NOT_FOUND');assert.equal(s.writes[0].filter.user_id,'owner');assert.equal(s.writes[0].filter.status,'queued');assert.equal(s.writes[0].filter.worker_id,null);assert.equal(s.writes[0].filter.locked_at,null);
});
test('read outages cannot consume acquired-render attempts or retry indefinitely beyond the existing pre-lease budget',async()=>{
  const s=setup({error:{message:'offline',code:'DATABASE_UNAVAILABLE'},preleaseFailures:2});await s.run();assert.equal(s.writes[0].update.$set.status,'failed');assert.equal(s.writes[0].update.$set.error_code,'DATABASE_UNAVAILABLE');assert.equal(s.writes[0].update.$inc,undefined);
});
test('a repository promise rejection retains its original retry semantics rather than becoming not-found',async()=>{
  const s=setup({queryThrows:Object.assign(new Error('database unavailable'),{code:'DATABASE_UNAVAILABLE'})});await s.run();assert.equal(s.writes[0].update.$set.prelease_failures,1);assert.equal(s.writes[0].update.$set.status,undefined);
});

test('actual worker refuses stale revision-bound queued job instead of rebinding it to newer clip edits',async()=>{
 const s=setup({clip:{id:'clip',render_version:6,editor_version:10,render_status:'ready'},jobFields:{admission_version:1,render_version:5,editor_version:9}});
 await assert.rejects(s.worker.executeRenderClipJob('clip','owner',jobId),{code:'RENDER_INPUT_CHANGED'});assert.deepEqual(s.writes,[]);
 await assert.rejects(setup({clip:{id:'clip',render_version:6,editor_version:10,render_status:'ready'}}).worker.executeRenderClipJob('clip','owner','not-a-uuid'),{code:'RENDER_JOB_REQUIRED'});
});
test('sweep terminalizes a superseded queued admission only on its exact unclaimed owner job, preserving the newer clip',async()=>{
 const s=setup({clip:{id:'clip',render_version:6,editor_version:10,render_status:'ready'},jobFields:{admission_version:1,render_version:5,editor_version:9}});await s.run();assert.equal(s.writes.length,1);
 assert.equal(s.writes[0].update.$set.status,'failed');assert.equal(s.writes[0].update.$set.error_code,'RENDER_INPUT_CHANGED');assert.deepEqual(s.writes[0].filter,{id:jobId,clip_id:'clip',user_id:'owner',status:'queued',worker_id:null,locked_at:null,prelease_failures:{$eq:0},attempts:{$eq:0},next_retry_at:{$eq:null}});
});

test('incomplete editor save before claim uses bounded backoff instead of starving oldest-first queue',async()=>{
 const clip={id:'clip',render_status:'queued',editor_project_sync_pending:{id:'editor',version:8}};
 const first=setup({clip});await first.run();assert.equal(first.writes.length,1);assert.equal(first.writes[0].update.$set.prelease_failures,1);assert(first.writes[0].update.$set.next_retry_at instanceof Date);assert.equal(first.writes[0].update.$set.attempts,undefined);
 const exhausted=setup({clip,preleaseFailures:2});await exhausted.run();assert.equal(exhausted.writes[0].update.$set.status,'failed');assert.equal(exhausted.writes[0].update.$set.error_code,'EDITOR_SYNC_PENDING');
});
test('unclassified and numeric repository errors cannot leave queued jobs spinning without a budget',async()=>{
 for(const code of ['UNCLASSIFIED_DB_ERROR',91]){
  const first=setup({error:{message:'read unavailable',code}});await first.run();assert.equal(first.writes[0].update.$set.prelease_failures,1);assert.equal(first.writes[0].update.$set.status,undefined);
  const exhausted=setup({error:{message:'read unavailable',code},preleaseFailures:2});await exhausted.run();assert.equal(exhausted.writes[0].update.$set.status,'failed');assert.equal(exhausted.writes[0].update.$set.error_code,code);
 }
});
test('another active render defers the exact queued snapshot without consuming a pre-lease failure budget',async()=>{
 const s=setup({clip:{id:'clip',render_status:'rendering',updated_at:new Date().toISOString()}});await s.run();assert.equal(s.writes.length,1);
 const {filter,update}=s.writes[0];assert.deepEqual(filter,{id:jobId,clip_id:'clip',user_id:'owner',status:'queued',worker_id:null,locked_at:null,prelease_failures:{$eq:0},attempts:{$eq:0},next_retry_at:{$eq:null}});
 assert(update.$set.next_retry_at instanceof Date);assert.equal(update.$set.prelease_failures,undefined);assert.equal(update.$set.attempts,undefined);assert.equal(update.$set.status,undefined);
 assert.deepEqual(s.events,[['reserve','clip'],['release','clip']]);
});
test('missing authenticated owner scope remains an invariant error, not a failed queued render',async()=>{
 const s=setup({queryThrows:Object.assign(new Error('missing context'),{code:'AUTH_REQUIRED'})});await s.run();assert.equal(s.writes.length,0);
});

test('api-role deployments never sweep queued background work',async()=>{
 process.env.VIREO_SERVICE_ROLE='api';try{const s=setup();assert.equal(await s.run(),0);assert.deepEqual(s.writes,[]);assert.deepEqual(s.events,[]);}finally{delete process.env.VIREO_SERVICE_ROLE;}
});
test('legacy null or absent pre-lease count is set from the fenced snapshot, never incremented as null',async()=>{
 for(const preleaseFailures of [null,undefined]){const s=setup({error:{message:'offline',code:'DATABASE_UNAVAILABLE'},preleaseFailures,jobFields:{prelease_failures:preleaseFailures}});await s.run();const {filter,update}=s.writes[0];assert.deepEqual(filter.prelease_failures,{$eq:null});assert.equal(update.$set.prelease_failures,1);assert.equal(update.$inc,undefined);}
});
