/** LOCAL ONLY: real project routes/Mongo; fixture auth, no external network. */
import fs from 'node:fs';import crypto from 'node:crypto';import assert from 'node:assert/strict';
Object.assign(process.env,{NODE_ENV:'test',MONGODB_URI:'mongodb://127.0.0.1:27019',MONGODB_DB_NAME:'vireo_recovery_qualification',SUPABASE_URL:'http://127.0.0.1:5998',SUPABASE_SECRET_KEY:'isolated-fixture',OPENROUTER_API_KEY:'',GROQ_API_KEY:''});
const actualFetch=globalThis.fetch;globalThis.fetch=async(i:any,o?:any)=>{if(!String(i?.url||i).startsWith('http://127.0.0.1:'))throw Error('External request forbidden');return actualFetch(i,o)};
const {default:express}=await import('express');const {supabaseAuthClient}=await import('../../src/utils/supabase.ts');const {getMongoDb,closeMongo}=await import('../../src/db/mongoClient.ts');const {default:routes}=await import('../../src/routes/projectRoutes.ts');const {errorHandler}=await import('../../src/middleware/errorHandler.ts');const {EntitlementService}=await import('../../src/services/entitlementService.ts');
const uid=crypto.randomUUID(),foreign=crypto.randomUUID(),token='retention-fixture';let plan='free';
(supabaseAuthClient.auth as any).getUser=async(t:string)=>t===token?{data:{user:{id:uid,email:'retention@vireoclip.test'}},error:null}:{data:{user:null},error:{message:'fixture'}};
// Switch only the fixture's resolved plan, no live billing mutation.
(EntitlementService as any).resolveUserEntitlements=async()=>EntitlementService.getPlanEntitlements(plan as any);
const db=await getMongoDb();const app=express();app.use((req,res,next)=>{res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','*');if(req.method==='OPTIONS'){res.sendStatus(204);return}next()});app.use(express.json());app.use('/api',routes);app.use(errorHandler);const server=app.listen(5581,'127.0.0.1');
async function call(path:string,method='GET',body?:any){const r=await actualFetch('http://127.0.0.1:5581/api'+path,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const j=await r.json();assert.ok(r.ok,JSON.stringify(j));return j}
const events:any[]=[];
try{
 const free=(await call('/projects','POST',{title:'New Free source',source_type:'upload',retention_policy:{enforcement:'enabled'},creationPlanId:'pro'})).project;
 assert.equal(free.retention_policy.planAtCreation,'free');assert.equal(free.retention_policy.enforcement,'disabled');assert.equal(Date.parse(free.retention_policy.proposedExpiresAt)-Date.parse(free.created_at),259200000);events.push({check:'free_create_ignores_client_policy',id:free.id});
 plan='pro';const paid=(await call('/projects','POST',{title:'Paid source, no Free deadline',source_type:'upload'})).project;assert.equal(paid.retention_policy.proposedExpiresAt,null);plan='free';
 const failedId=crypto.randomUUID(),reviewId=crypto.randomUUID(),oldId=crypto.randomUUID();
 await db.collection('projects').insertMany([
 {id:failedId,user_id:uid,title:'Failed source retained for recovery',video_status:'failed',created_at:new Date().toISOString(),error_message:'Qualification failure'},
 {id:reviewId,user_id:uid,title:'Transcript needs review',video_status:'failed',transcript_quality_status:'needs_review',created_at:new Date().toISOString()},
 {id:oldId,user_id:uid,title:'Legacy source, no retroactive expiry',video_status:'uploaded',created_at:'2020-01-01T00:00:00.000Z'},
 {id:crypto.randomUUID(),user_id:foreign,title:'Another account',video_status:'failed',created_at:new Date().toISOString()}]);
 await db.collection('transcripts').insertOne({id:crypto.randomUUID(),project_id:reviewId,user_id:uid,transcript_text:'Synthetic flagged phrase for read-only review',language:'en',segments:[{start:0,end:2,text:'Synthetic flagged phrase for read-only review'}],quality_assessment:{version:1,status:'needs_review'},created_at:new Date().toISOString()});
 const before=await db.collection('projects').find({user_id:uid}).sort({id:1}).toArray();
 for(let n=0;n<2;n++){const list=await call('/projects');assert.equal(list.total,5);assert.equal(list.projects.length,5);assert.ok(list.projects.some((p:any)=>p.id===failedId&&p.video_status==='failed'));assert.ok(list.projects.some((p:any)=>p.id===reviewId&&p.transcript_quality_status==='needs_review'));assert.equal(list.projects.find((p:any)=>p.id===oldId).retention_policy,undefined);assert.equal(list.projects.find((p:any)=>p.id===paid.id).retention_policy.proposedExpiresAt,null);}
 const after=await db.collection('projects').find({user_id:uid}).sort({id:1}).toArray();assert.deepEqual(after,before);
 const page=await call('/projects?limit=2&offset=1');assert.equal(page.total,5);assert.equal(page.projects.length,2);
 const read=(await call('/projects/'+free.id)).project;assert.deepEqual(read.retention_policy,free.retention_policy);events.push({check:'read_only_list_twice_failed_review_legacy_paid_downgrade_count_pagination_owner',total:5});
 // Expire proposal in THIS fixture for visual proof that access remains available.
 await db.collection('projects').updateOne({id:free.id},{$set:{'retention_policy.proposedExpiresAt':'2026-11-16T00:00:00.000Z'}});
 fs.writeFileSync('/tmp/vireo-local-restore/retention-result.json',JSON.stringify({uid,token,reviewId,events},null,2));console.log('RETENTION_HTTP_PASS',JSON.stringify(events));
 if(process.env.KEEP_LOCAL_SERVER==='1'){console.log('RETENTION_UI_READY');await new Promise<void>(r=>process.on('SIGTERM',()=>r()))}
}finally{await new Promise<void>(r=>server.close(()=>r()));await closeMongo()}
