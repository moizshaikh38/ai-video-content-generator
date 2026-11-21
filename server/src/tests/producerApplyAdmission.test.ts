import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import {transcriptContentIdentity} from '../shared/transcriptSourceBinding.js';
import {selectionSourceReceipt} from '../shared/selectionSourceReceipt.js';
import {editorRenderSnapshot} from '../shared/editorRenderSnapshot.js';

// Real local Mongo transaction and source HEAD; provider, FFmpeg and cloud
// uploads are intentionally absent. Worker arguments are observed, not rendered.
test('Producer Apply atomically admits a revision-bound job and replays without duplicate edits',async()=>{
 const {config}=await import('../config/index.js');
 const storage=http.createServer((_q,r)=>{r.setHeader('ETag','"fixture"');r.setHeader('Content-Length','7');r.end();});
 await new Promise<void>(r=>storage.listen(0,'127.0.0.1',r));const address=storage.address();assert(address&&typeof address!=='string');
 const savedConfig={r2AccountId:config.r2AccountId,r2AccessKeyId:config.r2AccessKeyId,r2SecretAccessKey:config.r2SecretAccessKey,r2SourceBucket:config.r2SourceBucket,r2Endpoint:config.r2Endpoint};
 Object.assign(config,{r2AccountId:'fixture',r2AccessKeyId:'fixture',r2SecretAccessKey:'fixture',r2SourceBucket:'source',r2Endpoint:`http://127.0.0.1:${address.port}`});
 const {getMongoDb,getMongoClient,closeMongo}=await import('../db/mongoClient.js');
 const {ownerContext}=await import('../db/repositories/dataRepository.js');
 const {ProducerRenderService}=await import('../services/producerRenderService.js');
 const {ClipRenderService}=await import('../services/clipRenderService.js');
 const {EntitlementService}=await import('../services/entitlementService.js');
 const {ProEditorService}=await import('../services/proEditorService.js');
 const {commitProducerApply}=await import('../db/repositories/producerApplyRepository.js');
 const db=await getMongoDb(),client=await getMongoClient();
 const {bootstrapMongo}=await import('../db/bootstrapMongo.js');await bootstrapMongo(db);
 const oldGate=process.env.VIREO_RENDER_ADMISSION_V1,oldWorker=ClipRenderService.renderClipJob,oldPlan=EntitlementService.resolveUserEntitlements;
 const launches:any[]=[];
 (ClipRenderService as any).renderClipJob=async(...args:any[])=>{launches.push(args);};
 (EntitlementService as any).resolveUserEntitlements=async()=>({isUnlimited:true,displayName:'Fixture',allowedSubtitlePresets:['simple','clean']});
 const owners:string[]=[];
 async function fixture(user=crypto.randomUUID()){
  const project=crypto.randomUUID(),clip=crypto.randomUUID(),plan=crypto.randomUUID(),key=`users/${user}/projects/${project}/source/fixture.mp4`;owners.push(user);
  const transcript:any={id:crypto.randomUUID(),user_id:user,project_id:project,transcript_text:'Synthetic fixture words.',language:'en',duration_seconds:2,segments:[{start:0,end:2,text:'Synthetic fixture words.'}]};
  transcript.source_binding={version:1,source_receipt:{key,size:7,etag:'"fixture"',sha256:'a'.repeat(64)},prepared_audio_sha256:'b'.repeat(64),requests:[{sha256:'b'.repeat(64),bytes:7,status:'completed'}],transcript_content_sha256:transcriptContentIdentity(transcript)};
  await db.collection('projects').insertOne({id:project,user_id:user,source_url:key,video_status:'transcribed'});
  await db.collection('transcripts').insertOne(transcript);
  await db.collection('clips').insertOne({id:clip,user_id:user,project_id:project,start_seconds:0,end_seconds:2,duration_seconds:2,aspect_ratio:'9:16',crop_mode:'center',crop_config:{mode:'center'},render_status:'ready',render_version:1,editor_version:1,caption_enabled:false,caption_style:'simple',source_storage_path:key,selection_source_receipt:selectionSourceReceipt(transcript,key),created_at:new Date(),updated_at:new Date()});
  await db.collection('producer_plans').insertOne({id:plan,user_id:user,clip_id:clip,status:'draft',operations:[{id:crypto.randomUUID(),type:'BRAND_OVERLAY',enabled:true,parameters:{text:'Synthetic fixture'}}]});
  await db.collection('render_jobs').insertOne({id:crypto.randomUUID(),user_id:user,clip_id:clip,status:'completed',admission_version:1,render_version:1,editor_version:1,created_at:new Date()});
  return {user,project,clip,plan};
 }
 async function apply(f:any,routeClip=f.clip){return ownerContext.run(f.user,()=>ProducerRenderService.applyPlanToClip(f.plan,f.user,routeClip));}
 async function unchanged(f:any){const clip=await db.collection('clips').findOne({id:f.clip});const plan=await db.collection('producer_plans').findOne({id:f.plan});assert.equal(clip?.editor_version,1);assert.equal(clip?.render_version,1);assert.equal(plan?.status,'draft');assert.equal(plan?.apply_receipt,undefined);assert.equal(await db.collection('editor_projects').countDocuments({clip_id:f.clip}),0);}
 try{
  delete process.env.VIREO_RENDER_ADMISSION_V1;
  const disabled=await fixture();await assert.rejects(apply(disabled),{code:'RENDER_ADMISSION_NOT_ENABLED'});await unchanged(disabled);assert.equal(launches.length,0);
  process.env.VIREO_RENDER_ADMISSION_V1='1';
  const f=await fixture();const results=await Promise.all([apply(f),apply(f)]);await new Promise(r=>setImmediate(r));
  assert.equal(results[0].renderJob.id,results[1].renderJob.id);assert.equal(results.filter(r=>r.replayed).length,1);assert.equal(launches.length,1);assert.equal(launches[0][2],results[0].renderJob.id);
  const clip=await db.collection('clips').findOne({id:f.clip}),editor=await db.collection('editor_projects').findOne({clip_id:f.clip});
  assert(editor?.created_at instanceof Date);assert(editor?.updated_at instanceof Date);
  assert.equal(clip?.render_status,'queued');assert.equal(clip?.render_version,2);assert.equal(clip?.editor_version,2);assert.equal(editor?.version,1);
  assert.deepEqual(results[0].renderJob.editor_project_snapshot,editorRenderSnapshot(editor));assert.equal(results[0].renderJob.admission_version,1);assert.equal(await db.collection('render_jobs').countDocuments({clip_id:f.clip}),2);
  const tracks=JSON.stringify(editor?.tracks);const replay=await apply(f);assert(replay.replayed);assert.equal(JSON.stringify((await db.collection('editor_projects').findOne({clip_id:f.clip}))?.tracks),tracks);assert.equal(launches.length,1);
  await assert.rejects(apply(f,crypto.randomUUID()),{code:'PLAN_NOT_FOUND'});
  // A second distinct plan after completion updates the existing editor in
  // place without losing previous user text, and queues its own new revision.
  await db.collection('render_jobs').updateOne({id:results[0].renderJob.id},{$set:{status:'completed'}});
  await db.collection('clips').updateOne({id:f.clip},{$set:{render_status:'ready'}});
  const nextPlan=crypto.randomUUID();await db.collection('producer_plans').insertOne({id:nextPlan,user_id:f.user,clip_id:f.clip,status:'draft',operations:[{id:crypto.randomUUID(),type:'BRAND_OVERLAY',enabled:true,parameters:{text:'Second synthetic plan'}}]});
  const second=await apply({...f,plan:nextPlan});const secondEditor=await db.collection('editor_projects').findOne({clip_id:f.clip});
  assert.equal(second.renderJob.render_version,3);assert.equal(second.renderJob.editor_version,3);assert.equal(secondEditor?.version,2);assert.equal(secondEditor?.id,editor?.id);assert(JSON.stringify(secondEditor?.tracks).includes('Synthetic fixture'));assert(JSON.stringify(secondEditor?.tracks).includes('Second synthetic plan'));
  const oldReplay=await apply(f);assert.equal(oldReplay.clip.render_version,3);assert.equal(oldReplay.renderJob.render_version,2);assert(oldReplay.replayed);
  const stranger=crypto.randomUUID();await assert.rejects(ownerContext.run(stranger,()=>ProducerRenderService.applyPlanToClip(f.plan,stranger,f.clip)),{code:'PLAN_NOT_FOUND'});
  await db.collection('producer_plans').updateOne({id:f.plan},{$set:{operations:[]}});await assert.rejects(apply(f),{code:'PRODUCER_APPLY_CONFLICT'});
  const active=await fixture();await db.collection('render_jobs').insertOne({id:crypto.randomUUID(),user_id:active.user,clip_id:active.clip,status:'queued'});await assert.rejects(apply(active),{code:'RENDER_ALREADY_ACTIVE'});await unchanged(active);
  const race=await fixture(),otherPlan=crypto.randomUUID();await db.collection('producer_plans').insertOne({id:otherPlan,user_id:race.user,clip_id:race.clip,status:'draft',operations:[]});
  const raced=await Promise.allSettled([apply(race),apply({...race,plan:otherPlan})]);assert.equal(raced.filter(r=>r.status==='fulfilled').length,1);assert.equal(await db.collection('render_jobs').countDocuments({clip_id:race.clip,status:'queued'}),1);assert.equal(await db.collection('producer_plans').countDocuments({clip_id:race.clip,status:'applied'}),1);
  const pending=await fixture();await db.collection('clips').updateOne({id:pending.clip},{$set:{editor_project_sync_pending:{id:crypto.randomUUID(),version:2}}});await assert.rejects(apply(pending),{code:'PRODUCER_APPLY_CONFLICT'});await unchanged(pending);
  const stale=await fixture();await db.collection('projects').updateOne({id:stale.project},{$set:{source_url:'replaced'}});await assert.rejects(apply(stale),{code:'TRANSCRIPT_SOURCE_REVIEW_REQUIRED'});await unchanged(stale);
  const limited=await fixture();(EntitlementService as any).resolveUserEntitlements=async()=>({isUnlimited:false,limits:{maxClipRenders:0},displayName:'Fixture'});await assert.rejects(apply(limited),{code:'MONTHLY_RENDER_LIMIT_EXCEEDED'});await unchanged(limited);(EntitlementService as any).resolveUserEntitlements=async()=>({isUnlimited:true,allowedSubtitlePresets:['simple','clean']});
  const accountOne=await fixture(),accountTwo=await fixture(accountOne.user),priorMonth=new Date();priorMonth.setUTCDate(1);priorMonth.setUTCHours(0,0,0,0);priorMonth.setUTCDate(0);
  await db.collection('render_jobs').updateMany({user_id:accountOne.user},{$set:{created_at:priorMonth}});
  (EntitlementService as any).resolveUserEntitlements=async()=>({isUnlimited:false,limits:{maxClipRenders:1},displayName:'Fixture',allowedSubtitlePresets:['simple','clean']});
  const accountRace=await Promise.allSettled([apply(accountOne),apply(accountTwo)]);assert.equal(accountRace.filter(r=>r.status==='fulfilled').length,1);assert.equal(accountRace.filter(r=>r.status==='rejected'&&r.reason.code==='MONTHLY_RENDER_LIMIT_EXCEEDED').length,1);assert.equal(await db.collection('render_jobs').countDocuments({user_id:accountOne.user,status:'queued'}),1);
  (EntitlementService as any).resolveUserEntitlements=async()=>({isUnlimited:true,allowedSubtitlePresets:['simple','clean']});
  const validation=await fixture(),oldPrepare=ProEditorService.prepareEditorRevision;
  (ProEditorService as any).prepareEditorRevision=async()=>{throw Object.assign(Error('Synthetic staging failure'),{code:'FIXTURE_EDITOR_INVALID'});};try{await assert.rejects(apply(validation),{code:'FIXTURE_EDITOR_INVALID'});await unchanged(validation);}finally{ProEditorService.prepareEditorRevision=oldPrepare;}
  const lateSource=await fixture(),oldStage=ProEditorService.prepareEditorRevision;
  (ProEditorService as any).prepareEditorRevision=async(...args:any[])=>{const stage=await (oldStage as any).apply(ProEditorService,args);await db.collection('projects').updateOne({id:lateSource.project},{$set:{source_url:'changed-after-live-head'}});return stage;};
  try{await assert.rejects(apply(lateSource),{code:'TRANSCRIPT_SOURCE_REVIEW_REQUIRED'});await unchanged(lateSource);}finally{ProEditorService.prepareEditorRevision=oldStage;}
  // Force job insertion failure inside the actual transaction and verify that
  // editor creation, clip updates and applied status all roll back.
  const rollback=await fixture();const {Collection}=await import('mongodb'),oldInsert=Collection.prototype.insertOne;
  (Collection.prototype as any).insertOne=async function(doc:any,...rest:any[]){if(this.collectionName==='render_jobs'&&doc.user_id===rollback.user&&doc.admission_version===1&&doc.status==='queued')throw Object.assign(Error('Synthetic insert failure'),{code:'FIXTURE_INSERT_FAILED'});return oldInsert.call(this,doc,...rest);};
  try{await assert.rejects(apply(rollback),{code:'FIXTURE_INSERT_FAILED'});}finally{Collection.prototype.insertOne=oldInsert;}await unchanged(rollback);const recovered=await apply(rollback);assert.equal(recovered.renderJob.render_version,2);
  const uncertain=await fixture(),{MongoClient}=await import('mongodb'),oldSession=MongoClient.prototype.startSession;
  (MongoClient.prototype as any).startSession=function(...args:any[]){const session=(oldSession as any).apply(this,args),oldTransaction=session.withTransaction.bind(session);session.withTransaction=async(...txArgs:any[])=>{await oldTransaction(...txArgs);throw Error('Synthetic lost postcommit return');};return session;};
  let receipt:any;try{receipt=await apply(uncertain);}finally{MongoClient.prototype.startSession=oldSession;}
  assert(receipt.replayed);assert.equal(await db.collection('render_jobs').countDocuments({clip_id:uncertain.clip,status:'queued'}),1);const afterUncertain=await apply(uncertain);assert.equal(afterUncertain.renderJob.id,receipt.renderJob.id);
  // Repository fences exact staged editor revision. No hidden overwrite of a
  // concurrent manual edit or operation change is allowed.
  const conflicted=await fixture();const baseClip=await db.collection('clips').findOne({id:conflicted.clip}),basePlan=await db.collection('producer_plans').findOne({id:conflicted.plan});
  const fakeEditor={id:crypto.randomUUID(),clip_id:conflicted.clip,user_id:conflicted.user,version:1,tracks:[],canvas:{aspect_ratio:'9:16'},settings:{}};
  await db.collection('clips').updateOne({id:conflicted.clip},{$inc:{editor_version:1}});
  await assert.rejects(commitProducerApply(client,db,{userId:conflicted.user,plan:basePlan,clip:baseClip,expectedEditor:null,editor:fakeEditor,clipUpdates:{}}),{code:'PRODUCER_APPLY_CONFLICT'});
  assert.equal(await db.collection('editor_projects').countDocuments({clip_id:conflicted.clip}),0);
  await db.collection('clips').deleteOne({id:rollback.clip});await assert.rejects(apply(rollback),{code:'CLIP_NOT_FOUND'});
 }finally{
  (ClipRenderService as any).renderClipJob=oldWorker;(EntitlementService as any).resolveUserEntitlements=oldPlan;
  if(oldGate===undefined)delete process.env.VIREO_RENDER_ADMISSION_V1;else process.env.VIREO_RENDER_ADMISSION_V1=oldGate;
  for(const name of ['projects','transcripts','clips','producer_plans','render_jobs','editor_projects','render_quota_fences'])await db.collection(name).deleteMany({user_id:{$in:owners}});
  storage.closeAllConnections();await new Promise<void>(r=>storage.close(()=>r()));Object.assign(config,savedConfig);await closeMongo();
 }
});
