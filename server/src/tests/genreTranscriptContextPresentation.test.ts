import test from 'node:test';
import assert from 'node:assert/strict';
import {applySemanticGenreReceipt,genreSampleTimes,genreTranscriptDigest,type SemanticGenreReceipt} from '../shared/semanticGenreEvidence.js';
import {genreEvidencePresentation} from '../shared/genreEvidencePresentation.js';
import type {GenreSuggestion} from '../types/index.js';

// Pure contract fixtures, not real provider results or an accuracy benchmark.
function result(text:string){
 const sha='a'.repeat(64),base:GenreSuggestion={genre:'general',confidence:0,reasons:[],metrics:{wpm:null,ocrDensity:null,faceCount:null,sceneCutRatePerMin:null,silenceRatio:null}};
 const receipt:SemanticGenreReceipt={version:1,sourceSha256:sha,transcriptTextSha256:genreTranscriptDigest(text),durationSeconds:30,model:'contract-fixture:free',sampling:'uniform-five-v1',frames:genreSampleTimes(30).map(time=>({time,form:'software_demo'})),genre:'education_tutorial',support:.9,reason:'Contract fixture',status:'suggested',providerCostUsd:0};
 return applySemanticGenreReceipt(base,receipt,sha,30,text);
}
test('visual-only evidence never claims an absent transcript was supplied',()=>{
 for(const text of ['', '   ']){
  const suggestion=result(text);assert.equal(suggestion.genre,'education_tutorial');assert.equal(suggestion.semanticEvidence?.status,'suggested');
  assert(suggestion.semanticEvidence?.limitations.some(line=>line.includes('5 sparse frames')));
  assert(suggestion.semanticEvidence?.limitations.every(line=>!line.includes('transcript')));
 }
});
test('actual supplied speech context stays named in backend evidence limits',()=>{
 const suggestion=result('Retained spoken context');assert(suggestion.semanticEvidence?.limitations.some(line=>line.includes('plus sampled transcript')));
});
test('saved metadata without transcript-presence proof gets only the verified sampled-frame claim',()=>{
 for(const text of ['', 'Retained spoken context']){
  const suggestion=result(text),view=genreEvidencePresentation({suggested_genre:suggestion.genre,genre_evidence:suggestion.evidence,genre_semantic_evidence:suggestion.semanticEvidence},['general','education_tutorial']);
  assert.equal(view?.state,'suggested');assert.match(view!.description,/5 sampled frames/);assert.doesNotMatch(view!.description,/and transcript|plus.*transcript|accuracy of/i);
 }
});
