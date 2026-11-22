/* Run: CHROME_PATH=/path/to/chrome node scripts/verify_project_detail_reads.cjs
 * Actual ProjectDetailPage and React Router, with isolated delayed service reads.
 * No live backend, credentials, provider requests or production-style verdicts.
 * Requires the existing dev dependencies. This does not download a browser.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { createRequire } = require('node:module');
const puppeteer = require('puppeteer-core');
let esbuild;
try { esbuild = require('esbuild'); }
catch { esbuild = createRequire(require.resolve('vite/package.json'))('esbuild'); }
const root = path.resolve(__dirname, '..');
const chrome = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(p => p && fs.existsSync(p));
if (!chrome) throw new Error('Set CHROME_PATH to an installed Chrome or Chromium executable.');
const temp = fs.mkdtempSync(path.join(process.env.VIREO_UI_TMPDIR || os.tmpdir(), 'vireo-project-reads-'));
const evidence = process.env.VIREO_UI_EVIDENCE_DIR;
const results = [];
let browser;
const stubs = {
  projectService: `export const projectService={getProject:()=>undefined,getOutputs:()=>[],fetchProject:id=>new Promise((resolve,reject)=>window.projectReads.push({id,resolve,reject})),fetchTranscript:id=>new Promise((resolve,reject)=>window.transcriptReads.push({id,resolve,reject})),fetchContentOutputs:async()=>[],startProcessing:async id=>{window.processingCalls.push(id);throw Error('Isolated processing stub')}};`,
  backendClient: `export const backendRequest=async()=>({signedUrl:null});`,
  AuthContext: `export const useAuth=()=>({creatorProfile:null});`,
};
for (const name of ['CreatorPersonaCard','GenerationProgress','SpotlightCard','QuotaExceededModal','ClipWorkspace','PublishModal','ProjectThumbImage']) stubs[name] = `export const ${name}=()=>null;`;
const pagePath = JSON.stringify(path.join(root, 'src/pages/ProjectDetailPage.tsx'));
const entry = `import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route,useNavigate}from'react-router-dom';import{ProjectDetailPage}from${pagePath};window.projectReads=[];window.transcriptReads=[];window.processingCalls=[];function Nav(){const n=useNavigate();window.navigateProject=id=>n('/project/'+id+'?review=transcript');return null}window.resolveProject=i=>{const q=window.projectReads[i];q.resolve({id:q.id,title:'Project '+q.id,status:'failed',video_status:'failed',source_type:'upload',source_url:null,error_code:'TRANSCRIPT_REVIEW_REQUIRED',created_at:'2026-01-01T00:00:00Z'})};window.resolveTranscript=i=>{const q=window.transcriptReads[i];q.resolve({id:'t-'+q.id,project_id:q.id,transcript_text:'Saved transcript for '+q.id,segments:[],language:'en',duration_seconds:10})};const Wrapper=location.search.includes('strict')?React.StrictMode:React.Fragment;createRoot(document.getElementById('root')).render(<Wrapper><MemoryRouter initialEntries={[location.search.includes('normal')?'/project/A':'/project/A?review=transcript']}><Nav/><Routes><Route path='/project/:id' element={<ProjectDetailPage/>}/></Routes></MemoryRouter></Wrapper>);`;
const uploaded = { id:'A',title:'Project A',status:'uploaded',video_status:'uploaded',source_type:'upload',source_url:'isolated-fixture.mp4',created_at:'2026-01-01T00:00:00Z' };
async function settle(p) { await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); }
async function count(p, key, n) { await p.waitForFunction((k, v) => window[k].length === v, { timeout: 5000 }, key, n); }
async function text(p, value) { await p.waitForFunction(s => document.body.innerText.includes(s), { timeout: 5000 }, value); }
async function click(p, label) { await p.evaluate(s => { const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===s); if(!b)throw Error('Button missing: '+s); b.click(); }, label); }
async function open(name, query = '') {
  const p = await browser.newPage();
  p.setDefaultTimeout(5000);
  p.setDefaultNavigationTimeout(5000);
  p.testErrors = [];
  p.on('pageerror', e => p.testErrors.push(String(e)));
  await p.setViewport({ width: 1000, height: 950 });
  await p.setRequestInterception(true);
  p.on('request', r => r.url().startsWith('file:') || r.url().startsWith('data:') ? r.continue() : r.abort());
  await p.goto(pathToFileURL(path.join(temp, 'index.html')).href + query);
  await count(p, 'projectReads', query.includes('strict') ? 2 : 1);
  p.caseName = name;
  return p;
}
async function finish(p, expectedCalls = 0) {
  await settle(p);
  assert.deepEqual(p.testErrors, [], p.caseName + ': unhandled browser error');
  assert.equal(await p.evaluate(() => window.processingCalls.length), expectedCalls, p.caseName + ': unexpected processing');
  assert(!(await p.evaluate(() => document.body.innerText)).includes('TEST_ONLY_INTERNAL_DETAIL'));
  if (evidence) await p.screenshot({ path: path.join(evidence, p.caseName + '.png'), fullPage: true });
  results.push({ name: p.caseName, passed: true, isolatedProcessingCalls: expectedCalls });
  await p.close();
}
(async () => {
  try {
    if (evidence) fs.mkdirSync(evidence, { recursive: true });
    await esbuild.build({ stdin:{contents:entry,loader:'tsx',resolveDir:root},nodePaths:[path.join(root,'node_modules')],bundle:true,platform:'browser',format:'iife',outfile:path.join(temp,'bundle.js'),plugins:[{name:'isolated-services',setup(b){b.onResolve({filter:/.*/},a=>{const k=a.path.split('/').pop().replace(/\.(ts|tsx)$/,'');if(a.importer.endsWith('ProjectDetailPage.tsx')&&stubs[k])return{path:k,namespace:'fixture'};});b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:stubs[a.path],loader:'tsx'}));}}] });
    fs.writeFileSync(path.join(temp,'index.html'),'<!doctype html><meta charset="utf-8"><style>body{font:15px system-ui;background:#15151d;color:#eee;padding:24px}svg{width:18px;height:18px}button,a{margin:4px;padding:8px}p{line-height:1.6}</style><div id="root"></div><script src="bundle.js"></script>');
    browser = await puppeteer.launch({ executablePath:chrome,headless:true,userDataDir:path.join(temp,'profile'),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--disable-component-update','--disk-cache-size=0','--renderer-process-limit=1'] });
    for (const kind of ['late-project','late-transcript']) {
      const p=await open(kind);
      if(kind==='late-transcript'){await p.evaluate(()=>window.resolveProject(0));await count(p,'transcriptReads',1);}
      await p.evaluate(()=>window.navigateProject('B'));await count(p,'projectReads',2);await p.evaluate(()=>window.resolveProject(1));await p.waitForFunction(()=>window.transcriptReads.some(q=>q.id==='B'));await p.evaluate(()=>window.resolveTranscript(window.transcriptReads.findIndex(q=>q.id==='B')));await text(p,'Saved transcript for B');
      if(kind==='late-project')await p.evaluate(()=>window.resolveProject(0));else await p.evaluate(()=>window.resolveTranscript(0));await settle(p);
      assert.equal(await p.$eval('h1',e=>e.textContent),'Project B');assert(!(await p.evaluate(()=>document.body.innerText)).includes('Saved transcript for A'));await finish(p);
    }
    {
      const p=await open('rapid-A-B-A');await p.evaluate(()=>window.navigateProject('B'));await count(p,'projectReads',2);await p.evaluate(()=>window.navigateProject('A'));await count(p,'projectReads',3);await p.evaluate(()=>window.resolveProject(2));await count(p,'transcriptReads',1);await p.evaluate(()=>window.resolveTranscript(0));await text(p,'Saved transcript for A');await p.evaluate(()=>{window.projectReads[0].resolve({id:'A',title:'Obsolete A',status:'failed',video_status:'failed',error_code:'TRANSCRIPT_REVIEW_REQUIRED'});window.resolveProject(1)});await settle(p);assert.equal(await p.$eval('h1',e=>e.textContent),'Project A');assert.equal(await p.evaluate(()=>window.transcriptReads.length),1);await finish(p);
    }
    {
      const p=await open('strict-effect-reads','?strict=1');await p.evaluate(()=>{window.resolveProject(0);window.resolveProject(1)});await count(p,'transcriptReads',1);await p.evaluate(()=>window.resolveTranscript(0));await text(p,'Saved transcript for A');await finish(p);
    }
    for (const kind of ['project-read-failure','transcript-read-failure','reload-uploaded-read-only','late-read-rejection']) {
      const p=await open(kind,kind==='reload-uploaded-read-only'?'?normal=1':'');
      if(kind==='transcript-read-failure'){await p.evaluate(()=>window.resolveProject(0));await count(p,'transcriptReads',1);await p.evaluate(()=>window.transcriptReads[0].reject(Error('TEST_ONLY_INTERNAL_DETAIL')));}
      else if(kind==='late-read-rejection'){await p.evaluate(()=>window.navigateProject('B'));await count(p,'projectReads',2);await p.evaluate(()=>window.resolveProject(1));await count(p,'transcriptReads',1);await p.evaluate(()=>window.resolveTranscript(0));await text(p,'Saved transcript for B');await p.evaluate(()=>window.projectReads[0].reject(Error('TEST_ONLY_INTERNAL_DETAIL')));await settle(p);assert.equal(await p.$eval('h1',e=>e.textContent),'Project B');assert.equal(await p.$('[role=alert]'),null);await finish(p);continue;}
      else await p.evaluate(()=>window.projectReads[0].reject(Error('TEST_ONLY_INTERNAL_DETAIL')));
      await p.waitForSelector('[role=alert]');assert(!(await p.evaluate(()=>document.body.innerText)).includes('Loading project details'));await click(p,'Retry loading');await count(p,'projectReads',2);
      if(kind==='reload-uploaded-read-only'){await p.evaluate(u=>window.projectReads[1].resolve(u),uploaded);await text(p,'Start Processing');await settle(p);assert.equal(await p.evaluate(()=>window.processingCalls.length),0);assert(!(await p.evaluate(()=>document.body.innerText)).includes('25%'));}
      else {await p.evaluate(()=>window.resolveProject(1));await count(p,'transcriptReads',kind==='transcript-read-failure'?2:1);await p.evaluate(()=>window.resolveTranscript(window.transcriptReads.length-1));await text(p,'Saved transcript for A');assert(!(await p.evaluate(()=>document.body.innerText)).includes('Retry Processing'));}
      assert.equal(await p.$('[role=alert]'),null);await finish(p);
    }
    for (const kind of ['ordinary-upload-auto-start','strict-upload-auto-start','manual-start-after-read-retry']) {
      const p=await open(kind,'?normal=1'+(kind==='strict-upload-auto-start'?'&strict=1':''));
      if(kind==='manual-start-after-read-retry'){await p.evaluate(()=>window.projectReads[0].reject(Error('Read fixture failure')));await p.waitForSelector('[role=alert]');await click(p,'Retry loading');await count(p,'projectReads',2);await p.evaluate(u=>window.projectReads[1].resolve(u),uploaded);await text(p,'Start Processing');await settle(p);assert.equal(await p.evaluate(()=>window.processingCalls.length),0);await click(p,'Start Processing');}
      else await p.evaluate(u=>window.projectReads.forEach(q=>q.resolve(u)),uploaded);
      await count(p,'processingCalls',1);await finish(p,1);
    }
    const report={scope:'Actual page and router with isolated service fixtures. No live backend, provider calls or production layout qualification.',cases:results};
    if(evidence)fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
  } finally {
    try { if(browser)await browser.close(); }
    finally { fs.rmSync(temp,{recursive:true,force:true}); }
  }
})().catch(error=>{console.error(error);process.exitCode=1});
