import test from 'node:test';
import assert from 'node:assert/strict';
import {InstagramPublishingProvider} from '../services/publishing/providers/instagramPublishingProvider.js';
const req=(id?:string,privacy:any='public')=>({accessToken:'fixture-not-live',payload:{caption:'Fixture',privacy},mediaUrl:'https://media.invalid/fixture.mp4',providerAccountId:id,grantedScopes:['instagram_content_publish']});
const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status});
const quota={data:[{quota_usage:1,config:{quota_total:2,quota_duration:86400}}]};
const receipt={creationId:'333',selectedAccountId:'222',publishDispatchStarted:false};
async function mock(work:(calls:{url:string;options?:RequestInit}[],p:InstagramPublishingProvider)=>Promise<void>,replies:(Response|Error)[],quotaReply:unknown=quota){
 const old=globalThis.fetch,calls:{url:string;options?:RequestInit}[]=[];
 globalThis.fetch=async(url,options)=>{calls.push({url:String(url),options});if(String(url).includes('/content_publishing_limit?'))return response(quotaReply);const next=replies.shift();assert(next,'Unexpected network call');if(next instanceof Error)throw next;return next;};
 try{await work(calls,new InstagramPublishingProvider());}finally{globalThis.fetch=old;}
}
test('Instagram missing/malformed selected account is never rediscovered from a page list',async()=>mock(async(c,p)=>{
 for(const id of [undefined,'','../me','123/other','not-an-ig-id'])await assert.rejects(p.publish(req(id)),{code:'INSTAGRAM_ACCOUNT_REQUIRED'});assert.equal(c.length,0);
},[]));
test('Instagram refuses implicit/private/unlisted visibility rather than silently publishing publicly',async()=>mock(async(c,p)=>{
 for(const privacy of [null,'private','unlisted'])await assert.rejects(p.publish(req('222',privacy)),{code:'INSTAGRAM_VISIBILITY_UNSUPPORTED'});assert.equal(p.validatePublishRequest({},true).valid,false);assert.equal(c.length,0);
},[]));
test('Instagram selected account must be verified; mismatched/fallback basic identity never uploads',async()=>{
 for(const data of [{id:'111',username:'wrong'},{id:'222'}])await mock(async(c,p)=>{await assert.rejects(p.publish(req('222')),{code:'INSTAGRAM_ACCOUNT_UNVERIFIED'});assert.equal(c.length,1);assert(c[0].url.includes('/222?'));assert(!c[0].url.includes('access_token'));assert.equal((c[0].options?.headers as any).Authorization,'Bearer fixture-not-live');},[response(data)]);
});
test('Instagram creates one container for exact account but does not call media_publish before durable persistence',async()=>mock(async(c,p)=>{
 const r=await p.publish(req('222'));assert.equal(r.providerPostId,'333');assert.equal(r.outcome,'pending');assert.equal(r.metadata?.publishDispatchStarted,false);assert.equal(c.length,2);
 assert(c[0].url.includes('/v26.0/222?'));assert(c[1].url.endsWith('/222/media'));assert(!c.some(x=>x.url.includes('/me/accounts')||x.url.includes('media_publish')));
 for(const call of c){assert.equal(call.options?.redirect,'error');assert(!call.url.includes('fixture-not-live'));assert(!String(call.options?.body||'').includes('fixture-not-live'));assert(call.options?.signal);}
},[response({id:'222',username:'selected'}),response({id:'333'})]));
test('Instagram missing/malformed container receipt cannot be used in a status or publish URL',async()=>mock(async(c,p)=>{await assert.rejects(p.publish(req('222')),{code:'INSTAGRAM_CONTAINER_UNVERIFIED'});assert.equal(c.length,2);},[response({id:'222',username:'selected'}),response({id:'../elsewhere'})]));
test('Instagram missing grant refuses before any network call',async()=>mock(async(c,p)=>{await assert.rejects(p.publish({...req('222'),grantedScopes:[]}),{code:'INSTAGRAM_PUBLISH_SCOPE_REQUIRED'});assert.equal(c.length,0);},[]));
test('ready container checkpoints publish dispatch before exactly one media_publish and keeps partial success',async()=>mock(async(c,p)=>{
 let checkpointed=false;const r=await p.continuePending(req('222'),'333',receipt,async m=>{assert.equal(c.length,2);assert.equal(m.publishDispatchStarted,true);assert.equal(m.publishingQuota.total,2);checkpointed=true;});
 assert(checkpointed);assert.equal(c.length,3);assert.equal(c[2].options?.method,'POST');assert(c[1].url.endsWith('/222/content_publishing_limit?fields=quota_usage,config'));assert.equal(r.providerPostId,'444');assert.equal(r.providerPostUrl,null);assert.equal(r.outcome,'published');assert.equal(r.metadata?.partialSuccess,true);assert.deepEqual(r.metadata?.warnings,['CAPTION_NOT_ATTACHED']);assert.equal(r.metadata?.captionAttachmentVerified,false);
},[response({status_code:'FINISHED'}),response({id:'444',config_issue:'CAPTION_NOT_ATTACHED'})]));
test('checkpoint failure prevents any media_publish call',async()=>mock(async(c,p)=>{await assert.rejects(p.continuePending(req('222'),'333',receipt,async()=>{throw Error('disk unavailable');}),/disk unavailable/);assert.equal(c.length,2);},[response({status_code:'FINISHED'})]));
test('uncertain dispatch can only read status, never resubmit even when FINISHED',async()=>mock(async(c,p)=>{
 const r=await p.continuePending(req('222'),'333',{...receipt,publishDispatchStarted:true},async()=>assert.fail('No second dispatch'));assert.equal(r.outcome,'pending');assert.equal(r.metadata?.confirmation,'publish_outcome_unknown');assert.equal(c.length,1);
},[response({status_code:'FINISHED'})]));
test('lost publish response is reconciled using PUBLISHED container receipt without inventing media ID/link',async()=>mock(async(c,p)=>{
 let state={...receipt};await assert.rejects(p.continuePending(req('222'),'333',state,async m=>{state=m as any;}),/fixture timeout/);assert.equal(state.publishDispatchStarted,true);
 const r=await p.continuePending(req('222'),'333',state,async()=>assert.fail('No second publish'));assert.equal(c.length,4);assert.equal(c.filter(x=>x.options?.method==='POST').length,1);assert.equal(r.outcome,'published');assert.equal(r.providerPostId,'333');assert.equal(r.metadata?.providerIdKind,'container_receipt');assert.equal(r.metadata?.captionAttachmentVerified,false);assert.equal(r.providerPostUrl,null);
},[response({status_code:'FINISHED'}),Error('fixture timeout'),response({status_code:'PUBLISHED'})]));
test('missing final media receipt is not confirmed publication and cannot trigger second publish',async()=>mock(async(c,p)=>{
 let state={...receipt};await assert.rejects(p.continuePending(req('222'),'333',state,async m=>{state=m as any;}),{code:'INSTAGRAM_PUBLISH_UNVERIFIED'});const r=await p.continuePending(req('222'),'333',state,async()=>assert.fail());assert.equal(r.outcome,'pending');assert.equal(c.filter(x=>x.options?.method==='POST').length,1);
},[response({status_code:'FINISHED'}),response({success:true}),response({status_code:'FINISHED'})]));
test('processing only returns pending; ERROR/EXPIRED fail definitively; unknown states cannot become success',async()=>{
 for(const state of ['IN_PROGRESS','ERROR','EXPIRED','alien'])await mock(async(c,p)=>{
  if(state==='IN_PROGRESS')assert.equal((await p.resolvePending('fixture','333')).outcome,'pending');else await assert.rejects(p.resolvePending('fixture','333'),{code:state==='alien'?'INSTAGRAM_STATUS_UNVERIFIED':'INSTAGRAM_SUBMISSION_FAILED'});assert.equal(c.length,1);assert.equal(c[0].options?.method,'GET');
 },[response({status_code:state})]);
});
test('container/account rebinding cannot even query status',async()=>mock(async(c,p)=>{await assert.rejects(p.continuePending(req('999'),'333',receipt,async()=>assert.fail()),{code:'INSTAGRAM_SUBMISSION_BINDING_CHANGED'});assert.equal(c.length,0);},[]));

