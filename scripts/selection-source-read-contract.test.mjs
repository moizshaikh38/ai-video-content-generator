import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const load=async source=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
const clean=path=>fs.readFileSync(path,'utf8').replace(/^import\b.*;\n/gm,'');
const binding=await load("import crypto from 'node:crypto';\n"+clean('server/src/shared/sourceObjectReceipt.ts')+clean('server/src/shared/transcriptSourceBinding.ts'));
const validTranscript={id:'transcript'};validTranscript.source_binding={version:1,source_receipt:{key:'source',size:12,etag:'same',sha256:'a'.repeat(64)},prepared_audio_sha256:'b'.repeat(64),requests:[{sha256:'b'.repeat(64),bytes:12,status:'completed'}],transcript_content_sha256:binding.transcriptContentIdentity(validTranscript)};
const guard=clean('server/src/services/selectionSourceGuardService.ts');
const reuse=clean('server/src/services/transcriptSourceBindingService.ts');
const {make}=await load(`export function make(d:any){const {dataRepository,ownerContext,AppError,selectionSourceReceiptMatches,headObject,assertTranscriptUsable,transcriptSourceBindingMatches,hasValidTranscriptSourceBinding}=d;${reuse.replace('export async function','async function')};${guard.replace('export async function','async function')};return {assertSelectionSourceCurrent,assertTranscriptReusable};}`);
class AppError extends Error{constructor(message,statusCode,code){super(message);this.statusCode=statusCode;this.code=code;}}
function fixture({projectError=null,transcriptError=null,project={source_url:'source'},transcript=structuredClone(validTranscript),receiptMatches=true,bindingMatches=true,storageError=null,qualityError=null,readReject=null}={}){
  const events=[];
  const functions=make({AppError,hasValidTranscriptSourceBinding:binding.hasValidTranscriptSourceBinding,ownerContext:{run:async(owner,fn)=>{events.push(['owner',owner]);return fn()}},
    dataRepository:{from:table=>{events.push(['read',table]);const q={select:()=>q,eq:(key,value)=>{events.push(['filter',table,key,value]);return q},maybeSingle:async()=>{if(readReject)throw readReject;return table==='projects'?{data:project,error:projectError}:{data:transcript,error:transcriptError}}};return q}},
    selectionSourceReceiptMatches:()=>{events.push('receipt');return receiptMatches},
    assertTranscriptUsable:()=>{events.push('quality');if(qualityError)throw qualityError},
    headObject:async(bucket,key)=>{events.push(['head',bucket,key]);if(storageError)throw storageError;return{size:12,etag:'same'}},
    transcriptSourceBindingMatches:()=>{events.push('binding');return bindingMatches},
  });
  return{events,run:()=>functions.assertSelectionSourceCurrent('owner','project',{version:1},'source'),reuse:()=>functions.assertTranscriptReusable(transcript,'source')};
}
test('project DB read failure is unavailable evidence, not a confirmed source mismatch',async()=>{
  const s=fixture({projectError:{message:'offline',code:'DATABASE_UNAVAILABLE'},project:null});await assert.rejects(s.run(),{code:'DATABASE_UNAVAILABLE'});
  assert(!s.events.includes('receipt'));assert(!s.events.some(e=>Array.isArray(e)&&e[0]==='head'));assert(!s.events.some(e=>Array.isArray(e)&&e[0]==='read'&&e[1]==='transcripts'));
});
test('transcript DB read failure is preserved before source matching or storage work',async()=>{
  const s=fixture({transcriptError:{message:'offline',code:'DATABASE_UNAVAILABLE'},transcript:null});await assert.rejects(s.run(),{code:'DATABASE_UNAVAILABLE'});assert(!s.events.includes('receipt'));assert(!s.events.includes('quality'));
});
test('returned database errors without codes have a retryable fallback rather than a stale-source claim',async()=>{
  for(const kind of ['projectError','transcriptError']){const s=fixture({[kind]:{message:'offline'}});await assert.rejects(s.run(),{code:'DATABASE_UNAVAILABLE'});assert(!s.events.includes('receipt'));}
});
test('known missing project or transcript still refuses with source review and no storage request',async()=>{
  for(const kind of ['project','transcript']){const s=fixture({[kind]:null});await assert.rejects(s.run(),{code:'TRANSCRIPT_SOURCE_REVIEW_REQUIRED'});assert(!s.events.some(e=>Array.isArray(e)&&e[0]==='head'));}
});
test('confirmed selection mismatch and clip-source mismatch still fail closed before storage or provider work',async()=>{
  for(const options of [{receiptMatches:false},{project:{source_url:'other-source'}}]){const s=fixture(options);await assert.rejects(s.run(),{code:'TRANSCRIPT_SOURCE_REVIEW_REQUIRED'});assert(!s.events.includes('quality'));assert(!s.events.some(e=>Array.isArray(e)&&e[0]==='head'));}
});
test('storage HEAD outage retains STORAGE_UNAVAILABLE, not a permanently stale transcript claim',async()=>{
  const s=fixture({storageError:new AppError('Storage is unavailable.',503,'STORAGE_UNAVAILABLE')});await assert.rejects(s.run(),{code:'STORAGE_UNAVAILABLE',statusCode:503});assert(s.events.includes('quality'));assert(!s.events.includes('binding'));
});
test('a successful HEAD with a genuinely mismatching binding still requires review',async()=>{
  const s=fixture({bindingMatches:false});await assert.rejects(s.run(),{code:'TRANSCRIPT_SOURCE_REVIEW_REQUIRED'});assert(s.events.includes('binding'));
});
test('transcript quality failure still stops before storage validation',async()=>{
  const s=fixture({qualityError:new AppError('Transcript needs review.',409,'TRANSCRIPT_REVIEW_REQUIRED')});await assert.rejects(s.run(),{code:'TRANSCRIPT_REVIEW_REQUIRED'});assert(!s.events.some(e=>Array.isArray(e)&&e[0]==='head'));
});
test('a supplied current receipt, usable transcript and matching HEAD still pass in exact owner scope',async()=>{
  const s=fixture();await s.run();assert(s.events.includes('binding'));assert.deepEqual(s.events.filter(e=>Array.isArray(e)&&e[0]==='head'),[['head','source','source']]);
  assert(s.events.some(e=>Array.isArray(e)&&e[0]==='filter'&&e[1]==='projects'&&e[2]==='user_id'&&e[3]==='owner'));
  assert(s.events.some(e=>Array.isArray(e)&&e[0]==='filter'&&e[1]==='transcripts'&&e[2]==='user_id'&&e[3]==='owner'));
});
test('repository promise rejections retain the original error and cannot start fallback work',async()=>{
  const error=new AppError('offline',503,'DATABASE_UNAVAILABLE'),s=fixture({readReject:error});await assert.rejects(s.run(),e=>e===error);assert(!s.events.includes('receipt'));assert(!s.events.includes('quality'));
});

