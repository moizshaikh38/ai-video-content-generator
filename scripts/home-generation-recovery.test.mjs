import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync('src/components/dashboard/HomeClippingWorkflow.tsx','utf8');
const ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const bodies={};
function visit(n){if(ts.isVariableDeclaration(n)&&['handleGenerateClips','cancelGeneration'].includes(n.name.getText(ast)))bodies[n.name.getText(ast)]=n.initializer.getText(ast);ts.forEachChild(n,visit);}visit(ast);
const names=['needsTranscriptReview','isSubmitting','abortControllerRef','selectedSource','isCreditEstimateLoading','creditEstimate','user','setErrorMessage','setWorkflowState','setIsSubmitting','setActiveProjectId','setActiveProjectStatus','setUploadProgress','setProcessingStageMessage','clipPreferences','captionsEnabled','captionLang','clipCount','projectService','setSelectedSource','uploadVideoFile','onRefreshProjects','handlePostProcessingReady','loadWalletBalance','setClippingFailure','crypto'];
const js=ts.transpileModule(`export function make(d:any){const {${names}}=d;return{generate:${bodies.handleGenerateClips},cancel:${bodies.cancelGeneration}}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {make}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
function setup(selectedSource={type:'url',url:'https://video.example.test/video',title:'test'}){
  const events=[],d={needsTranscriptReview:false,isSubmitting:false,abortControllerRef:{current:null},selectedSource,isCreditEstimateLoading:false,creditEstimate:{has_sufficient_credits:true},user:{id:'owner'},clipPreferences:{},captionsEnabled:true,captionLang:'en',clipCount:'auto',crypto:{randomUUID:()=> 'new-project'},projectService:{ingestProjectUrlAsync:async()=>{events.push('ingest');return{id:'p'}},startProcessing:async()=>events.push('start'),createProjectAsync:async()=>events.push('create'),fetchProject:async()=>({id:'p',status:'transcribed'}),updateProjectAsync:async()=>events.push('update')},uploadVideoFile:async()=>events.push('upload'),onRefreshProjects:()=>events.push('refresh'),handlePostProcessingReady:async()=>events.push('analyze'),loadWalletBalance:()=>events.push('wallet')};
  for(const key of names.filter(k=>k.startsWith('set')))d[key]=value=>events.push([key,value]);
  return{d,events,h:make(d)};
}
test('same-tick Generate clicks ingest once even before React updates isSubmitting',async()=>{
  const s=setup();let resolve,calls=0;s.d.projectService.ingestProjectUrlAsync=()=>{calls++;return new Promise(r=>resolve=r)};
  const first=s.h.generate();await s.h.generate();assert.equal(calls,1);resolve({id:'p'});await first;assert.equal(s.events.filter(e=>e==='start').length,1);
});
test('cancel during URL ingestion cannot start processing or restore the replaced selection',async()=>{
  const s=setup();let resolve;s.d.projectService.ingestProjectUrlAsync=()=>new Promise(r=>resolve=r);
  const first=s.h.generate();s.h.cancel();s.events.length=0;resolve({id:'old'});await first;
  assert.deepEqual(s.events,[]);assert.equal(s.d.abortControllerRef.current,null);
});
test('an older canceled request cannot clear a newer generation lock',async()=>{
  const s=setup();const resolvers=[];s.d.projectService.ingestProjectUrlAsync=()=>new Promise(r=>resolvers.push(r));
  const old=s.h.generate();s.h.cancel();const next=s.h.generate();const current=s.d.abortControllerRef.current;
  resolvers[0]({id:'old'});await old;assert.equal(s.d.abortControllerRef.current,current);
  resolvers[1]({id:'new'});await next;assert.equal(s.d.abortControllerRef.current,null);
});
test('canceled file-project creation cannot start upload or paid processing',async()=>{
  const s=setup({type:'file',file:{name:'source.mp4'},title:'source'});let resolve;s.d.projectService.createProjectAsync=()=>new Promise(r=>resolve=r);
  const first=s.h.generate();s.h.cancel();s.events.length=0;resolve();await first;
  assert(!s.events.includes('upload'));assert(!s.events.includes('start'));assert(!s.events.some(e=>Array.isArray(e)&&e[0]==='setSelectedSource'));
});
test('canceled existing-project read cannot update preferences or start analysis',async()=>{
  const s=setup({type:'project',projectId:'p',title:'source'});let resolve;s.d.projectService.fetchProject=()=>new Promise(r=>resolve=r);
  const first=s.h.generate();s.h.cancel();s.events.length=0;resolve({id:'p',status:'transcribed'});await first;
  assert(!s.events.includes('update'));assert(!s.events.includes('analyze'));
});
test('late canceled generation failures cannot replace the newer workflow with error',async()=>{
  const s=setup();let reject;s.d.projectService.ingestProjectUrlAsync=()=>new Promise((_r,j)=>reject=j);
  const first=s.h.generate();s.h.cancel();s.events.length=0;reject(Error('old failure'));await first;assert.deepEqual(s.events,[]);
});

test('an unavailable saved project cannot be treated as idle and sent for new processing',async()=>{const s=setup({type:'project',projectId:'p'});s.d.projectService.fetchProject=async()=>null;await s.h.generate();assert(!s.events.includes('update'));assert(!s.events.includes('start'));assert(s.events.some(e=>Array.isArray(e)&&e[0]==='setClippingFailure'));});
