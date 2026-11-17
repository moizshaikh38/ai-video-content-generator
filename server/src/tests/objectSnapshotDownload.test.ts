import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
test('single stream download binds HEAD version and rejects silent short object',async()=>{
 let mode='normal';const seen:Array<string|undefined>=[];const bytes=Buffer.from('verified source bytes');
 const server=http.createServer((req,res)=>{
  res.setHeader('ETag','"version-a"');
  if(req.method==='HEAD'){res.setHeader('Content-Length',String(bytes.length));res.end();return;}
  seen.push(req.headers['if-match'] as string|undefined);
  if(mode==='replaced'){res.writeHead(412);res.end();return;}
  const body=mode==='short'?bytes.subarray(0,5):bytes;
  res.setHeader('Content-Length',String(body.length));res.end(body);
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');
 const {config}=await import('../config/index.js');Object.assign(config,{r2AccountId:'fixture',r2AccessKeyId:'fixture',r2SecretAccessKey:'fixture',r2SourceBucket:'source',r2Endpoint:`http://127.0.0.1:${address.port}`});
 const {downloadObjectToFile}=await import('../services/objectStorageService.js');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vireo-object-snapshot-'));
 try{
  const result=await downloadObjectToFile('source','same-key.mp4',path.join(dir,'normal'));
  assert.equal(result.sha256,crypto.createHash('sha256').update(bytes).digest('hex'));assert.equal(seen[0],'"version-a"');
  mode='replaced';await assert.rejects(()=>downloadObjectToFile('source','same-key.mp4',path.join(dir,'replaced')));
  mode='short';await assert.rejects(()=>downloadObjectToFile('source','same-key.mp4',path.join(dir,'short')));
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));fs.rmSync(dir,{recursive:true,force:true});}
});
