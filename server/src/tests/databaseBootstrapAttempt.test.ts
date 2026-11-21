import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseBootstrapAttempt} from '../services/databaseBootstrapAttempt.js';
import {WorkLifecycle} from '../services/queue/workLifecycle.js';
function deferred(){let resolve!:()=>void,reject!:(error:Error)=>void;const promise=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}

test('wait timeouts never launch overlapping bootstrap attempts, late success is reused',async()=>{
 const gate=deferred();let calls=0;const lifecycle=new WorkLifecycle();
 const bootstrap=new DatabaseBootstrapAttempt(()=>lifecycle.run('fixture-bootstrap',async()=>{calls++;await gate.promise;}));
 await assert.rejects(bootstrap.wait(10),/underlying attempt remains owned/);assert.equal(calls,1);assert.deepEqual(lifecycle.snapshot().active,['fixture-bootstrap']);
 const retry=bootstrap.wait(1000);void retry.catch(()=>{});await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);gate.resolve();await retry;assert.equal(calls,1);assert.deepEqual(lifecycle.snapshot().active,[]);
 await bootstrap.wait(10);assert.equal(calls,1,'completed bootstrap is not rerun');
});

test('concurrent supervisors share one bootstrap; actual rejection permits a fresh retry',async()=>{
 let calls=0;const first=deferred();const bootstrap=new DatabaseBootstrapAttempt(async()=>{calls++;if(calls===1)await first.promise;});
 const a=bootstrap.wait(1000),b=bootstrap.wait(1000);const checked=Promise.all([assert.rejects(a,/fixture rejection/),assert.rejects(b,/fixture rejection/)]);await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);first.reject(Error('fixture rejection'));await checked;
 await Promise.all([bootstrap.wait(1000),bootstrap.wait(1000)]);assert.equal(calls,2);
});

test('late failure after timeout is handled and releases ownership for a real retry',async()=>{
 let calls=0;const first=deferred();const bootstrap=new DatabaseBootstrapAttempt(async()=>{calls++;if(calls===1)await first.promise;});
 await assert.rejects(bootstrap.wait(10),/wait timeout/);first.reject(Error('fixture late rejection'));await new Promise(resolve=>setImmediate(resolve));await bootstrap.wait(1000);assert.equal(calls,2);
});

test('draining lifecycle still tracks pending timed-out bootstrap until settlement',async()=>{
 const gate=deferred(),lifecycle=new WorkLifecycle();const bootstrap=new DatabaseBootstrapAttempt(()=>lifecycle.run('fixture-bootstrap',()=>gate.promise));
 await assert.rejects(bootstrap.wait(10),/wait timeout/);lifecycle.beginDrain();let idle=false;void lifecycle.waitForIdle().then(()=>{idle=true;});await new Promise(resolve=>setImmediate(resolve));assert.equal(idle,false);gate.resolve();await lifecycle.waitForIdle();assert(idle);await bootstrap.wait(10);
});

test('invalid wait deadline refuses without starting schema work',async()=>{
 let calls=0;const bootstrap=new DatabaseBootstrapAttempt(async()=>{calls++;});for(const value of [0,-1,1.5,NaN,Infinity])await assert.rejects(bootstrap.wait(value),/positive integer/);assert.equal(calls,0);
});
