import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import {selectionSourceReceipt,selectionSourceReceiptMatches} from '../shared/selectionSourceReceipt.js';
import {transcriptContentIdentity} from '../shared/transcriptSourceBinding.js';

function fixture(key:string) {
  const t:any={transcript_text:'Synthetic fixture words.',language:'en',segments:[{start:0,end:2,text:'Synthetic fixture words.'}],duration_seconds:2};
  t.source_binding={version:1,source_receipt:{key,size:7,etag:'"fixture-a"',sha256:'a'.repeat(64)},prepared_audio_sha256:'b'.repeat(64),requests:[{sha256:'b'.repeat(64),bytes:7,status:'completed'}],transcript_content_sha256:transcriptContentIdentity(t)};
  return t;
}
test('selection receipt changes with speech, source or source bytes, not row metadata',()=>{
 const t=fixture('key'),r=selectionSourceReceipt(t,'key');
 assert(selectionSourceReceiptMatches(r,{...t,id:'clone'},'key'));
 assert(!selectionSourceReceiptMatches(r,t,'other'));
 assert(!selectionSourceReceiptMatches(r,{...t,transcript_text:'Different'},'key'));
 assert(!selectionSourceReceiptMatches(null,t,'key'));
 const changed=structuredClone(t);changed.source_binding.source_receipt.sha256='c'.repeat(64);
 assert(!selectionSourceReceiptMatches(r,changed,'key'));
});

