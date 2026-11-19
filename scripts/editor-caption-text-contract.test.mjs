import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync('src/hooks/useEditorProject.ts','utf8');
const ast=ts.createSourceFile('editor.ts',source,ts.ScriptTarget.Latest,true),bodies={};
function visit(n){if(ts.isVariableDeclaration(n)&&['updateCueText','replaceWordGlobally'].includes(n.name.getText(ast)))bodies[n.name.getText(ast)]=n.initializer.arguments[0].getText(ast);ts.forEachChild(n,visit);}visit(ast);
const js=ts.transpileModule(`export function make(d:any){const {cues,setCues,updateProject}=d;return{edit:${bodies.updateCueText},replace:${bodies.replaceWordGlobally}}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {make}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
function setup({deferPanel=false}={}){
  let panel=[{id:'cue',start:1,end:3,text:'old word',words:[{text:'old',start:1,end:2},{text:'word',start:2,end:3}]}];
  let row={tracks:[{type:'CAPTION',items:[{id:'first',caption:{style:'clean',position:'center',cues:structuredClone(panel)}},{id:'deleted',caption:{cues:[],cues_covered_end:10}}]}]};
  const updates=[];const h=make({cues:panel,setCues:fn=>{if(deferPanel)updates.push(fn);else panel=fn(panel)},updateProject:fn=>row=fn(row)});
  return{h,get panel(){return panel},get row(){return row},flush:()=>{updates.splice(0).forEach(fn=>panel=fn(panel))}};
}
test('saved caption words do not depend on whether the panel state updater ran yet',()=>{
  const s=setup({deferPanel:true});s.h.edit('cue','new caption');
  const saved=s.row.tracks[0].items[0].caption;
  assert.deepEqual(saved.cues[0].words.map(w=>w.text),['new','caption']);
  s.flush();assert.deepEqual(saved.cues[0].words,s.panel[0].words);assert.equal(saved.position,'center');
});
test('clearing cue text clears saved highlight words instead of retaining the old speech',()=>{
  const s=setup();s.h.edit('cue','');const cue=s.row.tracks[0].items[0].caption.cues[0];assert.equal(cue.text,'');assert.deepEqual(cue.words,[]);
});
test('editing another cue cannot repopulate an intentionally empty caption item',()=>{
  const s=setup();s.h.edit('cue','new');assert.deepEqual(s.row.tracks[0].items[1].caption.cues,[]);assert.equal(s.row.tracks[0].items[1].caption.cues_covered_end,10);
});
test('global replacement preserves literal dollar replacement text in panel and saved cues',()=>{
  const s=setup();s.h.replace('old','$&');assert.equal(s.panel[0].text,'$& word');assert.equal(s.row.tracks[0].items[0].caption.cues[0].text,'$& word');assert.equal(s.panel[0].words[0].text,'$&');
});
test('global replacement does not refill deliberately empty caption items',()=>{
  const s=setup();s.h.replace('old','new');assert.deepEqual(s.row.tracks[0].items[1].caption.cues,[]);
});
