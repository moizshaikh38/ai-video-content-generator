import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync('server/src/services/clipRenderService.ts','utf8'),ast=ts.createSourceFile('service.ts',source,ts.ScriptTarget.Latest,true);let body;
function visit(n){if(ts.isMethodDeclaration(n)&&n.name.getText(ast)==='getSignedPreviewUrl')body=n.getText(ast);ts.forEachChild(n,visit)}visit(ast);assert(body);
const js=ts.transpileModule(`export function make(d:any){const {AppError,assertSelectionSourceCurrent,EntitlementService,WatermarkService,signObjectGet,enforceSavedRenderFreshness}=d;return class ClipRenderService{static async getClip(...args:any[]){return d.getClip(...args)};${body}}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {make}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const expected={renderVersion:5,editorVersion:9,jobId:'job'};
function setup(options={}){
 const calls=[];const clip={id:'clip',project_id:'source',source_storage_path:'source-object',output_storage_path:'versioned-output',render_status:'ready',render_version:5,editor_version:9,...options.clip,latest_job:options.noJob?null:{id:'job',clip_id:'clip',render_version:5,editor_version:9,status:'completed',...options.job}};
 class AppError extends Error{constructor(message,statusCode,code){super(message);this.statusCode=statusCode;this.code=code;}}
 const s=make({AppError,enforceSavedRenderFreshness:async()=>{calls.push(['freshness']);if(options.freshnessError)throw options.freshnessError},getClip:async(...args)=>{calls.push(['clip',...args]);return clip},assertSelectionSourceCurrent:async()=>{calls.push(['source']);if(options.sourceError)throw options.sourceError},EntitlementService:{resolveUserEntitlements:async(...args)=>{calls.push(['plan',...args]);return{}}},WatermarkService:{assertExportAccess:()=>calls.push(['watermark'])},signObjectGet:async(...args)=>{calls.push(['sign',...args]);return'preview-url'}});
 return{calls,run:(receipt=expected)=>s.getSignedPreviewUrl('clip','owner',receipt)};
}
test('preview signing uses the captured receipt-matching output snapshot',async()=>{
 const s=setup();const result=await s.run();assert.equal(result.signedUrl,'preview-url');assert.deepEqual(s.calls[0],['clip','clip','owner']);assert.deepEqual(s.calls.at(-1),['sign','clips','versioned-output']);
});
test('wrong clip/job/revision or non-completed job cannot sign any output for a receipt',async()=>{
 for(const options of [{clip:{render_version:6}},{clip:{editor_version:10}},{job:{id:'other'}},{job:{clip_id:'other'}},{job:{render_version:6}},{job:{editor_version:10}},{job:{status:'processing'}},{noJob:true}]){
  const s=setup(options);await assert.rejects(s.run(),{statusCode:409,code:'RENDER_INPUT_CHANGED'});assert(!s.calls.some(c=>c[0]==='sign'));
 }
});
test('receipt guard never bypasses ready-output, source or watermark preconditions',async()=>{
 for(const clip of [{render_status:'queued'},{output_storage_path:null}]){const s=setup({clip});await assert.rejects(s.run(),{code:'CLIP_NOT_READY'});assert(!s.calls.some(c=>c[0]==='sign'));}
 const sourceError=Object.assign(Error('source changed'),{code:'TRANSCRIPT_SOURCE_REVIEW_REQUIRED'});const s=setup({sourceError});await assert.rejects(s.run(),e=>e===sourceError);assert(!s.calls.some(c=>c[0]==='sign'));
});
test('ordinary preview reads without a receipt preserve their existing contract',async()=>{const s=setup({job:{render_version:undefined},clip:{editor_version:undefined}});assert.equal((await s.run(null)).signedUrl,'preview-url')});

const controllerSource=fs.readFileSync('server/src/controllers/clipController.ts','utf8');const controllerAst=ts.createSourceFile('controller.ts',controllerSource,ts.ScriptTarget.Latest,true);let initializer;
function controllerVisit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(controllerAst)==='getClipPreviewUrl')initializer=n.initializer.getText(controllerAst);ts.forEachChild(n,controllerVisit)}controllerVisit(controllerAst);assert(initializer);
const controllerJs=ts.transpileModule(`export function makeController(d:any){const {isValidUUID,ClipRenderService}=d;return ${initializer}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {makeController}=await import('data:text/javascript;base64,'+Buffer.from(controllerJs).toString('base64'));
function controllerSetup(query={}){let status,response;const calls=[];const run=makeController({isValidUUID:v=>v==='clip'||v==='job',ClipRenderService:{getSignedPreviewUrl:async(...args)=>{calls.push(args);return{signedUrl:'preview-url'}}}});const res={status:n=>{status=n;return res},json:value=>{response=value;return res}};return{calls,run:()=>run({user:{id:'owner'},params:{clipId:'clip'},query},res),get status(){return status},get response(){return response}};}
test('preview controller forwards only a complete valid receipt',async()=>{const s=controllerSetup({render_version:'5',editor_version:'9',job_id:'job'});await s.run();assert.equal(s.status,200);assert.deepEqual(s.calls,[['clip','owner',expected]])});
test('partial, array, non-integer, overflowing and malformed receipt queries cannot reach signer',async()=>{
 for(const query of [{render_version:'5'},{render_version:['5'],editor_version:'9',job_id:'job'},{render_version:'05',editor_version:'9',job_id:'job'},{render_version:'9007199254740992',editor_version:'9',job_id:'job'},{render_version:'5',editor_version:'0',job_id:'job'},{render_version:'5',editor_version:'9',job_id:'other'}]){const s=controllerSetup(query);await s.run();assert.equal(s.status,400);assert.equal(s.response.code,'INVALID_RENDER_RECEIPT');assert.equal(s.calls.length,0);}
});
test('preview controller keeps ordinary unpinned reads available',async()=>{const s=controllerSetup();await s.run();assert.equal(s.status,200);assert.deepEqual(s.calls,[['clip','owner',undefined]])});

test('preview signing cannot bypass an enabled ordinary freshness refusal',async()=>{
 const error=Object.assign(Error('provenance incomplete'),{code:'RENDER_FRESHNESS_UNVERIFIED',statusCode:409});const s=setup({freshnessError:error});await assert.rejects(s.run(),e=>e===error);assert(!s.calls.some(c=>c[0]==='sign'));
});
