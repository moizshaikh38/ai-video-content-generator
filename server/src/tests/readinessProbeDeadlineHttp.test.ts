import test from 'node:test';
import assert from 'node:assert/strict';
import {MongoClient} from 'mongodb';

process.env.NODE_ENV='test';process.env.MONGODB_URI='mongodb://127.0.0.1:1';process.env.MONGODB_DB_NAME='readiness_fixture_not_connected';
process.env.SUPABASE_URL='http://127.0.0.1:5998';process.env.SUPABASE_SECRET_KEY='fixture';process.env.R2_ACCOUNT_ID='fixture';process.env.R2_ACCESS_KEY_ID='fixture';process.env.R2_SECRET_ACCESS_KEY='fixture';process.env.OPENROUTER_API_KEY='fixture';process.env.GROQ_API_KEY='';

test('readiness deadline helper handles failure, late failure and successful values',async()=>{
 const{readinessProbe}=await import('../services/healthService.js');
 assert.equal(await readinessProbe(async()=>3,20,0),3);
 assert.equal(await readinessProbe(async()=>{throw Error('fixture');},20,0),0);
 let reject!:(error:Error)=>void;const late=new Promise<number>((_,r)=>{reject=r;});
 assert.equal(await readinessProbe(()=>late,20,0),0);reject(Error('fixture late rejection'));await new Promise(resolve=>setTimeout(resolve,10));
});

test('actual readiness HTTP is bounded with stalled advisory probes and fails closed on a stalled core probe',async()=>{
 const oldConnect=MongoClient.prototype.connect,oldDb=MongoClient.prototype.db;
 let stallPing=false,counts=0;const observed:any[]=[];const never=new Promise<any>(()=>{});
 MongoClient.prototype.connect=async function(){return this;};
 MongoClient.prototype.db=function(){return{command:async()=>stallPing?never:{ok:1},collection:()=>({countDocuments:async(_query:any,options:any)=>{counts++;observed.push(options);return never;}})} as any;};
 const{SmartReframeService}=await import('../services/smartReframeService.js');const oldRuntime=SmartReframeService.checkReframeRuntime;
 SmartReframeService.checkReframeRuntime=async()=>never;
 const{setDatabaseBootstrapState}=await import('../services/databaseBootstrapState.js');const{closeMongo}=await import('../db/mongoClient.js');
 const{default:app}=await import('../index.js');const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const address=server.address();assert(address&&typeof address!=='string');const url=`http://127.0.0.1:${address.port}/ready`;
 try{
  setDatabaseBootstrapState('ready');let started=Date.now();const response=await fetch(url);const body=await response.json();let elapsed=Date.now()-started;
  assert.equal(response.status,200);assert.equal(body.status,'ready');assert.equal(body.renderQueue,null);assert.equal(body.reframeRuntime,null);assert(counts>=2);for(const options of observed){assert.equal(options.maxTimeMS,500);assert.equal(options.timeoutMS,500);}assert(elapsed<1500,`advisory probes delayed HTTP ${elapsed}ms`);
  stallPing=true;started=Date.now();const unavailable=await fetch(url);const missing=await unavailable.json();elapsed=Date.now()-started;
  assert.equal(unavailable.status,503);assert.equal(missing.checks.mongodb,false);assert.equal(missing.status,'not_ready');assert(elapsed<3000,`core probe delayed HTTP ${elapsed}ms`);
  // A failure is not cached forever: later healthy probes can recover.
  stallPing=false;const recovered=await fetch(url);assert.equal(recovered.status,200);
  const{workLifecycle}=await import('../services/queue/workLifecycle.js');let entered!:()=>void,release!:()=>void;const entering=new Promise<void>(r=>{entered=r;}),releasing=new Promise<void>(r=>{release=r;});
  SmartReframeService.checkReframeRuntime=async()=>{entered();await releasing;return{available:false,pythonPath:'fixture'};};
  const drainingResponse=fetch(url);await entering;workLifecycle.beginDrain();release();const drained=await drainingResponse;assert.equal(drained.status,503);assert.equal((await drained.json()).draining,true);
 }finally{setDatabaseBootstrapState('pending');SmartReframeService.checkReframeRuntime=oldRuntime;MongoClient.prototype.connect=oldConnect;MongoClient.prototype.db=oldDb;server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await closeMongo();}
});
