import {test} from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {startRenderQueueWake} from '../services/queue/renderQueueWake.js';
const pause=(n=20)=>new Promise(r=>setTimeout(r,n));
test('queue changes coalesce without concurrent drains; changes during drain request another pass',async()=>{const stream:any=new EventEmitter();let closed=0,active=0,max=0,calls=0,release!:()=>void,errors=0;stream.close=async()=>{closed++;};let pipeline:any;const db:any={collection:(name:string)=>{assert.equal(name,'render_jobs');return{watch:(p:any)=>{pipeline=p;return stream;}};}};const wake=startRenderQueueWake(db,async()=>{calls++;active++;max=Math.max(max,active);if(calls===1)await new Promise<void>(r=>release=r);active--;},()=>errors++);assert.equal(pipeline[0].$match['fullDocument.status'],'queued');stream.emit('change',{});stream.emit('change',{});await pause();assert.equal(calls,1);stream.emit('change',{});release();await pause();assert.equal(calls,2);assert.equal(max,1);stream.emit('error',Error('fixture'));assert.equal(errors,1);wake.stop();stream.emit('change',{});await pause();assert.equal(calls,2);assert.equal(closed,1);});

test('terminal stream errors reopen once and request recovery; stale streams cannot drain',async()=>{
 const streams:any[]=[],errors:unknown[]=[];let calls=0;
 const db:any={collection:()=>({watch:()=>{const s:any=new EventEmitter();s.closed=0;s.close=async()=>{s.closed++;s.emit('close');};streams.push(s);return s;}})};
 const wake=startRenderQueueWake(db,async()=>{calls++;},e=>errors.push(e));
 try{streams[0].emit('error',Error('terminal fixture'));streams[0].emit('close');assert.equal(errors.length,1);assert.equal(streams[0].closed,1);await pause(1100);assert.equal(streams.length,2);assert.equal(calls,1);streams[0].emit('change');await pause();assert.equal(calls,1);streams[1].emit('change');await pause();assert.equal(calls,2);}finally{wake.stop();}
 assert.equal(streams[1].closed,1);
});

test('synchronous watch failure does not crash startup and retries; stop cancels retry',async()=>{
 let watches=0,calls=0,errors=0;const s:any=new EventEmitter();s.close=async()=>{};
 const db:any={collection:()=>({watch:()=>{watches++;if(watches===1)throw Error('watch fixture');return s;}})};
 const wake=startRenderQueueWake(db,async()=>{calls++;},()=>errors++);
 try{assert.equal(errors,1);await pause(1100);assert.equal(watches,2);assert.equal(calls,1);s.emit('error',Error('shutdown fixture'));wake.stop();await pause(1100);assert.equal(watches,2);}finally{wake.stop();}
});

test('pending notification survives a failing drain and remains serialized',async()=>{
 const s:any=new EventEmitter();s.close=async()=>{};let calls=0,errors=0,release!:()=>void;
 const db:any={collection:()=>({watch:()=>s})};const wake=startRenderQueueWake(db,async()=>{calls++;if(calls===1){await new Promise<void>(r=>release=r);throw Error('drain fixture');}},()=>errors++);
 try{wake.request();await pause();wake.request();release();await pause();assert.equal(calls,2);assert.equal(errors,1);}finally{wake.stop();}
});
