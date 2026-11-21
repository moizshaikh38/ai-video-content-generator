import test from 'node:test';
import assert from 'node:assert/strict';
import {MongoClient} from 'mongodb';
process.env.NODE_ENV='test';process.env.MONGODB_URI='mongodb://127.0.0.1:1';process.env.MONGODB_DB_NAME='ping_timeout_fixture_not_connected';

test('initial and health pings carry driver operation deadlines and can recover after timeout',async()=>{
 const{getMongoDb,isMongoHealthy,closeMongo}=await import('../db/mongoClient.js');await closeMongo();
 const oldConnect=MongoClient.prototype.connect,oldDb=MongoClient.prototype.db,oldClose=MongoClient.prototype.close;
 let connects=0,closed=0,pings=0,fail=true;const calls:any[]=[];
 const db={command:async(command:any,options:any)=>{pings++;calls.push({command,options});if(fail)throw Object.assign(Error('fixture operation timeout'),{name:'MongoOperationTimeoutError'});return{ok:1};}};
 MongoClient.prototype.connect=async function(){connects++;return this;};MongoClient.prototype.db=function(){return db as any;};MongoClient.prototype.close=async function(){closed++;};
 try{
  await assert.rejects(getMongoDb(),{code:'DATABASE_UNAVAILABLE'});assert.equal(closed,1);assert.equal(connects,1);
  fail=false;assert.equal(await getMongoDb(),db);assert.equal(connects,2);
  fail=true;assert.equal(await isMongoHealthy(),false);fail=false;assert.equal(await isMongoHealthy(),true);
  assert.equal(connects,2,'health failure does not replace a usable shared pool');assert.equal(pings,4);
  for(const{command,options}of calls){assert.equal(command.ping,1);assert.equal(command.maxTimeMS,2000);assert.equal(options?.timeoutMS,2000);}
  await closeMongo();assert.equal(closed,2);
 }finally{await closeMongo();MongoClient.prototype.connect=oldConnect;MongoClient.prototype.db=oldDb;MongoClient.prototype.close=oldClose;}
});
