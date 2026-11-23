import test from 'node:test';
import assert from 'node:assert/strict';
import {config} from '../config/index.js';
import {OpenRouterTranscriptionProvider as P,PARAKEET_MODEL,MAI_MODEL} from '../services/transcription/openRouterTranscriptionProvider.js';

const native={text:'Hello.',language:'en',duration:1,segments:[{text:'Hello.',start:0,end:1}],words:[{word:'Hello.',start:0,end:.8}]};
test('JSON STT adapters request supported data filters without chat routing controls',async()=>{
 const old=globalThis.fetch,key=config.openrouterApiKey;const calls:any[]=[];config.openrouterApiKey='fixture-only';
 globalThis.fetch=async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify(native),{status:200});};
 try{
  for(const model of [PARAKEET_MODEL,MAI_MODEL]){
   await new P(model).transcribeAudio(Buffer.from('fixture-audio'),'test.wav','audio/wav',{language:'en',...(model===MAI_MODEL?{diarize:true}:{})});
   const {url,init}=calls.at(-1);assert.equal(url,'https://openrouter.ai/api/v1/audio/transcriptions');assert.equal(init.redirect,'error');
   const json=typeof init.body==='string'?JSON.parse(init.body):undefined;
   const policy=json?.provider||JSON.parse(init.body.get('provider'));
   assert.equal(policy.zdr,true);assert.equal(policy.data_collection,'deny');
   for(const forbidden of ['only','order','ignore','allow_fallbacks','max_price'])assert.equal(policy[forbidden],undefined);
   assert.equal(json?.model||init.body.get('model'),model,'No model substituted');
   if(model===MAI_MODEL){assert.equal(policy.options.azure.enhancedMode.modelOptions.transcribeStyle,'verbatim');assert.equal(policy.options.azure.diarization.enabled,true);}
   if(model===PARAKEET_MODEL){assert.equal(json.language,'en');assert.equal(policy.options,undefined);}
  }
  assert.equal(calls.length,2);
 }finally{globalThis.fetch=old;config.openrouterApiKey=key;}
});
test('data-policy routing refusal is not retried without filters or sent to another model',async()=>{
 const old=globalThis.fetch,key=config.openrouterApiKey;let calls=0;config.openrouterApiKey='fixture-only';
 globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({error:{message:'No endpoints match data policy'}}),{status:404});};
 try{await assert.rejects(new P(PARAKEET_MODEL).transcribeAudio(Buffer.from('fixture'),'x.wav','audio/wav',{language:'en'}));assert.equal(calls,1);}
 finally{globalThis.fetch=old;config.openrouterApiKey=key;}
});
