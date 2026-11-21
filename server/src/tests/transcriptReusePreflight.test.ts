import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import {transcriptContentIdentity,hasValidTranscriptSourceBinding} from '../shared/transcriptSourceBinding.js';
function fixture(){const t:any={transcript_text:'Synthetic fixture words.',language:'en',duration_seconds:2,segments:[{start:0,end:2,text:'Synthetic fixture words.'}]};t.source_binding={version:1,source_receipt:{key:'fixture.mp4',size:7,etag:'"fixture"',sha256:'a'.repeat(64)},prepared_audio_sha256:'b'.repeat(64),requests:[{sha256:'b'.repeat(64),bytes:7,status:'completed'}],transcript_content_sha256:transcriptContentIdentity(t)};return t;}

test('locally invalid lineage refuses before storage, valid lineage preserves unavailable storage and stale-source semantics',async()=>{
 let heads=0,etag='"fixture"',fail=false;const server=http.createServer((req,res)=>{heads++;assert.equal(req.method,'HEAD');if(fail){res.writeHead(503).end();return;}res.setHeader('Content-Length','7');res.setHeader('ETag',etag);res.end();});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const a=server.address();assert(a&&typeof a!=='string');
 const{config}=await import('../config/index.js');const keys=['r2AccountId','r2AccessKeyId','r2SecretAccessKey','r2SourceBucket','r2Endpoint'] as const;const saved=Object.fromEntries(keys.map(k=>[k,config[k]]));Object.assign(config,{r2AccountId:'fixture',r2AccessKeyId:'fixture',r2SecretAccessKey:'fixture',r2SourceBucket:'source',r2Endpoint:`http://127.0.0.1:${a.port}`});
 const{assertTranscriptReusable}=await import('../services/transcriptSourceBindingService.js');
 try{
  const good=fixture();assert(hasValidTranscriptSourceBinding(good,'fixture.mp4'));
  const bads=[undefined,null,{},0,{...good.source_binding,source_receipt:null},{...good.source_binding,requests:[null]},{...good.source_binding,requests:[]},{...good.source_binding,prepared_audio_sha256:'bad'},{...good.source_binding,transcript_content_sha256:'c'.repeat(64)}];
  for(const binding of bads){const t={...good,source_binding:binding};assert.equal(hasValidTranscriptSourceBinding(t,'fixture.mp4'),false);await assert.rejects(assertTranscriptReusable(t,'fixture.mp4'),{code:'TRANSCRIPT_SOURCE_REVIEW_REQUIRED'});}
  await assert.rejects(assertTranscriptReusable({...good,transcript_text:'Changed'},'fixture.mp4'),{code:'TRANSCRIPT_SOURCE_REVIEW_REQUIRED'});await assert.rejects(assertTranscriptReusable(good,'other.mp4'),{code:'TRANSCRIPT_SOURCE_REVIEW_REQUIRED'});assert.equal(heads,0,'provably bad local lineage requires no external dependency');
  await assertTranscriptReusable(good,'fixture.mp4');assert.equal(heads,1);etag='"changed"';await assert.rejects(assertTranscriptReusable(good,'fixture.mp4'),{code:'TRANSCRIPT_SOURCE_REVIEW_REQUIRED'});assert.equal(heads,2);
  etag='"fixture"';config.r2SecretAccessKey='';await assert.rejects(assertTranscriptReusable(good,'fixture.mp4'),{code:'STORAGE_UNAVAILABLE'});assert.equal(heads,2,'valid local lineage preserves configuration outage, not false stale result');config.r2SecretAccessKey='fixture';
  const reviewed={...good,quality_assessment:{version:1,status:'needs_review',issues:[{code:'unreliable_word_timing',detail:'fixture'}]}};await assert.rejects(assertTranscriptReusable(reviewed,'fixture.mp4'),{code:'TRANSCRIPT_REVIEW_REQUIRED'});assert.equal(heads,2);
 }finally{Object.assign(config,saved);await new Promise<void>(r=>server.close(()=>r()));}
});
