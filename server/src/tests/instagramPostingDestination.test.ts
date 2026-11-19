import test from 'node:test';
import assert from 'node:assert/strict';
import {InstagramPublishingProvider} from '../services/publishing/providers/instagramPublishingProvider.js';

const req = (id?:string,privacy:any='public')=>({accessToken:'fixture-not-live',payload:{caption:'Fixture',privacy},mediaUrl:'https://media.invalid/fixture.mp4',providerAccountId:id});
const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status});
async function mock(work:(calls:{url:string;options?:RequestInit}[],p:InstagramPublishingProvider)=>Promise<void>,replies:Response[]){
  const old=globalThis.fetch,calls:{url:string;options?:RequestInit}[]=[];
  globalThis.fetch=async(url,options)=>{calls.push({url:String(url),options});const next=replies.shift();assert(next,'Unexpected network call');return next;};
  try{await work(calls,new InstagramPublishingProvider(async()=>{}));}finally{globalThis.fetch=old;}
}
test('Instagram missing/malformed selected account is never rediscovered from a page list',async()=>mock(async(c,p)=>{
  for(const id of [undefined,'','../me','123/other','not-an-ig-id'])await assert.rejects(p.publish(req(id)),{code:'INSTAGRAM_ACCOUNT_REQUIRED'});
  assert.equal(c.length,0);
},[]));
test('Instagram refuses implicit/private/unlisted visibility rather than silently publishing publicly',async()=>mock(async(c,p)=>{
  for(const privacy of [null,'private','unlisted'])await assert.rejects(p.publish(req('222',privacy)),{code:'INSTAGRAM_VISIBILITY_UNSUPPORTED'});
  assert.equal(p.validatePublishRequest({},true).valid,false);assert.equal(c.length,0);
},[]));
test('Instagram selected account must be verified; mismatched/fallback basic identity never uploads',async()=>{
  for(const data of [{id:'111',username:'wrong'},{id:'222'},{error:{message:'fixture'}}])await mock(async(c,p)=>{
    await assert.rejects(p.publish(req('222')),{code:'INSTAGRAM_ACCOUNT_UNVERIFIED'});assert.equal(c.length,1);assert(c[0].url.includes('/222?'));assert(!c[0].url.includes('access_token'));assert.equal((c[0].options?.headers as any).Authorization,'Bearer fixture-not-live');
  },[response(data)]);
});
test('Instagram uses only exact selected account and never invents a shortcode URL',async()=>mock(async(c,p)=>{
  const r=await p.publish(req('222'));assert.equal(r.providerPostId,'444');assert.equal(r.providerPostUrl,null);assert.equal(r.outcome,'published');
  assert(c[0].url.includes('/222?'));assert(c[1].url.endsWith('/222/media'));assert(c[2].url.includes('/333?'));assert(c[3].url.endsWith('/222/media_publish'));assert(!c.some(x=>x.url.includes('/me/accounts')));
},[response({id:'222',username:'selected'}),response({id:'333'}),response({status_code:'FINISHED'}),response({id:'444'})]));
test('Instagram missing/malformed container receipt cannot be used in a status or publish URL',async()=>mock(async(c,p)=>{
  await assert.rejects(p.publish(req('222')),{code:'INSTAGRAM_CONTAINER_UNVERIFIED'});assert.equal(c.length,2);
},[response({id:'222',username:'selected'}),response({id:'../elsewhere'})]));
test('Instagram missing final media receipt is not confirmed publication',async()=>mock(async(_c,p)=>{
  await assert.rejects(p.publish(req('222')),{code:'INSTAGRAM_PUBLISH_UNVERIFIED'});
},[response({id:'222',username:'selected'}),response({id:'333'}),response({status_code:'FINISHED'}),response({success:true})]));
