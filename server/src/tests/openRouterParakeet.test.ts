import test from 'node:test';
import assert from 'node:assert/strict';
import {config} from '../config/index.js';
import {OpenRouterTranscriptionProvider,PARAKEET_MODEL} from '../services/transcription/openRouterTranscriptionProvider.js';
import {getTranscriptionProvider} from '../services/transcription/transcriptionProviderFactory.js';
import {getTranscriptionProviderWithFailover} from '../services/transcription/failoverTranscriptionProvider.js';
const result = ()=>({text:'Hello, this is a test.',duration:2,segments:[{start:0,end:2,text:'Hello, this is a test.'}],words:[{word:'Hello,',start:0,end:.4},{word:'this',start:.4,end:.7},{word:'is',start:.7,end:1},{word:'a',start:1,end:1.2},{word:'test.',start:1.2,end:1.8}],usage:{seconds:2,cost:.0000333334}});
async function fixture(work:(calls:any[])=>Promise<void>,response:any=result()){
  const oldFetch=globalThis.fetch,oldKey=config.openrouterApiKey,oldModel=config.transcriptionModel,oldProvider=config.transcriptionProvider,calls:any[]=[];
  (config as any).openrouterApiKey='fixture-not-live';
  globalThis.fetch=async(input,init)=>{calls.push({url:String(input),init});return new Response(JSON.stringify(response),{status:200});};
  try{await work(calls);}finally{globalThis.fetch=oldFetch;(config as any).openrouterApiKey=oldKey;(config as any).transcriptionModel=oldModel;(config as any).transcriptionProvider=oldProvider;}
}
test('Parakeet rejects auto/unknown/Hindi/Hinglish before sending audio',async()=>fixture(async calls=>{
  const p=new OpenRouterTranscriptionProvider(PARAKEET_MODEL);
  for(const language of [undefined,'auto','hi','hinglish','en-US','de'])await assert.rejects(p.transcribeAudio(Buffer.from('fixture'),'fixture.wav','audio/wav',{language}),{code:'PARAKEET_LANGUAGE_REVIEW_REQUIRED'});
  assert.equal(calls.length,0);
}));
test('Parakeet uses verified STT JSON with explicit English and actual provider clocks/cost',async()=>fixture(async calls=>{
  const p=new OpenRouterTranscriptionProvider(PARAKEET_MODEL),r=await p.transcribeAudio(Buffer.from('fixture'),'fixture.wav','audio/wav',{language:'en'});
  assert.equal(calls.length,1);assert.equal(calls[0].url,'https://openrouter.ai/api/v1/audio/transcriptions');
  const init=calls[0].init,body=JSON.parse(init.body);assert.equal(init.redirect,'error');assert.equal(body.model,PARAKEET_MODEL);assert.equal(body.language,'en');assert.equal(body.input_audio.data,Buffer.from('fixture').toString('base64'));assert.equal(body.input_audio.format,'wav');assert.equal(body.response_format,'verbose_json');assert.deepEqual(body.timestamp_granularities,['word','segment']);
  assert.equal(r.language,'','Missing detected language is unknown, not fabricated en');assert.equal(r.provenance?.requested_language,'en');assert.equal(r.provenance?.model,PARAKEET_MODEL);assert.equal(r.words[0].end,.4);assert.equal(r.usage?.costUsd,.0000333334);
}));
test('Parakeet segment-only output is not stretched into fake word clocks',async()=>fixture(async()=>{
  await assert.rejects(new OpenRouterTranscriptionProvider(PARAKEET_MODEL).transcribeAudio(Buffer.from('fixture'),'x.wav','audio/wav',{language:'en'}),{code:'PARAKEET_WORD_TIMING_REQUIRED'});
},{...result(),words:[]}));
test('Parakeet invalid or overlapping provider word clocks cannot become caption-ready',async()=>{
 for(const words of [[{word:'bad',start:0,end:0}],[{word:'one',start:1,end:2},{word:'two',start:1.5,end:3}]])await fixture(async()=>{
   await assert.rejects(new OpenRouterTranscriptionProvider(PARAKEET_MODEL).transcribeAudio(Buffer.from('fixture'),'x.wav','audio/wav',{language:'en'}),{code:'PARAKEET_WORD_TIMING_REQUIRED'});
 },{...result(),words});
});
test('Parakeet unsupported format does not hit the provider',async()=>fixture(async calls=>{
 await assert.rejects(new OpenRouterTranscriptionProvider(PARAKEET_MODEL).transcribeAudio(Buffer.from('fixture'),'x.bin','application/octet-stream',{language:'en'}),/Unsupported audio format/);assert.equal(calls.length,0);
}));
test('Configured OpenRouter factory selects Parakeet without changing the default or using direct Groq',async()=>fixture(async calls=>{
 (config as any).transcriptionModel=PARAKEET_MODEL;(config as any).transcriptionProvider='openrouter';
 for(const p of [getTranscriptionProvider('openrouter'),getTranscriptionProviderWithFailover()]){
  const r=await p.transcribeAudio(Buffer.from('fixture'),'x.wav','audio/wav',{language:'en'});assert.equal(r.provenance?.model,PARAKEET_MODEL);
 }
 assert.equal(calls.length,2);assert(calls.every(c=>c.url.startsWith('https://openrouter.ai/')));
}));
test('Existing default Whisper remains multipart and model is not silently changed',async()=>fixture(async calls=>{
 await new OpenRouterTranscriptionProvider().transcribeAudio(Buffer.from('fixture'),'x.mp3','audio/mp3',{language:'hi'});
 assert(calls[0].init.body instanceof FormData);assert.equal(calls[0].init.body.get('model'),'openai/whisper-large-v3-turbo');assert.equal(calls[0].init.body.get('language'),'hi');
}));
test('Unrecognized model is refused rather than substituted',()=>assert.throws(()=>new OpenRouterTranscriptionProvider('not-a-model')));

test('Configured English opt-in keeps Hindi/Hinglish/auto on existing OpenRouter Turbo',async()=>fixture(async calls=>{
 (config as any).transcriptionModel=PARAKEET_MODEL;(config as any).transcriptionProvider='openrouter';
 for(const language of ['hi','hinglish','auto',undefined]){
  const r=await getTranscriptionProviderWithFailover().transcribeAudio(Buffer.from('fixture'),'x.wav','audio/wav',{language});
  assert.equal(r.provenance?.model,'openai/whisper-large-v3-turbo');
 }
 assert.equal(calls.length,4);assert(calls.every(c=>c.init.body instanceof FormData));
}));
