import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import {transcriptContentIdentity} from '../shared/transcriptSourceBinding.js';

// Disposable source-bound transcript and injected provider adapter only. This
// tests completion/persistence semantics, never model quality or real media.
test('successful empty discovery replaces stale suggestions but preserves selections; failed or stale runs preserve all rows', async(t)=>{
 Object.assign(process.env,{NODE_ENV:'test',MONGODB_URI:process.env.MONGODB_URI||'mongodb://127.0.0.1:27028/?replicaSet=emptyselection',MONGODB_DB_NAME:'vireo_empty_selection_'+crypto.randomUUID().replaceAll('-',''),SUPABASE_URL:'http://127.0.0.1:1',SUPABASE_SECRET_KEY:'fixture',OPENROUTER_API_KEY:'',GROQ_API_KEY:''});
 let etag='"fixture"';
 const storage=http.createServer((_req,res)=>{res.setHeader('ETag',etag);res.setHeader('Content-Length','7');res.end();});
 await new Promise<void>(r=>storage.listen(0,'127.0.0.1',r));
 const address=storage.address();assert(address&&typeof address!=='string');
 t.after(async()=>{storage.closeAllConnections();await new Promise<void>(r=>storage.close(()=>r()));});
 const {config}=await import('../config/index.js');Object.assign(config,{r2AccountId:'fixture',r2AccessKeyId:'fixture',r2SecretAccessKey:'fixture',r2SourceBucket:'source',r2Endpoint:`http://127.0.0.1:${address.port}`});
 const {getMongoDb,closeMongo}=await import('../db/mongoClient.js');
 const {ClipAnalysisService,activeClipAnalysisSet}=await import('../services/clipAnalysisService.js');
 const db=await getMongoDb(),ids:string[]=[];
 try{
 for(const mode of ['empty','settings','source','transcript','provider-failure','malformed','unseen','long-empty','long-malformed','long-unseen'] as const){
  etag='"fixture"';const user=crypto.randomUUID(),project=crypto.randomUUID();ids.push(project);
  await db.collection('projects').insertOne({id:project,user_id:user,title:'Empty completion contract',source_url:'fixture/key',notes:'Original intent',clip_preferences:{genre:'general',genreSelectionMode:'manual'}});
  const transcript:any={id:crypto.randomUUID(),project_id:project,user_id:user,transcript_text:'Opening statement. Ending statement.',duration_seconds:120,segments:[{start:0,end:3,text:'Opening statement.'},{start:3,end:8,text:'Ending statement.'}]};
  if(mode.startsWith('long-')){transcript.duration_seconds=2400;transcript.segments=Array.from({length:24},(_,i)=>({start:i*100,end:(i+1)*100,text:i%2?'Ending statement.':'Opening statement.'}));transcript.transcript_text=transcript.segments.map((v:any)=>v.text).join(' ');}
  transcript.source_binding={version:1,source_receipt:{key:'fixture/key',size:7,etag,sha256:'a'.repeat(64)},prepared_audio_sha256:'b'.repeat(64),requests:[{sha256:'b'.repeat(64),bytes:7,status:'completed'}],transcript_content_sha256:transcriptContentIdentity(transcript)};
  await db.collection('transcripts').insertOne(transcript);
  await db.collection('clip_candidates').insertMany(['suggested','dismissed','selected'].map((status,i)=>({id:crypto.randomUUID(),project_id:project,user_id:user,status,start_segment_index:i,end_segment_index:i+1,start_seconds:i*10,end_seconds:i*10+5,engagement_score:90-i,metadata:{fixture:true}})));
  const before=await db.collection('clip_candidates').find({project_id:project}).sort({id:1}).toArray();
  const selected=before.find(r=>r.status==='selected');let calls=0;
  const service=new ClipAnalysisService({async generateJsonCompletion(){calls++;
   if(mode==='settings')await db.collection('projects').updateOne({id:project},{$set:{notes:'New intent'}});
   if(mode==='source')etag='"changed-source"';
   if(mode==='transcript')await db.collection('transcripts').updateOne({project_id:project},{$set:{transcript_text:'Changed transcript'}});
   if(mode==='provider-failure')throw new Error('Injected provider failure');
   if(mode==='malformed'||mode==='long-malformed')return {clips:[{start_segment_index:null,end_segment_index:1,title:'Invalid',hook:'Invalid'}]};
   if(mode==='unseen'||mode==='long-unseen')return {clips:[{start_segment_index:999,end_segment_index:999,title:'Unseen',hook:'Unseen'}]};
   return {clips:[]};
  }} as any);
  if(mode==='empty'||mode==='long-empty'){
   const result=await service.analyzeAndPersistClips({projectId:project,userId:user});
   assert.equal(result.length,1);assert.equal(result[0].id,selected!.id);assert.equal(result[0].status,'selected');
   assert.deepEqual(await db.collection('clip_candidates').find({project_id:project}).toArray(),[selected]);
   const reload=await ClipAnalysisService.getCandidates(project,user);assert.deepEqual(reload,result);
  }else{
   await assert.rejects(service.analyzeAndPersistClips({projectId:project,userId:user}),(e:any)=>mode==='provider-failure'||e.code===(mode==='settings'?'CLIP_SELECTION_CONTEXT_CHANGED':mode.includes('malformed')||mode.includes('unseen')?'CLIP_SELECTION_WINDOWS_FAILED':'TRANSCRIPT_SOURCE_REVIEW_REQUIRED'));
   assert.deepEqual(await db.collection('clip_candidates').find({project_id:project}).sort({id:1}).toArray(),before);
  }
  if(mode.startsWith('long-'))assert(calls>=2);else assert.equal(calls,1);assert.equal(activeClipAnalysisSet.has(project),false);
 }
 }finally{for(const collection of ['projects','transcripts','clip_candidates'])await db.collection(collection).deleteMany(collection==='projects'?{id:{$in:ids}}:{project_id:{$in:ids}});await closeMongo();}
});
