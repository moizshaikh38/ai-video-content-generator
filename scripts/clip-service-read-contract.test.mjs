import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
async function extract(file,method){const source=fs.readFileSync(file,'utf8');const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);let body;function visit(n){if(ts.isMethodDeclaration(n)&&n.name.getText(ast)===method)body=n.getText(ast);ts.forEachChild(n,visit);}visit(ast);assert(body);const js=ts.transpileModule(`export function make(backendRequest:any){return new class {${body}}()}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;return (await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))).make;}
for(const [file,method,field] of [['src/services/clipService.ts','getClipCandidates','candidates'],['src/services/clipRenderService.ts','getProjectClips','clips']]){const make=await extract(file,method);
 test(method+' preserves confirmed empty arrays',async()=>{const service=make(async()=>({status:'ok',projectId:'p',[field]:[]}));assert.deepEqual(await service[method]('p'),[]);});
 test(method+' returns saved data without changing it',async()=>{const rows=[{id:'saved',project_id:'p'}];const service=make(async()=>({status:'ok',projectId:'p',[field]:rows}));assert.equal(await service[method]('p'),rows);});
 test(method+' rejects missing/null/non-array responses rather than claiming no saved results',async()=>{for(const response of [null,undefined,{}, {[field]:null},{[field]:{}},{[field]:'invalid'}]){const service=make(async()=>response);await assert.rejects(()=>service[method]('p'),/could not be read/);}});
 test(method+' rejects another project response before exposing its rows',async()=>{const service=make(async()=>({status:'ok',projectId:'other',[field]:[{id:'saved',project_id:'other'}]}));await assert.rejects(()=>service[method]('p'),/could not be read/);});
 test(method+' rejects null, missing-id and wrong-project rows rather than partially trusting the list',async()=>{for(const row of [null,{}, {id:'',project_id:'p'}, {id:'saved',project_id:'other'}]){const service=make(async()=>({status:'ok',projectId:'p',[field]:[row]}));await assert.rejects(()=>service[method]('p'),/could not be read/);}});
 test(method+' preserves request failures for callers to handle',async()=>{const error=Object.assign(Error('unauthorized'),{status:401});const service=make(async()=>{throw error});await assert.rejects(()=>service[method]('p'),e=>e===error);});
}
