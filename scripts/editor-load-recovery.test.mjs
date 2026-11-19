import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync('src/hooks/useEditorProject.ts', 'utf8');
const ast = ts.createSourceFile('editor.ts', source, ts.ScriptTarget.Latest, true);
let body;
function visit(n) { if (ts.isVariableDeclaration(n) && n.name.getText(ast) === 'loadData') body = n.initializer.arguments[0].getText(ast); ts.forEachChild(n, visit); }
visit(ast); assert(body);
const names = ['clipId','loadSequenceRef','localEditSequenceRef','activeClipIdRef','setLoading','setError','clipRenderService','proEditorService','setClip','setWatermarkRequired','setCleanSourceUrl','setRenderedPreviewUrl','setPreviewUrl','setCues','setTimingMode','healCaptionTracks','markDirty','mergeExtendedCues','setProject','setPersistedReframeSourceKey','editorReframeSourceKey','resetHistory','deriveCaptionCuesFromProject'];
const js = ts.transpileModule(`export function make(d:any){const {${names}}=d;return ${body}}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
let deriveBody;function findDerive(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='deriveCaptionCuesFromProject')deriveBody=n.getText(ast);ts.forEachChild(n,findDerive);}findDerive(ast);
const deriveJs=ts.transpileModule(deriveBody+';export {deriveCaptionCuesFromProject};',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {deriveCaptionCuesFromProject}=await import('data:text/javascript;base64,'+Buffer.from(deriveJs).toString('base64'));
const { make } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const helpers = await import('data:text/javascript;base64,' + Buffer.from(ts.transpileModule(fs.readFileSync('src/lib/captionExtendMerge.ts','utf8'), {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64'));
function data(id = 'c') { return { clip: { id }, editorProject: { id: 'editor:' + id, clip_id: id, tracks: [], canvas: { duration: 30 } } }; }
function setup() {
  const events = [], d = { deriveCaptionCuesFromProject, clipId: 'c', loadSequenceRef: { current: 0 }, localEditSequenceRef: { current: 0 }, activeClipIdRef: { current: 'c' }, clipRenderService: { getClipEditorData: async () => data(), getClipCaptions: async () => ({ cues: [], timingMode: 'segment' }) }, proEditorService: { getOrCreateEditorProject: async () => data().editorProject }, editorReframeSourceKey: () => 'key', healCaptionTracks: helpers.healCaptionTracks, mergeExtendedCues: helpers.mergeExtendedCues };
  for (const name of names.filter(n => n.startsWith('set') || ['resetHistory','markDirty'].includes(n))) d[name] = value => events.push([name, value]);
  return { d, events, run: make(d) };
}
test('current matching clip/editor response loads the editor document', async () => { const s = setup(); await s.run(); assert(s.events.some(e => e[0] === 'setProject' && e[1].clip_id === 'c')); });
test('older reload cannot overwrite a newer completed editor document', async () => {
  const s = setup(); let resolve, reads = 0;
  s.d.clipRenderService.getClipEditorData = () => ++reads === 1 ? new Promise(r => resolve = r) : Promise.resolve(data());
  const old = s.run(); await s.run(); s.events.length = 0; resolve(data()); await old; assert.deepEqual(s.events, []);
});
test('clip navigation invalidates pending load before any old clip publication', async () => {
  const s = setup(); let resolve; s.d.clipRenderService.getClipEditorData = () => new Promise(r => resolve = r);
  const old = s.run(); s.d.activeClipIdRef.current = 'new'; s.events.length = 0; resolve(data()); await old; assert.deepEqual(s.events, []);
});
test('silent render-completion reload cannot overwrite edits made while its read was pending', async () => {
  const s = setup(); let resolve; s.d.clipRenderService.getClipEditorData = () => new Promise(r => resolve = r);
  const old = s.run({ silent: true }); s.d.localEditSequenceRef.current++; s.events.length = 0; resolve(data()); await old; assert.deepEqual(s.events, []);
});
test('fallback initialization cannot publish half of a clip/editor pair', async () => {
  const s = setup(); let resolve; s.d.clipRenderService.getClipEditorData = async () => ({ clip: { id: 'c' } });
  s.d.proEditorService.getOrCreateEditorProject = () => new Promise(r => resolve = r);
  const old = s.run(); await new Promise(r => setTimeout(r, 0)); assert(!s.events.some(e => e[0] === 'setClip'));
  s.d.activeClipIdRef.current = 'new'; s.events.length = 0; resolve(data().editorProject); await old; assert.deepEqual(s.events, []);
});
test('wrong clip or editor project identity stops without publishing source/timeline state', async () => {
  for (const response of [data('other'), { ...data(), editorProject: data('other').editorProject }]) {
    const s = setup(); s.d.clipRenderService.getClipEditorData = async () => response; await s.run();
    assert(!s.events.some(e => ['setClip','setProject','setPreviewUrl'].includes(e[0]))); assert(s.events.some(e => e[0] === 'setError' && /did not match/.test(e[1])));
  }
});
test('late old-clip load errors cannot replace the new clip error/loading state', async () => {
  const s = setup(); let reject; s.d.clipRenderService.getClipEditorData = () => new Promise((_r,j) => reject = j);
  const old = s.run(); s.d.activeClipIdRef.current = 'new'; s.events.length = 0; reject(Error('old')); await old; assert.deepEqual(s.events, []);
});

function captionDataFixture(marker = 10) {
  const response=data();
  response.editorProject.tracks=[{id:'caption',type:'CAPTION',items:[{id:'cap-item',timeline_start:0,timeline_end:20,caption:{cues:[],cues_covered_end:marker}}]}];
  return response;
}
test('saved deletion of every caption stays deleted when reopening the editor',async()=>{
  const s=setup(),response=captionDataFixture();s.d.healCaptionTracks=helpers.healCaptionTracks;s.d.mergeExtendedCues=helpers.mergeExtendedCues;
  s.d.clipRenderService.getClipEditorData=async()=>response;
  s.d.clipRenderService.getClipCaptions=async()=>({timingMode:'segment',cues:[{id:'deleted',start:1,end:2,text:'deleted by user'}]});
  await s.run();const saved=s.events.find(e=>e[0]==='setProject')[1];
  assert.deepEqual(saved.tracks[0].items[0].caption.cues,[]);
  const writes=s.events.filter(e=>e[0]==='setCues');assert.deepEqual(writes.at(-1)[1],[]);
});

test('only newly extended speech is appended after an intentionally emptied caption span',async()=>{
  const s=setup(),response=captionDataFixture();s.d.healCaptionTracks=helpers.healCaptionTracks;
  s.d.clipRenderService.getClipEditorData=async()=>response;
  s.d.clipRenderService.getClipCaptions=async()=>({timingMode:'segment',cues:[{id:'deleted',start:1,end:2,text:'must stay deleted'},{id:'extended',start:11,end:12,text:'new speech'}]});
  await s.run();const saved=s.events.find(e=>e[0]==='setProject')[1];
  assert.deepEqual(saved.tracks[0].items[0].caption.cues.map(c=>c.id),['extended']);
  assert.deepEqual(s.events.filter(e=>e[0]==='setCues').at(-1)[1].map(c=>c.id),['extended']);
});
test('legacy uninitialized caption items can still receive their first caption cues',async()=>{
  const s=setup(),response=captionDataFixture();delete response.editorProject.tracks[0].items[0].caption.cues_covered_end;
  s.d.clipRenderService.getClipEditorData=async()=>response;
  s.d.clipRenderService.getClipCaptions=async()=>({cues:[{id:'initial',start:1,end:2,text:'initial'}]});
  await s.run();const saved=s.events.find(e=>e[0]==='setProject')[1];assert.equal(saved.tracks[0].items[0].caption.cues[0].id,'initial');
});
test('partial caption deletion stays deleted in both saved timeline and transcript panel after extension', async () => {
  const s=setup(),response=captionDataFixture();
  response.editorProject.tracks[0].items[0].caption.cues=[{id:'kept',start:1,end:2,text:'kept edit'}];
  response.editorProject.tracks[0].items[0].caption.position='center';
  s.d.clipRenderService.getClipEditorData=async()=>response;
  s.d.clipRenderService.getClipCaptions=async()=>({cues:[{id:'original',start:1,end:2,text:'original text'},{id:'deleted',start:5,end:6,text:'deleted'},{id:'extended',start:11,end:12,text:'new'}]});
  await s.run();const saved=s.events.find(e=>e[0]==='setProject')[1];
  const caption=saved.tracks[0].items[0].caption;
  assert.deepEqual(caption.cues.map(c=>c.id),['kept','extended']);assert.equal(caption.position,'center');
  assert.deepEqual(s.events.filter(e=>e[0]==='setCues').at(-1)[1].map(c=>c.id),['kept','extended']);
});

test('deleting the last legacy caption stamps coverage before its saved cues become empty',async()=>{
  let deleteBody;function findDelete(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='deleteCue')deleteBody=n.initializer.arguments[0].getText(ast);ts.forEachChild(n,findDelete);}findDelete(ast);
  const js=ts.transpileModule(`export function make(d:any){const {cues,setCues,deleteTimeRange,updateProject,initCoveredEnd}=d;return ${deleteBody}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  const {make:makeDelete}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
  let row=captionDataFixture().editorProject;delete row.tracks[0].items[0].caption.cues_covered_end;
  let cues=[{id:'last',start:1,end:7,text:'deleted'}];row.tracks[0].items[0].caption.cues=cues;
  makeDelete({cues,setCues:f=>cues=f(cues),deleteTimeRange:()=>{throw Error('not cutting media')},updateProject:f=>row=f(row),initCoveredEnd:helpers.initCoveredEnd})('last');
  assert.deepEqual(cues,[]);assert.deepEqual(row.tracks[0].items[0].caption.cues,[]);assert.equal(row.tracks[0].items[0].caption.cues_covered_end,7);
  const s=setup();s.d.clipRenderService.getClipEditorData=async()=>({...data(),editorProject:row});s.d.clipRenderService.getClipCaptions=async()=>({cues:[{id:'original',start:1,end:7,text:'must remain deleted'}]});
  await s.run();assert.deepEqual(s.events.find(e=>e[0]==='setProject')[1].tracks[0].items[0].caption.cues,[]);
});
