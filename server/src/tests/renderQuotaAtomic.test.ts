import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {MongoClient,Collection} from 'mongodb';
import {admitRenderJob} from '../db/repositories/renderAdmissionRepository.js';
import {createClipWithJob} from '../db/repositories/clipRepository.js';
import {renderQuotaPolicy} from '../db/repositories/renderQuotaRepository.js';
import {parseRenderSubmission} from '../db/repositories/renderSubmissionRepository.js';
import {selectionSourceReceipt} from '../shared/selectionSourceReceipt.js';
import {transcriptContentIdentity} from '../shared/transcriptSourceBinding.js';

const unlimited={kind:'unlimited'} as const;
const limit=(maximum:number)=>({kind:'limited',maximum,displayName:'Fixture'} as const);
test('quota policy preserves explicit unlimited/zero and rejects malformed plan state',()=>{
 assert.deepEqual(renderQuotaPolicy({isUnlimited:true}),unlimited);assert.deepEqual(renderQuotaPolicy({isUnlimited:false,limits:{maxClipRenders:0},displayName:'Fixture'}),limit(0));
 for(const value of [undefined,{}, {isUnlimited:'true'}, {isUnlimited:false,limits:{maxClipRenders:NaN}}, {isUnlimited:false,limits:{maxClipRenders:-1}}])assert.throws(()=>renderQuotaPolicy(value),{code:'RENDER_PLAN_UNAVAILABLE'});
});
test('actual Mongo serializes account quota across clips and initial/saved admission, with rollback/replay isolation',async()=>{
 const uri=process.env.MONGODB_URI!;const a=await new MongoClient(uri,{maxPoolSize:2}).connect(),b=await new MongoClient(uri,{maxPoolSize:2}).connect();
 const db=a.db(process.env.MONGODB_DB_NAME),other=b.db(process.env.MONGODB_DB_NAME),users:string[]=[];
 const {closeMongo}=await import('../db/mongoClient.js');
 async function seed(user=crypto.randomUUID()){
  users.push(user);const project=crypto.randomUUID(),clip=crypto.randomUUID(),candidate=crypto.randomUUID(),key=`users/${user}/projects/${project}/source/fixture.mp4`;
  const t:any={id:crypto.randomUUID(),project_id:project,user_id:user,transcript_text:'Synthetic quota fixture.',segments:[],words:[]};
  t.source_binding={version:1,source_receipt:{key,size:7,etag:'"fixture"',sha256:'a'.repeat(64)},prepared_audio_sha256:'b'.repeat(64),requests:[{sha256:'b'.repeat(64),bytes:7,status:'completed'}],transcript_content_sha256:transcriptContentIdentity(t)};const receipt=selectionSourceReceipt(t,key);
  await db.collection('projects').insertOne({id:project,user_id:user,source_url:key,video_status:'transcribed'});await db.collection('transcripts').insertOne(t);
  await db.collection('clip_candidates').insertOne({id:candidate,user_id:user,project_id:project,start_seconds:0,end_seconds:2,status:'suggested',metadata:{selection_source_receipt:receipt}});
  await db.collection('clips').insertOne({id:clip,user_id:user,project_id:project,render_status:'ready',render_version:1,editor_version:1,source_storage_path:key,selection_source_receipt:receipt});
  const submission=parseRenderSubmission({submission_id:crypto.randomUUID(),expected_render_version:1,expected_editor_version:1},clip)!;
  return {user,project,clip,candidate,input:{clipId:clip,userId:user,expectedRenderVersion:1,expectedEditorVersion:1,expectedEditorProject:null,submission,quotaPolicy:limit(1)} as any};
 }
 try{
  // Use the bootstrap-equivalent fence validator on the existing isolated
  // collection, not a permissive in-memory stand-in.
  if(!(await db.listCollections({name:'render_quota_fences'}).toArray()).length)await db.createCollection('render_quota_fences');
  await db.command({collMod:'render_quota_fences',validator:{$jsonSchema:{bsonType:'object',required:['id','user_id'],properties:{id:{bsonType:'string'},user_id:{bsonType:'string'},created_at:{bsonType:'date'},updated_at:{bsonType:'date'}}}},validationLevel:'moderate'});
  const one=await seed(),two=await seed(one.user);
  const race=await Promise.allSettled([admitRenderJob(a,db,one.input),admitRenderJob(b,other,two.input)]);
  assert.equal(race.filter(r=>r.status==='fulfilled').length,1,'only one new job may consume the account last slot');
  assert.equal(race.filter(r=>r.status==='rejected'&&(r.reason as any).code==='MONTHLY_RENDER_LIMIT_EXCEEDED').length,1);assert.equal(await db.collection('render_jobs').countDocuments({user_id:one.user}),1);
  const fenceBefore=await db.collection('render_quota_fences').findOne({user_id:one.user});
  const winner=race[0].status==='fulfilled'?one:two;const replay=await admitRenderJob(b,other,{...winner.input,quotaPolicy:limit(0)});assert(replay.replayed);assert.equal(await db.collection('render_jobs').countDocuments({user_id:one.user}),1);assert.equal((await db.collection('render_quota_fences').findOne({user_id:one.user}))?.serial,fenceBefore?.serial);
  const foreign=await seed();const own=await admitRenderJob(b,other,foreign.input);assert(own.job.id);
  const mixed=await seed(),initial=await seed(mixed.user);
  const mixedRace=await Promise.allSettled([admitRenderJob(a,db,mixed.input),(createClipWithJob as any)(initial.project,initial.candidate,initial.user,'9:16','center',undefined,undefined,limit(1))]);
  assert.equal(mixedRace.filter(r=>r.status==='fulfilled').length,1,'initial and saved render contend for same account slot');assert.equal(await db.collection('render_jobs').countDocuments({user_id:mixed.user}),1);
  const zero=await seed();await assert.rejects(admitRenderJob(a,db,{...zero.input,quotaPolicy:limit(0)}),{code:'MONTHLY_RENDER_LIMIT_EXCEEDED'});assert.equal(await db.collection('render_jobs').countDocuments({user_id:zero.user}),0);
  const {ClipRenderService}=await import('../services/clipRenderService.js');await assert.rejects(ClipRenderService.renderClipJob(crypto.randomUUID(),one.user),{code:'RENDER_JOB_REQUIRED'});assert.equal(await db.collection('render_jobs').countDocuments({user_id:one.user}),1);
  const noPolicy=await seed();await assert.rejects(admitRenderJob(a,db,{...noPolicy.input,quotaPolicy:undefined}),{code:'RENDER_PLAN_UNAVAILABLE'});
  const rollback=await seed(),oldInsert=Collection.prototype.insertOne;
  (Collection.prototype as any).insertOne=async function(doc:any,...rest:any[]){if(this.collectionName==='render_jobs'&&doc.user_id===rollback.user)throw Object.assign(Error('Synthetic quota rollback'),{code:'FIXTURE_QUOTA_INSERT_FAILURE'});return (oldInsert as any).call(this,doc,...rest);};
  try{await assert.rejects(admitRenderJob(a,db,rollback.input),{code:'FIXTURE_QUOTA_INSERT_FAILURE'});}finally{Collection.prototype.insertOne=oldInsert;}
  assert.equal(await db.collection('render_jobs').countDocuments({user_id:rollback.user}),0);assert.equal((await db.collection('render_quota_fences').findOne({user_id:rollback.user}))?.serial,0);const afterRollback=await admitRenderJob(b,other,rollback.input);assert(afterRollback.job.id);assert.equal(await db.collection('render_jobs').countDocuments({user_id:rollback.user}),1);
  const legacy=await seed();const currentStart=new Date();currentStart.setUTCDate(1);currentStart.setUTCHours(0,0,0,0);
  await db.collection('render_jobs').insertOne({id:crypto.randomUUID(),user_id:legacy.user,clip_id:crypto.randomUUID(),status:'failed',created_at:currentStart.toISOString()});await assert.rejects(admitRenderJob(a,db,legacy.input),{code:'MONTHLY_RENDER_LIMIT_EXCEEDED'});
  for(const bad of [undefined,null,'not-a-date','2026-99-99T00:00:00.000Z',17,{},[]]){
   const unknown=await seed();const row:any={id:crypto.randomUUID(),user_id:unknown.user,status:'failed'};if(bad!==undefined)row.created_at=bad;await db.collection('render_jobs').insertOne(row);
   await assert.rejects(admitRenderJob(a,db,unknown.input),{code:'RENDER_USAGE_UNAVAILABLE'},'uncountable usage is not free allowance');assert.equal(await db.collection('render_jobs').countDocuments({user_id:unknown.user}),1);
  }
  const offsetBoundary=await seed();const beforeMidnight=new Date(currentStart.getTime()-3600000).toISOString().replace('Z','-02:00');
  await db.collection('render_jobs').insertOne({id:crypto.randomUUID(),user_id:offsetBoundary.user,status:'failed',created_at:beforeMidnight});
  await assert.rejects(admitRenderJob(a,db,offsetBoundary.input),{code:'MONTHLY_RENDER_LIMIT_EXCEEDED'},'ISO offset is compared by UTC instant, not text');
  const previous=await seed();const old=new Date(currentStart);old.setUTCDate(0);await db.collection('render_jobs').insertOne({id:crypto.randomUUID(),user_id:previous.user,status:'completed',created_at:old});assert((await admitRenderJob(a,db,previous.input)).job.id);
  const free=await seed();assert((await admitRenderJob(a,db,{...free.input,quotaPolicy:unlimited})).job.id);const extra=await seed(free.user);assert((await admitRenderJob(b,other,{...extra.input,quotaPolicy:unlimited})).job.id);
 }finally{for(const name of ['projects','transcripts','clips','clip_candidates','render_jobs','render_submissions','render_quota_fences'])await db.collection(name).deleteMany({user_id:{$in:users}});await closeMongo();await Promise.all([a.close(),b.close()]);}
});
