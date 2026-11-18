import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeProviderTiming} from '../services/transcription/providerTiming.js';
import {assessTranscriptQuality} from '../services/transcription/transcriptQuality.js';
import {assertChunkSeamCoverage} from '../services/transcription/chunkedTranscription.js';
import {planTimestampRecoveryChunks} from '../services/transcription/timestampRecoveryPlan.js';
import {CaptionService} from '../services/captionService.js';
test('Scribe-style confidence, speaker labels and annotations survive normalization',()=>{
 const n=normalizeProviderTiming({words:[{text:'Hello',start:0,end:.4,confidence:.31,speaker_label:'speaker_0',speaker:0},{text:'[laughs]',start:.5,end:.8,confidence:.9},{text:'[censored]',start:1,end:1.2}]});
 assert.equal(n.words[0].confidence,.31);assert.equal(n.words[0].speakerId,'speaker_0');assert.equal(n.words[1].kind,'audio_event');assert.equal(n.words[2].kind,'redaction');
 const q=assessTranscriptQuality({...n,text:'Hello',language:'en',durationSeconds:2});assert.equal(q.status,'needs_review');assert.equal(q.issues.filter(i=>i.code==='non_speech_annotation').length,2);
});
test('low confidence alone is evidence, not an automatic accented-speech rejection',()=>{
 const n=normalizeProviderTiming({words:[{word:'Hello',start:0,end:.4,confidence:0}]});assert.equal(n.words[0].confidence,0);assert.equal(assessTranscriptQuality({...n,text:'Hello',language:'en',durationSeconds:1}).status,'unverified');
});
const result=(words:any[])=>({text:words.map(w=>w.word).join(' '),segments:[],words,language:'en',durationSeconds:5});
test('seam ownership cannot silently discard a word missing from neighbouring recognition',()=>{
 const left={plan:{index:0,startSec:0,durationSec:6,ownStartSec:0,ownEndSec:5},result:result([])};
 const right={plan:{index:1,startSec:4,durationSec:6,ownStartSec:5,ownEndSec:10},result:result([{word:'Hello',start:.3,end:.5}])};
 assert.throws(()=>assertChunkSeamCoverage([left,right]),{code:'TRANSCRIPTION_SEAM_REVIEW_REQUIRED'});
 left.result=result([{word:'Hello',start:4.3,end:4.5}]);assert.doesNotThrow(()=>assertChunkSeamCoverage([left,right]));
});
test('short recovery windows cover audio with bounded overlap, not paid retry execution',()=>{
 const p=planTimestampRecoveryChunks(20);assert.equal(p.length,3);assert.equal(p[0].startSec,0);assert.equal(p.at(-1)!.ownEndSec,20);assert.equal(p.reduce((s,v)=>s+v.durationSec,0),24);assert.throws(()=>planTimestampRecoveryChunks(61));
});
test('single-word preset override emits one real timed token per cue without subdivisions',()=>{
 const words=[{word:'Hello',start:.2,end:.6},{word:'friend',start:.8,end:1.2}];
 const out=CaptionService.extractCuesForClipSettings({words},{start_seconds:0,end_seconds:2,caption_style:'vireo_comic_punch',caption_config:{presetId:'vireo_comic_punch',presetOverrides:{maxWordsPerCue:1,maxLines:1}},aspect_ratio:'9:16'}as any);
 assert.equal(out.timingMode,'word');assert.equal(out.cues.length,2);for(let i=0;i<2;i++){assert.equal(out.cues[i].words?.length,1);assert.equal(out.cues[i].start,words[i].start);assert.equal(out.cues[i].end,words[i].end);}
});

test('diarization is opt-in, Scribe-only and requests real labels without a paid call',async()=>{
 const {OpenRouterTranscriptionProvider}=await import('../services/transcription/openRouterTranscriptionProvider.js');
 const {config}=await import('../config/index.js');const oldFetch=globalThis.fetch,oldKey=config.openrouterApiKey;let calls=0;
 try{config.openrouterApiKey='fixture';globalThis.fetch=async(_input,init)=>{calls++;const form=init?.body as FormData;assert.equal(form.get('diarize'),'true');return new Response(JSON.stringify({text:'Hello',language:'eng',words:[{word:'Hello',start:0,end:.2,speaker:0,speaker_label:'speaker_0',confidence:.9}]}),{status:200});};
 const result=await new OpenRouterTranscriptionProvider('elevenlabs/scribe-v2').transcribeAudio(Buffer.from('fixture'),'fixture.wav','audio/wav',{diarize:true});assert.equal(result.words[0].speakerId,'speaker_0');assert.equal(calls,1);
 await assert.rejects(new OpenRouterTranscriptionProvider().transcribeAudio(Buffer.from('fixture'),'fixture.wav','audio/wav',{diarize:true}),/not supported/);assert.equal(calls,1);
 }finally{globalThis.fetch=oldFetch;config.openrouterApiKey=oldKey;}
});
