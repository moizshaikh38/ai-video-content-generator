import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const load=source=>import('data:text/javascript;base64,'+Buffer.from(compile(source)).toString('base64'));
const snapshots=await load(fs.readFileSync('server/src/shared/editorRenderSnapshot.ts','utf8'));
const source=fs.readFileSync('server/src/services/renderFreshnessGuard.ts','utf8').replace(/^import .*;\n/gm,'');
const {make}=await load(`export function make(d:any){const {AppError,editorRenderSnapshot,getMongoDb,process}=d;${source.replace(/export /g,'')};return{assertSavedRenderCurrent,enforceSavedRenderFreshness};}`);
class AppError extends Error{constructor(message,statusCode,code){super(message);this.statusCode=statusCode;this.code=code;}}
function setup(options={}){
 const calls=[];const originalEditor={id:'editor',clip_id:'clip',user_id:'owner',version:7,canvas:{duration:24},tracks:[],settings:{}};
 const editor=options.noEditor?null:{...originalEditor,...options.editor};
 const saved=options.noEditor?null:snapshots.editorRenderSnapshot(originalEditor);
 const clip={id:'clip',user_id:'owner',project_id:'project',render_status:'ready',output_storage_path:'immutable-attempt-output',source_storage_path:'source-object',selection_source_receipt:{version:1},render_version:5,editor_version:9,...options.clip,latest_job:{id:'job',clip_id:'clip',user_id:'owner',status:'completed',render_version:5,editor_version:9,editor_project_snapshot:saved,...options.job}};
 const current={...clip,...options.current};
 const db={collection:table=>({findOne:async filter=>{calls.push([table,filter]);if(options.readError)throw options.readError;return table==='editor_projects'?editor:options.deleted?null:current}})};
 const f=make({AppError,...snapshots,getMongoDb:async()=>{calls.push(['db']);return db},process:{env:{VIREO_SAVED_RENDER_FRESHNESS_V1:options.flag}}});
 return{clip,calls,run:()=>f.assertSavedRenderCurrent(db,clip,'owner'),enforce:()=>f.enforceSavedRenderFreshness(clip,'owner')};
}
test('current rendered editor snapshot passes owner-scoped reads and final clip recheck',async()=>{const s=setup();await s.run();assert.deepEqual(s.calls,[['editor_projects',{clip_id:'clip',user_id:'owner'}],['clips',{id:'clip',user_id:'owner'}]])});
test('no-editor render with an explicit null snapshot is supported',async()=>{await setup({noEditor:true}).run()});
test('historical missing or malformed job provenance is explicitly unverified, never guessed current',async()=>{
 for(const job of [{render_version:undefined},{editor_version:undefined},{editor_project_snapshot:undefined},{editor_project_snapshot:{id:'editor',version:7,digest:'not-a-digest'}}]){const s=setup({job});await assert.rejects(s.run(),{statusCode:409,code:'RENDER_FRESHNESS_UNVERIFIED'});assert.equal(s.calls.length,0);}
});
test('different owner, job/clip binding, incomplete job and changed revisions cannot sign as current',async()=>{
 const foreign=setup({clip:{user_id:'other'}});await assert.rejects(foreign.run(),{statusCode:404,code:'CLIP_NOT_FOUND'});
 for(const job of [{user_id:'other'},{clip_id:'other'},{status:'processing'},{render_version:4},{editor_version:8}])await assert.rejects(setup({job}).run(),{statusCode:409,code:'RENDER_INPUT_CHANGED'});
});
test('render-affecting editor changes and a newly created editor invalidate the saved output',async()=>{
 for(const options of [{editor:{version:8}},{editor:{tracks:[{id:'changed'}]}},{job:{editor_project_snapshot:null}}]){const s=setup(options);await assert.rejects(s.run(),{code:'RENDER_INPUT_CHANGED'});assert.equal(s.calls.length,1);}
});
test('pending save or a change between editor and final clip read is rejected',async()=>{
 const pending=setup({clip:{editor_project_sync_pending:{id:'editor',version:8}}});await assert.rejects(pending.run(),{code:'RENDER_INPUT_CHANGED'});assert.equal(pending.calls.length,0);
 for(const current of [{editor_version:10},{render_version:6},{render_status:'queued'},{output_storage_path:'different-output'},{source_storage_path:'different-source'},{project_id:'different-project'},{selection_source_receipt:{version:2}},{editor_project_sync_pending:{id:'editor',version:8}}])await assert.rejects(setup({current}).run(),{code:'RENDER_INPUT_CHANGED'});
});
test('deletion or repository failure is not mistaken for trustworthy legacy provenance',async()=>{
 await assert.rejects(setup({deleted:true}).run(),{code:'CLIP_NOT_FOUND'});const error=Object.assign(Error('read unavailable'),{code:'DATABASE_UNAVAILABLE'});await assert.rejects(setup({readError:error}).run(),e=>e===error);
});
test('ordinary freshness enforcement defaults off and performs no database reads without exact opt-in',async()=>{
 for(const flag of [undefined,'','0','true',' 1','2']){const s=setup({flag,job:{editor_project_snapshot:undefined}});await s.enforce();assert.equal(s.calls.length,0);}
});
test('explicit opt-in invokes the real guard and retains historical-access refusal as a release decision',async()=>{
 const current=setup({flag:'1'});await current.enforce();assert.equal(current.calls[0][0],'db');assert.equal(current.calls.length,3);
 const legacy=setup({flag:'1',job:{editor_project_snapshot:undefined}});await assert.rejects(legacy.enforce(),{code:'RENDER_FRESHNESS_UNVERIFIED'});
});
const serviceSource=fs.readFileSync('server/src/services/clipRenderService.ts','utf8');const serviceAst=ts.createSourceFile('service.ts',serviceSource,ts.ScriptTarget.Latest,true);let download;
function visit(n){if(ts.isMethodDeclaration(n)&&n.name.getText(serviceAst)==='getSignedDownloadUrl')download=n.getText(serviceAst);ts.forEachChild(n,visit)}visit(serviceAst);assert(download);
const {makeDownload}=await load(`export function makeDownload(d:any){const {assertSelectionSourceCurrent,enforceSavedRenderFreshness,EntitlementService,WatermarkService,dataRepository,sanitizeFilename,signObjectGet}=d;return class ClipRenderService{static getClip(){return d.clip};${download}}}`);
test('direct download runs the separable freshness boundary before titles or object signing',async()=>{
 for(const refused of [false,true]){
  const calls=[];const error=Object.assign(Error('legacy provenance requires release review'),{statusCode:409,code:'RENDER_FRESHNESS_UNVERIFIED'});
  const s=makeDownload({clip:{id:'clip',render_status:'ready',output_storage_path:'captured-output',project_id:'project'},assertSelectionSourceCurrent:async()=>{},enforceSavedRenderFreshness:async()=>{calls.push('freshness');if(refused)throw error},EntitlementService:{resolveUserEntitlements:async()=>({})},WatermarkService:{assertExportAccess:()=>{}},dataRepository:{from:()=>{calls.push('title');const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{title:'saved'}})};return q}},sanitizeFilename:v=>v,signObjectGet:async(bucket,key)=>{calls.push(['sign',bucket,key]);return'download-url'}});
  if(refused){await assert.rejects(()=>s.getSignedDownloadUrl('clip','owner'),e=>e===error);assert.deepEqual(calls,['freshness']);}
  else{assert.equal((await s.getSignedDownloadUrl('clip','owner')).signedUrl,'download-url');assert.equal(calls[0],'freshness');assert.deepEqual(calls.at(-1),['sign','clips','captured-output']);}
 }
});

test('snapshot and source-receipt field order is not mistaken for a changed saved input',async()=>{
 const s=setup({clip:{selection_source_receipt:{version:1,source:{etag:'same',bytes:5}}},current:{selection_source_receipt:{source:{bytes:5,etag:'same'},version:1}}});const {digest,version,id}=s.clip.latest_job.editor_project_snapshot;s.clip.latest_job.editor_project_snapshot={digest,version,id};await s.run();
});
