import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync('src/services/clipRenderService.ts','utf8');
const ast=ts.createSourceFile('service.ts',source,ts.ScriptTarget.Latest,true);const methods=[];
function visit(n){if(ts.isMethodDeclaration(n)&&['renderClip','getPreviewUrl'].includes(n.name.getText(ast)))methods.push(n.getText(ast));ts.forEachChild(n,visit)}visit(ast);assert.equal(methods.length,2);
const js=ts.transpileModule(`export function make(backendRequest:any){const renderSubmissionRecovery={submit:async(clipId:any,options:any)=>{const data=await backendRequest('/clips/'+clipId+'/render',{method:"POST",body:JSON.stringify(options)});return data}};return new class{${methods.join('\n')}}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {make}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const receipt={status:'ok',clipId:'clip',jobId:'job',renderVersion:5,editorVersion:9};
test('render client returns the validated job and revision receipt rather than discarding it',async()=>{
 let request;const s=make(async(...args)=>{request=args;return receipt});assert.strictEqual(await s.renderClip('clip',{render_resolution:'720p'}),receipt);assert.equal(request[0],'/clips/clip/render');assert.equal(request[1].method,'POST');assert.deepEqual(JSON.parse(request[1].body),{render_resolution:'720p'});
});
test('receipt-bound preview reads encode the exact clip/job/revision preconditions',async()=>{
 let path;const s=make(async value=>{path=value;return{signedUrl:'signed-preview'}});assert.equal(await s.getPreviewUrl('clip',receipt),'signed-preview');const [base,query]=path.split('?');assert.equal(base,'/clips/clip/preview-url');assert.deepEqual(Object.fromEntries(new URLSearchParams(query)),{render_version:'5',editor_version:'9',job_id:'job'});
});
test('ordinary preview reads remain supported, but missing URLs are not returned as success',async()=>{
 let path;const s=make(async value=>{path=value;return{signedUrl:'saved-preview'}});assert.equal(await s.getPreviewUrl('clip'),'saved-preview');assert.equal(path,'/clips/clip/preview-url');
 for(const value of [null,{}, {signedUrl:''},{signedUrl:9}])await assert.rejects(()=>make(async()=>value).getPreviewUrl('clip'),/could not be verified/);
});
test('preview receipt for another clip is rejected before any request',async()=>{
 let calls=0;await assert.rejects(()=>make(async()=>{calls++}).getPreviewUrl('other',receipt),/different clip/);assert.equal(calls,0);
});
