import crypto from 'node:crypto';import http from 'node:http';import test from 'node:test';import assert from 'node:assert/strict';
test('marked autopilot publishing binds approval and refuses stale admission and dispatch', {skip:!process.env.POSTING_TEST_MONGODB_URI}, async()=>{
const uri=new URL(process.env.POSTING_TEST_MONGODB_URI!);assert.equal(uri.protocol,'mongodb:');assert(['localhost','127.0.0.1','[::1]'].includes(uri.hostname));assert(!uri.username&&!uri.password);
const keys=['MONGODB_URI','MONGODB_DB_NAME','NODE_ENV','SUPABASE_URL','SUPABASE_SECRET_KEY'];const prior=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
process.env.MONGODB_URI=process.env.POSTING_TEST_MONGODB_URI;process.env.MONGODB_DB_NAME='vireo_punch1161_'+crypto.randomUUID().replaceAll('-','');process.env.NODE_ENV='test';process.env.SUPABASE_URL='http://127.0.0.1:1';process.env.SUPABASE_SECRET_KEY='fixture';
const storage=http.createServer((_q,r)=>{r.setHeader('ETag','"fixture"');r.setHeader('Content-Length','7');r.end();});await new Promise<void>(r=>storage.listen(0,'127.0.0.1',r));const address=storage.address();if(!address||typeof address==='string')throw Error('address');
const {config}=await import('../config/index.js');Object.assign(config,{r2AccountId:'fixture',r2AccessKeyId:'fixture',r2SecretAccessKey:'fixture',r2SourceBucket:'source',r2Endpoint:`http://127.0.0.1:${address.port}`});
const {getMongoDb,closeMongo}=await import('../db/mongoClient.js');const {transcriptContentIdentity}=await import('../shared/transcriptSourceBinding.js');const {selectionSourceReceipt}=await import('../shared/selectionSourceReceipt.js');const {ProEditorService:P}=await import('../services/proEditorService.js');
const db=await getMongoDb(),user=crypto.randomUUID(),project=crypto.randomUUID(),clip=crypto.randomUUID();
const words=[{word:'money',start:11,end:11.5},{word:'never',start:15,end:15.5},{word:'million',start:19,end:19.5},{word:'profit',start:22,end:22.5}];const transcript:any={id:crypto.randomUUID(),user_id:user,project_id:project,duration_seconds:30,transcript_text:words.map(w=>w.word).join(' '),words,segments:words.map(w=>({start:w.start,end:w.end,text:w.word}))};transcript.source_binding={version:1,source_receipt:{key:'fixture/key',size:7,etag:'"fixture"',sha256:'a'.repeat(64)},prepared_audio_sha256:'b'.repeat(64),requests:[{sha256:'b'.repeat(64),bytes:7,status:'completed'}],transcript_content_sha256:transcriptContentIdentity(transcript)};
try{await db.collection('projects').insertOne({id:project,user_id:user,source_url:'fixture/key',duration_seconds:30});await db.collection('transcripts').insertOne(transcript);await db.collection('clips').insertOne({id:clip,user_id:user,project_id:project,start_seconds:10,end_seconds:24,duration_seconds:14,trim_start_offset:3,trim_end_offset:3,aspect_ratio:'9:16',crop_mode:'center',render_status:'draft',render_version:1,editor_version:1,source_storage_path:'fixture/key',selection_source_receipt:selectionSourceReceipt(transcript,'fixture/key'),caption_enabled:true,caption_style:'vireo_comic_default'});
const {ProducerRenderService:R}=await import('../services/producerRenderService.js');const {ClipRenderService:C}=await import('../services/clipRenderService.js');const {EntitlementService:E}=await import('../services/entitlementService.js');const {ownerContext}=await import('../db/repositories/dataRepository.js');
process.env.VIREO_RENDER_ADMISSION_V1='1';C.renderClipJob=async()=>{};E.resolveUserEntitlements=async()=>({isUnlimited:true,allowedSubtitlePresets:['simple','clean','vireo_comic_default']}) as any;
const plan=crypto.randomUUID();await db.collection('producer_plans').insertOne({id:plan,user_id:user,clip_id:clip,status:'draft',operations:[{id:'fade',type:'NORMALIZE_AUDIO',enabled:true,parameters:{gain_db:6,target_lufs:-16}}]});
const e=await P.getOrCreateEditorProject(clip,user);const videos=e.tracks.find(t=>t.type==='VIDEO')!.items;const before=videos.map(i=>({source:[i.source_start,i.source_end],timeline:[i.timeline_start,i.timeline_end],fade:[i.audio?.fade_in,i.audio?.fade_out],volume:i.audio?.volume}));
const {HookLabService:H}=await import('../services/hookLabService.js');const {commitHookGeneration}=await import('../db/repositories/hookGenerationRepository.js');const {getMongoClient}=await import('../db/mongoClient.js');const {BrandContextService:B}=await import('../services/brand/brandContextService.js');
const concurrent=await Promise.allSettled([H.getOrCreateSession(user,clip),H.getOrCreateSession(user,clip)]);const sessions=await db.collection('hook_lab_sessions').find({clip_id:clip}).toArray();if(sessions.length!==1)throw Error('duplicate sessions');const session=sessions[0];const preserved:any={id:crypto.randomUUID(),user_id:user,hook_lab_session_id:session.id,text:'MANUAL ORIGINAL',locked:true,manual_edit:true,approved:true,applied:false,status:'EDITED',delivery_mode:'TEXT_OVERLAY',source_evidence:[],scores:{},explanation:{summary:'ORIGINAL'},overall_hook_fit:40};await db.collection('hook_candidates').insertOne(preserved);
const {editorRenderSnapshot}=await import('../shared/editorRenderSnapshot.js');const {enqueueRenderJob}=await import('../db/repositories/renderAdmissionRepository.js');const {commitFencedRenderOutcome}=await import('../services/queue/renderLeaseCommit.js');const {AutopilotService:A}=await import('../services/autopilotService.js');const {ContentPackService:CP}=await import('../services/contentPackService.js');
await db.collection('hook_candidates').updateOne({id:preserved.id},{$set:{text_overlay_plan:{text:'MANUAL ORIGINAL',start_time:.5,end_time:2.5,position_y:.22,font_size:48,font_family:'Inter',color:'#ffffff'}}});
const oldPrepare=P.prepareEditorRevision;P.prepareEditorRevision=async(...args:any[])=>{const result=await (oldPrepare as any).apply(P,args);await db.collection('clips').updateOne({id:clip},{$set:{trim_start_offset:4}});return result;};
let applyRace:any;try{await H.applyCandidateToEditor(session.id,preserved.id,user,e.id)}catch(e:any){applyRace={code:e.code,status:e.statusCode}}P.prepareEditorRevision=oldPrepare;
const racedCandidate=await db.collection('hook_candidates').findOne({id:preserved.id}),racedEditor=await db.collection('editor_projects').findOne({id:e.id});if(!applyRace||racedCandidate!.applied||racedEditor!.version!==e.version)throw Error('apply race leaked');await db.collection('clips').updateOne({id:clip},{$set:{trim_start_offset:3}});
await H.applyCandidateToEditor(session.id,preserved.id,user,e.id);
const editor=await db.collection('editor_projects').findOne({id:e.id}),savedClip=await db.collection('clips').findOne({id:clip}),snap=editorRenderSnapshot(editor);
const admission=await enqueueRenderJob({userId:user,clipId:clip,expectedRenderVersion:savedClip!.render_version,expectedEditorVersion:savedClip!.editor_version,expectedEditorProject:snap,quotaPolicy:{kind:'unlimited'}});
const worker=crypto.randomUUID();await db.collection('render_jobs').updateOne({id:admission.job.id},{$set:{status:'processing',worker_id:worker}});
const artifactKey=`users/${user}/projects/${project}/clips/${clip}/v${admission.renderVersion}/attempts/${crypto.randomUUID()}/render.mp4`;const artifact={version:1,key:artifactKey,size:7,etag:'"fixture"',sha256:'c'.repeat(64),job_id:admission.job.id,render_version:admission.renderVersion,editor_version:savedClip!.editor_version,editor_project:snap};
// Exercise actual fenced completion repository, not encoding/upload/native work.
await commitFencedRenderOutcome(await getMongoClient(),db,{jobId:admission.job.id,clipId:clip,userId:user,workerId:worker,renderVersion:admission.renderVersion,editorVersion:savedClip!.editor_version,editorProject:snap},{job:{output_artifact_receipt:artifact,status:'completed',worker_id:null},clip:{output_artifact_receipt:artifact,render_status:'ready',rendered_editor_version:snap!.version,rendered_editor_digest:snap!.digest,output_storage_path:artifactKey,output_object_key:artifactKey}});
const pack=crypto.randomUUID();await db.collection('content_packs').insertOne({id:pack,user_id:user,clip_id:clip,project_id:project});
const run:any={id:crypto.randomUUID(),user_id:user,clip_id:clip,project_id:project,hook_session_id:session.id,selected_hook_candidate_id:preserved.id,status:'COMPLETED',content_pack_id:pack,settings:{target_platform:'tiktok'},steps:[{step:'HOOK_LAB',status:'COMPLETED',artifacts:{hook_text:preserved.text}},{step:'APPROVAL',status:'PENDING'}]};await db.collection('autopilot_runs').insertOne(run);
CP.getPublishHandoffPayload=async()=>({title:'Fixture handoff',caption:'Fixture',platform:'tiktok'}) as any;
const oldGetRun=A.getRun,pack2=crypto.randomUUID();await db.collection('content_packs').insertOne({id:pack2,user_id:user,clip_id:clip,project_id:project});let initialChanged=false,requestedPack:any;
A.getRun=async(...args:any[])=>{const result=await(oldGetRun as any).apply(A,args);if(!initialChanged){initialChanged=true;await db.collection('autopilot_runs').updateOne({id:run.id},{$set:{content_pack_id:pack2}});}return result;};CP.getPublishHandoffPayload=async(_user:any,p:any)=>{requestedPack=p;return {title:'New snapshot pack',source_content_pack_id:p}as any;};
const readRace=await A.approveRun(user,run.id,{});A.getRun=oldGetRun;if(requestedPack!==pack2||readRace.publishing_handoff.source_content_pack_id!==pack2)throw Error('two run reads mixed');await db.collection('autopilot_runs').updateOne({id:run.id},{$set:{content_pack_id:pack}});CP.getPublishHandoffPayload=async()=>({title:'Fixture handoff',caption:'Fixture',platform:'tiktok'})as any;
const valid=await A.approveRun(user,run.id,{});
const {publishingService:PS}=await import('../services/publishingService.js');const {socialPublishingRegistry:registry}=await import('../services/publishing/socialPublishingRegistry.js');const originalProvider=registry.getProvider;registry.getProvider=(()=>({getCapabilities:()=>({supportsVideo:true,supportsTextOnly:false,supportsScheduling:true}),validatePublishRequest:()=>({valid:true,errors:[]})}))as any;
const connection=crypto.randomUUID();await db.collection('social_account_connections').insertOne({id:connection,user_id:user,provider:'youtube',provider_account_id:'fixture-account'});

const dto:any={userId:user,projectId:project,clipId:clip,socialConnectionId:connection,payload:{title:'Fixture post',description:'No provider calls',privacy:'private',platform_custom:{autopilot_run_id:run.id}},publishType:'scheduled',scheduledFor:new Date(Date.now()+3600000).toISOString()};
const beforePosts=await db.collection('published_posts').countDocuments({});
// Force a post insertion failure inside the transaction: neither the post/job
// nor preceding proof fences may escape it.
const prototype=Object.getPrototypeOf(db.collection('published_posts'));const originalInsert=prototype.insertOne;let failInsert=true;
prototype.insertOne=async function(...args:any[]){if(this.collectionName==='published_posts'&&failInsert)throw Error('fixture rollback');return originalInsert.apply(this,args)};
let rollback=false;try{await PS.createPublishPost(dto)}catch(e:any){rollback=e.message==='fixture rollback'}finally{failInsert=false;prototype.insertOne=originalInsert;}
if(!rollback||await db.collection('published_posts').countDocuments({})!==beforePosts||await db.collection('publish_jobs').countDocuments({})!==0)throw Error('transaction rollback failed');
// Change the candidate after proof preflight but before its transactional read.
const proto=Object.getPrototypeOf(await getMongoClient()), originalStart=proto.startSession;let changedInRace=false;
proto.startSession=function(...args:any[]){const tx=originalStart.apply(this,args), original=tx.withTransaction.bind(tx);tx.withTransaction=async(...txArgs:any[])=>{if(!changedInRace){changedInRace=true;await db.collection('hook_candidates').updateOne({id:preserved.id},{$set:{text:'admission race'}})}return original(...txArgs)};return tx};
let race:any;try{await PS.createPublishPost(dto)}catch(e:any){race={code:e.code,status:e.statusCode}}finally{proto.startSession=originalStart;await db.collection('hook_candidates').updateOne({id:preserved.id},{$set:{text:'MANUAL ORIGINAL'}})}
if(!race||await db.collection('published_posts').countDocuments({})!==beforePosts||await db.collection('publish_jobs').countDocuments({})!==0)throw Error('admission race leaked');
const result=await PS.createPublishPost(dto);const validReceipt=(result.post as any).autopilot_hook_receipt;if(!validReceipt)throw Error('missing receipt');
// A marker without a receipt, or a modified stored receipt, cannot reach token access.
for(const receipt of [undefined,{...validReceipt,approval_identity:'forged'}]){
 const forged=await PS.createPublishPost({...dto,scheduledFor:new Date(Date.now()+Math.random()*600000+14400000).toISOString()});
 await db.collection('published_posts').updateOne({id:forged.post.id},receipt?{$set:{autopilot_hook_receipt:receipt}}:{$unset:{autopilot_hook_receipt:1}});
 await db.collection('publish_jobs').updateOne({id:forged.job!.id},{$set:{status:'publishing'}});await PS.executePublishJob(forged.job!.id);
 const j=await db.collection('publish_jobs').findOne({id:forged.job!.id});assert.equal(j!.status,'failed');assert(!j!.provider_attempt_started_at);
}
await db.collection('hook_candidates').updateOne({id:preserved.id},{$set:{text:'CHANGED AFTER APPROVAL'}});let stale:any;try{await PS.createPublishPost({...dto,scheduledFor:new Date(Date.now()+7200000).toISOString()})}catch(e:any){stale={code:e.code,status:e.statusCode}};
await db.collection('publish_jobs').updateOne({id:result.job!.id},{$set:{status:'publishing'}});await PS.executePublishJob(result.job!.id);const failed=await db.collection('publish_jobs').findOne({id:result.job!.id});if(!stale||failed!.status!=='failed')throw Error('stale sent');
// Fake-only late dispatch race: valid approval passes initial worker guard,
// then candidate changes during media preparation. No real adapter is called.
await db.collection('hook_candidates').updateOne({id:preserved.id},{$set:{text:'MANUAL ORIGINAL'}});
(config as any).socialTokenEncryptionKey='local-fixture-key-not-an-account-secret';const {encryptToken}=await import('../utils/tokenEncryption.js');
await db.collection('social_account_connections').updateOne({id:connection},{$set:{provider:'instagram',scopes:['instagram_content_publish'],access_token:encryptToken('fake-local-token')}});
const late=await PS.createPublishPost({...dto,scheduledFor:new Date(Date.now()+10800000).toISOString()});
let mediaReads=0,publishCalls=0;const previousListener=storage.listeners('request')[0];storage.removeAllListeners('request');storage.on('request',async(q,r)=>{mediaReads++;if(mediaReads===2)await db.collection('hook_candidates').updateOne({id:preserved.id},{$set:{text:'late changed'}});(previousListener as any)(q,r)});
registry.getProvider=(()=>({publish:async()=>{publishCalls++;throw Error('must not publish')}}))as any;
await db.collection('publish_jobs').updateOne({id:late.job!.id},{$set:{status:'publishing'}});await PS.executePublishJob(late.job!.id);const lateJob=await db.collection('publish_jobs').findOne({id:late.job!.id});if(mediaReads<2||publishCalls!==0||lateJob!.status!=='failed'||lateJob!.provider_attempt_started_at)throw Error('late dispatch race leaked');registry.getProvider=originalProvider;
// The same current package can cross the final fence to a strictly local fake
// adapter once, and later executions cannot upload it again.
storage.removeAllListeners('request');storage.on('request',previousListener as any);
await db.collection('hook_candidates').updateOne({id:preserved.id},{$set:{text:'MANUAL ORIGINAL'}});
registry.getProvider=(()=>({getCapabilities:()=>({supportsVideo:true,supportsTextOnly:false,supportsScheduling:true}),validatePublishRequest:()=>({valid:true,errors:[]}),publish:async()=>{publishCalls++;return {outcome:'published',providerPostId:'local-only-fixture-post',providerPostUrl:'https://example.invalid/local-fixture'}}}))as any;
const positive=await PS.createPublishPost({...dto,scheduledFor:new Date(Date.now()+18000000).toISOString()});
await db.collection('publish_jobs').updateOne({id:positive.job!.id},{$set:{status:'publishing'}});await PS.executePublishJob(positive.job!.id);await PS.executePublishJob(positive.job!.id);
assert.equal(publishCalls,1);assert.equal((await db.collection('published_posts').findOne({id:positive.post.id}))!.status,'published');registry.getProvider=originalProvider;
// Instagram container preparation is not publication. Exercise the actual
// provider continuation with only graph/status/quota fixture methods.
const {InstagramPublishingProvider}=await import('../services/publishing/providers/instagramPublishingProvider.js');const ig:any=new InstagramPublishingProvider();let mediaPublish=0;
ig.resolvePending=async()=>({outcome:'pending',providerPostId:'123',metadata:{confirmation:'FINISHED'}});ig.publishingQuota=async()=>({usage:0,total:25});ig.graph=async()=>{mediaPublish++;return {id:'456'}};
registry.getProvider=(()=>ig)as any;
await db.collection('social_account_connections').updateOne({id:connection},{$set:{provider_account_id:'789'}});
for(const [name,staleWords,started]of [['stale',true,false],['current',false,false],['already-dispatched',true,true]]as const){
 await db.collection('hook_candidates').updateOne({id:preserved.id},{$set:{text:'MANUAL ORIGINAL'}});
 const pending=await PS.createPublishPost({...dto,payload:{...dto.payload,privacy:'public'},scheduledFor:new Date(Date.now()+20000000+Math.random()*100000).toISOString()});
 await db.collection('publish_jobs').updateOne({id:pending.job!.id},{$set:{status:'publishing',provider_attempt_started_at:new Date(),provider_pending_started_at:new Date(),provider_pending_id:'123',provider_pending_metadata:{creationId:'123',selectedAccountId:'789',publishDispatchStarted:started}}});
 if(staleWords)await db.collection('hook_candidates').updateOne({id:preserved.id},{$set:{text:'pending changed'}});
 const before=mediaPublish;await PS.executePublishJob(pending.job!.id);const currentJob=await db.collection('publish_jobs').findOne({id:pending.job!.id});
 if(name==='stale'){assert.equal(mediaPublish,before);assert.equal(currentJob!.status,'failed');assert.notEqual(currentJob!.provider_pending_metadata.publishDispatchStarted,true);}
 if(name==='current'){assert.equal(mediaPublish,before+1);assert.equal(currentJob!.status,'completed');}
 if(name==='already-dispatched'){assert.equal(mediaPublish,before);assert.equal(currentJob!.status,'scheduled');}
}
registry.getProvider=originalProvider;
assert.equal(rollback,true);assert.equal(race.status,409);assert.equal(lateJob!.status,'failed');
}finally{await db.dropDatabase();await closeMongo();storage.closeAllConnections();await new Promise<void>(r=>storage.close(()=>r()));}
for(const k of keys){if(prior[k]===undefined)delete process.env[k];else process.env[k]=prior[k];}
});
