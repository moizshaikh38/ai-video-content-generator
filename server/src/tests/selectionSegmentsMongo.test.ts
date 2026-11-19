import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {MongoClient} from 'mongodb';
import {newTranscriptSelectionFields} from '../services/transcription/selectionSegments.js';
import {transcriptContentIdentity, transcriptSourceBindingMatches} from '../shared/transcriptSourceBinding.js';

test('selection storage seam signs new indexes, survives Mongo clone and leaves old indexes unchanged',async()=>{
 const uri=process.env.MONGODB_URI!;assert.match(uri,/127\.0\.0\.1:27020/);
 const client=await new MongoClient(uri,{maxPoolSize:2,serverSelectionTimeoutMS:2000}).connect(),db=client.db(process.env.MONGODB_DB_NAME),project=crypto.randomUUID(),clone=crypto.randomUUID(),owner=crypto.randomUUID();
 const words=[{word:'First.',start:.1,end:.8},{word:'Second.',start:1,end:1.8},{word:'And',start:2,end:2.5}];
 const provider=[{start:0,end:3,text:'First. Second. And',avg_logprob:-.2}];
 const old:any={project_id:project,user_id:owner,segments:provider,words,transcript_text:provider[0].text,text:provider[0].text,language:'en',duration_seconds:3};
 const sign=(record:any)=>({...record,source_binding:{version:1,source_receipt:{key:'fixture/key',size:7,etag:'"fixture"',sha256:'a'.repeat(64)},prepared_audio_sha256:'b'.repeat(64),requests:[{sha256:'b'.repeat(64),bytes:3,status:'completed'}],transcript_content_sha256:transcriptContentIdentity(record)}});
 try{
  const oldSigned=sign(old);await db.collection('transcripts').insertOne(oldSigned);
  const legacyBefore=JSON.stringify(await db.collection('transcripts').findOne({project_id:project}));
  const candidate=sign({...old,project_id:clone,...newTranscriptSelectionFields(provider,words)});await db.collection('transcripts').insertOne(candidate);
  const saved:any=await db.collection('transcripts').findOne({project_id:clone});assert(saved);assert.equal(saved.segments.length,3);assert.deepEqual(saved.words,words);assert.deepEqual(saved.provider_segments,provider);assert.equal(saved.segments[2].text,'And');assert(transcriptSourceBindingMatches(saved,'fixture/key',{size:7,etag:'"fixture"'}));
  const copied={...saved,project_id:crypto.randomUUID(),id:crypto.randomUUID(),updated_at:'later'};assert(transcriptSourceBindingMatches(copied,'fixture/key',{size:7,etag:'"fixture"'}));assert.equal(transcriptSourceBindingMatches({...saved,segments:provider},'fixture/key',{size:7,etag:'"fixture"'}),false);
  assert.equal(JSON.stringify(await db.collection('transcripts').findOne({project_id:project})),legacyBefore);
 }finally{await db.collection('transcripts').deleteMany({project_id:{$in:[project,clone]},user_id:owner});await client.close();}
});
