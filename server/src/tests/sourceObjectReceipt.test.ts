import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {sourceObjectReceiptMatches} from '../shared/sourceObjectReceipt.js';
test('download receipt binds actual hash to object validator and normal preview fetch rejects replacement',async()=>{
 const bytes=Buffer.from('source version A');let etag='"version-a"';
 const server=http.createServer((req,res)=>{res.setHeader('ETag',etag);res.setHeader('Content-Length',String(bytes.length));if(req.method==='HEAD'){res.end();return;}res.end(bytes);});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');
 const {config}=await import('../config/index.js');Object.assign(config,{r2AccountId:'fixture',r2AccessKeyId:'fixture',r2SecretAccessKey:'fixture',r2SourceBucket:'source',r2Endpoint:`http://127.0.0.1:${address.port}`});
 const {downloadObjectToFile}=await import('../services/objectStorageService.js');const {getMongoDb,closeMongo}=await import('../db/mongoClient.js');const {ownerContext}=await import('../db/repositories/dataRepository.js');const {SmartReframeService}=await import('../services/smartReframeService.js');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'source-receipt-')),db=await getMongoDb(),id=crypto.randomUUID(),uid=crypto.randomUUID(),tid=crypto.randomUUID(),key='fixture/'+crypto.randomUUID()+'.mp4';
 try{
  const downloaded=await downloadObjectToFile('source',key,path.join(dir,'source'),{requireSnapshotReceipt:true});
  assert.equal(downloaded.sourceReceipt?.sha256,crypto.createHash('sha256').update(bytes).digest('hex'));
  assert.equal(sourceObjectReceiptMatches(downloaded.sourceReceipt,key,{size:bytes.length,etag},downloaded.sha256),true);
  await db.collection('clips').insertOne({id,user_id:uid,source_storage_path:key,start_seconds:0,end_seconds:4,aspect_ratio:'9:16'});
  await db.collection('reframe_tracks').insertOne({id:tid,user_id:uid,clip_id:id,status:'ready',analyzed_aspect_ratio:'9:16',created_at:new Date().toISOString(),metadata:{analyzed_source_path:key,analyzed_source_start:0,analyzed_source_end:4,analyzed_source_sha256:downloaded.sha256,analyzed_source_receipt:downloaded.sourceReceipt}});
  await ownerContext.run(uid,async()=>{
   assert.equal((await SmartReframeService.getReframeTrack(id,uid,undefined,true))?.isStale,false);
   const originalCv=(SmartReframeService as any).runCvAnalyzer;
   (SmartReframeService as any).runCvAnalyzer=async()=>({source_width:854,source_height:480,duration:4,sample_fps:1,samples:[],scene_cuts:[]});
   try{
    const analyzed=await SmartReframeService.analyzeClipFraming(id,uid,{localSourcePath:path.join(dir,'source'),sourceReceipt:downloaded.sourceReceipt});
    assert.deepEqual(analyzed.metadata.analyzed_source_receipt,downloaded.sourceReceipt);
    assert.equal(analyzed.metadata.analyzed_source_sha256,downloaded.sha256);
   }finally{(SmartReframeService as any).runCvAnalyzer=originalCv;}
   // Actual local database + object HEAD + normal controller, with explicitly
   // synthetic analysis records. This is not a video/recognition qualification.
   await db.collection('clips').updateOne({id},{$set:{crop_config:{mode:'smart',layout_mode:'track'}}});
   await db.collection('reframe_tracks').updateMany({clip_id:id},{$set:{status:'ready',analysis_version:1,source_width:854,source_height:480,raw_samples:[{time:0,faces:[]}],smoothed_keyframes:[{time:0,centerX:.5,centerY:.5}],'metadata.shot_composition_candidate':true,'metadata.clip_duration':4}});
   const {getClipReframe:normalPreview}=await import('../controllers/clipController.js');let boundResponse:any;
   await normalPreview({user:{id:uid},params:{clipId:id},query:{layoutCandidate:'off'}} as any,{status(){return this;},json(value:any){boundResponse=value;return this;}} as any);
   assert.equal(boundResponse.adaptiveComposition,true);assert.equal(boundResponse.measuredPlanEnvelope?.sourceValidation,'object-receipt-verified');assert.equal(boundResponse.measuredPlanEnvelope.identity.sourceVersion,downloaded.sha256);
   const {resolvePreviewItemPlan}=await import('../shared/previewItemAutomaticPlan.js');
   const accepted=resolvePreviewItemPlan({id:'contained-ui-item',source_start:1,source_end:3,source_asset_id:id,source_path:key},boundResponse.measuredPlanEnvelope,{sourceAssetId:id,sourcePath:key,outputAspect:'9:16',sourceVersion:downloaded.sha256});assert.equal(accepted.status,'ready');
   // Ordinary reads stay unchanged, but review records cannot skip HEAD
   // simply because the export caller omitted verifyObjectReceipt.
   assert.equal((await SmartReframeService.getReframeTrack(id,uid))?.sourceObjectVerified,undefined);
   // Ordinary fragmented Split recovery must carry a real object HEAD too.
   await db.collection('reframe_tracks').updateMany({clip_id:id},{$set:{layout_mode:'split','metadata.scene_cuts':[2],'metadata.shot_composition_candidate':false}});
   assert.equal((await SmartReframeService.getReframeTrack(id,uid))?.sourceObjectVerified,true);
   etag='"version-b"';
   const cutChanged=await SmartReframeService.getReframeTrack(id,uid);
   assert.equal(cutChanged?.sourceObjectVerified,false);assert.equal(cutChanged?.isStale,true);
   etag='"version-a"';
   await db.collection('reframe_tracks').updateMany({clip_id:id},{$set:{layout_mode:'track','metadata.scene_cuts':[]}});
   await db.collection('reframe_tracks').updateMany({clip_id:id},{$set:{'metadata.embedded_camera_panel_review_enabled':true}});
   assert.equal((await SmartReframeService.getReframeTrack(id,uid))?.sourceObjectVerified,true);
   // Ordinary source-structure guards require the same consumer-side HEAD.
   await db.collection('reframe_tracks').updateMany({clip_id:id},{$set:{'metadata.embedded_camera_panel_review_enabled':false,'metadata.embedded_source_split_guard_enabled':true}});
   assert.equal((await SmartReframeService.getReframeTrack(id,uid))?.sourceObjectVerified,true);
   etag='"version-b"';
   const reviewChanged=await SmartReframeService.getReframeTrack(id,uid);
   assert.equal(reviewChanged?.sourceObjectVerified,false);assert.equal(reviewChanged?.isStale,true);
   const changed=await SmartReframeService.getReframeTrack(id,uid,undefined,true);assert.equal(changed?.isStale,true);assert.equal(changed?.sourceObjectVerified,false);
   const {getClipReframe}=await import('../controllers/clipController.js');let response:any;
   await getClipReframe({user:{id:uid},params:{clipId:id},query:{}} as any,{status(){return this;},json(value:any){response=value;return this;}} as any);
   assert.equal(response.isStale,true);assert.equal(response.measuredPlanEnvelope,null);

   etag='"version-a"';await db.collection('reframe_tracks').updateMany({clip_id:id},{$unset:{'metadata.analyzed_source_receipt':''}});
   assert.equal((await SmartReframeService.getReframeTrack(id,uid,undefined,true))?.isStale,true);
   assert.equal((await SmartReframeService.getReframeTrack(id,uid))?.sourceObjectVerified,false);
  });
 }finally{await db.collection('clips').deleteOne({id});await db.collection('reframe_tracks').deleteMany({clip_id:id});await closeMongo();await new Promise<void>(resolve=>server.close(()=>resolve()));fs.rmSync(dir,{recursive:true,force:true});}
});
test('receipt cannot substitute wrong hash, weak validator, wrong key or fabricated size',()=>{const r={key:'key',size:20,etag:'"v"',sha256:'a'.repeat(64)},head={size:20,etag:'"v"'};assert.equal(sourceObjectReceiptMatches(r,'key',head,'b'.repeat(64)),false);assert.equal(sourceObjectReceiptMatches({...r,etag:'W/"v"'},'key',{...head,etag:'W/"v"'}),false);assert.equal(sourceObjectReceiptMatches(r,'other',head),false);assert.equal(sourceObjectReceiptMatches(r,'key',{...head,size:19}),false);});
