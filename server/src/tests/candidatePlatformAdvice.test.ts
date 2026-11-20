import test from 'node:test';
import assert from 'node:assert/strict';
import {candidatePlatformAdvice as advice} from '../shared/candidatePlatformAdvice.js';
import {MultimodalScoringService} from '../services/multimodal/multimodalScoringService.js';

test('Shorts supports 60-180 seconds without pretending that duration validates publishing',()=>{
 for(const duration of [60,60.001,90,120,179.999,180]){
  const a=advice(duration,80,70,false).shorts;
  assert.equal(a.suitable,true);
  assert.equal(a.duration_check?.status,'within-checked-range');
  assert.equal(a.publishing_eligibility,'unverified');
  assert.match(a.reason,/square or vertical/);
  assert.match(a.reason,/over 1 minute.*Content ID.*blocked globally/);
  assert.doesNotMatch(a.reason,/strong hook retention|60s limit|60-second/);
 }
 assert.equal(advice(180.001,80,70,false).shorts.suitable,false);
});

test('Instagram no longer rejects 90-180 seconds; creation ceiling is distinct from discovery',()=>{
 for(const duration of [90.001,120,180,180.001,1200]){
  const a=advice(duration,80,70,false).instagram;
  assert.equal(a.suitable,true);
  assert.match(a.reason,/20-minute Reels creation/);
  assert.match(a.reason,/over 3 minutes are not recommended to new audiences/);
  assert.match(a.reason,/does not guarantee recommendation/);
  assert.equal(a.publishing_eligibility,'unverified');
 }
 assert.equal(advice(1200.001,80,70,false).instagram.suitable,false);
});

test('X longer clips remain conditional on account and route, not universally impossible',()=>{
 assert.equal(advice(140,80,null,false).x.duration_check?.status,'within-checked-range');
 const a=advice(180,80,null,false).x;
 assert.equal(a.suitable,true);
 assert.equal(a.duration_check?.status,'account-or-route-dependent');
 assert.match(a.reason,/paid plan and upload route/);
 assert.match(a.reason,/512 MB/);
});

test('other advice states non-duration requirements without algorithm or relevance promises',()=>{
 const a=advice(129.845,80,70,true);
 assert.match(a.tiktok.reason,/selected sound can limit duration/);
 assert.match(a.tiktok.reason,/not evidence of FYP performance/);
 assert.match(a.linkedin.reason,/codec.*resolution.*aspect ratio.*frame rate.*bit rate/);
 assert.equal(advice(2.5,80,null,false).linkedin.duration_check?.status,'account-or-route-dependent');
 assert.equal(advice(1.99,80,null,false).linkedin.suitable,false);
 assert.equal(advice(901,80,null,false).youtube.duration_check?.status,'account-or-route-dependent');
 assert.equal(advice(43200.001,80,null,false).youtube.suitable,false);
 for(const value of Object.values(a)){
  assert.equal(value.score_basis,'editorial-heuristic');
  assert.equal(value.publishing_eligibility,'unverified');
  assert.equal(value.duration_check?.checked_at,'2026-11-20');
  assert.match(value.duration_check?.source_url??'',/^https:\/\//);
  assert.match(value.reason,/no reach or upload guarantee/);
 }
});

test('invalid durations never pass or manufacture a verified technical claim',()=>{
 for(const duration of [NaN,Infinity,-1,0]) for(const value of Object.values(advice(duration,80,null,false))){
  assert.equal(value.suitable,false);
  assert.equal(value.duration_check?.status,'unknown');
  assert.match(value.reason,/invalid or missing/);
 }
});

test('scorer uses exact span at hard boundaries, with editorial score independent of Shorts eligibility',()=>{
 const score=(end:number)=>MultimodalScoringService.scoreCandidate({start_seconds:0,end_seconds:end,title:'A local diagnostic',hook:'A diagnostic hook',baseHookScore:80,baseStandaloneScore:80,baseInsightScore:80});
 const a=score(180),b=score(180.001);
 assert.equal(b.duration_seconds,180); // rounded display must not clear the policy boundary
 assert.equal(a.explanation.platform_suitability.shorts.suitable,true);
 assert.equal(b.explanation.platform_suitability.shorts.suitable,false);
 assert.equal(a.vireo_score,b.vireo_score);
 assert.equal(a.explanation.platform_suitability.shorts.score,b.explanation.platform_suitability.shorts.score);
 assert.match(a.explanation.reasons.join(' '),/not technical upload eligibility/);
 assert.equal(score(129.845).explanation.platform_suitability.instagram.suitable,true);
});
