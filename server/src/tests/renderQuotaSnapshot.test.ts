import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {assertRenderQuotaMaximum,assertRenderUsageCount} from '../shared/renderQuotaSnapshot.js';
import {MongoClient} from 'mongodb';
process.env.MONGODB_URI='mongodb://127.0.0.1:1';
process.env.MONGODB_DB_NAME='quota_snapshot_no_connection';
const {EntitlementService}=await import('../services/entitlementService.js');
const {createProjectClip,renderClip}=await import('../controllers/clipController.js');
const {ClipRenderService}=await import('../services/clipRenderService.js');

const invalid=[NaN,Infinity,-Infinity,-1,.5,Number.MAX_SAFE_INTEGER+1,undefined,null,'10',{},true];
test('quota snapshot refuses malformed, negative and unsafe values but preserves finite zero',()=>{
 for(const value of invalid){assert.throws(()=>assertRenderQuotaMaximum(value),{code:'RENDER_PLAN_UNAVAILABLE'});assert.throws(()=>assertRenderUsageCount(value),{code:'RENDER_USAGE_UNAVAILABLE'});}
 for(const value of [0,1,100,Number.MAX_SAFE_INTEGER]){assert.doesNotThrow(()=>assertRenderQuotaMaximum(value));assert.doesNotThrow(()=>assertRenderUsageCount(value));}
});
test('initial and Quick routes fail before DB/source/render work on malformed finite-plan maximum',async()=>{
 const original=EntitlementService.resolveUserEntitlements,oldFetch=globalThis.fetch,gate=process.env.VIREO_RENDER_ADMISSION_V1,oldCreate=ClipRenderService.createClipFromCandidate,oldGet=ClipRenderService.getClip;
 const oldConnect=MongoClient.prototype.connect;let databaseConnects=0;
 (MongoClient.prototype as any).connect=async()=>{databaseConnects++;throw Error('MONGO_SHOULD_NOT_CONNECT');};
 let downstream=0,network=0;process.env.VIREO_RENDER_ADMISSION_V1='1';
 globalThis.fetch=async()=>{network++;throw Error('No network allowed');};
 (ClipRenderService as any).createClipFromCandidate=async()=>{downstream++;throw Error('Render should not be reached');};
 (ClipRenderService as any).getClip=async()=>{downstream++;throw Error('Source should not be reached');};
 try{
  for(const value of invalid){
   (EntitlementService as any).resolveUserEntitlements=async()=>({isUnlimited:false,limits:{maxClipRenders:value},displayName:'Fixture'});
   for(const route of [createProjectClip,renderClip]){
    let status=200,body:any;const res:any={status(code:number){status=code;return this;},json(data:any){body=data;return this;}};
    const req:any={user:{id:crypto.randomUUID(),email:'fixture@example.invalid'},params:{id:crypto.randomUUID(),clipId:crypto.randomUUID()},body:{candidateId:crypto.randomUUID()}};
    await route(req,res);assert(status>=500,JSON.stringify({status,body,value}));assert.equal(body.status,'error');
   }
  }
  assert.equal(downstream,0);assert.equal(network,0);assert.equal(databaseConnects,0,'invalid limit must refuse before DB access');
 }finally{MongoClient.prototype.connect=oldConnect;(EntitlementService as any).resolveUserEntitlements=original;globalThis.fetch=oldFetch;(ClipRenderService as any).createClipFromCandidate=oldCreate;(ClipRenderService as any).getClip=oldGet;if(gate===undefined)delete process.env.VIREO_RENDER_ADMISSION_V1;else process.env.VIREO_RENDER_ADMISSION_V1=gate;}
});
