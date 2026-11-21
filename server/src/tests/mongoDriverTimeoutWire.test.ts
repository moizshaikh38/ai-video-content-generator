import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {BSON} from 'mongodb';

// This is a small loopback wire-protocol fixture, NOT a MongoDB process. It
// answers handshakes and deliberately withholds ping replies so the installed
// driver's socket/operation deadline runs for real. No user data is accepted.
test('installed Mongo driver times out a stalled acceptance ping and pool retries successfully', {timeout:15_000}, async(t)=>{
 const sockets=new Set<net.Socket>();let port=0,replyId=0,stall=true,pings=0,onPing:(()=>void)|null=null;const commands:string[]=[];
 const server=net.createServer(socket=>{
  sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});let pending=Buffer.alloc(0);
  socket.on('data',chunk=>{
   pending=Buffer.concat([pending,chunk]);
   while(pending.length>=4){
    const size=pending.readInt32LE(0);if(size<16||size>1024*1024){socket.destroy();return;}if(pending.length<size)return;
    const frame=pending.subarray(0,size);pending=pending.subarray(size);const requestId=frame.readInt32LE(4),opcode=frame.readInt32LE(12);let start:number;
    if(opcode===2004){const end=frame.indexOf(0,20);if(end<0){socket.destroy();return;}start=end+1+8;}
    else if(opcode===2013&&frame[20]===0)start=21;
    else{socket.destroy();return;}
    let command:any;try{command=BSON.deserialize(frame.subarray(start));}catch{socket.destroy();return;}
    const name=Object.keys(command)[0];commands.push(name);let result:any;
    if(name==='hello'||name==='ismaster'||name==='isMaster')result={ok:1,isWritablePrimary:true,ismaster:true,helloOk:true,setName:'loopback-wire-fixture',hosts:[`127.0.0.1:${port}`],minWireVersion:0,maxWireVersion:25,logicalSessionTimeoutMinutes:30,maxBsonObjectSize:16777216,maxMessageSizeBytes:48000000,maxWriteBatchSize:100000};
    else if(name==='ping'){pings++;onPing?.();if(stall)continue;result={ok:1};}
    else if(name==='endSessions')result={ok:1};
    else result={ok:0,code:59,errmsg:'Unsupported loopback fixture command'};
    const doc=BSON.serialize(result),body=opcode===2004?Buffer.alloc(20+doc.length):Buffer.alloc(5+doc.length);
    if(opcode===2004){body.writeInt32LE(1,16);doc.copy(body,20);}else{body.writeInt32LE(0,0);body[4]=0;doc.copy(body,5);}
    const header=Buffer.alloc(16);header.writeInt32LE(16+body.length,0);header.writeInt32LE(++replyId,4);header.writeInt32LE(requestId,8);header.writeInt32LE(opcode===2004?1:2013,12);socket.write(Buffer.concat([header,body]));
   }
  });
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert(address&&typeof address!=='string');port=address.port;
 process.env.NODE_ENV='test';process.env.MONGODB_URI=`mongodb://127.0.0.1:${port}/?directConnection=true`;process.env.MONGODB_DB_NAME='wire_fixture_no_database';
 const{getMongoDb,isMongoHealthy,closeMongo}=await import('../db/mongoClient.js');
 try{
  const started=Date.now();await assert.rejects(getMongoDb(),{code:'DATABASE_UNAVAILABLE'});const elapsed=Date.now()-started;
  assert(pings>=1,'real driver must complete handshake and attempt ping');assert(elapsed>=1500&&elapsed<5000,`native operation deadline elapsed ${elapsed}ms`);
  stall=false;await getMongoDb();assert.equal(await isMongoHealthy(),true);assert(pings>=3);
  stall=true;const healthStarted=Date.now();assert.equal(await isMongoHealthy(),false);const healthElapsed=Date.now()-healthStarted;assert(healthElapsed>=1500&&healthElapsed<5000,`native health deadline elapsed ${healthElapsed}ms`);
  stall=false;assert.equal(await isMongoHealthy(),true);
  await closeMongo();stall=true;let sawPing!:()=>void;const pingSeen=new Promise<void>(resolve=>{sawPing=resolve;});onPing=()=>{onPing=null;sawPing();};
  const pending=getMongoDb();const rejected=assert.rejects(pending,{code:'DATABASE_UNAVAILABLE'});await pingSeen;const closing=closeMongo();stall=false;const fresh=getMongoDb();await Promise.all([closing,rejected]);const current=await fresh;assert.equal((await getMongoDb()).client,current.client);assert.equal(await isMongoHealthy(),true);
  t.diagnostic(`real installed-driver acceptance ping deadline ${elapsed}ms; health ping deadline ${healthElapsed}ms; pending close and retry settled against loopback wire fixture`);
  assert(commands.every(name=>['hello','ismaster','isMaster','ping','endSessions'].includes(name)),'fixture must not receive schema or user-data commands');
 }finally{await closeMongo();for(const socket of sockets)socket.destroy();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
