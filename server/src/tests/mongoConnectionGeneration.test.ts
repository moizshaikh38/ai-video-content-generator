import test from 'node:test';
import assert from 'node:assert/strict';
import {MongoClient} from 'mongodb';
process.env.NODE_ENV='test';process.env.MONGODB_URI='mongodb://127.0.0.1:1';process.env.MONGODB_DB_NAME='pool_lifetime_fixture_not_connected';
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(reason:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}

test('closed connection generations cannot resurrect or clear a newer shared attempt',async()=>{
 const{getMongoDb,closeMongo}=await import('../db/mongoClient.js');await closeMongo();
 const oldConnect=MongoClient.prototype.connect,oldDb=MongoClient.prototype.db,oldClose=MongoClient.prototype.close;
 const records:any[]=[];
 MongoClient.prototype.connect=function(){const record={client:this,connect:deferred<MongoClient>(),ping:deferred<any>(),entered:deferred<void>(),closed:0,pings:0,db:null as any};record.db={command:async()=>{record.pings++;record.entered.resolve();return record.ping.promise;}};records.push(record);return record.connect.promise;};
 MongoClient.prototype.db=function(){return records.find(r=>r.client===this).db;};
 MongoClient.prototype.close=async function(){records.find(r=>r.client===this).closed++;};
 try{
  for(const phase of ['connect','ping','reject']){
   const offset=records.length;const first=getMongoDb();const firstFailure=assert.rejects(first,{code:'DATABASE_UNAVAILABLE'});const stale=records[offset];
   if(phase==='ping'){stale.connect.resolve(stale.client);await stale.entered.promise;}
   await closeMongo();assert(stale.closed>=1,'pending pool must be closed, not leaked');
   const next=getMongoDb(),shared=getMongoDb();const fresh=records[offset+1];assert.equal(records.length,offset+2);
   if(phase==='reject')stale.connect.reject(Error('fixture old handshake failed'));
   else if(phase==='connect')stale.connect.resolve(stale.client);
   else stale.ping.resolve({ok:1});
   await firstFailure;
   const third=getMongoDb();assert.equal(records.length,offset+2,'old continuation must not clear newer shared attempt');
   if(phase==='connect')assert.equal(stale.pings,0,'closed candidate must not begin a ping');
   fresh.connect.resolve(fresh.client);fresh.ping.resolve({ok:1});const databases=await Promise.all([next,shared,third]);for(const db of databases)assert.equal(db,fresh.db);
   assert.equal(fresh.pings,1);assert.equal(await getMongoDb(),fresh.db);assert.equal(records.length,offset+2);
   await closeMongo();assert.equal(fresh.closed,1);
  }
 }finally{await closeMongo();MongoClient.prototype.connect=oldConnect;MongoClient.prototype.db=oldDb;MongoClient.prototype.close=oldClose;}
});

test('ordinary shared connection failure still permits one fresh retry',async()=>{
 const{getMongoDb,closeMongo}=await import('../db/mongoClient.js');await closeMongo();
 const oldConnect=MongoClient.prototype.connect,oldDb=MongoClient.prototype.db,oldClose=MongoClient.prototype.close;let attempts=0,closed=0;
 MongoClient.prototype.connect=async function(){attempts++;if(attempts===1)throw Error('fixture initial unavailable');return this;};
 const db={command:async()=>({ok:1})};MongoClient.prototype.db=function(){return db as any;};MongoClient.prototype.close=async function(){closed++;};
 try{const a=getMongoDb(),b=getMongoDb();await Promise.all([assert.rejects(a,{code:'DATABASE_UNAVAILABLE'}),assert.rejects(b,{code:'DATABASE_UNAVAILABLE'})]);assert.equal(attempts,1);assert.equal(closed,1);assert.equal(await getMongoDb(),db);assert.equal(attempts,2);await closeMongo();assert.equal(closed,2);}
 finally{await closeMongo();MongoClient.prototype.connect=oldConnect;MongoClient.prototype.db=oldDb;MongoClient.prototype.close=oldClose;}
});
