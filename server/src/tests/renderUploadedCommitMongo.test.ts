import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
process.env.NODE_ENV='test';process.env.MONGODB_DB_NAME='vireo_uploaded_commit_'+process.pid;
const {config}=await import('../config/index.js');
const {getMongoClient,getMongoDb,closeMongo}=await import('../db/mongoClient.js');
const {commitUploadedRenderOutcome}=await import('../services/queue/renderUploadedCommit.js');
const {deleteClipRecords}=await import('../db/repositories/deletionRepository.js');
const {renderAttemptObjectKey}=await import('../services/objectStorageService.js');
const deleted:string[]=[];let deny=false;
const server=http.createServer((req,res)=>{let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{assert.equal(req.method,'POST');const key=body.match(/<Key>(.*?)<\/Key>/)?.[1];assert(key);if(!deny)deleted.push(key);res.setHeader('Content-Type','application/xml');res.end('<DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">'+(deny?'<Error><Key>'+key+'</Key><Code>AccessDenied</Code></Error>':'')+'</DeleteResult>');});});
await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
Object.assign(config,{r2AccountId:'fixture',r2AccessKeyId:'fixture',r2SecretAccessKey:'fixture',r2Endpoint:'http://127.0.0.1:'+(server.address() as any).port,r2ClipsBucket:'clips'});
after(async()=>{await closeMongo();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));});
async function fixture(run:(f:any)=>Promise<void>){
 const db=await getMongoDb(),client=await getMongoClient(),userId=crypto.randomUUID(),clipId=crypto.randomUUID(),projectId=crypto.randomUUID(),jobId=crypto.randomUUID(),workerId=crypto.randomUUID(),attemptId=crypto.randomUUID();
 const identity={userId,clipId,jobId,workerId,renderVersion:1,editorVersion:1};const objectKey=renderAttemptObjectKey(userId,projectId,clipId,1,attemptId);const attempt={projectId,attemptId,objectKey};
 const outcome={job:{status:'completed',worker_id:null},clip:{render_status:'ready',output_storage_path:objectKey}};
 await db.collection('clips').insertOne({id:clipId,user_id:userId,project_id:projectId,render_version:1,editor_version:1,render_status:'rendering'});
 await db.collection('render_jobs').insertOne({id:jobId,clip_id:clipId,user_id:userId,worker_id:workerId,status:'processing'});
 const before=deleted.length;
 try{await run({db,client,identity,attempt,outcome,before,commit:()=>commitUploadedRenderOutcome(client,db,identity,outcome,attempt)});}finally{deny=false;for(const name of ['projects','clips','render_jobs'])await db.collection(name).deleteMany({user_id:userId});}
}
test('deleted clip: definitive publication refusal deletes only own late uploaded attempt',()=>fixture(async f=>{
 await deleteClipRecords(f.identity.userId,f.identity.clipId);await assert.rejects(f.commit,{code:'FENCING_TOKEN_MISMATCH'});assert.deepEqual(deleted.slice(f.before),[f.attempt.objectKey]);assert.equal(await f.db.collection('clips').countDocuments({user_id:f.identity.userId}),0);
}));
test('changed revision aborts publication and removes stale attempt without changing newer clip',()=>fixture(async f=>{
 await f.db.collection('clips').updateOne({id:f.identity.clipId},{$set:{render_version:2,output_storage_path:'current-output'}});await assert.rejects(f.commit,{code:'RENDER_INPUT_CHANGED'});assert.deepEqual(deleted.slice(f.before),[f.attempt.objectKey]);assert.equal((await f.db.collection('clips').findOne({id:f.identity.clipId})).output_storage_path,'current-output');assert.equal((await f.db.collection('render_jobs').findOne({id:f.identity.jobId})).status,'processing');
}));
test('successful publication preserves uploaded object',()=>fixture(async f=>{await f.commit();assert.equal(deleted.length,f.before);assert.equal((await f.db.collection('clips').findOne({id:f.identity.clipId})).output_storage_path,f.attempt.objectKey);}));
test('definitive refusal still preserves any currently referenced object',()=>fixture(async f=>{await f.db.collection('clips').updateOne({id:f.identity.clipId},{$set:{output_storage_path:f.attempt.objectKey}});await f.db.collection('render_jobs').deleteOne({id:f.identity.jobId});await assert.rejects(f.commit,{code:'FENCING_TOKEN_MISMATCH'});assert.equal(deleted.length,f.before);}));
test('completed job conservatively preserves bytes even if clip reference is absent',()=>fixture(async f=>{await f.db.collection('render_jobs').updateOne({id:f.identity.jobId},{$set:{status:'completed'}});await assert.rejects(f.commit,{code:'FENCING_TOKEN_MISMATCH'});assert.equal(deleted.length,f.before);}));
test('unknown transaction error never deletes an ambiguously published object',()=>fixture(async f=>{const client={startSession(){throw Error('unknown transaction outcome');}};await assert.rejects(()=>commitUploadedRenderOutcome(client as any,f.db,f.identity,f.outcome,f.attempt),/unknown transaction outcome/);assert.equal(deleted.length,f.before);}));
test('storage cleanup denial preserves original publication failure rather than claiming cleanup success',()=>fixture(async f=>{deny=true;await deleteClipRecords(f.identity.userId,f.identity.clipId);await assert.rejects(f.commit,{code:'FENCING_TOKEN_MISMATCH'});assert.equal(deleted.length,f.before);}));
test('mismatched attempt identity never commits or deletes another object',()=>fixture(async f=>{await assert.rejects(()=>commitUploadedRenderOutcome(f.client,f.db,f.identity,f.outcome,{...f.attempt,objectKey:'other-object'}),/identity does not match/);assert.equal(deleted.length,f.before);assert.equal((await f.db.collection('render_jobs').findOne({id:f.identity.jobId})).status,'processing');}));

test('project deleted after upload: actual source validation rejection removes only unpublished attempt',()=>fixture(async f=>{
 const {deleteProjectRecords}=await import('../db/repositories/deletionRepository.js');
 const {assertSelectionSourceCurrent}=await import('../services/selectionSourceGuardService.js');
 await f.db.collection('projects').insertOne({id:f.attempt.projectId,user_id:f.identity.userId});
 await deleteProjectRecords(f.identity.userId,f.attempt.projectId);
 const attempt={...f.attempt,validateSource:()=>assertSelectionSourceCurrent(f.identity.userId,f.attempt.projectId,null,'deleted-source')};
 await assert.rejects(()=>commitUploadedRenderOutcome(f.client,f.db,f.identity,f.outcome,attempt),{code:'TRANSCRIPT_SOURCE_REVIEW_REQUIRED'});
 assert.deepEqual(deleted.slice(f.before),[f.attempt.objectKey]);
 assert.equal(await f.db.collection('clips').countDocuments({user_id:f.identity.userId}),0);
}));
test('unknown source validation failure preserves bytes for reconciliation',()=>fixture(async f=>{
 const attempt={...f.attempt,validateSource:async()=>{throw Object.assign(Error('database read unavailable'),{code:'DATABASE_UNAVAILABLE'});}};
 await assert.rejects(()=>commitUploadedRenderOutcome(f.client,f.db,f.identity,f.outcome,attempt),{code:'DATABASE_UNAVAILABLE'});assert.equal(deleted.length,f.before);
}));
