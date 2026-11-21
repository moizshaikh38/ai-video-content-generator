import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import fs from 'node:fs';

test('real render stage update preserves BSON dates with installed validators and rejects replaced worker',async()=>{
 assert.equal(process.env.NODE_ENV,'test','integration fixture is test-only');
 const{getMongoDb,closeMongo}=await import('../db/mongoClient.js');const{bootstrapMongo}=await import('../db/bootstrapMongo.js');const{ClipRenderService}=await import('../services/clipRenderService.js');const db=await getMongoDb();await bootstrapMongo(db);
 const u=crypto.randomUUID(),c=crypto.randomUUID(),j=crypto.randomUUID(),w='synthetic-stage-worker';
 try{
  await db.collection('clips').insertOne({id:c,user_id:u,render_status:'queued',render_version:1,editor_version:1,created_at:new Date(),updated_at:new Date()});
  await db.collection('render_jobs').insertOne({id:j,clip_id:c,user_id:u,status:'processing',worker_id:w,created_at:new Date(),updated_at:new Date()});
  await ClipRenderService.updateJobStage(j,c,'preparing_captions',12,'rendering',w,{renderVersion:1,editorVersion:1});
  const clip=await db.collection('clips').findOne({id:c}),job=await db.collection('render_jobs').findOne({id:j});assert.equal(clip?.render_status,'rendering');assert(clip?.updated_at instanceof Date);assert.equal(job?.stage,'preparing_captions');assert(job?.updated_at instanceof Date);
  await assert.rejects(ClipRenderService.updateJobStage(j,c,'uploading',95,'uploading','replaced-worker',{renderVersion:1,editorVersion:1}),{code:'FENCING_TOKEN_MISMATCH'});
  assert.equal((await db.collection('clips').findOne({id:c}))?.render_status,'rendering');
 }finally{await db.collection('render_jobs').deleteMany({user_id:u});await db.collection('clips').deleteMany({user_id:u});await closeMongo();}
});

test('direct transactional stage, failure and success callers all use native dates',()=>{
 const source=fs.readFileSync(new URL('../services/clipRenderService.ts',import.meta.url),'utf8');const start=source.indexOf('      await commitUploadedRenderOutcome('),end=source.indexOf('  /**',source.indexOf('  public static async updateJobStage'));const callers=source.slice(start,end);assert(start>0&&end>start);assert.doesNotMatch(callers,/new Date\(\)\.toISOString\(\)/);assert.match(callers,/updated_at: new Date\(\)/);assert.match(callers,/clip:\{render_status:clipStatus,updated_at:new Date\(\)\}/);
});
