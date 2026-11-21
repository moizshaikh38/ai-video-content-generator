import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import {transcriptContentIdentity,transcriptSourceBindingMatches} from '../shared/transcriptSourceBinding.js';

test('content receipt survives same-owner clone metadata, not edits or missing input evidence',()=>{
 const record:any={id:'old',updated_at:'old',transcript_text:'Fixture',segments:[{start:0,end:1,text:'Fixture'}],language:'en'};
 record.source_binding={version:1,source_receipt:{key:'key',size:7,etag:'"a"',sha256:'a'.repeat(64)},prepared_audio_sha256:'b'.repeat(64),requests:[{sha256:'b'.repeat(64),bytes:5,status:'completed'}],transcript_content_sha256:transcriptContentIdentity(record)};
 assert.ok(transcriptSourceBindingMatches({...record,id:'clone',updated_at:'later'},'key',{size:7,etag:'"a"'}));
 for(const edited of [{transcript_text:'Edited'},{language:'hi'},{segments:[{start:0,end:2,text:'Fixture'}]},{quality_assessment:{status:'needs_review'}},{transcription_provenance:{provider:'changed'}},{text:'different alias'},{av_start_offset_sec:1}])assert.equal(transcriptSourceBindingMatches({...record,...edited},'key',{size:7,etag:'"a"'}),false);
 for(const head of [{size:8,etag:'"a"'},{size:7,etag:'"b"'},{size:7,etag:'W/"a"'}])assert.equal(transcriptSourceBindingMatches(record,'key',head),false);
 assert.equal(transcriptSourceBindingMatches(record,'different',{size:7,etag:'"a"'}),false);
 assert.equal(transcriptSourceBindingMatches({...record,source_binding:{...record.source_binding,requests:[]}},'key',{size:7,etag:'"a"'}),false);
});

test('request observer hashes actual different inputs and settles failed and late sibling requests',async()=>{
 const {observeTranscriptionInputs}=await import('../services/transcription/transcriptionInputObserver.js');
 let finish!:()=>void;const late=new Promise<void>(resolve=>{finish=resolve;});
 const observed=observeTranscriptionInputs({name:'fixture',async transcribeAudio(audio){if(audio.toString()==='fail')throw new Error('fixture failed');if(audio.toString()==='late')await late;return {text:'fixture',language:'',durationSeconds:1,segments:[],words:[]};}});
 const failed=observed.provider.transcribeAudio(Buffer.from('fail'));await assert.rejects(failed);
 const delayed=observed.provider.transcribeAudio(Buffer.from('late'));assert.equal(observed.requests[1].status,'submitted');
 await observed.provider.transcribeAudio(Buffer.from('fallback'));finish();await observed.settle();await delayed;
 assert.deepEqual(observed.requests.map(r=>r.status),['failed','completed','completed']);
 assert.deepEqual(observed.requests.map(r=>r.sha256),['fail','late','fallback'].map(v=>crypto.createHash('sha256').update(v).digest('hex')));
});

