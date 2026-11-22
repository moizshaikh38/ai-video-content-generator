import{execFileSync}from'node:child_process';import{test}from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import os from'node:os';import path from'node:path';import{reviewSourceGenreFree}from'../services/sourceGenreReviewService.js';
test('reject paid or noncatalog image models before inference',async()=>{const old=globalThis.fetch;let calls=0;try{globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({data:[{id:'fixture:free',pricing:{prompt:'0.01',completion:'0'},architecture:{input_modalities:['text','image']}}]}));};await assert.rejects(reviewSourceGenreFree({source:'/not-read',transcriptText:'',out:'/not-created',apiKey:'fixture',model:'paid'}),/explicit free/);assert.equal(calls,0);await assert.rejects(reviewSourceGenreFree({source:'/not-read',transcriptText:'',out:'/not-created',apiKey:'fixture',model:'fixture:free'}),/Zero-cost/);assert.equal(calls,1);}finally{globalThis.fetch=old;}});
test('model failure and incomplete JSON never retry or accept receipt; no paid fallback',async()=>{const old=globalThis.fetch,dir=fs.mkdtempSync(path.join(os.tmpdir(),'genre-provider-fixture-'));let inferenceCalls=0;try{const source=path.join(dir,'source.mp4');execFileSync('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','color=c=blue:s=64x64:d=3','-threads','1','-c:v','libx264',source],{timeout:10000});globalThis.fetch=async(url:any,opts:any)=>{if(String(url).endsWith('/models'))return new Response(JSON.stringify({data:[{id:'fixture:free',pricing:{prompt:'0',completion:'0'},architecture:{input_modalities:['image']}}]}));inferenceCalls++;const body=JSON.parse(opts.body);assert.equal(body.model,'fixture:free');assert.equal(body.provider.allow_fallbacks,false);assert.equal(body.provider.max_price.prompt,0);assert.equal(body.models,undefined);return new Response(JSON.stringify({usage:{cost:0},choices:[{finish_reason:'length',message:{content:'{"genre":'}}]}));};await assert.rejects(reviewSourceGenreFree({source:path.join(dir,'source.mp4'),transcriptText:'fixture',out:path.join(dir,'review'),apiKey:'fixture',model:'fixture:free'}),/Incomplete/);assert.equal(inferenceCalls,1);assert.equal(fs.existsSync(path.join(dir,'review','receipt.json')),false);const failedResponse=fs.readFileSync(path.join(dir,'review','response.json'),'utf8');await assert.rejects(reviewSourceGenreFree({source:path.join(dir,'source.mp4'),transcriptText:'fixture',out:path.join(dir,'review'),apiKey:'fixture',model:'fixture:free'}),/new attempt directory/);assert.equal(inferenceCalls,1);assert.equal(fs.readFileSync(path.join(dir,'review','response.json'),'utf8'),failedResponse);}finally{globalThis.fetch=old;fs.rmSync(dir,{recursive:true,force:true});}});

test('missing, blank or null catalog prices are not evidence of zero cost',async()=>{const old=globalThis.fetch;try{for(const pricing of [{},{prompt:'0'},{prompt:null,completion:'0'},{prompt:'',completion:'0'},{prompt:'0',completion:'0',image:null}]){let calls=0;globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({data:[{id:'fixture:free',pricing,architecture:{input_modalities:['image']}}]}));};await assert.rejects(reviewSourceGenreFree({source:'/not-read',transcriptText:'',out:'/not-created',apiKey:'fixture',model:'fixture:free'}),/Zero-cost/);assert.equal(calls,1);}}finally{globalThis.fetch=old;}});


