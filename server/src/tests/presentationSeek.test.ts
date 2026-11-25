import {test} from 'node:test';import assert from 'node:assert/strict';
import {presentFromSnapshot,commitPresentationClock as C,getPresentationClock,presentSeek as P,consumePresentationEcho,isPausedOnPresentation,clearPresentationSeek,onNativeSeeking} from '../../../src/lib/presentationSeek.js';

const mk=()=>({currentTime:0,paused:true});
const own=(v:any,k:string,t:number)=>{C(v,k);P(v,t,k)};
test('every echo while paused on the owned target is an echo, however late',()=>{const v=mk();own(v,'A',34.3233);for(let i=0;i<5;i++)assert.equal(consumePresentationEcho(v),true);});
test('off-target update drops ownership for echo AND paused-edit; return is not revived',()=>{const v=mk();own(v,'A',5);v.currentTime=5.2;assert.equal(consumePresentationEcho(v),false);v.currentTime=5;assert.equal(consumePresentationEcho(v),false);assert.equal(isPausedOnPresentation(v),false);});
test('supersede replaces the target',()=>{const v=mk();own(v,'A',5);P(v,7,'A');v.currentTime=5;assert.equal(consumePresentationEcho(v),false);});
test('play drops ownership',()=>{const v=mk();own(v,'A',5);v.paused=false;assert.equal(consumePresentationEcho(v),false);v.paused=true;assert.equal(consumePresentationEcho(v),false);});
test('seeking elsewhere drops ownership; seeking on target keeps it',()=>{const v=mk();own(v,'A',5);onNativeSeeking(v);assert.equal(isPausedOnPresentation(v),true);v.currentTime=6;onNativeSeeking(v);v.currentTime=5;assert.equal(isPausedOnPresentation(v),false);});
test('clear and per-element state',()=>{const a=mk(),b=mk();own(a,'A',2);assert.equal(consumePresentationEcho(b),false);clearPresentationSeek(a);assert.equal(isPausedOnPresentation(a),false);});
test('A->B->A with no intervening reader does not revive the old ownership',()=>{const v=mk();own(v,'A',5);C(v,'B');C(v,'A');assert.equal(isPausedOnPresentation(v),false);assert.equal(consumePresentationEcho(v),false);});
test('known-stale writer is rejected: media and the newer owner B are untouched',()=>{const v=mk();C(v,'A');P(v,34.323334,'A');C(v,'B');assert.equal(P(v,39.345,'B'),true);assert.equal(P(v,34.323334,'A'),false);assert.equal(v.currentTime,39.345);assert.equal(isPausedOnPresentation(v),true);assert.equal(consumePresentationEcho(v),true);});
test('probe from review: late A write after B committed leaves video at B target and echo owned',()=>{const v=mk();C(v,'A');P(v,34.323334,'A');C(v,'B');P(v,39.345,'B');P(v,34.323334,'A');assert.equal(v.currentTime,39.345);assert.equal(consumePresentationEcho(v),true);});
test('unknown identity seeks without owning; never overrides B ownership claims',()=>{const v=mk();C(v,'B');assert.equal(P(v,6,undefined),true);assert.equal(v.currentTime,6);assert.equal(isPausedOnPresentation(v),false);});
test('nothing committed yet: seeks but does not own',()=>{const v=mk();P(v,5,undefined);assert.equal(isPausedOnPresentation(v),false);assert.equal(P(v,5,'A'),true);assert.equal(isPausedOnPresentation(v),false,'A never committed');});
test('speculative render does not touch the live map: nothing changes until commit',()=>{const v=mk();own(v,'A',5);assert.equal(getPresentationClock(v),'A');assert.equal(isPausedOnPresentation(v),true);});
test('re-commit of the same key is a no-op',()=>{const v=mk();own(v,'A',5);C(v,'A');C(v,'A');assert.equal(isPausedOnPresentation(v),true);});

test('metadata listener presents from one committed snapshot (key + inputs together); an abandoned B render cannot leak in',()=>{const v=mk();const map=(sl:any,t:number,o:number)=>Math.round(((sl.speed||1)*t+o)*1000)/1000;
 const snapA={key:'A',slices:{speed:1},offset:24.24,time:10};C(v,'A');
 // a B render was computed but never committed: nothing publishes B; the listener still uses A's snapshot
 assert.equal(presentFromSnapshot(v,snapA,map),true);assert.equal(v.currentTime,34.24);assert.equal(isPausedOnPresentation(v),true);
 const snapB={key:'B',slices:{speed:1.5},offset:24.24,time:10};C(v,'B');assert.equal(isPausedOnPresentation(v),false);
 assert.equal(presentFromSnapshot(v,snapA,map),false,'late A snapshot after B committed is rejected');assert.equal(v.currentTime,34.24);
 assert.equal(presentFromSnapshot(v,snapB,map),true);assert.equal(v.currentTime,39.24);assert.equal(isPausedOnPresentation(v),true);});
