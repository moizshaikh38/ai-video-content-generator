import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync('src/pages/HistoryPage.tsx','utf8');
const ast=ts.createSourceFile('History.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const bodies={};
function visit(n){if(ts.isVariableDeclaration(n)&&['handleOpenPreview','closePreview'].includes(n.name.getText(ast)))bodies[n.name.getText(ast)]=n.initializer.getText(ast);ts.forEachChild(n,visit);}visit(ast);
const code=ts.transpileModule(`export function make(d:any){const {previewReadSequenceRef,setActivePreviewClip,setPreviewSignedUrl,setPreviewError,clipRenderService}=d;return {open:${bodies.handleOpenPreview},close:${bodies.closePreview}}}`,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {make}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
function setup(){let clip=null,url=null,error=null;const d={previewReadSequenceRef:{current:0},setActivePreviewClip:x=>clip=x,setPreviewSignedUrl:x=>url=x,setPreviewError:x=>error=x,clipRenderService:{getPreviewUrl:async id=>'url:'+id}};return {d,h:make(d),get clip(){return clip},get url(){return url},get error(){return error}};}
test('slow preview A cannot show its video under preview B title',async()=>{const s=setup();let resolveA;s.d.clipRenderService.getPreviewUrl=id=>id==='a'?new Promise(r=>resolveA=r):Promise.resolve('url:b');const a=s.h.open({id:'a'});await s.h.open({id:'b'});resolveA('url:a');await a;assert.equal(s.clip.id,'b');assert.equal(s.url,'url:b');});
test('close invalidates a pending preview read',async()=>{const s=setup();let resolve;s.d.clipRenderService.getPreviewUrl=()=>new Promise(r=>resolve=r);const pending=s.h.open({id:'a'});s.h.close();resolve('url:a');await pending;assert.equal(s.clip,null);assert.equal(s.url,null);});
test('preview failure displays a recoverable error, never treats thumbnail image as video',async()=>{const s=setup();s.d.clipRenderService.getPreviewUrl=async()=>{throw Error('offline')};await s.h.open({id:'a',thumbnail_url:'image.jpg'});assert.equal(s.url,null);assert.match(s.error,/could not be loaded/);assert(!source.includes('setPreviewSignedUrl(clip.thumbnail_url'));});
test('old preview error does not replace newer successful preview state',async()=>{const s=setup();let reject;s.d.clipRenderService.getPreviewUrl=id=>id==='a'?new Promise((_r,j)=>reject=j):Promise.resolve('url:b');const a=s.h.open({id:'a'});await s.h.open({id:'b'});reject(Error('late'));await a;assert.equal(s.url,'url:b');assert.equal(s.error,null);});
