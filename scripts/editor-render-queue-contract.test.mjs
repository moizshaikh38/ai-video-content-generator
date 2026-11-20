import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync('server/src/controllers/proEditorController.ts','utf8');
const ast=ts.createSourceFile('controller.ts',source,ts.ScriptTarget.Latest,true);let body;
function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='renderEditorProject')body=n.initializer.getText(ast);ts.forEachChild(n,visit);}visit(ast);assert(body);
const names=['closeSavedRenderSubmission','parseRenderSubmission','lookupRenderSubmission','assertRenderAdmissionEnabled','assertRenderPlanPreflight','isValidUUID','ProEditorService','assertPanelViewsAssigned','expandSceneLayoutProject','dataRepository','assertSelectionSourceCurrent','parseRenderResolutionStrict','launchInlineRender','sendSafeControllerError','enqueueRenderJob','editorRenderSnapshot'];
const js=ts.transpileModule(`export function make(d:any){const {${names}}=d;return ${body}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {make}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
function setup({recovered=null,submission=undefined,closeResult=null,requestBody={},gateError=null,readError=null,admissionError=null,policyError=null,clip={id:'clip',project_id:'source',render_version:4,editor_version:9}}={}){const events=[];let response,status,policyArgs,parseArgs;
const d={closeSavedRenderSubmission:async()=>closeResult,parseRenderSubmission:(...args)=>{parseArgs=args;return submission},lookupRenderSubmission:async()=>recovered,assertRenderAdmissionEnabled:()=>{if(gateError)throw gateError},assertRenderPlanPreflight:async(...args)=>{policyArgs=args;if(policyError)throw policyError;return {kind:'limited',maximum:10,displayName:'Free'}},isValidUUID:()=>true,ProEditorService:{getEditorProject:async()=>({id:'editor',clip_id:'clip',version:7,tracks:[]})},assertPanelViewsAssigned:()=>{},expandSceneLayoutProject:x=>x,assertSelectionSourceCurrent:async()=>{},parseRenderResolutionStrict:()=>null,editorRenderSnapshot:p=>({id:p.id,version:p.version,digest:'real helper separately tested'}),
 enqueueRenderJob:async input=>{events.push(['admit',input]);if(admissionError)throw admissionError;return{job:{id:'job',editor_version:9},renderVersion:5}},
 launchInlineRender:(...args)=>events.push(['launch',...args]),sendSafeControllerError:(res,error)=>res.status(error.statusCode||500).json({status:'error',code:error.code}),dataRepository:{from:table=>{assert.equal(table,'clips');const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:clip,error:readError}),update:()=>{throw Error('no standalone write')},insert:()=>{throw Error('no standalone write')}};return q}}};
const req={user:{id:'u',email:'owner@example.invalid'},params:{id:'editor'},body:requestBody};const res={status:n=>{status=n;return res},json:x=>{response=x;return res}};return{events,get parseArgs(){return parseArgs},get policyArgs(){return policyArgs},run:()=>make(d)(req,res),get status(){return status},get response(){return response}};}
test('Studio launch and202 follow a committed shared admission receipt',async()=>{const s=setup();await s.run();assert.equal(s.status,202);assert.equal(s.response.data.job_id,'job');assert.equal(s.response.data.render_version,5);assert.equal(s.response.data.editor_version,9);assert.equal(s.events[0][0],'admit');assert.deepEqual(s.events[1],['launch','clip','u','job']);});
test('Studio supplies the exact clip and editor revisions to the shared admission boundary',async()=>{const s=setup();await s.run();assert.deepEqual(s.events[0][1],{submission:undefined,clipId:'clip',userId:'u',quotaPolicy:{kind:'limited',maximum:10,displayName:'Free'},expectedRenderVersion:4,expectedEditorVersion:9,expectedEditorProject:{id:'editor',version:7,digest:'real helper separately tested'},settings:{}});});
test('Studio clip-read error is not mislabeled not-found and cannot admit',async()=>{const s=setup({readError:Error('offline'),clip:null});await s.run();assert.equal(s.status,500);assert.deepEqual(s.events,[]);});
test('confirmed missing Studio clip remains not-found',async()=>{const s=setup({clip:null});await s.run();assert.equal(s.status,404);assert.deepEqual(s.events,[]);});
test('Studio admission failure cannot launch fallback work',async()=>{const s=setup({admissionError:Error('insert or commit failed')});await s.run();assert.equal(s.status,500);assert.equal(s.events.length,1);});
test('Studio admission conflict remains409 without accepted response or launch',async()=>{const s=setup({admissionError:Object.assign(Error('changed'),{statusCode:409,code:'RENDER_INPUT_CHANGED'})});await s.run();assert.equal(s.status,409);assert.equal(s.response.code,'RENDER_INPUT_CHANGED');assert.equal(s.events.length,1);});

test('Studio checks saved-clip baseline plan policy under the authenticated owner before admitting',async()=>{const s=setup({clip:{id:'clip',project_id:'source',caption_style:'clean',render_version:4,editor_version:9}});await s.run();assert.deepEqual(s.policyArgs,['u','owner@example.invalid','clean']);assert.equal(s.status,202)});
test('Studio quota, baseline preset and plan-source failures cannot admit or launch',async()=>{
 for(const [statusCode,code] of [[403,'MONTHLY_RENDER_LIMIT_EXCEEDED'],[403,'PRESET_RESTRICTED'],[503,'RENDER_PLAN_UNAVAILABLE']]){const s=setup({policyError:Object.assign(Error('denied'),{statusCode,code})});await s.run();assert.equal(s.status,statusCode);assert.equal(s.response.code,code);assert.deepEqual(s.events,[]);}
});

test('closed deployment admission gate returns unavailable before policy/source/admission work',async()=>{
 const s=setup({gateError:Object.assign(Error('admission disabled'),{statusCode:503,code:'RENDER_ADMISSION_NOT_ENABLED'})});await s.run();assert.equal(s.status,503);assert.deepEqual(s.events,[]);
});

test('direct Studio keyed recovery returns its existing receipt before source/plan checks and the disabled gate',async()=>{
 const s=setup({requestBody:{submission_id:'key'},submission:{id:'key'},recovered:{job:{id:'original',editor_version:9},renderVersion:5},gateError:Error('closed'),policyError:Error('must not check')});await s.run();assert.equal(s.status,200);assert.equal(s.response.data.job_id,'original');assert.equal(s.response.data.replayed,true);assert.deepEqual(s.events,[]);assert.equal(s.policyArgs,undefined);
});
test('direct Studio lookup-only miss cannot queue absent work',async()=>{const s=setup({requestBody:{submission_id:'key',recover_only:true},submission:{id:'key'},gateError:Error('must not check')});await s.run();assert.equal(s.status,404);assert.equal(s.response.code,'RENDER_SUBMISSION_NOT_FOUND');assert.deepEqual(s.events,[])});
test('direct Studio close returns either the exact tombstone or admitted receipt without launch',async()=>{
 for(const closeResult of [{cancelled:true},{cancelled:false,receipt:{job:{id:'original',editor_version:9},renderVersion:5}}]){const s=setup({requestBody:{submission_id:'key',cancel_only:true},submission:{id:'key'},closeResult,gateError:Error('closed')});await s.run();assert.equal(s.status,200);assert.deepEqual(s.events,[]);if(closeResult.cancelled)assert.equal(s.response.cancelled,true);else assert.equal(s.response.data.job_id,'original');}
});
test('direct Studio keyed unsupported options and conflicting aliases cannot reach admission',async()=>{
 for(const extra of [{caption_enabled:false},{caption_style:'clean'},{platform:'social'},{resolution:'720p',render_resolution:'1080p'}]){const s=setup({requestBody:{submission_id:'key',...extra},submission:{id:'key'}});await s.run();assert.equal(s.status,400);assert.equal(s.response.code,'INVALID_RENDER_SUBMISSION');assert.deepEqual(s.events,[]);}
});
test('direct Studio fresh keyed admission pins the declared revisions; stale declarations cannot launch',async()=>{
 const submission={id:'key',expectedRenderVersion:4,expectedEditorVersion:9};const s=setup({requestBody:{submission_id:'key'},submission});await s.run();assert.equal(s.status,202);assert.strictEqual(s.events[0][1].submission,submission);
 const stale=setup({requestBody:{submission_id:'key'},submission:{...submission,expectedEditorVersion:8}});await stale.run();assert.equal(stale.status,409);assert.equal(stale.response.code,'RENDER_INPUT_CHANGED');assert.deepEqual(stale.events,[]);
});

test('direct Studio normalizes resolution aliases and binds the intent to the exact editor project',async()=>{
 const submission={id:'key',expectedRenderVersion:4,expectedEditorVersion:9};const s=setup({requestBody:{submission_id:'key',resolution:'720p'},submission});await s.run();assert.equal(s.parseArgs[0].render_resolution,'720p');assert.equal(s.parseArgs[0].resolution,undefined);assert.equal(s.parseArgs[1],'clip');assert.equal(s.parseArgs[2],'editor');
});

const serviceSource=fs.readFileSync('server/src/services/proEditorService.ts','utf8');const serviceAst=ts.createSourceFile('service.ts',serviceSource,ts.ScriptTarget.Latest,true);let getProjectMethod;
function serviceVisit(n){if(ts.isMethodDeclaration(n)&&n.name.getText(serviceAst)==='getEditorProject')getProjectMethod=n.getText(serviceAst);ts.forEachChild(n,serviceVisit)}serviceVisit(serviceAst);assert(getProjectMethod);
const serviceJs=ts.transpileModule(`export function makeService(d:any){const {AppError,isValidUUID,dataRepository}=d;return class ProEditorService{static async withSourceDuration(project:any){return project};${getProjectMethod}}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {makeService}=await import('data:text/javascript;base64,'+Buffer.from(serviceJs).toString('base64'));
test('owner project read outage is unavailable, not a false deletion during receipt recovery',async()=>{
 class AppError extends Error{constructor(message,statusCode,code){super(message);this.statusCode=statusCode;this.code=code;}}
 for(const error of [null,{message:'read unavailable',code:'DATABASE_UNAVAILABLE'}]){const s=makeService({AppError,isValidUUID:()=>true,dataRepository:{from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:null,error})};return q}}});await assert.rejects(()=>s.getEditorProject('editor','owner'),{statusCode:error?503:404,code:error?'DATABASE_UNAVAILABLE':'PROJECT_NOT_FOUND'});}
});
