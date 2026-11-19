import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync('src/components/dashboard/HomeClippingWorkflow.tsx','utf8');
const ast=ts.createSourceFile('Home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let restore;
function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect'&&n.arguments[0]?.getText(ast).includes('localStorage.getItem(STORAGE_KEY)'))restore=n.arguments[0].getText(ast);ts.forEachChild(n,visit);}visit(ast);assert(restore);
const names=['localStorage','STORAGE_KEY','setActiveProjectId','setAspectRatio','setDurationPref','setCaptionsEnabled','loadSavedClipPreferences','setCaptionLang','setCustomInstructions','workflowSessionRef','projectService','handlePreferencesChange','setSelectedSource','setWorkflowState','setErrorMessage','setActiveProjectStatus','searchParams','loadResults','setClippingFailure','projectClippingFailure'];
const js=ts.transpileModule(`export function make(d:any){const {${names}}=d;return ${restore}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {make}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
function setup(){const events=[];let resolve,reject;const d={localStorage:{getItem:()=>JSON.stringify({projectId:'saved',timestamp:Date.now()}),removeItem:()=>events.push('remove')},STORAGE_KEY:'saved',setActiveProjectId:()=>{},setAspectRatio:()=>{},setDurationPref:()=>{},setCaptionsEnabled:()=>{},loadSavedClipPreferences:()=>({}),setCaptionLang:()=>{},setCustomInstructions:()=>{},workflowSessionRef:{current:0},projectService:{fetchProject:()=>new Promise((r,j)=>{resolve=r;reject=j})},handlePreferencesChange:()=>events.push('preferences'),setSelectedSource:x=>events.push(['source',x]),setWorkflowState:x=>events.push(['state',x]),setErrorMessage:x=>events.push(['error',x]),setActiveProjectStatus:()=>{},searchParams:new URLSearchParams('view=review'),loadResults:()=>events.push('results'),setClippingFailure:()=>events.push('failure'),projectClippingFailure:x=>x};return{d,events,run:make(d),resolve:x=>resolve(x),reject:x=>reject(x)};}
const settle=()=>new Promise(r=>setTimeout(r,0));
test('current saved-project restoration still restores source and loads review',async()=>{const s=setup();s.run();s.resolve({id:'saved',title:'Saved',status:'completed',clip_preferences:{}});await settle();assert(s.events.includes('results'));assert(s.events.some(e=>Array.isArray(e)&&e[0]==='source'&&e[1].projectId==='saved'));});
test('a late saved-project response cannot replace a manually chosen new source',async()=>{const s=setup();s.run();s.d.workflowSessionRef.current++;s.resolve({id:'saved',title:'Saved',status:'completed',clip_preferences:{}});await settle();assert.deepEqual(s.events,[]);});
test('a stale restore failure does not erase the newer persisted selection',async()=>{const s=setup();s.run();s.d.workflowSessionRef.current++;s.reject(Error('old unauthorized'));await settle();assert.deepEqual(s.events,[]);});
test('a current failed restore still removes its own unusable persistence entry',async()=>{const s=setup();s.run();s.reject(Error('failed'));await settle();assert.deepEqual(s.events,['remove']);});
