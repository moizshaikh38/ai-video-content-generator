import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync('src/components/clips/ClipWorkspace.tsx','utf8');
const ast=ts.createSourceFile('workspace.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let body;
function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='handleTogglePreview')body=n.initializer.getText(ast);ts.forEachChild(n,visit);}visit(ast);assert(body);
const js=ts.transpileModule(`export function make(d:any){const {previewSequenceRef,previewClipId,setPreviewClipId,previewUrls,clipRenderService,setPreviewUrls,alert}=d;return ${body}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {make}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
function setup(){let active=null,urls={};const events=[];const d={previewSequenceRef:{current:0},previewClipId:null,setPreviewClipId:x=>{active=x},previewUrls:{},clipRenderService:{getPreviewUrl:async id=>'url:'+id},setPreviewUrls:f=>urls=f(urls),alert:x=>events.push(x)};return{d,events,run:make(d),get active(){return active},get urls(){return urls}};}
test('last requested workspace clip preview wins, even if the older URL is slower',async()=>{const s=setup();let resolve;s.d.clipRenderService.getPreviewUrl=id=>id==='a'?new Promise(r=>resolve=r):Promise.resolve('url:b');const old=s.run('a');await s.run('b');resolve('url:a');await old;assert.equal(s.active,'b');assert.equal(s.urls.a,undefined);});
test('project/unmount invalidation suppresses an old preview completion',async()=>{const s=setup();let resolve;s.d.clipRenderService.getPreviewUrl=()=>new Promise(r=>resolve=r);const pending=s.run('a');s.d.previewSequenceRef.current++;resolve('url:a');await pending;assert.equal(s.active,null);assert.deepEqual(s.urls,{});});
test('stale preview errors do not interrupt the newer clip',async()=>{const s=setup();let reject;s.d.clipRenderService.getPreviewUrl=id=>id==='a'?new Promise((_r,j)=>reject=j):Promise.resolve('url:b');const old=s.run('a');await s.run('b');reject(Error('late failure'));await old;assert.deepEqual(s.events,[]);assert.equal(s.active,'b');});
