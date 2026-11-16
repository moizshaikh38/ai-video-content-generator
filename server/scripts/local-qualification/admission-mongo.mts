import assert from 'node:assert/strict';
process.env.NODE_ENV='test';process.env.MONGODB_URI='mongodb://127.0.0.1:27019';process.env.MONGODB_DB_NAME='vireo_admission_qualification_'+Date.now();process.env.SUPABASE_URL='http://127.0.0.1:5998';process.env.SUPABASE_SECRET_KEY='isolated-fixture';
const {getMongoDb,closeMongo}=await import('../../src/db/mongoClient.ts');
const {ClipRenderService:S,launchInlineRender,renderOccupancy}=await import('../../src/services/clipRenderService.ts');
const db=await getMongoDb(), col=db.collection('render_jobs');const original=S.renderClipJob;
const make=async(id:string,extra:any={})=>col.insertOne({id,clip_id:id,user_id:'qualification-user',status:'queued',attempts:0,next_retry_at:null,worker_id:null,locked_at:null,created_at:new Date(),...extra});
let calls=0,active=0,max=0,release:any;
(S as any).renderClipJob=async(id:string)=>{calls++;active++;max=Math.max(max,active);await col.updateOne({id,status:'queued'},{$set:{status:'processing',worker_id:'fixture',locked_at:new Date()}});await new Promise(r=>release=r);await col.updateOne({id},{$set:{status:'completed'}});active--;};
try{
await make('inline-a');await make('sweep-b');assert.equal(launchInlineRender('inline-a','qualification-user','inline-a'),true);await new Promise(r=>setTimeout(r,10));assert.equal(await S.processDueRenderJobs(),0);assert.equal((await col.findOne({id:'sweep-b'}))?.status,'queued');release();await new Promise(r=>setTimeout(r,20));assert.equal(renderOccupancy(),0);console.log('PASS inline holds => sweep leaves different job queued');
const sweep=S.processDueRenderJobs();while(active===0)await new Promise(r=>setTimeout(r,5));assert.equal(launchInlineRender('inline-c','qualification-user','inline-c'),false);release();await sweep;assert.equal(renderOccupancy(),0);assert.equal(max,1);console.log('PASS sweep holds => inline refused; max simultaneous='+max);
// Force inline admission into the actual await gap after sweep pick but before reserve.
await make('race-picked');const {Collection}=await import('mongodb');const originalFind=Collection.prototype.findOne;let picked:any,continuePick:any;
const pickedGate=new Promise(r=>picked=r), resumeGate=new Promise(r=>continuePick=r);
(Collection.prototype as any).findOne=async function(...a:any[]){const result=await (originalFind as any).apply(this,a);if(this.collectionName==='render_jobs'&&a[0]?.status==='queued'){picked();await resumeGate;}return result;};
const raceSweep=S.processDueRenderJobs();await pickedGate;assert.equal(launchInlineRender('race-inline','qualification-user',undefined),true);continuePick();assert.equal(await raceSweep,0);Collection.prototype.findOne=originalFind;assert.equal((await col.findOne({id:'race-picked'}))?.status,'queued');assert.equal((await col.findOne({id:'race-picked'}))?.locked_at,null);release();await new Promise(r=>setTimeout(r,20));assert.equal(renderOccupancy(),0);console.log('PASS actual Mongo query-await race => no claim or stranded lease');
(S as any).renderClipJob=original;await col.updateOne({id:'race-picked'},{$set:{status:'completed'}});await make('missing-clip');assert.equal(await S.processDueRenderJobs(),1);assert.equal((await col.findOne({id:'missing-clip'}))?.error_code,'CLIP_NOT_FOUND');assert.equal(renderOccupancy(),0);console.log('PASS real renderClipJob missing-clip prelease error => failed job and slot released');
await make('stale-job',{status:'processing',locked_at:new Date(Date.now()-16*60*1000),worker_id:'old'});assert.equal(await S.processDueRenderJobs(),1);assert.equal((await col.findOne({id:'stale-job'}))?.error_code,'CLIP_NOT_FOUND');assert.equal(renderOccupancy(),0);console.log('PASS stale Mongo lease recovered then actual prelease failure, no slot leak');
}finally{(S as any).renderClipJob=original;await closeMongo();}
