import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';

const script=new URL('../../scripts/local-cv.js',import.meta.url).pathname;
test('local launcher rejects missing inputs without launching a command',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'local-cv-test-'));const marker=path.join(dir,'launched');
 try{
  const result=spawnSync(process.execPath,[script,'--python','/not-found/python','--person-model','/not-found/model','--face-model','/not-found/face','--',process.execPath,'-e',`require('fs').writeFileSync(${JSON.stringify(marker)},'unexpected')`],{encoding:'utf8'});
  assert.equal(result.status,1);assert.equal(fs.existsSync(marker),false);assert.match(result.stderr,/No persistent settings changed/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('local launcher refuses ambiguous execution and duplicate arguments',()=>{
 for(const args of [[],['--check','--','node'],['--python','one','--python','two','--check']]){
  const result=spawnSync(process.execPath,[script,...args],{encoding:'utf8'});assert.equal(result.status,1);
 }
});

test('spaced paths preserve arguments and nonexecutable Python never launches app',()=>{
 if(process.platform!=='linux')return;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'local cv spaced '));
 try{
  const fake=path.join(dir,'python fake'),model=path.join(dir,'model fake'),marker=path.join(dir,'launched');fs.writeFileSync(model,'corrupt');
  fs.writeFileSync(fake,'#!/bin/sh\nprintf \'%s\\n\' \'{"available":true,"face":{"kind":"yunet","status":"available"},"person":{"status":"available"}}\'\n');fs.chmodSync(fake,0o700);
  const base=[script,'--python',fake,'--person-model',model,'--face-model',model];
  const good=spawnSync(process.execPath,[...base,'--',process.execPath,'-e','console.log(process.argv[1])','literal argument with spaces'],{encoding:'utf8'});assert.equal(good.status,0);assert.match(good.stdout,/literal argument with spaces/);
  fs.chmodSync(fake,0o600);const bad=spawnSync(process.execPath,[...base,'--',process.execPath,'-e',`require('fs').writeFileSync(${JSON.stringify(marker)},'unexpected')`],{encoding:'utf8'});assert.equal(bad.status,1);assert.equal(fs.existsSync(marker),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('launcher interruption kills app and watch descendants',async()=>{
 if(process.platform!=='linux')return;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'local-cv-stop-'));let launcher;
 try{
  const fake=path.join(dir,'python'),model=path.join(dir,'model'),marker=path.join(dir,'descendant');fs.writeFileSync(model,'fake');
  fs.writeFileSync(fake,'#!/bin/sh\nprintf \'%s\\n\' \'{"available":true,"face":{"kind":"yunet","status":"available"},"person":{"status":"available"}}\'\n');fs.chmodSync(fake,0o700);
  launcher=spawn(process.execPath,[script,'--python',fake,'--person-model',model,'--face-model',model,'--',process.execPath,'-e',`const c=require('child_process').spawn('sleep',['30']);require('fs').writeFileSync(${JSON.stringify(marker)},String(c.pid));setInterval(()=>{},1000);`],{stdio:'ignore'});
  const done=new Promise(resolve=>launcher.once('close',resolve));
  for(let i=0;i<100&&!fs.existsSync(marker);i++)await new Promise(r=>setTimeout(r,20));
  assert(fs.existsSync(marker));const pid=fs.readFileSync(marker,'utf8');launcher.kill('SIGTERM');await done;
  try{const stat=fs.readFileSync('/proc/'+pid+'/stat','utf8');assert(['Z','X'].includes(stat.slice(stat.lastIndexOf(')')+2).split(' ')[0]));}catch(e){if(e.code!=='ENOENT')throw e;}
 }finally{launcher?.kill('SIGKILL');fs.rmSync(dir,{recursive:true,force:true});}
});

test('preflight timeout kills spawned descendants before refusing app launch',()=>{
 if(process.platform!=='linux')return;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'local-cv-timeout-'));
 try{
  const fake=path.join(dir,'python'),model=path.join(dir,'model'),marker=path.join(dir,'descendant');fs.writeFileSync(model,'fake');
  fs.writeFileSync(fake,'#!/bin/sh\nsleep 30 &\necho $! > '+JSON.stringify(marker)+'\nwait\n');fs.chmodSync(fake,0o700);
  const start=Date.now();const result=spawnSync(process.execPath,[script,'--python',fake,'--person-model',model,'--face-model',model,'--check'],{encoding:'utf8',timeout:11000});
  assert.equal(result.status,1);assert.match(result.stderr,/8-second budget/);assert(Date.now()-start<10500);
  const pid=fs.readFileSync(marker,'utf8').trim();try{const stat=fs.readFileSync('/proc/'+pid+'/stat','utf8');assert(['Z','X'].includes(stat.slice(stat.lastIndexOf(')')+2).split(' ')[0]));}catch(e){if(e.code!=='ENOENT')throw e;}
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
