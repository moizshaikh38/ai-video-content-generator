import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
// Actual native Instagram provider + real isolated Mongo. Social responses and
// media URL are fixtures. No real account, storage fetch, upload or post occurs.
test('Instagram receipt/checkpoint survives worker recreation and uncertain dispatch without duplicate publication',{skip:!process.env.POSTING_TEST_MONGODB_URI},async()=>{
 const uri=new URL(process.env.POSTING_TEST_MONGODB_URI!);assert.equal(uri.protocol,'mongodb:');assert(['127.0.0.1','localhost'].includes(uri.hostname));assert(!uri.username&&!uri.password);
 const keys=['NODE_ENV','MONGODB_URI','MONGODB_DB_NAME','SUPABASE_URL','SUPABASE_SECRET_KEY'];const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));const id=crypto.randomUUID();
 Object.assign(process.env,{NODE_ENV:'test',MONGODB_URI:uri.toString(),MONGODB_DB_NAME:'vireo_ig_test_'+id.replaceAll('-',''),SUPABASE_URL:'http://127.0.0.1:1',SUPABASE_SECRET_KEY:'fixture'});
 const {getMongoDb,closeMongo}=await import('../db/mongoClient.js');const {encryptToken}=await import('../utils/tokenEncryption.js');const {publishingService}=await import('../services/publishingService.js');const {socialPublishingRegistry}=await import('../services/publishing/socialPublishingRegistry.js');
 const db=await getMongoDb(),provider=socialPublishingRegistry.getProvider('instagram'),originalPublish=provider.publish,originalFetch=globalThis.fetch;
 let quotaUsage=2,quotaReads=0;
 const replies:(any|Error)[]=[],calls:{url:string;method:string}[]=[];
 provider.publish=function(r){return originalPublish.call(this,{...r,mediaUrl:'https://media.invalid/fixture.mp4'});};
 globalThis.fetch=async(url,options)=>{if(String(url).includes('/content_publishing_limit?')){quotaReads++;return new Response(JSON.stringify({data:[{quota_usage:quotaUsage,config:{quota_total:100,quota_duration:86400}}]}));}calls.push({url:String(url),method:options?.method||'GET'});const r=replies.shift();assert(r,'Unexpected fixture network call');if(r instanceof Error)throw r;return new Response(JSON.stringify(r));};
 const post=(name:string)=>({id:name,user_id:id,project_id:'fixture',social_connection_id:'connection',provider:'instagram',provider_account_id:'222',status:'publishing',payload:{privacy:'public'},retry_count:0,request_fingerprint:name,created_at:new Date(),updated_at:new Date()});
 const job=(name:string)=>({id:name,user_id:id,published_post_id:name,status:'publishing',attempts:0,scheduled_for:new Date(),locked_at:new Date(),created_at:new Date(),updated_at:new Date()});
 const fresh=()=>Object.create(Object.getPrototypeOf(publishingService)) as typeof publishingService;
 const read=async(name='pending')=>(await db.collection('published_posts').findOne({id:name}))!;
 const stored=async(name='pending')=>(await db.collection('publish_jobs').findOne({id:name}))!;
 async function due(){await db.collection('publish_jobs').updateOne({id:'pending'},{$set:{scheduled_for:new Date(0)}});return fresh().processDueJobs();}
 try{
  await db.collection('social_account_connections').insertOne({id:'connection',user_id:id,provider:'instagram',provider_account_id:'222',status:'connected',scopes:['instagram_content_publish'],access_token:encryptToken('fixture-not-live')});
  await db.collection('published_posts').insertOne(post('pending'));await db.collection('publish_jobs').insertOne(job('pending'));
  replies.push({id:'222',username:'selected'},{id:'333'});await publishingService.executePublishJob('pending');assert.equal((await read()).status,'publishing');assert.equal((await stored()).provider_pending_id,'333');assert.equal((await stored()).provider_pending_metadata.publishDispatchStarted,false);assert.equal(calls.length,2);
  replies.push({status_code:'IN_PROGRESS'});await due();assert.equal((await read()).status,'publishing');assert.equal(calls.length,3);
  replies.push({status_code:'FINISHED'},Error('fixture lost publish response'));await due();assert.equal((await stored()).provider_pending_metadata.publishDispatchStarted,true);assert.equal((await stored()).status,'scheduled');assert.equal((await read()).status,'publishing');
  replies.push({status_code:'FINISHED'});await due();assert.equal((await read()).status,'publishing');assert.equal(calls.filter(c=>c.url.endsWith('/media_publish')).length,1);
  replies.push({status_code:'PUBLISHED'});await due();assert.equal((await read()).status,'published');assert.equal((await read()).provider_post_id,'333');assert.equal((await read()).metadata.providerIdKind,'container_receipt');assert.equal((await read()).metadata.captionAttachmentVerified,false);assert.equal((await stored()).status,'completed');assert.equal(calls.filter(c=>c.url.endsWith('/222/media')).length,1);assert.equal(calls.filter(c=>c.url.endsWith('/media_publish')).length,1);
  const count=calls.length;await fresh().executePublishJob('pending');assert.equal(calls.length,count);
  // Checkpointed FINISHED stays read-only even if a separate worker started it.
  await db.collection('published_posts').insertOne(post('partial'));await db.collection('publish_jobs').insertOne({...job('partial'),provider_attempt_started_at:new Date(),provider_pending_id:'555',provider_pending_started_at:new Date(),provider_pending_metadata:{creationId:'555',selectedAccountId:'222',publishDispatchStarted:false}});
  replies.push({status_code:'FINISHED'},{id:'777',config_issue:'CAPTION_NOT_ATTACHED'});await fresh().executePublishJob('partial');assert.equal((await read('partial')).status,'published');assert.equal((await read('partial')).provider_post_id,'777');assert.equal((await read('partial')).metadata.partialSuccess,true);assert.equal((await read('partial')).last_error_code,'PUBLISHED_REVIEW_REQUIRED');assert.match((await read('partial')).last_error_message,/Published, but Instagram/);assert.deepEqual((await read('partial')).metadata.warnings,['CAPTION_NOT_ATTACHED']);
  // Five-minute horizon ends automatic reads, retaining receipt for review.
  await db.collection('published_posts').insertOne(post('expired'));await db.collection('publish_jobs').insertOne({...job('expired'),provider_attempt_started_at:new Date(),provider_pending_id:'888',provider_pending_started_at:new Date(Date.now()-301000),provider_pending_metadata:{creationId:'888',selectedAccountId:'222',publishDispatchStarted:true}});
  const before=calls.length;await fresh().executePublishJob('expired');assert.equal(calls.length,before);assert.equal((await read('expired')).last_error_code,'PUBLISH_OUTCOME_UNKNOWN');assert.equal((await stored('expired')).provider_pending_id,'888');
  // Two workers observing FINISHED concurrently still share one majority
  // checkpoint and may dispatch media_publish only once.
  await db.collection('published_posts').insertOne(post('race'));await db.collection('publish_jobs').insertOne({...job('race'),provider_attempt_started_at:new Date(),provider_pending_id:'999',provider_pending_started_at:new Date(),provider_pending_metadata:{creationId:'999',selectedAccountId:'222',publishDispatchStarted:false}});
  const fixtureFetch=globalThis.fetch;let release!:()=>void,arrived=0;const barrier=new Promise<void>(r=>{release=r;});
  globalThis.fetch=async(url,options)=>{if(String(url).includes('/999?')){if(++arrived===2)release();await barrier;}return fixtureFetch(url,options);};
  replies.push({status_code:'FINISHED'},{status_code:'FINISHED'},{id:'1000'});const beforeRace=calls.filter(c=>c.url.endsWith('/media_publish')).length;
  try{await Promise.all([fresh().executePublishJob('race'),fresh().executePublishJob('race')]);}finally{globalThis.fetch=fixtureFetch;}
  assert.equal(arrived,2);assert.equal(calls.filter(c=>c.url.endsWith('/media_publish')).length,beforeRace+1);assert.equal((await read('race')).status,'published');assert.equal((await read('race')).provider_post_id,'1000');
  // A stale IN_PROGRESS result cannot erase a concurrent irreversible marker.
  const monoPost=post('monotonic'),monoJob={...job('monotonic'),provider_attempt_started_at:new Date(),provider_pending_id:'1010',provider_pending_started_at:new Date(),provider_pending_metadata:{creationId:'1010',selectedAccountId:'222',publishDispatchStarted:true}};
  await db.collection('published_posts').insertOne(monoPost);await db.collection('publish_jobs').insertOne(monoJob);
  await assert.rejects((fresh() as any).recordPublishOutcome({...monoJob,provider_pending_metadata:{...monoJob.provider_pending_metadata,publishDispatchStarted:false}},monoPost,{outcome:'pending',providerPostId:'1010',metadata:{...monoJob.provider_pending_metadata,publishDispatchStarted:false,confirmation:'IN_PROGRESS'}}),{code:'PUBLISH_RECEIPT_NOT_SAVED'});
  assert.equal((await stored('monotonic')).provider_pending_metadata.publishDispatchStarted,true);
  // Capacity exhaustion waits on the same durable receipt before dispatch;
  // once the dynamic response permits it, publish exactly once, with no upload.
  await db.collection('published_posts').insertOne(post('quota-wait'));await db.collection('publish_jobs').insertOne({...job('quota-wait'),provider_attempt_started_at:new Date(),provider_pending_id:'2020',provider_pending_started_at:new Date(),provider_pending_metadata:{creationId:'2020',selectedAccountId:'222',publishDispatchStarted:false}});
  quotaUsage=100;const quotaBefore=quotaReads,publishBefore=calls.filter(c=>c.url.endsWith('/media_publish')).length;
  replies.push({status_code:'FINISHED'});await fresh().executePublishJob('quota-wait');
  assert.equal((await read('quota-wait')).status,'publishing');assert.equal((await stored('quota-wait')).provider_pending_metadata.publishDispatchStarted,false);assert.equal((await stored('quota-wait')).provider_pending_metadata.confirmation,'publishing_quota_wait');assert.equal(quotaReads,quotaBefore+1);assert.equal(calls.filter(c=>c.url.endsWith('/media_publish')).length,publishBefore);
  quotaUsage=99;await db.collection('publish_jobs').updateOne({id:'quota-wait'},{$set:{status:'publishing'}});
  replies.push({status_code:'FINISHED'},{id:'2121'});await fresh().executePublishJob('quota-wait');
  assert.equal((await read('quota-wait')).status,'published');assert.equal((await read('quota-wait')).provider_post_id,'2121');assert.equal(calls.filter(c=>c.url.endsWith('/media_publish')).length,publishBefore+1);assert.equal((await stored('quota-wait')).provider_pending_metadata.publishingQuota.total,100);
  // A refresh that confirms removed publishing permission updates persistence,
  // not just the response object, and cannot dispatch another container.
  const {socialProviderRegistry}=await import('../services/social/socialProviderRegistry.js');
  const {socialService}=await import('../services/socialService.js');
  const oauth=socialProviderRegistry.getProvider('instagram'),refresh=oauth.refreshAccessToken;
  oauth.refreshAccessToken=async()=>({accessToken:'fixture-refreshed',scopes:[],expiresInSeconds:3000});
  try{await socialService.refreshConnection(id,'connection');}finally{oauth.refreshAccessToken=refresh;}
  assert.deepEqual((await db.collection('social_account_connections').findOne({id:'connection'}))!.scopes,[]);
  await db.collection('published_posts').insertOne(post('revoked'));await db.collection('publish_jobs').insertOne(job('revoked'));const beforeRevoked=calls.length;
  await fresh().executePublishJob('revoked');assert.equal(calls.length,beforeRevoked);assert.equal((await read('revoked')).last_error_code,'INSTAGRAM_PUBLISH_SCOPE_REQUIRED');assert.equal((await stored('revoked')).provider_attempt_started_at,undefined);
  assert.equal(replies.length,0);
 }finally{provider.publish=originalPublish;globalThis.fetch=originalFetch;await db.dropDatabase();await closeMongo();for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}}
});