test('dynamic quota exhaustion retains pending receipt without checkpoint or post',async()=>mock(async(c,p)=>{
 const r=await p.continuePending(req('222'),'333',receipt,async()=>assert.fail('No dispatch at quota'));
 assert.equal(r.outcome,'pending');assert.equal(r.providerPostId,'333');assert.equal(r.metadata?.confirmation,'publishing_quota_wait');assert.equal(r.metadata?.publishDispatchStarted,false);assert.equal(c.length,2);assert(!c.some(x=>x.options?.method==='POST'));
},[response({status_code:'FINISHED'})],{data:[{quota_usage:2,config:{quota_total:2,quota_duration:86400}}]}));
test('missing, ambiguous, malformed or coerced quota never permits publish',async()=>{
 for(const q of [{}, {data:[]},{data:[quota.data[0],quota.data[0]]},{data:[{quota_usage:'1',config:quota.data[0].config}]},{data:[{quota_usage:-1,config:quota.data[0].config}]},{data:[{quota_usage:0,config:{quota_total:0,quota_duration:86400}}]}])await mock(async(c,p)=>{
  await assert.rejects(p.continuePending(req('222'),'333',receipt,async()=>assert.fail('No unverifiable dispatch')),{code:'INSTAGRAM_QUOTA_UNVERIFIED'});assert.equal(c.length,2);assert(!c.some(x=>x.options?.method==='POST'));
 },[response({status_code:'FINISHED'})],q);
});
