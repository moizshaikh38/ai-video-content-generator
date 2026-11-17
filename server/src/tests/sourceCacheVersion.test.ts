import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
test('normal source cache revalidates remote object and never reuses path-only content',async()=>{
 let body=Buffer.from('source A'),etag:string|undefined='"version-a"',gets=0,changeAfterGet=false;
 const server=http.createServer((req,res)=>{if(etag)res.setHeader('ETag',etag);res.setHeader('Content-Length',String(body.length));if(req.method==='HEAD'){res.end();return;}gets++;res.end(body);if(changeAfterGet)etag='"version-after-race"';});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');
 const {config}=await import('../config/index.js');Object.assign(config,{r2AccountId:'fixture',r2AccessKeyId:'fixture',r2SecretAccessKey:'fixture',r2SourceBucket:'source',r2Endpoint:`http://127.0.0.1:${address.port}`});
 const {ClipRenderService}=await import('../services/clipRenderService.js');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vireo-cache-version-')),key='fixture/'+crypto.randomUUID()+'.mp4';
 try{
  assert.equal(await ClipRenderService.ensureSourceVideo(key,path.join(dir,'one')),'downloaded');
  assert.equal(await ClipRenderService.ensureSourceVideo(key,path.join(dir,'two')),'cache_hit');assert.equal(gets,1);
  body=Buffer.from('source B');etag='"version-b"';
  assert.equal(await ClipRenderService.ensureSourceVideo(key,path.join(dir,'three')),'downloaded');assert.equal(fs.readFileSync(path.join(dir,'three'),'utf8'),'source B');assert.equal(gets,2);
  etag=undefined;await ClipRenderService.ensureSourceVideo(key,path.join(dir,'four'));await ClipRenderService.ensureSourceVideo(key,path.join(dir,'five'));assert.equal(gets,4);
  etag='"version-before-race"';changeAfterGet=true;
  await assert.rejects(()=>ClipRenderService.ensureSourceVideo(key,path.join(dir,'race')),(e:any)=>e.code==='SOURCE_VERSION_CHANGED');
  assert.equal(fs.existsSync(path.join(dir,'race')),false);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));fs.rmSync(dir,{recursive:true,force:true});}
});
