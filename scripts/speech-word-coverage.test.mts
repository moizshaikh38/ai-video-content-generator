import assert from 'node:assert/strict';
import {test} from 'node:test';
import {speechWordCoverage,assertSpeechWordCoverage} from '../server/src/shared/speechWordCoverage.js';
import {assessTranscriptQuality,assertTranscriptUsable} from '../server/src/services/transcription/transcriptQuality.js';
import {FailoverTranscriptionProvider,isFailoverWorthy} from '../server/src/services/transcription/failoverTranscriptionProvider.js';
import {CaptionService} from '../server/src/services/captionService.js';
const words=(s:string)=>s.split(' ').map((word,i)=>({word,start:i,end:i+.8}));
for(const [name,text,spoken]of [
 ['literal repeated speech','go go now','go go now'],
 ['Hindi repeated speech','अब अब बोलो','अब अब बोलो'],
 ['subword splitting','notebook','note book'],
 ['email punctuation','contact@example.org','contact @ example . org'],
 ['case punctuation','Hello, WORLD!','hello world'],
 ['canonical Unicode','café','cafe\u0301'],
 ['Devanagari marks','हूँ यहाँ','हूँ यहाँ'],
 ['CJK spacing','你好世界','你好 世界'],
]as const)test(name,()=>{assert.equal(speechWordCoverage({text,words:words(spoken)}),'consistent');assert.doesNotThrow(()=>assertSpeechWordCoverage({text,words:words(spoken)}));});
for(const [name,text,spoken]of [
 ['positive-duration tail','go now','go now ghost'],
 ['repeated tail','go now','go now now'],
 ['missing legitimate repeat','go go now','go now'],
 ['wrong word same count','go now','stop now'],
 ['changed order','go now','now go'],
 ['different Hindi marks','हूँ','हूं'],
 ['email spoken separator','contact@example.org','contact at example org'],
]as const)test(name,()=>{const x={text,words:words(spoken)};assert.equal(speechWordCoverage(x),'mismatch');assert.throws(()=>assertSpeechWordCoverage(x),{code:'TRANSCRIPT_WORD_TEXT_REVIEW_REQUIRED'});});
test('segment-only transcript remains available without fabricated words',()=>assert.equal(speechWordCoverage({segments:[{text:'hello'}]}),'unavailable'));
test('unavailable text is not invented from words',()=>assert.equal(speechWordCoverage({words:words('hello')}),'unavailable'));
test('legacy corpus uses transcript_text',()=>assert.equal(speechWordCoverage({transcript_text:'go now',words:words('go now ghost')}),'mismatch'));
test('segments give coverage when full text is absent',()=>assert.equal(speechWordCoverage({segments:[{text:'go now'}],words:words('go now ghost')}),'mismatch'));
test('quality assessment records mismatch without silently changing text/words',()=>{const x={text:'go now',words:words('go now ghost'),segments:[{text:'go now',start:0,end:2}],language:'en',durationSeconds:3};const before=JSON.stringify(x);const q=assessTranscriptQuality(x);assert(q.issues.some(i=>i.code==='text_word_mismatch'));assert.equal(q.status,'needs_review');assert.equal(JSON.stringify(x),before);});
test('cached legacy record cannot bypass because quality metadata is missing',()=>assert.throws(()=>assertTranscriptUsable({transcript_text:'go now',words:words('go now ghost')}),{code:'TRANSCRIPT_WORD_TEXT_REVIEW_REQUIRED'}));
test('direct actual caption extractor rejects plausible-clock ghost',()=>assert.throws(()=>CaptionService.extractClipCues({segments:[{text:'go now',start:0,end:2}],words:words('go now ghost')},0,3),{code:'TRANSCRIPT_WORD_TEXT_REVIEW_REQUIRED'}));
test('actual caption extractor preserves legitimate repeated speech',()=>{const r=CaptionService.extractClipCues({text:'go go now',segments:[{text:'go go now',start:0,end:3}],words:words('go go now')},0,3);assert.equal(r.timingMode,'word');assert.equal(r.cues.flatMap(c=>(c.tokens||[]).map(t=>t.text)).join(' '),'go go now');});

test('coverage review never spends on a failover provider',async()=>{let calls=0;const error=Object.assign(new Error('needs review'),{code:'TRANSCRIPT_WORD_TEXT_REVIEW_REQUIRED'});assert.equal(isFailoverWorthy(error),false);const p=new FailoverTranscriptionProvider({name:'fixture-primary',transcribeAudio:async()=>{throw error;}},{name:'fixture-secondary',transcribeAudio:async()=>{calls++;throw new Error('must not call');}});await assert.rejects(()=>p.transcribeAudio(Buffer.from('fixture')),{code:error.code});assert.equal(calls,0);});
