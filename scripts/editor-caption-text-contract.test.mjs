import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync('src/hooks/useEditorProject.ts','utf8');
const ast=ts.createSourceFile('editor.ts',source,ts.ScriptTarget.Latest,true),bodies={};
function visit(n){if(ts.isVariableDeclaration(n)&&['updateCueText','replaceWordGlobally'].includes(n.name.getText(ast)))bodies[n.name.getText(ast)]=n.initializer.arguments[0].getText(ast);ts.forEachChild(n,visit);}visit(ast);
const helperJs=ts.transpileModule(fs.readFileSync('server/src/shared/manualCaptionTextEdit.ts','utf8').replace("import {subtitleWordsMatchCue} from './subtitleWordClockReview.js';",fs.readFileSync('server/src/shared/subtitleWordClockReview.ts','utf8').replaceAll('export ','')),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {manualCaptionTextEdit}=await import('data:text/javascript;base64,'+Buffer.from(helperJs).toString('base64'));
const js=ts.transpileModule(`export function make(d:any){const {cues,setCues,updateProject,manualCaptionTextEdit}=d;return{edit:${bodies.updateCueText},replace:${bodies.replaceWordGlobally}}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {make}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
function setup({deferPanel=false,tokensOnly=false,sourceWords}={}){
  let panel=[{id:'cue',start:1,end:3,text:'old word',words:[{text:'old',start:1,end:2},{text:'word',start:2,end:3}]}];
  if(sourceWords!==undefined)panel[0].words=sourceWords;
  if(tokensOnly){panel[0].tokens=panel[0].words;delete panel[0].words;}
  let row={tracks:[{type:'CAPTION',items:[{id:'first',caption:{style:'clean',position:'center',cues:structuredClone(panel)}},{id:'deleted',caption:{cues:[],cues_covered_end:10}}]}]};
  const updates=[];const h=make({manualCaptionTextEdit,cues:panel,setCues:fn=>{if(deferPanel)updates.push(fn);else panel=fn(panel)},updateProject:fn=>row=fn(row)});
  return{h,get panel(){return panel},get row(){return row},flush:()=>{updates.splice(0).forEach(fn=>panel=fn(panel))}};
}
test('saved caption words do not depend on whether the panel state updater ran yet',()=>{
  const s=setup({deferPanel:true});s.h.edit('cue','new caption');
  const saved=s.row.tracks[0].items[0].caption;
  assert.deepEqual(saved.cues[0].words.map(w=>w.text),['new','caption']);
  s.flush();assert.deepEqual(saved.cues[0].words,s.panel[0].words);assert.equal(saved.position,'center');
});
test('clearing cue text clears saved highlight words instead of retaining the old speech',()=>{
  const s=setup();s.h.edit('cue','');const cue=s.row.tracks[0].items[0].caption.cues[0];assert.equal(cue.text,'');assert.equal(cue.words,undefined);assert.equal(cue.tokens,undefined);
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

test('count change and undo/save-reload keep explicit text/window, no guessed clocks or restored deleted items',()=>{const s=setup({deferPanel:true}),old=structuredClone(s.row);s.h.edit('cue','one longer edited sentence');const after=structuredClone(s.row);assert.equal(after.tracks[0].items[0].caption.cues[0].words,undefined);assert.equal(after.tracks[0].items[0].caption.cues[0].text,'one longer edited sentence');assert.equal(after.tracks[0].items[0].caption.cues[0].start,1);s.flush();assert.deepEqual(s.panel[0],after.tracks[0].items[0].caption.cues[0]);assert.deepEqual(JSON.parse(JSON.stringify(after)).tracks[0].items[0].caption.cues[0],JSON.parse(JSON.stringify(s.panel[0])));assert.equal(old.tracks[0].items[0].caption.cues[0].text,'old word');assert.deepEqual(old.tracks[0].items[1].caption.cues,[])});
test('samecount normal edit preserves original positional clocks rather than redistributing',()=>{const s=setup();const old=structuredClone(s.panel[0]);s.h.edit('cue','corrected speech');assert.deepEqual(s.panel[0].words.map(w=>[w.start,w.end]),old.words.map(w=>[w.start,w.end]));assert.equal(s.panel[0].words[0].confidence,undefined)});

test('actual Pro hook handles malformed clocks and word aliases without throwing or manufacturing',()=>{for(const words of[[null],[undefined],new Array(1),[5],['x'],[[1]],[{word:'old',start:1,end:2},{word:'word',start:2,end:3}]])for(const text of['Edited','A longer sentence']){const s=setup({sourceWords:words});s.h.edit('cue',text);assert.equal(s.panel[0].text,text);assert.equal(s.panel[0].words,undefined);assert.equal(s.row.tracks[0].items[0].caption.cues[0].words,undefined)}});

test('tokens-only actual Pro mapping fails closed on malformed and preserves compatible aliases',()=>{for(const words of[[null],[undefined],new Array(1),[5],['x'],[[1]],[{word:'old',start:1,end:2},{word:'word',start:2,end:3}]])for(const text of['Edited','A longer sentence','corrected speech']){const s=setup({sourceWords:words,tokensOnly:true});s.h.edit('cue',text);if(words.length===2&&text==='corrected speech'){assert.deepEqual(s.panel[0].words.map(w=>[w.start,w.end]),[[1,2],[2,3]])}else{assert.equal(s.panel[0].words,undefined);assert.equal(s.panel[0].tokens,undefined)}}});
