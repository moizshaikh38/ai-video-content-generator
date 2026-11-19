import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessTranscriptQuality,assertTranscriptUsable,readSegmentDiagnostics} from '../services/transcription/transcriptQuality.js';
import {mergeChunkTranscripts} from '../services/transcription/chunkedTranscription.js';
import {GroqTranscriptionProvider} from '../services/transcription/groqTranscriptionProvider.js';
import {OpenRouterTranscriptionProvider} from '../services/transcription/openRouterTranscriptionProvider.js';
import {config} from '../config/index.js';
const base:any={text:'Hold my hand, Daddy.',language:'en',durationSeconds:2,segments:[{start:0,end:2,text:'Hold my hand, Daddy.'}],words:['Hold','my','hand,','Daddy.'].map((word,i)=>({word,start:i*.4,end:(i+1)*.4}))};
test('missing diagnostics and legacy records are unverified, not failure or proof of accuracy',()=>{const q=assessTranscriptQuality(base);assert.equal(q.status,'unverified');assert.equal(q.diagnostics,'unavailable');assertTranscriptUsable({});assertTranscriptUsable({quality_assessment:q})});
test('requested language mismatch requires review but auto/multilingual speech is not guessed from words',()=>{assert.equal(assessTranscriptQuality({...base,language:'es'},'en').status,'needs_review');assert.equal(assessTranscriptQuality({...base,language:'es'},'auto').status,'unverified');assert.equal(assessTranscriptQuality({...base,language:'english'},'en').status,'unverified')});
test('weak score alone does not reject accented speech',()=>{const q=assessTranscriptQuality({...base,segments:[{...base.segments[0],avg_logprob:-1.4}]});assert.equal(q.status,'unverified');assert.equal(q.diagnostics,'present')});
test('weak recognition plus repetition or likely silence is explicitly flagged',()=>{for(const extra of [{compression_ratio:3},{no_speech_prob:.9}]){const q=assessTranscriptQuality({...base,segments:[{...base.segments[0],avg_logprob:-1.4,...extra}]});assert.equal(q.status,'needs_review');assert.deepEqual([q.issues[0].start,q.issues[0].end],[0,2]);assert.throws(()=>assertTranscriptUsable({quality_assessment:q}),(e:any)=>e.code==='TRANSCRIPT_REVIEW_REQUIRED')}});
test('invalid time windows cannot silently become automatic captions',()=>{const q=assessTranscriptQuality({...base,segments:[{start:2,end:1,text:'bad'}]});assert.equal(q.issues[0].code,'invalid_timing')});
test('diagnostics reject NaN/null/string placeholders instead of inventing confidence',()=>{assert.deepEqual(readSegmentDiagnostics({avg_logprob:null,no_speech_prob:'0.9',compression_ratio:NaN}),{})});
test('chunk merge retains diagnostic spans and word confidence on source clock',()=>{const merged=mergeChunkTranscripts([{plan:{index:0,startSec:4,durationSec:3,ownStartSec:4,ownEndSec:7},result:{...base,provenance:{provider:'fixture',model:'fixture-model'},segments:[{...base.segments[0],avg_logprob:-1.5,no_speech_prob:.9}],words:[{word:'hold',start:0,end:1,confidence:.4}]}}],7);assert.equal(merged.words[0].confidence,.4);assert.equal(merged.segments[0].start,4);assert.equal(assessTranscriptQuality(merged).status,'needs_review');assert.equal(merged.provenance?.provider,'fixture')});
test('both provider adapters keep raw diagnostics and requested language, no extra network calls',async()=>{const priorFetch=globalThis.fetch,priorGroq=config.groqApiKey,priorOR=config.openrouterApiKey;let calls=0;try{(config as any).groqApiKey='fixture';(config as any).openrouterApiKey='fixture';globalThis.fetch=async(_input:any,init:any)=>{calls++;assert.equal(init.body.get('language'),'en');assert.equal(init.body.get('temperature'),'0');return new Response(JSON.stringify({text:'hold',language:'es',duration:2,segments:[{start:0,end:2,text:'hold',avg_logprob:-1.5,no_speech_prob:.9,compression_ratio:3}],words:[{word:'hold',start:0,end:1,probability:.4}]}),{status:200})};for(const provider of [new GroqTranscriptionProvider(),new OpenRouterTranscriptionProvider()]){const result=await provider.transcribeAudio(Buffer.from('fixture'),'fixture.mp3','audio/mp3',{language:'en'});assert.equal(result.segments[0].avg_logprob,-1.5);assert.equal(result.words[0].confidence,.4);assert.equal(result.provenance?.requested_language,'en');assert.equal(assessTranscriptQuality(result).status,'needs_review')}assert.equal(calls,2)}finally{globalThis.fetch=priorFetch;(config as any).groqApiKey=priorGroq;(config as any).openrouterApiKey=priorOR}});

test('explicit source language survives preference normalization; auto/invalid never forces English',async()=>{const {GenreIntelligenceService}=await import('../services/genreIntelligenceService.js');assert.equal(GenreIntelligenceService.normalizePreferences({sourceLanguage:'EN'}).sourceLanguage,'en');assert.equal(GenreIntelligenceService.normalizePreferences({sourceLanguage:'auto'}).sourceLanguage,undefined);assert.equal(GenreIntelligenceService.normalizePreferences({sourceLanguage:'English;tool'}).sourceLanguage,undefined)});

test('missing detected language stays unknown through adapters and chunk merge, never invented English',async()=>{
 const priorFetch=globalThis.fetch,priorGroq=config.groqApiKey,priorOR=config.openrouterApiKey;
 try {
  (config as any).groqApiKey='fixture';(config as any).openrouterApiKey='fixture';
  globalThis.fetch=async()=>new Response(JSON.stringify({text:'hello',duration:1,segments:[{start:0,end:1,text:'hello'}],words:[]}),{status:200});
  for(const provider of [new GroqTranscriptionProvider(),new OpenRouterTranscriptionProvider()]) {
   const result=await provider.transcribeAudio(Buffer.from('fixture'),'fixture.mp3','audio/mp3',{language:'hi'});
   assert.equal(result.language,'');assert.equal(assessTranscriptQuality(result).status,'unverified');
   const merged=mergeChunkTranscripts([{plan:{index:0,startSec:0,durationSec:1,ownStartSec:0,ownEndSec:1},result}],1);
   assert.equal(merged.language,'');assert.equal(assessTranscriptQuality(merged).detected_language,'');
  }
 }finally{globalThis.fetch=priorFetch;(config as any).groqApiKey=priorGroq;(config as any).openrouterApiKey=priorOR}
});
