import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import { createProjectClip } from '../controllers/clipController.js';
import { ClipRenderService } from '../services/clipRenderService.js';
import { createClipWithJob } from '../db/repositories/clipRepository.js';
import { ProEditorService } from '../services/proEditorService.js';
import { EntitlementService } from '../services/entitlementService.js';

test('fresh generated Free clip defaults are saveable and preserve source without Smart access', {skip: !process.env.MONGODB_URI}, async()=>{
 const db=await getMongoDb(),uid=crypto.randomUUID(),pid=crypto.randomUUID(),cid=crypto.randomUUID();
 const orig=ClipRenderService.createClipFromCandidate;
 // Use the real transactional candidate-to-clip path, without launching an asynchronous render.
 ClipRenderService.createClipFromCandidate=async(p,u,c,a,m,o)=>createClipWithJob(p,c,u,a!,m!,o) as any;
 try{
  await db.collection('projects').insertOne({id:pid,user_id:uid,source_url:'local-free-test.mp4',video_status:'transcribed'});
  await db.collection('clip_candidates').insertOne({id:cid,project_id:pid,user_id:uid,start_seconds:0,end_seconds:30,status:'suggested'});
  let status=200,body:any;const res:any={status(n:number){status=n;return this},json(b:any){body=b;return this}};
  await createProjectClip({user:{id:uid,email:'free-generated@test.invalid'},params:{id:pid},body:{candidateId:cid}} as any,res);
  assert.equal(status,202,JSON.stringify(body));const clip=body.clip;
  assert.equal(clip.caption_style,'clean');assert.equal(clip.caption_config.presetId,'clean');assert.equal(clip.crop_config.mode,'fit');
  const e=await EntitlementService.resolveUserEntitlements(uid,'free-generated@test.invalid');assert.equal(EntitlementService.isPresetAllowed(e,clip.caption_style),true);
  assert.equal(EntitlementService.isPresetAllowed(e,'karaoke'),false);assert.equal(EntitlementService.isFeatureAllowed(e,'smartReframe'),false);
  const ep=(ProEditorService as any).buildInitialProject(clip,uid,null,null,{clip_id:clip.id});
  assert.equal(ep.tracks.find((t:any)=>t.type==='CAPTION').items[0].caption.style,'clean');
  assert.equal(ep.tracks.find((t:any)=>t.type==='VIDEO').items[0].crop.mode,'fit');
  await createProjectClip({user:{id:uid,email:'free-generated@test.invalid'},params:{id:pid},body:{candidateId:cid,caption_style:'karaoke'}} as any,res);assert.equal(status,403);assert.equal(body.code,'PRESET_RESTRICTED');
 }finally{ClipRenderService.createClipFromCandidate=orig;for(const col of ['projects','clip_candidates','clips','render_jobs','credit_wallets','credit_transactions'])await db.collection(col).deleteMany({user_id:uid});await closeMongo()}
});
