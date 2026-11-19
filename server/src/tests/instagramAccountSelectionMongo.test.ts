import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
/** Actual implementation, local isolated Mongo transactions, provider identities
 * and bearer tokens are fixtures. Never authorizes a real connection or post. */
test('explicit Instagram selection is owner-scoped, cancellable and atomic in isolated Mongo',{skip:!process.env.POSTING_TEST_MONGODB_URI},async()=>{
  const uri=new URL(process.env.POSTING_TEST_MONGODB_URI!);assert.equal(uri.protocol,'mongodb:');assert(['127.0.0.1','localhost'].includes(uri.hostname));assert(!uri.username&&!uri.password);
  const keys=['NODE_ENV','MONGODB_URI','MONGODB_DB_NAME','SUPABASE_URL','SUPABASE_SECRET_KEY'];const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  Object.assign(process.env,{NODE_ENV:'test',MONGODB_URI:uri.toString(),MONGODB_DB_NAME:'vireo_ig_selection_'+crypto.randomUUID().replaceAll('-',''),SUPABASE_URL:'http://127.0.0.1:1',SUPABASE_SECRET_KEY:'fixture'});
  const {getMongoDb,closeMongo}=await import('../db/mongoClient.js');const {InstagramAccountSelectionService}=await import('../services/instagramAccountSelectionService.js');const {socialProviderRegistry}=await import('../services/social/socialProviderRegistry.js');
  const db=await getMongoDb(),provider=socialProviderRegistry.getProvider('instagram'),original=provider.listAccountIdentities,originalExchange=provider.exchangeCode,service=new InstagramAccountSelectionService();
  let choices=[{providerAccountId:'22',accountName:'Fixture Studio',username:'fixture_studio',metadata:{pageId:'101'}},{providerAccountId:'33',accountName:'Fixture Creator',username:'fixture_creator',metadata:{pageId:'102'}}],reads=0;
  provider.listAccountIdentities=async token=>{assert.equal(token,'fixture-not-live');reads++;return structuredClone(choices);};
  const token={accessToken:'fixture-not-live',expiresInSeconds:3600,scopes:['instagram_basic','pages_show_list']};
  const connection=()=>db.collection('social_account_connections').findOne({user_id:'owner',provider:'instagram'});
  const prepare=()=>service.prepare('owner',token);
  try{
    await db.collection('oauth_states').createIndex({state_hash:1},{unique:true});await db.collection('social_account_connections').createIndex({provider:1,provider_account_id:1},{unique:true});
    const initial={id:'existing',user_id:'owner',provider:'instagram',provider_account_id:'11',provider_account_name:'Existing fixture',access_token:'existing-encrypted-fixture',created_at:new Date(1000),updated_at:new Date(2000),extra_field_to_preserve:'preserved'};
    await db.collection('social_account_connections').insertOne(initial);
    // Actual OAuth callback consumes the original state once, then pauses
    // into selection instead of silently choosing even a sole candidate.
    const {socialService}=await import('../services/socialService.js');
    const rawState='fixture-callback-state',stateHash=crypto.createHash('sha256').update(rawState).digest('hex');
    await db.collection('oauth_states').insertOne({id:'fixture-oauth',user_id:'owner',provider:'instagram',state_hash:stateHash,consumed_at:null,expires_at:new Date(Date.now()+60000)});
    provider.exchangeCode=async()=>token;
    const paused=await socialService.handleOAuthCallback('instagram',rawState,'fixture-code');assert('selectionId' in paused);assert.equal((await connection())!.provider_account_id,'11');await assert.rejects(socialService.handleOAuthCallback('instagram',rawState,'fixture-code'),{code:'OAUTH_STATE_REJECTED'});await service.cancel('owner',paused.selectionId);
    const p=await prepare();assert.equal((await connection())!.provider_account_id,'11');
    const stored=(await db.collection('oauth_states').findOne({id:p.selectionId}))!;assert.equal(stored.selection_status,'pending');assert(!stored.encrypted_selection.includes('fixture-not-live'));assert(!JSON.stringify(await service.choices('owner',p.selectionId)).includes('accessToken'));assert.equal((await service.choices('owner',p.selectionId)).choices.length,2);
    const before=reads;await assert.rejects(service.choices('foreign',p.selectionId),{code:'INSTAGRAM_SELECTION_EXPIRED'});await assert.rejects(service.confirm('foreign',p.selectionId,'22',true),{code:'INSTAGRAM_SELECTION_EXPIRED'});assert.equal(reads,before);
    await assert.rejects(service.confirm('owner',p.selectionId,'99',true),{code:'INSTAGRAM_SELECTION_INVALID'});await assert.rejects(service.confirm('owner',p.selectionId,'22',false),{code:'INSTAGRAM_REPLACEMENT_CONFIRMATION_REQUIRED'});assert.equal((await connection())!.provider_account_id,'11');
    await service.cancel('foreign',p.selectionId);assert(await db.collection('oauth_states').findOne({id:p.selectionId}));await service.cancel('owner',p.selectionId);assert.equal(await db.collection('oauth_states').findOne({id:p.selectionId}),null);assert.equal((await connection())!.provider_account_id,'11');
    await assert.rejects(service.confirm('owner',p.selectionId,'22',true),{code:'INSTAGRAM_SELECTION_EXPIRED'});
    const stale=await prepare();await db.collection('social_account_connections').updateOne({id:'existing'},{$set:{updated_at:new Date(3000)}});await assert.rejects(service.confirm('owner',stale.selectionId,'22',true),{code:'INSTAGRAM_EXISTING_CONNECTION_CHANGED'});assert.equal((await connection())!.provider_account_id,'11');
    const expired=await prepare();await db.collection('oauth_states').updateOne({id:expired.selectionId},{$set:{expires_at:new Date(0)}});await assert.rejects(service.confirm('owner',expired.selectionId,'22',true),{code:'INSTAGRAM_SELECTION_EXPIRED'});
    const vanished=await prepare(),all=structuredClone(choices);choices=choices.filter(c=>c.providerAccountId!=='22');await assert.rejects(service.confirm('owner',vanished.selectionId,'22',true),{code:'INSTAGRAM_SELECTION_STALE'});choices=all;
    // Other-user ownership cannot be overridden by local review.
    await db.collection('social_account_connections').insertOne({id:'other',user_id:'other',provider:'instagram',provider_account_id:'22'});const owned=await prepare();await assert.rejects(service.confirm('owner',owned.selectionId,'22',true),{code:'ACCOUNT_ALREADY_LINKED'});assert.equal((await connection())!.provider_account_id,'11');await db.collection('social_account_connections').deleteOne({id:'other'});
    const good=await prepare();const result=await service.confirm('owner',good.selectionId,'22',true);assert.equal(result.connection.id,'existing');assert.equal(result.connection.account_name,'Fixture Studio');assert.equal((await connection())!.provider_account_id,'22');assert.equal((await connection())!.extra_field_to_preserve,'preserved');assert.deepEqual((await connection())!.scopes,token.scopes);assert.equal(await db.collection('oauth_states').findOne({id:good.selectionId}),null);await assert.rejects(service.confirm('owner',good.selectionId,'22',true),{code:'INSTAGRAM_SELECTION_EXPIRED'});
    // Two simultaneous confirmations cannot connect both choices. Snapshot
    // conflict/retry observes consumed pending state or changed baseline.
    const race=await prepare();const outcomes=await Promise.allSettled([service.confirm('owner',race.selectionId,'22',false),service.confirm('owner',race.selectionId,'33',true)]);assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert.equal(await db.collection('oauth_states').findOne({id:race.selectionId}),null);assert.equal(await db.collection('social_account_connections').countDocuments({user_id:'owner',provider:'instagram'}),1);
    assert.equal(await db.collection('published_posts').countDocuments(),0);
  }finally{provider.listAccountIdentities=original;provider.exchangeCode=originalExchange;await db.dropDatabase();await closeMongo();for(const key of keys){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];}}
});
