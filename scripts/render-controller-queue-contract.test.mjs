import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync('server/src/controllers/clipController.ts','utf8');
const ast=ts.createSourceFile('controller.ts',source,ts.ScriptTarget.Latest,true);let body;
function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='renderClip')body=n.initializer.getText(ast);ts.forEachChild(n,visit);}visit(ast);assert(body);
const names=['closeSavedRenderSubmission','parseRenderSubmission','lookupRenderSubmission','assertRenderAdmissionEnabled','isValidUUID','EntitlementService','getMongoDb','ClipRenderService','assertSelectionSourceCurrent','dataRepository','assertPanelViewsAssigned','expandSceneLayoutProject','isClipRenderActive','parseRenderResolutionStrict','launchInlineRender','enqueueRenderJob','editorRenderSnapshot'];
const js=ts.transpileModule(`export function make(d:any){const {${names}}=d;return ${body}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {make}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
function setup({closeResult=null,recovered=null,submission=undefined,gateError=null,admissionError=null,editorRow={id:'editor',version:7,tracks:[],updated_at:'saved'},editorReadError=null,body={}}={}){
 const events=[],editorReads=[];let response,status;
 const d={closeSavedRenderSubmission:async()=>closeResult,parseRenderSubmission:()=>submission,lookupRenderSubmission:async()=>recovered,assertRenderAdmissionEnabled:()=>{if(gateError)throw gateError},isValidUUID:()=>true,EntitlementService:{resolveUserEntitlements:async()=>({isUnlimited:true}),isPresetAllowed:()=>true},getMongoDb:()=>{throw Error('not used')},ClipRenderService:{getClip:async()=>({id:'clip',project_id:'p',render_version:4,editor_version:9})},assertSelectionSourceCurrent:async()=>{},assertPanelViewsAssigned:()=>{},expandSceneLayoutProject:x=>x,isClipRenderActive:()=>false,parseRenderResolutionStrict:r=>['1080p','720p'].includes(r)?r:null,
 launchInlineRender:(...args)=>events.push(['launch',...args]),editorRenderSnapshot:e=>e?{id:e.id,version:e.version,digest:'real helper separately tested'}:null,
 enqueueRenderJob:async input=>{events.push(['admit',input]);if(admissionError)throw admissionError;return{job:{id:'job',editor_version:9},renderVersion:5}},
 dataRepository:{from:table=>{assert.equal(table,'editor_projects');let selection;const q={select:s=>{selection=s;return q},eq:()=>q,maybeSingle:async()=>{editorReads.push(selection);return{data:editorReadError?null:editorRow,error:editorReadError}},update:()=>{throw Error('controller must not perform standalone writes')},insert:()=>{throw Error('controller must not perform standalone writes')}};return q}}};
 const req={user:{id:'u'},params:{clipId:'clip'},body};const res={status:n=>{status=n;return res},json:x=>{response=x;return res}};
 return{events,editorReads,req,run:()=>make(d)(req,res),get status(){return status},get response(){return response}};
}
test('Quick launches only the committed job receipt after shared admission',async()=>{const s=setup();await s.run();assert.equal(s.status,202);assert.equal(s.response.jobId,'job');assert.equal(s.response.renderVersion,5);assert.equal(s.response.editorVersion,9);assert.equal(s.events[0][0],'admit');assert.deepEqual(s.events[1],['launch','clip','u','job']);});
test('Quick sends exact clip/editor preconditions from the validated owner snapshot',async()=>{const s=setup();await s.run();assert.deepEqual(s.editorReads,['*']);assert.deepEqual(s.events[0][1],{submission:undefined,clipId:'clip',userId:'u',expectedRenderVersion:4,expectedEditorVersion:9,expectedEditorProject:{id:'editor',version:7,digest:'real helper separately tested'},settings:{}});});
test('Quick admission DB/commit failure cannot launch or return accepted',async()=>{const s=setup({admissionError:Error('transaction failed')});await s.run();assert.equal(s.status,500);assert.equal(s.events.length,1);});
test('Quick active admission conflict remains409 without a fallback launch',async()=>{const s=setup({admissionError:Object.assign(Error('already queued'),{statusCode:409,code:'RENDER_ALREADY_ACTIVE'})});await s.run();assert.equal(s.status,409);assert.equal(s.response.code,'RENDER_ALREADY_ACTIVE');assert.equal(s.events.length,1);});
test('editor read failure prevents transaction admission and launch',async()=>{const s=setup({editorReadError:Error('unavailable')});await s.run();assert.equal(s.status,500);assert.deepEqual(s.events,[]);});
test('requested caption and resolution settings enter the shared atomic boundary',async()=>{const s=setup({body:{caption_enabled:false,caption_style:'simple',render_resolution:'720p'}});await s.run();assert.deepEqual(s.events[0][1].settings,{caption_enabled:false,caption_style:'simple',render_resolution:'720p'});});
test('invalid resolution never reaches admission',async()=>{const s=setup({body:{resolution:'bad'}});await s.run();assert.equal(s.status,400);assert.deepEqual(s.events,[]);});

test('closed deployment admission gate returns unavailable before policy/source/admission work',async()=>{
 const s=setup({gateError:Object.assign(Error('admission disabled'),{statusCode:503,code:'RENDER_ADMISSION_NOT_ENABLED'})});await s.run();assert.equal(s.status,503);assert.deepEqual(s.events,[]);
});

test('durable receipt recovery precedes the closed rollout gate and never launches a second job',async()=>{
 const s=setup({gateError:Error('closed'),recovered:{job:{id:'original',editor_version:9},renderVersion:5,replayed:true}});await s.run();assert.equal(s.status,200);assert.equal(s.response.jobId,'original');assert.equal(s.response.replayed,true);assert.deepEqual(s.events,[]);assert.deepEqual(s.editorReads,[]);
});

test('lookup-only recovery miss cannot pass the gate or admit absent work',async()=>{const s=setup({submission:{id:'key'},gateError:Error('must not run')});s.req.body.recover_only=true;await s.run();assert.equal(s.status,404);assert.equal(s.response.code,'RENDER_SUBMISSION_NOT_FOUND');assert.deepEqual(s.events,[]);assert.deepEqual(s.editorReads,[])});

test('explicit close acknowledges only a tombstone and never launches new work',async()=>{const s=setup({submission:{id:'key'},closeResult:{cancelled:true,submissionId:'key'}});s.req.body.cancel_only=true;await s.run();assert.equal(s.status,200);assert.equal(s.response.cancelled,true);assert.deepEqual(s.events,[])});
test('explicit close of an already admitted request returns the existing receipt without cancelling or relaunching',async()=>{const s=setup({submission:{id:'key'},closeResult:{cancelled:false,receipt:{job:{id:'original',editor_version:9},renderVersion:5}}});s.req.body.cancel_only=true;await s.run();assert.equal(s.status,200);assert.equal(s.response.jobId,'original');assert.equal(s.response.replayed,true);assert.deepEqual(s.events,[])});
