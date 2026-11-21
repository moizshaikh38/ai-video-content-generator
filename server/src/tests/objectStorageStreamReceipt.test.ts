import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
const bytes=Buffer.from('synthetic source version A');
const hash=crypto.createHash('sha256').update(bytes).digest('hex');
test('actual storage downloader receipt fences without Mongo or external services',async(t)=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vireo-storage-offline-'));
 const counts=new Map<string,{head:number,get:number,ifMatch?:string}>();
 const server=http.createServer((req,res)=>{
  const key=(req.url||'').split('?')[0].split('/').pop()!;const state=counts.get(key)||{head:0,get:0};counts.set(key,state);
  if(req.method==='HEAD')state.head++;else {state.get++;state.ifMatch=req.headers['if-match'] as string;}
  const changed=key==='replace'&&state.get>0;
  const versionChanged=key==='version'&&state.get>0;
  if(key!=='missing')res.setHeader('ETag',key==='weak'?'W/"a"':changed?'"b"':'"a"');
  res.setHeader('x-amz-version-id',versionChanged?'v2':'v1');
  res.setHeader('Content-Length',key==='length'&&req.method==='HEAD'?bytes.length+1:bytes.length);
  res.end(req.method==='HEAD'?undefined:bytes);
 });
 t.after(async()=>{server.closeAllConnections();if(server.listening)await new Promise<void>(r=>server.close(()=>r()));fs.rmSync(dir,{recursive:true,force:true});});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const addr=server.address();assert(addr&&typeof addr!=='string');
 const {config}=await import('../config/index.js');Object.assign(config,{r2AccountId:'fixture',r2AccessKeyId:'fixture',r2SecretAccessKey:'fixture',r2SourceBucket:'source',r2Endpoint:`http://127.0.0.1:${addr.port}`});
 const {downloadObjectToFile}=await import('../services/objectStorageService.js');
 const run=(key:string,extra:Record<string,unknown>={})=>downloadObjectToFile('source',key,path.join(dir,key),{requireSnapshotReceipt:true,requireStreamingSha256:true,...extra});
 await t.test('stable receipt binds actual downloaded bytes and conditional GET',async()=>{const r=await run('stable');assert.equal(r.sha256,hash);assert.deepEqual(r.sourceReceipt,{key:'stable',size:bytes.length,etag:'"a"',sha256:hash});assert.equal(counts.get('stable')?.ifMatch,'"a"');assert.equal(counts.get('stable')?.head,2);});
 await t.test('same-length replacement after GET rejected',async()=>{await assert.rejects(run('replace'),{code:'SOURCE_VERSION_CHANGED'});});
 await t.test('version ID changes rejected even stable ETag and size',async()=>{await assert.rejects(run('version'),{code:'SOURCE_VERSION_CHANGED'});});
 await t.test('weak ETag cannot mint trusted receipt',async()=>{const r=await run('weak');assert.equal(r.sha256,hash);assert.equal(r.sourceReceipt,undefined);});
 await t.test('absent ETag cannot mint trusted receipt',async()=>{const r=await run('missing');assert.equal(r.sourceReceipt,undefined);});
 await t.test('expected output version fails before GET',async()=>{await assert.rejects(run('expected',{expectedObject:{size:bytes.length,etag:'"other"'}}),{code:'SOURCE_VERSION_CHANGED'});assert.equal(counts.get('expected')?.get,0);});
 await t.test('mismatched streamed byte count rejected',async()=>{await assert.rejects(run('length'),{code:'STORAGE_UNAVAILABLE'});});
});