test('existing successful evidence cannot be mixed with a later failed attempt',async()=>{
 const old=globalThis.fetch,dir=fs.mkdtempSync(path.join(os.tmpdir(),'genre-attempt-preserve-'));let calls=0,inferenceCalls=0;
 try{
  const source=path.join(dir,'source.mp4'),out=path.join(dir,'review');
  execFileSync('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','color=c=blue:s=64x64:d=3','-threads','1','-c:v','libx264',source],{timeout:10000});
  fs.mkdirSync(out);const previousReceipt='previous successful receipt fixture',previousResponse='previous successful response fixture';
  fs.writeFileSync(path.join(out,'receipt.json'),previousReceipt);fs.writeFileSync(path.join(out,'response.json'),previousResponse);
  globalThis.fetch=async(url:any)=>{calls++;if(String(url).endsWith('/models'))return new Response(JSON.stringify({data:[{id:'fixture:free',pricing:{prompt:'0',completion:'0'},architecture:{input_modalities:['image']}}]}));inferenceCalls++;return new Response(JSON.stringify({usage:{cost:0},choices:[{finish_reason:'length',message:{content:'incomplete fixture'}}]}));};
  await assert.rejects(reviewSourceGenreFree({source,transcriptText:'fixture',out,apiKey:'fixture',model:'fixture:free'}),/new attempt directory/);
  assert.equal(calls,0);assert.equal(inferenceCalls,0);
  assert.equal(fs.readFileSync(path.join(out,'receipt.json'),'utf8'),previousReceipt);assert.equal(fs.readFileSync(path.join(out,'response.json'),'utf8'),previousResponse);
 }finally{globalThis.fetch=old;fs.rmSync(dir,{recursive:true,force:true});}
});


test('existing empty and failed-attempt directories are not reused or modified',async()=>{
 const old=globalThis.fetch,dir=fs.mkdtempSync(path.join(os.tmpdir(),'genre-attempt-existing-'));let calls=0;
 try{globalThis.fetch=async()=>{calls++;throw Error('network must not be reached');};
  for(const name of ['empty','failed']){const out=path.join(dir,name);fs.mkdirSync(out);if(name==='failed')fs.writeFileSync(path.join(out,'response.json'),'failed attempt fixture');const before=fs.readdirSync(out).map(file=>[file,fs.readFileSync(path.join(out,file),'utf8')]);
   await assert.rejects(reviewSourceGenreFree({source:'/not-read',transcriptText:'',out,apiKey:'fixture',model:'fixture:free'}),/new attempt directory/);
   assert.deepEqual(fs.readdirSync(out).map(file=>[file,fs.readFileSync(path.join(out,file),'utf8')]),before);
  }assert.equal(calls,0);
 }finally{globalThis.fetch=old;fs.rmSync(dir,{recursive:true,force:true});}
});

test('concurrent attempts claim one directory atomically and allow only one inference',async()=>{
 const old=globalThis.fetch,dir=fs.mkdtempSync(path.join(os.tmpdir(),'genre-attempt-race-'));let inferenceCalls=0;
 try{const source=path.join(dir,'source.mp4'),out=path.join(dir,'review');execFileSync('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','color=c=blue:s=64x64:d=3','-threads','1','-c:v','libx264',source],{timeout:10000});
  globalThis.fetch=async(url:any)=>{if(String(url).endsWith('/models'))return new Response(JSON.stringify({data:[{id:'fixture:free',pricing:{prompt:'0',completion:'0'},architecture:{input_modalities:['image']}}]}));inferenceCalls++;return new Response(JSON.stringify({usage:{cost:0},choices:[{finish_reason:'stop',message:{content:JSON.stringify({genre:'general',support:0,status:'uncertain',reason:'Synthetic fixture provides no genre evidence.',frames:Array.from({length:5},(_,index)=>({index,form:'uncertain'}))})}}]}));};
  const input={source,transcriptText:'',out,apiKey:'fixture',model:'fixture:free'},results=await Promise.allSettled([reviewSourceGenreFree(input),reviewSourceGenreFree(input)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const failed=results.find(r=>r.status==='rejected')as PromiseRejectedResult;assert.match(String(failed.reason),/new attempt directory/);assert.equal(inferenceCalls,1);
  const accepted=JSON.parse(fs.readFileSync(path.join(out,'receipt.json'),'utf8'));assert.equal(accepted.version,2);assert.equal(accepted.status,'uncertain');assert.equal(accepted.frames.length,5);assert.equal(accepted.providerCostUsd,0);
 }finally{globalThis.fetch=old;fs.rmSync(dir,{recursive:true,force:true});}
});
