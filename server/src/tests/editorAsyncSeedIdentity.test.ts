import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
const src=fs.readFileSync(new URL('../../../src/components/editor/EditorShell.tsx',import.meta.url),'utf8');
function setup(kind='split'){
 let resolve:any;const pending=new Promise<any>(r=>resolve=r),updates:any[]=[];
 const seedIdentityRef={current:{version:0}},splitSeedSequence={current:0},hookSeedSequence={current:0};
 const start=src.indexOf(kind==='split'?'  const seedSplitAnchorsFromAnalysis =':'  const seedHookPlacementFromAnalysis ='),end=src.indexOf(kind==='split'?'  // Face-safe hook placement:':'  // One-click output template:',start);
 const raw=src.slice(start,end),name=kind==='split'?'seedSplitAnchorsFromAnalysis':'seedHookPlacementFromAnalysis';const js=ts.transpileModule(raw+'\nreturn '+name+';',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const project:any={id:'A',tracks:[{type:'VIDEO',items:[{id:'video'}]}]};const fn=new Function('clip','project','seedIdentityRef','splitSeedSequence','hookSeedSequence','clipRenderService','onUpdateProject',js)({id:'A'},project,seedIdentityRef,splitSeedSequence,hookSeedSequence,{getClipReframe:()=>pending},(u:any)=>updates.push(u));return {fn,resolve,updates,project,seedIdentityRef,splitSeedSequence,hookSeedSequence};
}
const flush=()=>new Promise(r=>setImmediate(r));
for(const kind of ['split','hook']){
 test(kind+' late identity/ABA/unmount response cannot queue update',async()=>{for(const bump of [1,2]){const s=setup(kind);s.fn(3);s.seedIdentityRef.current.version+=bump;s.resolve({speaker1X:.2,speaker2X:.8,smoothedKeyframes:[{time:0,centerY:.2}]});await flush();assert.equal(s.updates.length,0)}});
 test(kind+' delayed project updater rechecks destination',async()=>{const s=setup(kind);s.fn(3);s.resolve({speaker1X:.2,speaker2X:.8,smoothedKeyframes:[{time:0,centerY:.2}]});await flush();assert.equal(s.updates.length,1);s.seedIdentityRef.current.version++;const other={id:'B'};assert.strictEqual(s.updates[0](other),other)});
 test(kind+' superseding same-identity seed discards older response',async()=>{const s=setup(kind);s.fn(3);if(kind==='split')s.splitSeedSequence.current++;else s.hookSeedSequence.current++;s.resolve({speaker1X:.2,speaker2X:.8,smoothedKeyframes:[{time:0,centerY:.2}]});await flush();assert.equal(s.updates.length,0)});
 test(kind+' current result preserves locks and edits only eligible controls',async()=>{const s=setup(kind);s.fn(3);s.resolve({speaker1X:.2,speaker2X:.8,smoothedKeyframes:[{time:0,centerY:.2}]});await flush();const type=kind==='split'?'VIDEO':'TEXT';const make=(id:string,locked=false)=>({id,locked,timeline_start:0,transform:{position_y:-240}});const locked=make('locked',true),free=make('free'),track={type,locked:true,items:[make('track')]};const p={tracks:[{type,items:[locked,free]},track]};const q=s.updates[0](p);assert.strictEqual(q.tracks[0].items[0],locked);assert.strictEqual(q.tracks[1],track);assert.notDeepEqual(q.tracks[0].items[1],free)});
}