test('actual selection/creation/render consumers reject stale decisions without provider or render work',async()=>{
 Object.assign(process.env,{NODE_ENV:'test',MONGODB_URI:process.env.MONGODB_URI||'mongodb://127.0.0.1:27020/?replicaSet=homeproof',MONGODB_DB_NAME:process.env.MONGODB_DB_NAME||'vireo_selection_source_qualification',SUPABASE_URL:'http://127.0.0.1:5998',SUPABASE_SECRET_KEY:'fixture',OPENROUTER_API_KEY:'',GROQ_API_KEY:''});
 let etag='"fixture-a"',heads=0;
 const server=http.createServer((req,res)=>{heads++;res.setHeader('ETag',etag);res.setHeader('Content-Length','7');res.end();});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const a=server.address();assert(a&&typeof a!=='string');
 const {config}=await import('../config/index.js');Object.assign(config,{r2AccountId:'fixture',r2AccessKeyId:'fixture',r2SecretAccessKey:'fixture',r2SourceBucket:'source',r2Endpoint:`http://127.0.0.1:${a.port}`,openrouterApiKey:''});
 const {getMongoDb,closeMongo}=await import('../db/mongoClient.js');await (await import('../db/bootstrapMongo.js')).bootstrapMongo();const db=await getMongoDb();
 const {ownerContext}=await import('../db/repositories/dataRepository.js');
 const {assertSelectionSourceCurrent}=await import('../services/selectionSourceGuardService.js');
 const {createClipWithJob}=await import('../db/repositories/clipRepository.js');
 const {ClipAnalysisService}=await import('../services/clipAnalysisService.js');
 const {ClipRenderService}=await import('../services/clipRenderService.js');
 const {CaptionService}=await import('../services/captionService.js');
 const {ProEditorService}=await import('../services/proEditorService.js');
 const {getClipCaptions}=await import('../controllers/clipController.js');
 const {replaceSuggestedCandidates}=await import('../db/repositories/clipCandidateRepository.js');
 const user=crypto.randomUUID(),project=crypto.randomUUID(),candidate=crypto.randomUUID(),key='fixture/'+project+'.mp4';
 const t=fixture(key),receipt=selectionSourceReceipt(t,key);
 try {
 await db.collection('projects').insertOne({id:project,user_id:user,title:'Synthetic lineage case',source_url:key,video_status:'transcribed'});
 await db.collection('transcripts').insertOne({...t,id:crypto.randomUUID(),project_id:project,user_id:user});
 await db.collection('clip_candidates').insertOne({id:candidate,project_id:project,user_id:user,start_seconds:0,end_seconds:2,status:'suggested',metadata:{selection_source_receipt:receipt}});
 await assertSelectionSourceCurrent(user,project,receipt,key);assert(heads>0);
 // Ordered segments cannot waive a known unreliable word-clock issue.
 const quality={version:1,status:'needs_review',issues:[{code:'unreliable_word_timing',detail:'Synthetic overlapping provider clocks'}]};
 const reviewed={...t,source_binding:{...t.source_binding},quality_assessment:quality};
 reviewed.source_binding.transcript_content_sha256=transcriptContentIdentity(reviewed);
 await db.collection('transcripts').updateOne({project_id:project},{$set:{quality_assessment:quality,source_binding:reviewed.source_binding}});
 await assert.rejects(assertSelectionSourceCurrent(user,project,selectionSourceReceipt(reviewed,key),key),{code:'TRANSCRIPT_REVIEW_REQUIRED'});
 const {assertTranscriptReusable}=await import('../services/transcriptSourceBindingService.js');
 await assert.rejects(assertTranscriptReusable(reviewed,key),{code:'TRANSCRIPT_REVIEW_REQUIRED'});
 const languageCase={...reviewed,source_binding:{...reviewed.source_binding},quality_assessment:{...quality,issues:[{code:'language_mismatch',detail:'Synthetic language issue'}]}};
 languageCase.source_binding.transcript_content_sha256=transcriptContentIdentity(languageCase);
 await db.collection('transcripts').updateOne({project_id:project},{$set:{quality_assessment:languageCase.quality_assessment,source_binding:languageCase.source_binding}});
 await assert.rejects(assertSelectionSourceCurrent(user,project,selectionSourceReceipt(languageCase,key),key),{code:'TRANSCRIPT_REVIEW_REQUIRED'});
 await db.collection('transcripts').updateOne({project_id:project},{$set:{source_binding:t.source_binding},$unset:{quality_assessment:''}});

 await assert.rejects(assertSelectionSourceCurrent(crypto.randomUUID(),project,receipt,key),{code:'TRANSCRIPT_SOURCE_REVIEW_REQUIRED'});
 let created:any=await createClipWithJob(project,candidate,user,'9:16','center',undefined,undefined,{kind:'unlimited'});
 assert.deepEqual(created.clip.selection_source_receipt,receipt);
 etag='"replaced-same-size"';
 await assert.rejects(assertSelectionSourceCurrent(user,project,receipt,key),{code:'TRANSCRIPT_SOURCE_REVIEW_REQUIRED'});
 let aiCalls=0;
 const ai:any={async generateJsonCompletion(){aiCalls++;throw Error('Synthetic provider must not be reached');},async generateJsonCompletionWithTelemetry(){aiCalls++;throw Error('Synthetic provider must not be reached');}};
 await assert.rejects(new ClipAnalysisService(ai).analyzeAndPersistClips({projectId:project,userId:user}),{code:'TRANSCRIPT_SOURCE_REVIEW_REQUIRED'});
 assert.equal(aiCalls,0);
 await assert.rejects(ownerContext.run(user,()=>ClipRenderService.getSignedDownloadUrl(created.clip.id,user)),{code:'TRANSCRIPT_SOURCE_REVIEW_REQUIRED'});
 await assert.rejects(ownerContext.run(user,()=>ClipRenderService.getSignedPreviewUrl(created.clip.id,user)),{code:'TRANSCRIPT_SOURCE_REVIEW_REQUIRED'});
 await assert.rejects(ProEditorService.getOrCreateEditorProject(created.clip.id,user),{code:'TRANSCRIPT_SOURCE_REVIEW_REQUIRED'});
 await assert.rejects(ownerContext.run(user,()=>CaptionService.generateCaptionsForClip({clip:created.clip as any})),{code:'TRANSCRIPT_SOURCE_REVIEW_REQUIRED'});
 let captionStatus=200,captionBody:any;const res:any={set(){return this},status(n:number){captionStatus=n;return this},json(body:any){captionBody=body;return this}};
 await getClipCaptions({user:{id:user},params:{clipId:created.clip.id}} as any,res);
 assert.equal(captionStatus,409);assert.equal(captionBody.code,'TRANSCRIPT_SOURCE_REVIEW_REQUIRED');
 await ownerContext.run(user,()=>ClipRenderService.renderClipJob(created.clip.id,user,created.renderJob.id));
 const clip=await db.collection('clips').findOne({id:created.clip.id});const job=await db.collection('render_jobs').findOne({id:created.renderJob.id});
 assert.equal(clip?.render_status,'failed');assert.equal(clip?.render_error_code,'TRANSCRIPT_SOURCE_REVIEW_REQUIRED');assert.equal(job?.status,'failed');assert(clip?.updated_at instanceof Date);assert(job?.updated_at instanceof Date);assert(!clip?.output_storage_path);
 etag='"fixture-a"';await db.collection('transcripts').updateOne({project_id:project},{$set:{transcript_text:'Changed while selection was running'}});
 await assert.rejects(createClipWithJob(project,candidate,user,'9:16','center',undefined,undefined,{kind:'unlimited'}),{code:'TRANSCRIPT_SOURCE_REVIEW_REQUIRED'});
 await assert.rejects(replaceSuggestedCandidates(user,project,[],receipt),{code:'TRANSCRIPT_SOURCE_REVIEW_REQUIRED'});
 assert.equal(await db.collection('clip_candidates').countDocuments({id:candidate}),1);
 } finally {for(const col of ['projects','transcripts','clip_candidates','clips','render_jobs'])await db.collection(col).deleteMany({user_id:user});await closeMongo();await new Promise<void>(r=>server.close(()=>r()));}
});
