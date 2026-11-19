import test from 'node:test';
import assert from 'node:assert/strict';
import {config} from '../config/index.js';
import {createTierTranscriptionProvider,selectTierTranscription,freezeTierSelection,readTierSelection,TIER_POLICY,TURBO_MODEL} from '../services/transcription/tierTranscriptionPolicy.js';
import {MAI_MODEL} from '../services/transcription/openRouterTranscriptionProvider.js';
import {mergeChunkTranscripts} from '../services/transcription/chunkedTranscription.js';
const transcript={text:'Hello world',duration:1,segments:[{text:'Hello world',start:0,end:1}],words:[{word:'Hello',start:0,end:.4},{word:'world',start:.4,end:.9}],usage:{cost:.00003,seconds:1}};
test('only canonical paid plans choose MAI; developer is not evidence of paid subscription',()=>{
 for(const p of ['creator','pro','studio'])assert.equal(selectTierTranscription(p).model,MAI_MODEL);
 for(const p of ['free','developer'])assert.equal(selectTierTranscription(p).model,TURBO_MODEL);
 for(const p of ['paid',true,undefined,'pro;anything','PRO'])assert.throws(()=>selectTierTranscription(p));
});
test('corrupt or substituted saved policy fails closed',()=>{
 for(const p of [null,{}, {...selectTierTranscription('free'),model:MAI_MODEL},{...selectTierTranscription('pro'),policy:'different'}])assert.throws(()=>readTierSelection(p));
});
test('tier routing remains disabled in default configuration',()=>{assert.equal(config.tieredTranscriptionEnabled,false);});
test('premium request is MAI verbatim/automatic-language JSON, no premium-to-budget fallback',async()=>{
 const old=globalThis.fetch,key=config.openrouterApiKey,calls:any[]=[];(config as any).openrouterApiKey='fixture';
 globalThis.fetch=async(url,init)=>{calls.push({url:String(url),init});return new Response(JSON.stringify(transcript));};
 try{
  const p=createTierTranscriptionProvider(selectTierTranscription('pro'));assert.equal(p.allowWholeFileFallback,false);
  const r=await p.transcribeAudio(Buffer.from('fixture'),'x.mp3','audio/mp3',{language:'hi'});
  const body=JSON.parse(calls[0].init.body);assert.equal(body.model,MAI_MODEL);assert.equal(body.language,undefined);assert.equal(body.provider.options.azure.enhancedMode.modelOptions.transcribeStyle,'verbatim');assert.deepEqual(body.timestamp_granularities,['word','segment']);
  assert.equal(r.provenance?.requested_language,undefined);assert.equal(r.provenance?.source_language_preference,'hi');assert.equal(r.provenance?.routing_policy,TIER_POLICY);assert.equal(r.provenance?.plan_at_selection,'pro');assert.equal(r.words[1].end,.9);assert.equal(r.usage?.costUsd,.00003);
  globalThis.fetch=async()=>{calls.push('error');return new Response(JSON.stringify({error:{message:'fixture unavailable'}}),{status:503});};
  await assert.rejects(p.transcribeAudio(Buffer.from('fixture'),'x.mp3','audio/mp3'));assert.equal(calls.length,2);
 }finally{globalThis.fetch=old;(config as any).openrouterApiKey=key;}
});
test('MAI missing/invalid word clocks are never invented from segments',async()=>{
 const old=globalThis.fetch,key=config.openrouterApiKey;(config as any).openrouterApiKey='fixture';
 try{for(const words of [[],[{word:'bad',start:1,end:0}]]){
  globalThis.fetch=async()=>new Response(JSON.stringify({...transcript,words}));
  await assert.rejects(createTierTranscriptionProvider(selectTierTranscription('creator')).transcribeAudio(Buffer.from('fixture'),'x.mp3','audio/mp3'),{code:'MAI_WORD_TIMING_REQUIRED'});
 }}finally{globalThis.fetch=old;(config as any).openrouterApiKey=key;}
});
test('frozen policy requires owner-bound existing reservation and does not follow later upgrade',async()=>{
 let row:any={user_id:'owner',attempt_id:'attempt',metadata:{}},writes=0,resolves=0;
 const db:any={collection:()=>({findOne:async(f:any)=>f.user_id===row?.user_id&&f.attempt_id===row?.attempt_id?row:null,updateOne:async(f:any,u:any,options:any)=>{assert.equal(options.writeConcern.w,'majority');assert.equal(f.user_id,'owner');writes++;row.metadata.transcriptionPolicy??=u.$set['metadata.transcriptionPolicy'];}})};
 const one=await freezeTierSelection(db,'owner','attempt',async()=>{resolves++;return 'free';});assert.equal(one.model,TURBO_MODEL);
 const again=await freezeTierSelection(db,'owner','attempt',async()=>{resolves++;return 'pro';});assert.deepEqual(again,one);assert.equal(writes,1);assert.equal(resolves,1);
 await assert.rejects(freezeTierSelection(db,'someone-else','attempt',async()=> 'pro'));await assert.rejects(freezeTierSelection(db,'owner',undefined,async()=> 'pro'));
});
test('a concurrent already-frozen selection wins the compare-and-set race',async()=>{
 const saved=selectTierTranscription('creator');let reads=0;
 const db:any={collection:()=>({findOne:async()=>++reads===1?{metadata:{}}:{metadata:{transcriptionPolicy:saved}},updateOne:async()=>({matchedCount:0})})};
 assert.deepEqual(await freezeTierSelection(db,'u','a',async()=> 'free'),saved);
});
test('chunk merge sums actual costs only when every chunk has billing evidence',()=>{
 const result:any={...transcript,language:'',durationSeconds:1,usage:{costUsd:.01,audioSeconds:1}},part=(index:number,r=result)=>({plan:{index,startSec:index,durationSec:1,ownStartSec:index,ownEndSec:index+1},result:r});
 assert.deepEqual(mergeChunkTranscripts([part(0),part(1)],2).usage,{costUsd:.02,audioSeconds:2});
 assert.equal(mergeChunkTranscripts([part(0),part(1,{...result,usage:undefined})],2).usage,undefined,'unknown charge is not zero');
});
