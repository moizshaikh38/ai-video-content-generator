import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import {config} from '../config/index.js';
import {NEW_CAPTION_PRESET_ID} from '../shared/captionPresets.js';
import {transcriptContentIdentity} from '../shared/transcriptSourceBinding.js';
import {selectionSourceReceipt} from '../shared/selectionSourceReceipt.js';
import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import { createProjectClip } from '../controllers/clipController.js';
import { ClipRenderService } from '../services/clipRenderService.js';
import { createClipWithJob } from '../db/repositories/clipRepository.js';
import { ProEditorService } from '../services/proEditorService.js';
import { EntitlementService } from '../services/entitlementService.js';

test('fresh generated Free defaults accept verified fixture decisions and preserve restricted preset gates', {skip: !process.env.MONGODB_URI}, async()=>{
 const db=await getMongoDb(),uid=crypto.randomUUID(),pid=crypto.randomUUID(),cid=crypto.randomUUID();
 const sourceKey='local-free-test.mp4';
 const storage=http.createServer((_req,res)=>{res.setHeader('ETag','"free-fixture"');res.setHeader('Content-Length','7');res.end()});
 await new Promise<void>(r=>storage.listen(0,'127.0.0.1',r));const address=storage.address();assert(address&&typeof address!=='string');
 const storageBefore={r2AccountId:config.r2AccountId,r2AccessKeyId:config.r2AccessKeyId,r2SecretAccessKey:config.r2SecretAccessKey,r2SourceBucket:config.r2SourceBucket,r2Endpoint:config.r2Endpoint};
 Object.assign(config,{r2AccountId:'fixture',r2AccessKeyId:'fixture',r2SecretAccessKey:'fixture',r2SourceBucket:'source',r2Endpoint:`http://127.0.0.1:${address.port}`});
 const orig=ClipRenderService.createClipFromCandidate;
 // Use the real transactional candidate-to-clip path, without launching an asynchronous render.
 ClipRenderService.createClipFromCandidate=async(p,u,c,a,m,o)=>createClipWithJob(p,c,u,a!,m!,o) as any;
 try{
  await db.collection('projects').insertOne({id:pid,user_id:uid,source_url:'local-free-test.mp4',video_status:'transcribed'});
  // Explicitly synthetic receipt. This test is entitlement/default coverage, not recognition proof.
  const transcript:any={id:crypto.randomUUID(),project_id:pid,user_id:uid,transcript_text:'Synthetic defaults fixture.',language:'en',segments:[{start:0,end:30,text:'Synthetic defaults fixture.'}],duration_seconds:30};
  transcript.source_binding={version:1,source_receipt:{key:sourceKey,size:7,etag:'"free-fixture"',sha256:'a'.repeat(64)},prepared_audio_sha256:'b'.repeat(64),requests:[{sha256:'b'.repeat(64),bytes:7,status:'completed'}],transcript_content_sha256:transcriptContentIdentity(transcript)};
  await db.collection('transcripts').insertOne(transcript);
  await db.collection('clip_candidates').insertOne({id:cid,project_id:pid,user_id:uid,start_seconds:0,end_seconds:30,status:'suggested',metadata:{selection_source_receipt:selectionSourceReceipt(transcript,sourceKey)}});
  let status=200,body:any;const res:any={status(n:number){status=n;return this},json(b:any){body=b;return this}};
  await createProjectClip({user:{id:uid,email:'free-generated@test.invalid'},params:{id:pid},body:{candidateId:cid}} as any,res);
  assert.equal(status,202,JSON.stringify(body));const clip=body.clip;
  assert.equal(clip.caption_style,NEW_CAPTION_PRESET_ID);assert.equal(clip.caption_config.presetId,NEW_CAPTION_PRESET_ID);assert.equal(clip.crop_config.mode,'fit');
  const e=await EntitlementService.resolveUserEntitlements(uid,'free-generated@test.invalid');assert.equal(EntitlementService.isPresetAllowed(e,clip.caption_style),true);
  assert.equal(EntitlementService.isPresetAllowed(e,'karaoke'),false);assert.equal(EntitlementService.isFeatureAllowed(e,'smartReframe'),false);
  const ep=(ProEditorService as any).buildInitialProject(clip,uid,null,null,{clip_id:clip.id});
  assert.equal(ep.tracks.find((t:any)=>t.type==='CAPTION').items[0].caption.style,NEW_CAPTION_PRESET_ID);
  const captionItem=ep.tracks.find((t:any)=>t.type==='CAPTION').items[0];
  captionItem.caption={...captionItem.caption,font_family:'Arial',font_size:73,highlight_color:'#123456',animation:'none'};
  const manualBefore=JSON.stringify(captionItem.caption);await db.collection('editor_projects').insertOne(ep);
  const existing=await ProEditorService.getOrCreateEditorProject(clip.id,uid);assert.equal(JSON.stringify(existing.tracks.find((t:any)=>t.type==='CAPTION')!.items[0].caption),manualBefore,'existing manual editor must not be reinitialized');
  // Fit is the existing product 4:3 sharp band on blur, not full-source retention.
  assert.equal(ep.tracks.find((t:any)=>t.type==='VIDEO').items[0].crop.mode,'blur');
  assert.equal(ep.tracks.find((t:any)=>t.type==='VIDEO').items[0].crop.band,'4:3');
  await createProjectClip({user:{id:uid,email:'free-generated@test.invalid'},params:{id:pid},body:{candidateId:cid,caption_style:'clean'}} as any,res);assert.equal(status,202);assert.equal(body.clip.caption_style,'clean');
  await createProjectClip({user:{id:uid,email:'free-generated@test.invalid'},params:{id:pid},body:{candidateId:cid,caption_style:'karaoke'}} as any,res);assert.equal(status,403);assert.equal(body.code,'PRESET_RESTRICTED');
  const legacyId=crypto.randomUUID();await db.collection('clip_candidates').insertOne({id:legacyId,project_id:pid,user_id:uid,start_seconds:0,end_seconds:30,status:'suggested'});
  const clipsBefore=await db.collection('clips').countDocuments({user_id:uid});
  await createProjectClip({user:{id:uid,email:'free-generated@test.invalid'},params:{id:pid},body:{candidateId:legacyId}} as any,res);
  assert.equal(status,409);assert.equal(body.code,'TRANSCRIPT_SOURCE_REVIEW_REQUIRED');assert.equal(await db.collection('clips').countDocuments({user_id:uid}),clipsBefore);
 }finally{ClipRenderService.createClipFromCandidate=orig;for(const col of ['projects','transcripts','clip_candidates','clips','render_jobs','editor_projects','credit_wallets','credit_transactions'])await db.collection(col).deleteMany({user_id:uid});await closeMongo();Object.assign(config,storageBefore);await new Promise<void>(r=>storage.close(()=>r()))}
});
