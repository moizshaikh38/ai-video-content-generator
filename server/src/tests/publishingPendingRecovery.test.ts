import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// Durable worker qualification only: local Mongo is real, provider delivery is a
// strict fixture. This never connects an account, uploads media or publishes.
test('pending delivery survives worker recreation and resolves without another upload', {
  skip: !process.env.POSTING_TEST_MONGODB_URI,
}, async () => {
  const uri = new URL(process.env.POSTING_TEST_MONGODB_URI!);
  assert.equal(uri.protocol,'mongodb:');
  assert(['127.0.0.1','localhost','[::1]'].includes(uri.hostname));
  assert(!uri.username && !uri.password,'Only credential-free isolated loopback Mongo is allowed');
  const uid=crypto.randomUUID();
  const keys=['NODE_ENV','MONGODB_URI','MONGODB_DB_NAME','SUPABASE_URL','SUPABASE_SECRET_KEY','TOKEN_ENCRYPTION_KEY'];
  const prior=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  Object.assign(process.env,{NODE_ENV:'test',MONGODB_URI:process.env.POSTING_TEST_MONGODB_URI,MONGODB_DB_NAME:'vireo_posting_test_'+uid.replaceAll('-',''),SUPABASE_URL:'http://127.0.0.1:1',SUPABASE_SECRET_KEY:'fixture'});
  // Existing test-only token encryption fallback, never an external credential.
  const {getMongoDb,closeMongo}=await import('../db/mongoClient.js');
  const {encryptToken}=await import('../utils/tokenEncryption.js');
  const {publishingService}=await import('../services/publishingService.js');
  const {socialPublishingRegistry}=await import('../services/publishing/socialPublishingRegistry.js');
  const provider=socialPublishingRegistry.getProvider('tiktok');
  const originalPublish=provider.publish, originalResolve=provider.resolvePending;
  const db=await getMongoDb();
  let uploads=0,reads=0;
  let state:'pending'|'published'|'error'|'failed'='pending';
  provider.publish=async request=>{uploads++;assert.deepEqual(request.grantedScopes,['video.publish']);return {outcome:'pending',providerPostId:'fixture-receipt',metadata:{privacy:'private',publishId:'fixture-receipt'}};};
  provider.resolvePending=async(token,id)=>{
    reads++;assert.equal(token,'fixture-not-live');assert.equal(id,'fixture-receipt');
    if(state==='error')throw Error('fixture status timeout');
    if(state==='failed')throw Object.assign(Error('fixture platform rejection'),{code:'TIKTOK_SUBMISSION_FAILED'});
    return {outcome:state,providerPostId:state==='published'?'fixture-video':'fixture-receipt',metadata:{confirmation:state==='published'?'PUBLISH_COMPLETE':'PROCESSING_DOWNLOAD'}};
  };
  const connection={id:'connection',user_id:uid,provider:'tiktok',provider_account_id:'fixture-account',status:'connected',scopes:['video.publish'],access_token:encryptToken('fixture-not-live')};
  const post=(id:string)=>({id,user_id:uid,project_id:'fixture-project',social_connection_id:'connection',provider:'tiktok',provider_account_id:'fixture-account',status:'publishing',payload:{privacy:'private'},retry_count:0,request_fingerprint:id,created_at:new Date(),updated_at:new Date()});
  const job=(id:string,postId:string)=>({id,user_id:uid,published_post_id:postId,status:'publishing',attempts:0,scheduled_for:new Date(),locked_at:new Date(),created_at:new Date(),updated_at:new Date()});
  async function due(id='job') {await db.collection('publish_jobs').updateOne({id},{$set:{scheduled_for:new Date(0)}});return publishingService.processDueJobs();}
  async function saved(id='post'){return (await db.collection('published_posts').findOne({id}))!;}
  try {
    await db.collection('social_account_connections').insertOne(connection);
    await db.collection('published_posts').insertOne(post('post'));
    await db.collection('publish_jobs').insertOne(job('job','post'));
    await publishingService.executePublishJob('job');
    assert.equal(uploads,1);assert.equal(reads,0);
    assert.equal((await saved()).status,'publishing');assert.equal((await saved()).published_at,undefined);
    let stored=(await db.collection('publish_jobs').findOne({id:'job'}))!;
    assert.equal(stored.provider_pending_id,'fixture-receipt');assert.equal(stored.status,'scheduled');assert(stored.provider_attempt_started_at instanceof Date);
    assert.equal(await publishingService.processDueJobs(),0,'Future status check is not polled early');
    // A fresh service object has no local session/receipt state. It reads Mongo.
    const fresh=Object.create(Object.getPrototypeOf(publishingService)) as typeof publishingService;
    await db.collection('publish_jobs').updateOne({id:'job'},{$set:{scheduled_for:new Date(0)}});
    assert.equal(await fresh.processDueJobs(),1);assert.equal(uploads,1);assert.equal(reads,1);
    assert.equal((await saved()).status,'publishing');
    state='error';await due();assert.equal(uploads,1);assert.equal((await saved()).status,'publishing');
    stored=(await db.collection('publish_jobs').findOne({id:'job'}))!;assert.equal(stored.provider_pending_id,'fixture-receipt');assert.equal(stored.status,'scheduled');
    state='published';await due();assert.equal(uploads,1);assert.equal((await saved()).status,'published');assert.equal((await saved()).provider_post_id,'fixture-video');assert((await saved()).published_at instanceof Date);
    const before=reads;await fresh.executePublishJob('job');assert.equal(reads,before);assert.equal(uploads,1);
    // Unknown dispatch with no persisted receipt can never re-upload.
    await db.collection('published_posts').insertOne(post('unknown'));
    await db.collection('publish_jobs').insertOne({...job('unknown-job','unknown'),provider_attempt_started_at:new Date()});
    await fresh.executePublishJob('unknown-job');assert.equal(uploads,1);assert.equal((await saved('unknown')).last_error_code,'PUBLISH_OUTCOME_UNKNOWN');
    await assert.rejects(fresh.retryFailedPost(uid,'unknown'),{code:'PUBLISH_OUTCOME_UNKNOWN'});
    // Scope mismatch fails BEFORE any dispatch marker or external call.
    await db.collection('social_account_connections').updateOne({id:'connection'},{$set:{scopes:['video.upload']}});
    await db.collection('published_posts').insertOne(post('scope'));
    await db.collection('publish_jobs').insertOne(job('scope-job','scope'));
    await fresh.executePublishJob('scope-job');assert.equal(uploads,1);assert.equal((await saved('scope')).last_error_code,'TIKTOK_DIRECT_POST_SCOPE_REQUIRED');
    assert.equal((await db.collection('publish_jobs').findOne({id:'scope-job'}))!.provider_attempt_started_at,undefined);
    await db.collection('social_account_connections').updateOne({id:'connection'},{$set:{scopes:['video.publish']}});
    // Rebinding a connection cannot redirect even a status lookup.
    await db.collection('published_posts').insertOne(post('rebound'));
    await db.collection('publish_jobs').insertOne({...job('rebound-job','rebound'),provider_attempt_started_at:new Date(),provider_pending_id:'fixture-receipt',provider_pending_started_at:new Date()});
    await db.collection('social_account_connections').updateOne({id:'connection'},{$set:{provider_account_id:'different-account'}});
    await fresh.executePublishJob('rebound-job');assert.equal(reads,before);assert.equal((await saved('rebound')).last_error_code,'PUBLISH_ACCOUNT_CHANGED');
    await db.collection('social_account_connections').updateOne({id:'connection'},{$set:{provider_account_id:'fixture-account'}});
    // Definitive platform rejection is never labelled published or auto-resent.
    state='failed';await db.collection('published_posts').insertOne(post('rejected'));
    await db.collection('publish_jobs').insertOne({...job('rejected-job','rejected'),provider_attempt_started_at:new Date(),provider_pending_id:'fixture-receipt',provider_pending_started_at:new Date()});
    await fresh.executePublishJob('rejected-job');assert.equal((await saved('rejected')).last_error_code,'TIKTOK_SUBMISSION_FAILED');assert.equal(uploads,1);
    await assert.rejects(fresh.retryFailedPost(uid,'rejected'),{code:'PUBLISH_OUTCOME_UNKNOWN'});
    // Status horizon expiry asks for review rather than starting a new delivery.
    await db.collection('published_posts').insertOne(post('expired'));
    await db.collection('publish_jobs').insertOne({...job('expired-job','expired'),provider_attempt_started_at:new Date(),provider_pending_id:'fixture-receipt',provider_pending_started_at:new Date(Date.now()-25*3600000)});
    const beforeExpiry=reads;await fresh.executePublishJob('expired-job');assert.equal(reads,beforeExpiry);assert.equal((await saved('expired')).last_error_code,'PUBLISH_OUTCOME_UNKNOWN');assert.equal(uploads,1);
  } finally {
    provider.publish=originalPublish;provider.resolvePending=originalResolve;
    await db.dropDatabase();await closeMongo();
    for(const k of keys){if(prior[k]===undefined)delete process.env[k];else process.env[k]=prior[k];}
  }
});
