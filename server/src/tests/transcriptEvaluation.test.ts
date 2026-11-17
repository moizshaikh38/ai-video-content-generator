import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateTranscript,alignEvaluationWords,normalizeEvaluationWord,type TranscriptEvaluationCase} from '../shared/transcriptEvaluation.js';
const words=(...texts:string[])=>texts.map(text=>({text}));
function fixture():TranscriptEvaluationCase{return{caseId:'synthetic-only',sourceSha256:'a'.repeat(64),language:'en',noiseBucket:'synthetic',reference:{provenance:'synthetic',words:words('hello','Moiz','seventeen')},hypothesis:{provider:'fixture',model:'fixture',execution:'mock',manuallyCorrected:false,words:words('hello','boys','17','extra')}};}
test('reports substitutions, insertions, explicit name/number reference errors without semantic normalization',()=>{const x=fixture();x.reference.words[1].tags=['name'];x.reference.words[2].tags=['number'];const r=evaluateTranscript(x);assert.deepEqual(r.counts,{equal:1,substitution:2,deletion:0,insertion:1});assert.equal(r.wordErrorRate,1);assert.equal(r.taggedReferenceErrors.name.errors,1);assert.equal(r.taggedReferenceErrors.number.errors,1);assert.equal(r.recordedNoRescueEligibility,false);});
test('all missing speech is deletion; empty reference does not create a false0WER',()=>{const x=fixture();x.hypothesis.words=[];assert.equal(evaluateTranscript(x).wordErrorRate,1);x.reference.words=[];x.hypothesis.words=words('unexpected');assert.equal(evaluateTranscript(x).wordErrorRate,null);assert.equal(evaluateTranscript(x).counts.insertion,1);});
test('WER may exceed100percent when hallucinated insertions exceed reference length',()=>{const x=fixture();x.reference.words=words('one');x.hypothesis.words=words('one','two','three');assert.equal(evaluateTranscript(x).wordErrorRate,2);});
test('normalization preserves Hindi, diacritics, internal apostrophes and number distinctions',()=>{assert.equal(normalizeEvaluationWord(' HELLO! '),'hello');assert.equal(normalizeEvaluationWord('हिंदी'),'हिंदी');assert.notEqual(normalizeEvaluationWord('café'),normalizeEvaluationWord('cafe'));assert.notEqual(normalizeEvaluationWord('17'),normalizeEvaluationWord('seventeen'));assert.equal(normalizeEvaluationWord("don't"),"don't");});
test('timing excludes unequal words and invalid/unavailable clocks, reports coverage not perfect sync',()=>{const x=fixture();x.reference.words=[{text:'same',start:0,end:1},{text:'different',start:1,end:2},{text:'missing-clock',start:2,end:3},{text:'invalid-clock',start:3,end:4}];x.hypothesis.words=[{text:'same',start:.1,end:1.2},{text:'changed',start:1,end:2},{text:'missing-clock'},{text:'invalid-clock',start:null as any,end:4}];const r=evaluateTranscript(x);assert.equal(r.timing.matchedTimedWords,1);assert.equal(r.timing.exactLexicalMatches,3);assert.ok(Math.abs(r.timing.meanAbsoluteBoundaryErrorMs!-150)<.0001);assert.ok(Math.abs(r.timing.p95AbsoluteBoundaryErrorMs!-200)<.0001);});
test('recorded eligibility cannot be acquired from corrected, synthetic or mocked evidence',()=>{const x=fixture();x.reference.provenance='independently-reviewed';x.hypothesis.execution='actual-provider';assert.equal(evaluateTranscript(x).recordedNoRescueEligibility,true);x.hypothesis.manuallyCorrected=true;assert.equal(evaluateTranscript(x).recordedNoRescueEligibility,false);});
test('rejects absent identity, unknown tags, punctuation-only tokens and oversized inputs',()=>{const x=fixture();x.sourceSha256='not-a-hash';assert.throws(()=>evaluateTranscript(x));assert.throws(()=>alignEvaluationWords(words('!!!'),[]));assert.throws(()=>alignEvaluationWords(Array.from({length:3001},()=>({text:'word'})),[]));});
test('alignment preserves original words and reproducibly resolves repeated tokens',()=>{const x=fixture(),before=JSON.stringify(x);assert.deepEqual(alignEvaluationWords(words('a','a'),words('a')),alignEvaluationWords(words('a','a'),words('a')));evaluateTranscript(x);assert.equal(JSON.stringify(x),before);});

test('numeric signs, decimals, percentages and currency do not vanish during normalization',()=>{for(const[a,b]of[['-1','1'],['.5','5'],['$50','50'],['50%','50'],['1,000','1000']])assert.notEqual(normalizeEvaluationWord(a),normalizeEvaluationWord(b));});

// The actual saved provider response includes dialogue-marked word entries.
// Strip exterior punctuation/space for lexical comparison, not internal words.
test('dialogue-edge punctuation cannot leave an artificial leading space match error',()=>{
 assert.equal(normalizeEvaluationWord(' - Okay.'),'okay');
 assert.equal(normalizeEvaluationWord(' - And'),'and');
 assert.equal(normalizeEvaluationWord('\" Hello \"'),'hello');
 assert.equal(normalizeEvaluationWord('C-bombs'),'c-bombs');
 // Numeric signs remain deliberately conservative, even with whitespace.
 assert.notEqual(normalizeEvaluationWord(' - 15'),normalizeEvaluationWord('15'));
 assert.notEqual(normalizeEvaluationWord('-15'),normalizeEvaluationWord('15'));
});