const renderSource=fs.readFileSync('server/src/services/clipRenderService.ts','utf8'),renderAst=ts.createSourceFile('render.ts',renderSource,ts.ScriptTarget.Latest,true);let createCandidate;
function findCandidate(n){if(ts.isMethodDeclaration(n)&&n.name.getText(renderAst)==='createClipFromCandidate')createCandidate=n.getText(renderAst);ts.forEachChild(n,findCandidate)}findCandidate(renderAst);assert(createCandidate);
const {makeCandidate}=await load(`export function makeCandidate(d:any){const {AppError,isMongoConfigured,isValidUUID,dataRepository,assertSelectionSourceCurrent,createClipWithJob,launchInlineRender}=d;return class{${createCandidate}}}`);
function candidateFixture({error=null,data={metadata:{selection_source_receipt:{version:1}}},reject=null,replayed=false}={}){
 const events=[];const s=makeCandidate({AppError,isMongoConfigured:true,isValidUUID:()=>true,dataRepository:{from:()=>{const q={select:()=>q,eq:(key,value)=>{events.push(['scope',key,value]);return q},maybeSingle:async()=>{if(reject)throw reject;return{data,error}}};return q}},assertSelectionSourceCurrent:async()=>events.push('source'),createClipWithJob:async()=>{events.push('create');return{clip:{id:'clip',user_id:'owner'},renderJob:{id:'job'},replayed}},launchInlineRender:()=>events.push('launch')});
 return{events,run:()=>s.createClipFromCandidate('project','owner','candidate')};
}
test('initial candidate source-read failure is unavailable, not a source-mismatch diagnosis or a creation attempt',async()=>{
 for(const error of [{message:'offline',code:'DATABASE_UNAVAILABLE'},{message:'offline'}]){const s=candidateFixture({error,data:null});await assert.rejects(s.run(),{statusCode:503,code:'DATABASE_UNAVAILABLE'});assert(!s.events.includes('source'));assert(!s.events.includes('create'));assert(!s.events.includes('launch'));}
});
test('confirmed absent candidate remains not-found before source checks or creation',async()=>{const s=candidateFixture({data:null});await assert.rejects(s.run(),{statusCode:404,code:'CANDIDATE_NOT_FOUND'});assert(!s.events.includes('source'));assert(!s.events.includes('create'))});
test('candidate repository rejection preserves its error and never launches a fallback render',async()=>{const error=Error('offline'),s=candidateFixture({reject:error});await assert.rejects(s.run(),e=>e===error);assert(!s.events.includes('create'));assert(!s.events.includes('launch'))});
test('successful candidate source read remains owner/project/candidate scoped and launches only after creation',async()=>{const s=candidateFixture();await s.run();assert.deepEqual(s.events.filter(e=>typeof e==='string'),['source','create','launch']);assert(s.events.some(e=>Array.isArray(e)&&e[1]==='user_id'&&e[2]==='owner'));assert(s.events.some(e=>Array.isArray(e)&&e[1]==='project_id'&&e[2]==='project'));assert(s.events.some(e=>Array.isArray(e)&&e[1]==='id'&&e[2]==='candidate'))});

test('a concurrently recovered initial-creation receipt never relaunches its committed job',async()=>{const s=candidateFixture({replayed:true});await s.run();assert.deepEqual(s.events.filter(e=>typeof e==='string'),['source','create']);assert(!s.events.includes('launch'))});
test('missing local source binding refuses before storage even when HEAD would match',async()=>{const s=fixture({transcript:{id:'unbound'}});await assert.rejects(s.run(),{code:'TRANSCRIPT_SOURCE_REVIEW_REQUIRED'});assert(!s.events.some(e=>Array.isArray(e)&&e[0]==='head'));});
