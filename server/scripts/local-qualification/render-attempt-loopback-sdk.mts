import http from'node:http';import fs from'node:fs';import crypto from'node:crypto';import assert from'node:assert/strict';
const root='/downloads/vireo-render-fence-0006';const objects=new Map<string,Buffer>();const events:any[]=[];
const server=http.createServer(async(req,res)=>{
 try{
  assert.equal(req.socket.remoteAddress,'127.0.0.1');const url=new URL(req.url!,'http://127.0.0.1');const key=decodeURIComponent(url.pathname);assert(key.startsWith('/isolated-clips/users/'));
  if(req.method==='PUT'){assert.match(req.headers.authorization||'',/^AWS4-HMAC-SHA256 /);const parts:Buffer[]=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;assert(bytes<=1024);parts.push(chunk);}const body=Buffer.concat(parts);objects.set(key,body);assert(objects.size<=2);events.push({method:'PUT',key,bytes});res.setHeader('ETag','"'+crypto.createHash('md5').update(body).digest('hex')+'"');res.end();}
  else if(req.method==='GET'){assert(url.searchParams.has('X-Amz-Signature'));const body=objects.get(key);assert(body);events.push({method:'GET',key,bytes:body.length});res.setHeader('Content-Length',body.length);res.setHeader('Content-Type','video/mp4');res.end(body);}
  else throw new Error('Unexpected method');
 }catch(e){res.statusCode=500;res.end('isolated test rejected request');}
});
await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();assert(address&&typeof address!=='string');const endpoint='http://127.0.0.1:'+address.port;
Object.assign(process.env,{NODE_ENV:'test',MONGODB_URI:'',MONGODB_DB_NAME:'',SUPABASE_URL:'http://127.0.0.1:5998',SUPABASE_SECRET_KEY:'local-test-fixture',R2_ACCOUNT_ID:'isolated',R2_ACCESS_KEY_ID:'isolated-dummy-not-a-secret',R2_SECRET_ACCESS_KEY:'isolated-dummy-not-a-secret',R2_ENDPOINT:endpoint,R2_SOURCE_BUCKET:'isolated-source',R2_CLIPS_BUCKET:'isolated-clips',OPENROUTER_API_KEY:'',GROQ_API_KEY:''});
try{
 const{uploadFile,renderAttemptObjectKey,signObjectGet}=await import('../../src/services/objectStorageService.js');const u=crypto.randomUUID(),p=crypto.randomUUID(),c=crypto.randomUUID();const oldKey=renderAttemptObjectKey(u,p,c,1,crypto.randomUUID()),newKey=renderAttemptObjectKey(u,p,c,1,crypto.randomUUID());assert.notEqual(oldKey,newKey);
 const newer=Buffer.alloc(1024,78),older=Buffer.alloc(1024,79);fs.writeFileSync(root+'/synthetic-new.bin',newer);fs.writeFileSync(root+'/synthetic-old.bin',older);
 const newReceipt=await uploadFile('clips',newKey,root+'/synthetic-new.bin',newer.length,'video/mp4');const oldReceipt=await uploadFile('clips',oldKey,root+'/synthetic-old.bin',older.length,'video/mp4');
 const get=async(key:string)=>{const signed=await signObjectGet('clips',key);assert.equal(new URL(signed).origin,endpoint);const response=await fetch(signed);assert.equal(response.status,200);return Buffer.from(await response.arrayBuffer());};
 const newRead=await get(newKey),oldRead=await get(oldKey);assert.deepEqual(newRead,newer);assert.deepEqual(oldRead,older);assert.equal(newReceipt.sha256,crypto.createHash('sha256').update(newRead).digest('hex'));assert.equal(oldReceipt.sha256,crypto.createHash('sha256').update(oldRead).digest('hex'));
 const result={actualAwsSdkAndUploadFile:true,loopbackOnly:true,realR2:false,actualMedia:false,checks:{distinctAttemptPaths:true,newAttemptUploadedFirst:true,lateOldUploadDoesNotOverwriteNewBytes:true,bothActualSignedGetRequestsReturnExactBytes:true,sha256ReceiptsMatchReadback:true},objects:objects.size,bytes:2048,events:events.map(x=>({method:x.method,bytes:x.bytes,attempt:x.key.includes(newKey)?'new':'old'}))};fs.writeFileSync(root+'/loopback-sdk-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
