import test from 'node:test';
import assert from 'node:assert/strict';
import {InstagramOAuthProvider} from '../services/social/providers/instagramProvider.js';
import {config} from '../config/index.js';
const response=(d:any,s=200)=>new Response(JSON.stringify(d),{status:s});
async function fixture(work:(p:InstagramOAuthProvider,calls:any[])=>Promise<void>,replies:Response[]=[]){
 const f=globalThis.fetch,id=config.metaClientId,secret=config.metaClientSecret,calls:any[]=[];(config as any).metaClientId='fixture-app';(config as any).metaClientSecret='fixture-secret';
 globalThis.fetch=async(url,init)=>{calls.push({url:String(url),init});const r=replies.shift();assert(r,'Unexpected network call');return r;};
 try{await work(new InstagramOAuthProvider(),calls);}finally{globalThis.fetch=f;(config as any).metaClientId=id;(config as any).metaClientSecret=secret;}
}
test('Facebook Login remains versioned and requests the same original scope set, not Instagram Login replacements',async()=>fixture(async(p,c)=>{
 const r=await p.getAuthorizationUrl('fixture-state','https://app.invalid/callback'),url=new URL(r.url);assert.equal(url.pathname,'/v26.0/dialog/oauth');assert.equal(url.searchParams.get('state'),'fixture-state');assert.equal(url.searchParams.get('scope'),'instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement');assert.equal(c.length,0);
}));
test('one eligible Instagram account is bound exactly; credentials never appear in account-read URL',async()=>fixture(async(p,c)=>{
 const r=await p.getAccountIdentity('fixture-not-live');assert.equal(r.providerAccountId,'222');assert.equal(r.metadata?.pageId,'111');assert.equal(c.length,1);assert(!c[0].url.includes('fixture-not-live'));assert.equal(c[0].init.headers.Authorization,'Bearer fixture-not-live');assert.equal(c[0].init.redirect,'error');
},[response({data:[{id:'111',instagram_business_account:{id:'222',username:'selected'}}]})]));
test('multiple accounts, pagination, missing professional account and basic Meta identity never choose first/fallback',async()=>{
 for(const d of [{data:[{id:'1',instagram_business_account:{id:'222',username:'a'}},{id:'2',instagram_business_account:{id:'333',username:'b'}}]},{data:[{id:'1',instagram_business_account:{id:'222',username:'a'}}],paging:{next:'https://untrusted.invalid'}},{data:[]},{data:[{id:'1',name:'Facebook page'}]},{data:[{id:'1',instagram_business_account:{id:'222'}}]}])await fixture(async(p,c)=>{await assert.rejects(p.getAccountIdentity('fixture'),{code:'INSTAGRAM_ACCOUNT_SELECTION_REQUIRED'});assert.equal(c.length,1);},[response(d)]);
});
test('actual granted scopes are read, not assumed from requested scope list; missing expiry is unknown',async()=>fixture(async(p,c)=>{
 const r=await p.exchangeCode('fixture-code','https://app.invalid/callback');assert.deepEqual(r.scopes,['instagram_basic']);assert.equal(r.expiresInSeconds,null);assert.equal(c.length,3);assert(c[2].url.endsWith('/me/permissions'));assert(!c[2].url.includes('fixture-not-live'));
},[response({access_token:'fixture-short'}),response({access_token:'fixture-not-live'}),response({data:[{permission:'instagram_basic',status:'granted'},{permission:'instagram_content_publish',status:'declined'},{permission:'pages_read_engagement',status:'expired'}]})]));
test('unverifiable or incomplete granted permissions never become default grants',async()=>{
 for(const d of [{error:{message:'fixture'}},{data:[],paging:{next:'https://untrusted.invalid'}}])await fixture(async(p,c)=>{await assert.rejects(p.exchangeCode('fixture-code'),{code:'INSTAGRAM_PERMISSIONS_UNVERIFIED'});assert.equal(c.length,3);},[response({access_token:'fixture-short'}),response({access_token:'fixture-not-live'}),response(d)]);
});
