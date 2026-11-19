import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync('src/components/clips/ClipWorkspace.tsx','utf8');
const ast=ts.createSourceFile('workspace.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const bodies={};
function visit(n){if(ts.isVariableDeclaration(n)&&['handleSearchMoments','handleClearSearch'].includes(n.name.getText(ast)))bodies[n.name.getText(ast)]=n.initializer.getText(ast);ts.forEachChild(n,visit);}visit(ast);
const names=['searchQuery','searchRequestRef','searchSequenceRef','setIsSearching','setSearchError','setSearchMoments','setSearchQuery','clipService','projectId'];
const js=ts.transpileModule(`export function make(d:any){const {${names}}=d;return{search:${bodies.handleSearchMoments},clear:${bodies.handleClearSearch}}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {make}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
function setup(){const events=[];const d={searchQuery:'goal',searchRequestRef:{current:null},searchSequenceRef:{current:0},setIsSearching:x=>events.push(['busy',x]),setSearchError:x=>events.push(['error',x]),setSearchMoments:x=>events.push(['moments',x]),setSearchQuery:x=>events.push(['query',x]),clipService:{findMoments:async()=>[{id:'moment'}]},projectId:'p'};return{d,events,h:make(d)};}
test('same-tick moment search submits once before state rerenders',async()=>{const s=setup();let resolve,calls=0;s.d.clipService.findMoments=()=>{calls++;return new Promise(r=>resolve=r)};const pending=s.h.search();await s.h.search();assert.equal(calls,1);resolve([]);await pending;assert.equal(s.d.searchRequestRef.current,null);});
test('clear does not allow a late result to resurrect cleared moments',async()=>{const s=setup();let resolve;s.d.clipService.findMoments=()=>new Promise(r=>resolve=r);const pending=s.h.search();s.h.clear();s.events.length=0;resolve([{id:'old'}]);await pending;assert.deepEqual(s.events,[]);});
test('old search failure does not replace a newer successful query',async()=>{const s=setup();let reject,calls=0;s.d.clipService.findMoments=()=>++calls===1?new Promise((_r,j)=>reject=j):Promise.resolve([{id:'new'}]);const old=s.h.search();s.h.clear();await s.h.search();s.events.length=0;reject(Error('old failure'));await old;assert.deepEqual(s.events,[]);});
test('navigation invalidation prevents old-project moments appearing',async()=>{const s=setup();let resolve;s.d.clipService.findMoments=()=>new Promise(r=>resolve=r);const pending=s.h.search();s.d.searchSequenceRef.current++;s.events.length=0;resolve([{id:'old'}]);await pending;assert.deepEqual(s.events,[]);});
