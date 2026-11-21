import test from 'node:test';
import assert from 'node:assert/strict';
import {bootstrapMongo} from '../db/bootstrapMongo.js';
import {assertDatabaseTransactionalTopology,assertTransactionalTopology} from '../db/mongoClient.js';
import type {Db,MongoClient} from 'mongodb';

function fixture(handshake:(command:any,options:any)=>Promise<any>){
 const events:string[]=[];
 const db={
  command:async(command:any,options:any)=>{events.push(command.hello?'hello':'isMaster');assert.equal(options.timeoutMS,2000);return handshake(command,options);},
  listCollections:()=>{events.push('listCollections');return{toArray:async()=>[]};},
  createCollection:async()=>{events.push('createCollection');},
  collection:()=>({updateMany:async()=>{events.push('updateMany');},createIndex:async()=>{events.push('createIndex');}}),
 } as unknown as Db;
 return{db,events};
}

test('bootstrap rejects standalone topology before schema reads or writes',async()=>{
 const{db,events}=fixture(async()=>({isWritablePrimary:true}));
 await assert.rejects(bootstrapMongo(db),{code:'TRANSACTIONAL_TOPOLOGY_REQUIRED'});
 assert.deepEqual(events,['hello']);
});

test('supported topology permits actual bootstrap code to continue through schema setup',async()=>{
 for(const response of [{setName:'fixture-replica'},{msg:'isdbgrid'}]){
  const{db,events}=fixture(async()=>response);await bootstrapMongo(db);
  assert.equal(events[0],'hello');assert.equal(events[1],'listCollections');assert(events.includes('createCollection'));assert(events.includes('createIndex'));
 }
});

test('unsupported legacy hello falls back once with the same operation bounds',async()=>{
 const{db,events}=fixture(async command=>{if(command.hello)throw Object.assign(Error('fixture missing command'),{code:59});return{setName:'fixture-replica'};});
 await assertDatabaseTransactionalTopology(db);assert.deepEqual(events,['hello','isMaster']);
});

test('network, timeout and permission failures stay closed without legacy retry or schema writes',async()=>{
 for(const code of [13,18,50,89]){
  const failure=Object.assign(Error('fixture handshake failure'),{code});const{db,events}=fixture(async()=>{throw failure;});
  await assert.rejects(bootstrapMongo(db),error=>error===failure);assert.deepEqual(events,['hello']);
 }
 const{db,events}=fixture(async command=>{if(command.hello)throw Object.assign(Error('fixture missing command'),{codeName:'CommandNotFound'});throw Error('fixture legacy failure');});
 await assert.rejects(bootstrapMongo(db),/fixture legacy failure/);assert.deepEqual(events,['hello','isMaster']);
});

test('financial topology assertion uses the same bounded handshake implementation',async()=>{
 const{db,events}=fixture(async()=>({setName:'fixture-replica'}));let databases=0;
 await assertTransactionalTopology({db:(name:string)=>{databases++;assert.equal(name,'admin');return db;}} as unknown as MongoClient);
 assert.equal(databases,1);assert.deepEqual(events,['hello']);
});