test('actual processing records downloaded bytes and provider-input audio; stale/legacy/edit reuse stops without another provider call',async()=>{
 Object.assign(process.env,{NODE_ENV:'test',MONGODB_URI:process.env.MONGODB_URI||'mongodb://127.0.0.1:27019',MONGODB_DB_NAME:process.env.MONGODB_DB_NAME||'vireo_transcript_lineage_qualification',SUPABASE_URL:'http://127.0.0.1:5998',SUPABASE_SECRET_KEY:'fixture',OPENROUTER_API_KEY:'',GROQ_API_KEY:'fixture'});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'transcript-lineage-')),source=path.join(dir,'source.mp4');
 execFileSync(ffmpeg as unknown as string,['-v','error','-f','lavfi','-i','color=s=160x90:r=10:d=0.5','-f','lavfi','-i','sine=frequency=440:duration=0.5','-c:v','libx264','-threads','1','-preset','ultrafast','-c:a','aac','-shortest',source],{timeout:10000});
 const bytes=fs.readFileSync(source);let etag='"source-a"';
 const server=http.createServer((req,res)=>{if(req.headers['if-match']&&req.headers['if-match']!==etag){res.writeHead(412).end();return;}res.setHeader('ETag',etag);res.setHeader('Content-Length',bytes.length);req.method==='HEAD'?res.end():res.end(bytes);});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');
 const {config}=await import('../config/index.js');Object.assign(config,{r2AccountId:'fixture',r2AccessKeyId:'fixture',r2SecretAccessKey:'fixture',r2SourceBucket:'source',r2Endpoint:`http://127.0.0.1:${address.port}`,transcriptionProvider:'groq',openrouterApiKey:'',multimodalAutoAnalysis:false,gameEventsAuto:false});
 const {getMongoDb,closeMongo}=await import('../db/mongoClient.js');
 const {GroqTranscriptionProvider:G}=await import('../services/transcription/groqTranscriptionProvider.js');
 const {EntitlementService:E}=await import('../services/entitlementService.js');
 const originalProvider=G.prototype.transcribeAudio,originalEntitlements=E.resolveUserEntitlements;
 let calls=0,inputHash='',changeDuringProvider=false;
 // Explicit synthetic STT. No accuracy/provider-network claim and no paid call.
 G.prototype.transcribeAudio=async(audio)=>{calls++;inputHash=crypto.createHash('sha256').update(audio).digest('hex');if(changeDuringProvider)etag='"source-moved"';return {text:'Fixture.',language:'en',durationSeconds:.5,segments:[{start:0,end:.5,text:'Fixture.'}],words:[{start:0,end:.5,word:'Fixture.'}],provenance:{provider:'qualification-stub',model:'synthetic'}};};
 E.resolveUserEntitlements=async()=>({isUnlimited:true} as any);
 const {processProjectVideo}=await import('../services/videoProcessingService.js');
 const {SubtitleStudioService:S}=await import('../services/subtitleStudioService.js');
 await (await import('../db/bootstrapMongo.js')).bootstrapMongo();const db=await getMongoDb(),user=crypto.randomUUID(),project=crypto.randomUUID(),key='fixture/'+crypto.randomUUID()+'.mp4';const projects=[project];
 try {
  await db.collection('projects').insertOne({id:project,user_id:user,source_url:key,storage_path:key,source_type:'fixture',duration_seconds:.5});
  const result=await processProjectVideo(project,user,key);assert.equal(result.status,'transcribed');assert.equal(calls,1);
  const saved=await db.collection('transcripts').findOne({project_id:project,user_id:user});assert.ok(saved);
  assert.equal(saved.source_binding.source_receipt.sha256,crypto.createHash('sha256').update(bytes).digest('hex'));
  assert.equal(saved.source_binding.prepared_audio_sha256,inputHash);assert.equal(saved.source_binding.requests[0].sha256,inputHash);assert.equal(saved.source_binding.requests[0].status,'completed');
  assert.ok(transcriptSourceBindingMatches(saved,key,{size:bytes.length,etag}));assert.equal((await processProjectVideo(project,user,key)).status,'transcribed');assert.equal(calls,1);
  const clone=crypto.randomUUID();projects.push(clone);await db.collection('projects').insertOne({id:clone,user_id:user,source_url:key,source_type:'fixture',duration_seconds:.5});
  assert.ok(await (S as any).findReusableTranscript(user,clone,key));const cloned=await db.collection('transcripts').findOne({project_id:clone,user_id:user});assert.ok(cloned);assert.equal(cloned.source_binding.source_receipt.sha256,saved.source_binding.source_receipt.sha256);assert.ok(cloned.quality_assessment);assert.equal((await processProjectVideo(clone,user,key)).status,'transcribed');assert.equal(calls,1);
  etag='"source-b"';const stale=await processProjectVideo(project,user,key);assert.equal(stale.status,'failed');assert.match(stale.error!,/cannot be verified/);assert.equal(calls,1);await assert.rejects((S as any).findReusableTranscript(user,clone,key),{code:'TRANSCRIPT_SOURCE_REVIEW_REQUIRED'});etag='"source-a"';
  await db.collection('transcripts').updateOne({project_id:project},{$set:{transcript_text:'Edited'}});assert.equal((await processProjectVideo(project,user,key)).status,'failed');assert.equal(calls,1);
  await db.collection('transcripts').updateOne({project_id:project},{$set:{transcript_text:'Fixture.'},$unset:{source_binding:''}});assert.equal((await processProjectVideo(project,user,key)).status,'failed');assert.equal(calls,1);
  const vanished=crypto.randomUUID(),attempt=crypto.randomUUID();projects.push(vanished);await db.collection('projects').insertOne({id:vanished,user_id:user,source_url:key,source_type:'fixture',duration_seconds:.5});await (await import('../services/creditWalletService.js')).CreditWalletService.reserveCredits({userId:user,attemptId:attempt,operationId:'core_video_processing',amount:0,metadata:{isReusedTranscript:true}});assert.equal((await processProjectVideo(vanished,user,key,attempt)).status,'failed');assert.equal(calls,1);await db.collection('credit_reservations').deleteOne({attempt_id:attempt});
  const moved=crypto.randomUUID();projects.push(moved);await db.collection('projects').insertOne({id:moved,user_id:user,source_url:key,source_type:'fixture',duration_seconds:.5});changeDuringProvider=true;const movedResult=await processProjectVideo(moved,user,key);assert.equal(movedResult.status,'failed');assert.equal(movedResult.reviewCode,'TRANSCRIPT_SOURCE_REVIEW_REQUIRED');assert.equal(calls,2);assert.equal(await db.collection('transcripts').countDocuments({project_id:moved}),0);
  assert.equal((await processProjectVideo(clone,crypto.randomUUID(),key)).status,'failed');assert.equal(calls,2);
 }finally{G.prototype.transcribeAudio=originalProvider;E.resolveUserEntitlements=originalEntitlements;await db.collection('projects').deleteMany({id:{$in:projects}});await db.collection('transcripts').deleteMany({project_id:{$in:projects}});for(const col of ['credit_reservations','credit_ledger','credit_wallets'])await db.collection(col).deleteMany({user_id:user});await closeMongo();await new Promise<void>(resolve=>server.close(()=>resolve()));fs.rmSync(dir,{recursive:true,force:true});}
});
