/** LOCAL ONLY. Fresh isolated Mongo database and mocked auth verifier; real HTTP
 * editor routes/repository validation. No external requests or billing calls. */
import fs from 'node:fs';import crypto from 'node:crypto';import assert from 'node:assert/strict';
process.env.NODE_ENV='test';process.env.MONGODB_URI='mongodb://127.0.0.1:27019';process.env.MONGODB_DB_NAME='vireo_recovery_qualification';process.env.SUPABASE_URL='http://127.0.0.1:5998';process.env.SUPABASE_SECRET_KEY='isolated-local-fixture-not-real';process.env.OPENROUTER_API_KEY='';process.env.GROQ_API_KEY='';process.env.GAME_EVENTS_AUTO='off';process.env.MULTIMODAL_AUTO='off';
const actualFetch=globalThis.fetch;globalThis.fetch=async(input:any,opts?:any)=>{const url=String(input?.url||input);if(!/^http:\/\/127\.0\.0\.1:/.test(url))throw new Error('Local qualification forbids external request');return actualFetch(input,opts)};
const {default:express}=await import('express');const {supabaseAuthClient}=await import('../../src/utils/supabase.ts');const {getMongoDb,closeMongo}=await import('../../src/db/mongoClient.ts');const {default:routes}=await import('../../src/routes/projectRoutes.ts');const {errorHandler}=await import('../../src/middleware/errorHandler.ts');
const uid=crypto.randomUUID(),pid=crypto.randomUUID(),cid=crypto.randomUUID();const token='local-recovery-fixture-'+uid;const source=`users/${uid}/projects/${pid}/source/speed-refetched.mp4`;
(supabaseAuthClient.auth as any).getUser=async(t:string)=>t===token?{data:{user:{id:uid,email:'local-recovery@vireoclip.test'}},error:null}:{data:{user:null},error:{message:'fixture only'}};
let db=await getMongoDb();const now=new Date();await db.collection('projects').insertOne({id:pid,user_id:uid,title:'Isolated persistence recovery',duration_seconds:90.024,video_status:'ready',created_at:now,updated_at:now});await db.collection('clips').insertOne({id:cid,project_id:pid,user_id:uid,title:'Local persistence only, no STT',start_seconds:31.62,end_seconds:33.62,duration_seconds:2,aspect_ratio:'9:16',crop_mode:'fit',crop_config:{mode:'fit_blur'},source_storage_path:source,render_status:'pending',caption_enabled:false,created_at:now,updated_at:now});
const app=express();app.use(express.json({limit:'5mb'}));app.use('/api',routes);app.use(errorHandler);const server=app.listen(5581,'127.0.0.1');
const events:any[]=[];async function call(path:string,method='GET',body?:any,auth=token){const r=await actualFetch('http://127.0.0.1:5581/api'+path,{method,headers:{authorization:'Bearer '+auth,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();events.push({path,method,status:r.status});if(!r.ok)throw new Error(JSON.stringify(data));return data.data}

try {
 await db.collection('projects').updateOne({id:pid},{$set:{clip_preferences:{genre:'gaming',genreSelectionMode:'manual'}}});
 await db.collection('clips').updateOne({id:cid},{$set:{end_seconds:35.62,duration_seconds:4,crop_mode:'smart',crop_config:{mode:'smart',layout_mode:'screencast',layout_mode_source:'genre_recommendation'}}});
 const p=await call(`/clips/${cid}/editor-project`,'POST',{});const v=p.tracks.find((t:any)=>t.type==='VIDEO').items[0];assert.equal(v.panels.layout,'gameplay');assert.ok(v.panels.slots.every((s:any)=>!s.set));
 const again=await call(`/clips/${cid}/editor-project`,'POST',{});assert.equal(again.id,p.id);assert.deepEqual(again.tracks,p.tracks);
 const manual=structuredClone(p.tracks);const m=manual.find((t:any)=>t.type==='VIDEO').items[0];delete m.panels;m.crop={mode:'custom',focusX:.3,focusY:.5,scale:1.7};m.crop_config={layout_mode:'track',layout_mode_source:'user'};
 await call(`/editor-projects/${p.id}`,'PATCH',{tracks:manual});const reopened=await call(`/clips/${cid}/editor-project`,'POST',{});assert.equal(reopened.tracks.find((t:any)=>t.type==='VIDEO').items[0].panels,undefined);assert.equal(reopened.tracks.find((t:any)=>t.type==='VIDEO').items[0].crop.scale,1.7);
 // Restore unassigned template solely in this new qualification fixture for UI review proof.
 await call(`/editor-projects/${p.id}`,'PATCH',{tracks:p.tracks});
 fs.writeFileSync('/tmp/vireo-local-restore/gaming-fixture.json',JSON.stringify({user_id:uid,project_id:pid,clip_id:cid,editor_id:p.id,source_key:source,events},null,2));console.log('GAMING_HTTP_NEW_REOPEN_MANUAL_PRECEDENCE_PASS',JSON.stringify(events));
}finally{await new Promise<void>(r=>server.close(()=>r()));await closeMongo();}
