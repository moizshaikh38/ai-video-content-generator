import test from 'node:test';
import assert from 'node:assert/strict';
import {TikTokPublishingProvider} from '../services/publishing/providers/tiktokPublishingProvider.js';
import type {PublishExecutionRequest} from '../services/publishing/types.js';

const request = (privacy?: any): PublishExecutionRequest => ({accessToken:'fixture-not-live',payload:{title:'Fixture',...(privacy === undefined ? {} : {privacy})},mediaUrl:'https://media.invalid/fixture.mp4',grantedScopes:['video.publish'],mediaDurationSeconds:12});
const ok = (data: unknown) => new Response(JSON.stringify({data,error:{code:'ok'}}),{status:200,headers:{'Content-Type':'application/json'}});
const creator = (levels = ['SELF_ONLY','PUBLIC_TO_EVERYONE']) => ({privacy_level_options:levels,max_video_post_duration_sec:60,duet_disabled:true});
async function fake(run: (calls:{url:string;body:any}[], provider:TikTokPublishingProvider)=>Promise<void>, replies: any[]) {
  const original = globalThis.fetch, calls:{url:string;body:any}[] = [];
  globalThis.fetch = async (input, init) => {
    calls.push({url:String(input),body:JSON.parse(String(init?.body))});
    assert.equal(init?.redirect,'error'); assert(init?.signal);
    assert.equal((init?.headers as any).Authorization,'Bearer fixture-not-live');
    const reply = replies.shift();
    if (reply instanceof Error) throw reply;
    assert(reply,'No external fetch is allowed beyond the declared fixture responses');
    return reply;
  };
  try {await run(calls,new TikTokPublishingProvider());} finally {globalThis.fetch=original;}
}

test('TikTok absent privacy is private, init is pending not published',async()=>fake(async(c,p)=>{
  const r=await p.publish(request()); assert.equal(r.outcome,'pending'); assert.equal(r.providerPostId,'receipt');assert.equal(r.providerPostUrl,null);
  assert.equal(c[1].body.post_info.privacy_level,'SELF_ONLY');assert.equal(c[1].body.post_info.disable_comment,true);assert.equal(c.length,2);
},[ok(creator()),ok({publish_id:'receipt'})]));

test('TikTok explicit public stays public only when creator supports it',async()=>fake(async(c,p)=>{
  await p.publish(request('public'));assert.equal(c[1].body.post_info.privacy_level,'PUBLIC_TO_EVERYONE');
},[ok(creator()),ok({publish_id:'receipt'})]));

test('TikTok unsupported creator visibility never falls back or submits',async()=>fake(async(c,p)=>{
  await assert.rejects(p.publish(request('public')),{code:'TIKTOK_VISIBILITY_UNAVAILABLE'});assert.equal(c.length,1);
},[ok(creator(['SELF_ONLY']))]));

test('TikTok unlisted/invalid privacy is rejected rather than broadened',async()=>fake(async(c,p)=>{
  for(const v of ['unlisted','friends','',null]) await assert.rejects(p.publish(request(v)),{code:'TIKTOK_VISIBILITY_INVALID'});
  assert.equal(c.length,0);
},[]));

test('TikTok missing Direct Post grant does not query or upload',async()=>fake(async(c,p)=>{
  for(const scopes of [undefined,[],['video.upload']]) await assert.rejects(p.publish({...request(),grantedScopes:scopes}),{code:'TIKTOK_DIRECT_POST_SCOPE_REQUIRED'});
  assert.equal(c.length,0);
},[]));

test('TikTok missing/invalid/excessive selected duration fails before init',async()=>{
  for(const duration of [undefined,NaN,Infinity,0,-1,61]) await fake(async(c,p)=>{
    await assert.rejects(p.publish({...request(),mediaDurationSeconds:duration}),{code:'TIKTOK_DURATION_UNVERIFIED'});assert.equal(c.length,1);
  },[ok(creator())]);
});

test('TikTok blank init receipt is not fake success',async()=>fake(async(_c,p)=>{
  await assert.rejects(p.publish(request()),{code:'TIKTOK_RECEIPT_MISSING'});
},[ok(creator()),ok({publish_id:''})]));

test('TikTok processing and inbox states remain pending, status calls never init/upload',async()=>{
  for(const status of ['PROCESSING_DOWNLOAD','PROCESSING_UPLOAD','SEND_TO_USER_INBOX'])await fake(async(c,p)=>{
    const r=await p.resolvePending('fixture-not-live','receipt');assert.equal(r.outcome,'pending');assert.equal(r.providerPostId,'receipt');assert.equal(c.length,1);assert(c[0].url.endsWith('/status/fetch/'));assert.deepEqual(c[0].body,{publish_id:'receipt'});
  },[ok({status})]);
});

test('TikTok confirmed public post uses supplied video ID and no invented URL',async()=>fake(async(_c,p)=>{
  const r=await p.resolvePending('fixture-not-live','receipt');assert.equal(r.outcome,'published');assert.equal(r.providerPostId,'video');assert.equal(r.providerPostUrl,null);assert.equal(r.metadata?.publishId,'receipt');
},[ok({status:'PUBLISH_COMPLETE',publicaly_available_post_id:['video']})]));

test('TikTok confirmed private post can lack public video ID without a fake ID/URL',async()=>fake(async(_c,p)=>{
  const r=await p.resolvePending('fixture-not-live','receipt');assert.equal(r.outcome,'published');assert.equal(r.providerPostId,'receipt');assert.equal(r.metadata?.providerIdKind,'publish_id');assert.equal(r.providerPostUrl,null);
},[ok({status:'PUBLISH_COMPLETE'})]));

test('TikTok definitive failed status is not complete or a retry upload',async()=>fake(async(c,p)=>{
  await assert.rejects(p.resolvePending('fixture-not-live','receipt'),{code:'TIKTOK_SUBMISSION_FAILED'});assert.equal(c.length,1);
},[ok({status:'FAILED',fail_reason:'fixture'})]));

test('TikTok malformed status fails closed',async()=>fake(async(_c,p)=>{
  await assert.rejects(p.resolvePending('fixture-not-live','receipt'),{code:'TIKTOK_STATUS_UNRECOGNIZED'});
},[ok({status:'NEW_UNRECOGNIZED_STATE'})]));

test('TikTok provider API errors do not leak bodies or credentials',async()=>fake(async(_c,p)=>{
  await assert.rejects(p.resolvePending('fixture-not-live','receipt'),e=>e instanceof Error && !e.message.includes('SECRET_FIXTURE') && (e as any).code==='TIKTOK_API_UNCONFIRMED');
},[new Response(JSON.stringify({error:{code:'denied',message:'SECRET_FIXTURE'}}),{status:401})]));

test('TikTok transport failure is not retried by provider',async()=>fake(async(c,p)=>{
  await assert.rejects(p.resolvePending('fixture-not-live','receipt'),/fixture timeout/);assert.equal(c.length,1);
},[new Error('fixture timeout')]));
