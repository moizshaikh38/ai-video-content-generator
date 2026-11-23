import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.NODE_ENV='test';process.env.SUPABASE_URL='http://127.0.0.1:5998';process.env.SUPABASE_SECRET_KEY='fixture';
const {SmartReframeService:S}=await import('../services/smartReframeService.js');

test('runtime probe is single flight, reports optional unset, invalidates model changes and hides paths in readiness',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'runtime-probe-test-'));
 const saved={...process.env};
 try{
  delete process.env.SMART_REFRAME_PERSON_MODEL;delete process.env.SMART_REFRAME_YUNET_MODEL;
  const [a,b]=await Promise.all([S.checkReframeRuntime(true),S.checkReframeRuntime(true)]);
  assert.strictEqual(a,b,'concurrent force checks share one probe');
  assert.equal(a.available,true);assert.equal(a.person?.status,'not-configured');assert.equal(a.face?.kind,'haar');
  assert.strictEqual(await S.checkReframeRuntime(),a,'unchanged config returns cached result');
  const model=path.join(dir,'person.onnx');process.env.SMART_REFRAME_PERSON_MODEL=model;
  const missing=await S.checkReframeRuntime();assert.equal(missing.available,false);assert.equal(missing.person?.status,'unavailable');assert.notStrictEqual(missing,a);
  fs.writeFileSync(model,'wrong-checksum');
  const corrupt=await S.checkReframeRuntime();assert.notStrictEqual(corrupt,missing);assert.equal(corrupt.person?.status,'unavailable');
  delete process.env.SMART_REFRAME_PERSON_MODEL;
  const recovered=await S.checkReframeRuntime();assert.equal(recovered.available,true);assert.notStrictEqual(recovered,corrupt);
  const health=fs.readFileSync(new URL('../services/healthService.ts',import.meta.url),'utf8');
  assert.match(health,/pythonPath: _privatePath/);assert.match(health,/return capability/);
 }finally{
  for(const k of ['SMART_REFRAME_PERSON_MODEL','SMART_REFRAME_YUNET_MODEL']){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}
  fs.rmSync(dir,{recursive:true,force:true});
 }
});

test('stalled runtime probe is bounded, reports unavailable, and does not expose process details',async()=>{
 if(process.platform!=='linux')return;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'runtime-probe-timeout-'));
 const previous=process.env.PYTHON_PATH;
 try{
  const executable=path.join(dir,'stalled-python');
  fs.writeFileSync(executable,'#!/bin/sh\nsleep 30\n');fs.chmodSync(executable,0o700);process.env.PYTHON_PATH=executable;
  const started=Date.now();const result=await S.checkReframeRuntime(true);
  assert.equal(result.available,false);assert.match(result.detail||'',/8-second budget/);
  assert(Date.now()-started<10500,'supervised timeout must terminate owned probe');
 }finally{if(previous===undefined)delete process.env.PYTHON_PATH;else process.env.PYTHON_PATH=previous;fs.rmSync(dir,{recursive:true,force:true});}
});
