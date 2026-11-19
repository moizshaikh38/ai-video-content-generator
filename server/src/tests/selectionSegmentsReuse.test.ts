import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import crypto from 'node:crypto';
import {newTranscriptSelectionFields} from '../services/transcription/selectionSegments.js';import {transcriptContentIdentity} from '../shared/transcriptSourceBinding.js';
test('actual reuse and same-owner clone retain derived and legacy indexes without transcription',async()=>{
 Object.assign(process.env,{NODE_ENV:'test',OPENROUTER_API_KEY:'',GROQ_API_KEY:'',SUPABASE_URL:'http://127.0.0.1:5998',SUPABASE_SECRET_KEY:'fixture'});
 const server=http.createServer((req,res)=>{assert.equal(req.method,'HEAD');res.setHeader('ETag','"fixture"');res.setHeader('Content-Length','7');res.end();});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();assert(address&&typeof address!=='string');
 const {config}=await import('../config/index.js');Object.assign(config,{r2AccountId:'fixture',r2AccessKeyId:'fixture',r2SecretAccessKey:'fixture',r2SourceBucket:'source',r2Endpoint:`http://127.0.0.1:${address.port}`,multimodalAutoAnalysis:false,gameEventsAuto:false});
 const {getMongoDb,closeMongo}=await import('../db/mongoClient.js');const {SubtitleStudioService:S}=await import('../services/subtitleStudioService.js');const {processProjectVideo}=await import('../services/videoProcessingService.js');const {EntitlementService:E}=await import('../services/entitlementService.js');const original=E.resolveUserEntitlements;E.resolveUserEntitlements=async()=>({isUnlimited:true} as any);
 const db=await getMongoDb(),owner=crypto.randomUUID(),source=crypto.randomUUID(),clone=crypto.randomUUID(),legacy=crypto.randomUUID(),key='fixture/'+crypto.randomUUID();
 const raw=[{start:0,end:3,text:'First. Second. And'}],words=[{word:'First.',start:.1,end:.8},{word:'Second.',start:1,end:1.8},{word:'And',start:2,end:2.5}];
 const record:any={project_id:source,user_id:owner,transcript_text:raw[0].text,text:raw[0].text,duration_seconds:3,language:'en',words,...newTranscriptSelectionFields(raw,words)};
 const sign=(r:any)=>({...r,source_binding:{version:1,source_receipt:{key,size:7,etag:'"fixture"',sha256:'a'.repeat(64)},prepared_audio_sha256:'b'.repeat(64),requests:[{sha256:'b'.repeat(64),bytes:3,status:'completed'}],transcript_content_sha256:transcriptContentIdentity(r)}});
 try{
  await db.collection('projects').insertMany([source,clone,legacy].map(id=>({id,user_id:owner,source_url:key,source_type:'fixture',duration_seconds:3})));
  await db.collection('transcripts').insertMany([sign(record),sign({...record,project_id:legacy,segments:raw,provider_segments:undefined,selection_segmentation:undefined})]);
  const reused=await processProjectVideo(source,owner,key);assert.equal(reused.status,'transcribed');assert.equal(reused.transcript!.segments.length,3);
  const old=await processProjectVideo(legacy,owner,key);assert.equal(old.status,'transcribed');assert.equal(old.transcript!.segments.length,1);
  assert(await S.findReusableTranscript(owner,clone,key));const saved:any=await db.collection('transcripts').findOne({project_id:clone,user_id:owner});assert(saved);assert.equal(saved.segments.length,3);assert.deepEqual(saved.provider_segments,raw);assert.deepEqual(saved.selection_segmentation,record.selection_segmentation);assert.deepEqual(saved.words,words);
  assert.equal(await S.findReusableTranscript(crypto.randomUUID(),clone,key),null);
 }finally{E.resolveUserEntitlements=original;await db.collection('projects').deleteMany({id:{$in:[source,clone,legacy]},user_id:owner});await db.collection('transcripts').deleteMany({project_id:{$in:[source,clone,legacy]},user_id:owner});await closeMongo();await new Promise<void>(r=>server.close(()=>r()));}
});
