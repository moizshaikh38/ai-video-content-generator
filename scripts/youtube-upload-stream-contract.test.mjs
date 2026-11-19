import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';
import {finished} from 'node:stream/promises';
const source=fs.readFileSync('server/src/services/publishing/providers/youtubePublishingProvider.ts','utf8');
const ast=ts.createSourceFile('youtube.ts',source,ts.ScriptTarget.Latest,true);let method;
function visit(n){if(ts.isMethodDeclaration(n)&&n.name.getText(ast)==='publish')method=n.getText(ast);ts.forEachChild(n,visit)}visit(ast);assert(method);
class AppError extends Error{constructor(message,statusCode,code){super(message);this.statusCode=statusCode;this.code=code}}
const js=ts.transpileModule(`export function build(fs:any,fetch:any,AppError:any,finished:any){return new class{${method}}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {build}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
// Small disposable local bytes only. Every fetch below is an in-memory sink.
async function fixture(work){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vireo-upload-stream-'));try{const file=path.join(dir,'fixture.mp4');const data=Buffer.alloc(256*1024,42);fs.writeFileSync(file,data);await work(file,data)}finally{fs.rmSync(dir,{recursive:true,force:true})}}
const request=file=>({accessToken:'fixture-not-live',payload:{title:'Fixture'},mediaFilePath:file});
function filesystem(){const streams=[];return{streams,api:{existsSync:fs.existsSync,statSync:fs.statSync,readFileSync:()=>{throw Error('Whole-file buffering forbidden')},createReadStream:(...args)=>{const s=fs.createReadStream(...args);streams.push(s);return s}}}}
test('actual YouTube provider streams bounded chunks with content length and duplex rather than reading the whole file',async()=>fixture(async(file,data)=>{const f=filesystem();let calls=0,total=0,maxChunk=0;const hash=crypto.createHash('sha256');const provider=build(f.api,async(url,options)=>{calls++;if(calls===1)return{ok:true,headers:{get:()=> 'https://upload.invalid/fixture'}};assert.equal(url,'https://upload.invalid/fixture');assert.equal(options.method,'PUT');assert.equal(options.duplex,'half');assert.equal(options.headers['Content-Length'],String(data.length));assert(!Buffer.isBuffer(options.body));for await(const chunk of options.body){total+=chunk.length;maxChunk=Math.max(maxChunk,chunk.length);hash.update(chunk)}return{ok:true,json:async()=>({id:'fixture-video'})}},AppError,finished);const result=await provider.publish(request(file));assert.equal(result.providerPostId,'fixture-video');assert.equal(total,data.length);assert(maxChunk<=64*1024);assert.equal(hash.digest('hex'),crypto.createHash('sha256').update(data).digest('hex'));assert.equal(f.streams.length,1);assert(f.streams[0].destroyed)}));
test('upload network failure closes the stream and is not retried by the provider',async()=>fixture(async(file)=>{const f=filesystem();let calls=0;const error=Error('injected timeout');const provider=build(f.api,async()=>{if(++calls===1)return{ok:true,headers:{get:()=> 'https://upload.invalid/fixture'}};throw error},AppError,finished);await assert.rejects(provider.publish(request(file)),e=>e===error);assert.equal(calls,2);assert.equal(f.streams.length,1);assert(f.streams[0].destroyed)}));
test('provider HTTP rejection also closes the upload stream without another upload',async()=>fixture(async(file)=>{const f=filesystem();let calls=0;const provider=build(f.api,async()=>{if(++calls===1)return{ok:true,headers:{get:()=> 'https://upload.invalid/fixture'}};return{ok:false,text:async()=> 'fixture rejection'}},AppError,finished);await assert.rejects(provider.publish(request(file)),{code:'YOUTUBE_UPLOAD_FAILED'});assert.equal(calls,2);assert(f.streams[0].destroyed)}));
test('empty files and directories are refused before any provider request or stream allocation',async()=>fixture(async(file)=>{for(const target of [path.dirname(file),file]){if(target===file)fs.truncateSync(file);const f=filesystem();let calls=0;const provider=build(f.api,async()=>{calls++;throw Error('network forbidden')},AppError,finished);await assert.rejects(provider.publish(request(target)),{code:'MEDIA_FILE_INVALID'});assert.equal(calls,0);assert.equal(f.streams.length,0)}}));
