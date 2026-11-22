/* Run with existing dev dependencies: node scripts/verify_project_service_scope.cjs
 * Exercises the real cache and auth-owner store with isolated delayed requests.
 * No backend, real account, user data or network access is used.
 */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');
let esbuild;try{esbuild=require('esbuild')}catch{esbuild=createRequire(require.resolve('vite/package.json'))('esbuild')}
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'vireo-service-scope-'));
const previous={window:globalThis.window,CustomEvent:globalThis.CustomEvent,fetch:globalThis.fetch,requests:globalThis.__vireoScopeRequests};
const results=[];let service,setOwner;
const A={id:'11111111-1111-4111-8111-111111111111',user_id:'scope-A',title:'Account A fixture',video_status:'completed',created_at:'2026-01-01T00:00:00Z'};
const B={...A,user_id:'scope-B',title:'Account B fixture'};
const output={id:'out-A',project_id:A.id,platform:'shorts',content_type:'caption',content:'Account A output fixture',position:0};
const requests=()=>globalThis.__vireoScopeRequests;
const settled=p=>p.then(value=>({value}),error=>({error}));
function changed(result){assert.equal(result.error?.code,'AUTH_CONTEXT_CHANGED');assert(!String(result.error?.message).includes('INTERNAL_A_DETAIL'))}
async function run(name,fn){setOwner('scope-A');service.clear();globalThis.__vireoScopeRequests=[];await fn();results.push({name,passed:true})}
(async()=>{try{
  globalThis.window=new EventTarget();globalThis.CustomEvent=class extends Event{constructor(type,options){super(type);this.detail=options?.detail}};
  globalThis.fetch=()=>{throw Error('Unexpected network access in cache qualification')};globalThis.__vireoScopeRequests=[];
  const entry=`export{projectService}from${JSON.stringify(path.join(root,'src/services/projectService.ts'))};export{setCurrentAuthOwner}from${JSON.stringify(path.join(root,'src/lib/authOwner.ts'))};`;
  await esbuild.build({stdin:{contents:entry,loader:'ts',resolveDir:root},bundle:true,platform:'node',format:'cjs',outfile:path.join(temp,'fixture.cjs'),plugins:[{name:'isolated-backend',setup(b){b.onResolve({filter:/backendClient$/},()=>({path:'backendClient',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const backendRequest=(path,options)=>new Promise((resolve,reject)=>globalThis.__vireoScopeRequests.push({path,options,resolve,reject}));',loader:'js'}));}}]});
  const fixture=require(path.join(temp,'fixture.cjs'));service=fixture.projectService;setOwner=fixture.setCurrentAuthOwner;
  for(const kind of ['list','detail']){
    await run(kind+'-clear-and-switch',async()=>{const old=settled(kind==='list'?service.fetchProjects('scope-A'):service.fetchProject(A.id));service.clear();setOwner('scope-B');const fresh=settled(kind==='list'?service.fetchProjects('scope-B'):service.fetchProject(A.id));assert.equal(requests().length,2);if(kind==='list')requests()[1].resolve({projects:[B]});else requests()[1].reject(Object.assign(Error('Not found'),{status:404}));requests()[0].resolve(kind==='list'?{projects:[A]}:{project:A});changed(await old);const current=await fresh;assert(!current.error);assert.deepEqual(kind==='list'?current.value.map(p=>p.user_id):current.value,kind==='list'?['scope-B']:null);assert(!service.getProjects().some(p=>p.user_id==='scope-A'))});
    await run(kind+'-old-finally-keeps-new-dedup',async()=>{const old=settled(kind==='list'?service.fetchProjects('scope-A'):service.fetchProject(A.id));service.clear();setOwner('scope-B');const fresh=settled(kind==='list'?service.fetchProjects('scope-B'):service.fetchProject(A.id));requests()[0].resolve(kind==='list'?{projects:[A]}:{project:A});changed(await old);const duplicate=settled(kind==='list'?service.fetchProjects('scope-B'):service.fetchProject(A.id));assert.equal(requests().length,2);requests()[1].resolve(kind==='list'?{projects:[B]}:{project:B});assert(!(await fresh).error);assert(!(await duplicate).error);assert.deepEqual(service.getProjects().map(p=>p.user_id),['scope-B'])});
    await run(kind+'-same-owner-dedup',async()=>{const first=settled(kind==='list'?service.fetchProjects('scope-A'):service.fetchProject(A.id));const second=settled(kind==='list'?service.fetchProjects('scope-A'):service.fetchProject(A.id));assert.equal(requests().length,1);setOwner('scope-A');requests()[0].resolve(kind==='list'?{projects:[A]}:{project:A});assert(!(await first).error);assert(!(await second).error);assert.deepEqual(service.getProjects().map(p=>p.user_id),['scope-A'])});
  }
  await run('clear-same-owner-invalidates-pending',async()=>{const old=settled(service.fetchProjects('scope-A'));service.clear();requests()[0].resolve({projects:[A]});changed(await old);assert.deepEqual(service.getProjects(),[])});
  await run('owner-switch-without-explicit-clear',async()=>{const old=settled(service.fetchProjects('scope-A'));setOwner('scope-B');const fresh=settled(service.fetchProjects('scope-B'));assert.equal(requests().length,2);requests()[1].resolve({projects:[B]});requests()[0].resolve({projects:[A]});changed(await old);assert(!(await fresh).error);assert.deepEqual(service.getProjects().map(p=>p.user_id),['scope-B'])});
  await run('signed-out-drops-pending-response',async()=>{const old=settled(service.fetchProject(A.id));setOwner(undefined);requests()[0].resolve({project:A});changed(await old);assert.deepEqual(service.getProjects(),[])});
  await run('getters-reset-completed-owner-data',async()=>{const p=service.fetchProject(A.id);requests()[0].resolve({project:A});await p;const o=service.fetchContentOutputs(A.id);requests()[1].resolve({outputs:[output]});await o;service.updateProfile({name:'Account A profile'});setOwner('scope-B');assert.deepEqual(service.getProjects(),[]);assert.equal(service.getProject(A.id),undefined);assert.deepEqual(service.getOutputs(A.id),[]);assert.notEqual(service.getProfile().name,'Account A profile')});
  for(const [name,call,response]of[
    ['transcript',()=>service.fetchTranscript(A.id),{transcript:{project_id:A.id,transcript_text:'Account A transcript'}}],
    ['content',()=>service.fetchContentOutputs(A.id),{outputs:[output]}],
    ['create',()=>service.createProjectAsync({id:A.id,title:A.title}),{project:A}],
    ['ingest',()=>service.ingestProjectUrlAsync({id:A.id,url:'https://example.invalid/isolated-fixture'}),{project:A}],
    ['update',()=>service.updateProjectAsync(A.id,{title:'Updated A fixture'}),{project:A}],
    ['delete',()=>service.deleteProject(A.id),{}],
    ['processing',()=>service.startProcessing(A.id),{}],
    ['generate-content',()=>service.generateContent(A.id),{outputs:[output]}],
    ['update-output',()=>service.updateOutputContentAsync(output.id,A.id,'Updated A output'),{}],
  ])await run(name+'-late-completion-is-rejected',async()=>{const old=settled(call());setOwner('scope-B');requests()[0].resolve(response);changed(await old);assert.deepEqual(service.getProjects(),[]);assert.deepEqual(service.getOutputs(A.id),[])});
  await run('stale-error-hides-prior-account-detail',async()=>{const old=settled(service.fetchProjects('scope-A'));setOwner('scope-B');requests()[0].reject(Error('INTERNAL_A_DETAIL'));changed(await old)});
  await run('current-account-errors-still-propagate',async()=>{const old=settled(service.fetchProjects('scope-A'));const error=Object.assign(Error('Current account read failed'),{status:503});requests()[0].reject(error);assert.equal((await old).error,error)});
  console.log(JSON.stringify({scope:'Actual ProjectService and auth-owner store. Delayed isolated requests only; no live accounts, backend mutation or network.',cases:results},null,2));
}finally{globalThis.window=previous.window;globalThis.CustomEvent=previous.CustomEvent;globalThis.fetch=previous.fetch;globalThis.__vireoScopeRequests=previous.requests;fs.rmSync(temp,{recursive:true,force:true})}})().catch(error=>{console.error(error);process.exitCode=1});
