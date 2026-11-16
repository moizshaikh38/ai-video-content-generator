import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SmartReframeService as S} from '../services/smartReframeService.js';
const face={track_id:'a',x:.6,y:.2,width:.08,height:.14,center_x:.64,center_y:.27,confidence:.95};
const rawSamples=Array.from({length:24},(_,i)=>({time:i*.25,faces:i<8||i>=16?[{...face,track_id:i<8?'a':'b'}]:[]}));
const opts={rawSamples,sceneCuts:[2,4],duration:6,sourceWidth:640,sourceHeight:360};
test('unresolved context default stays full-source across the clip',()=>{
 const p=S.computeShotComposition(opts);assert.ok(p.every(s=>s.windowW===1&&s.windowH===1));
 assert.equal(p[1].contextStatus,'unresolved-preserved');
});
test('explicit review candidate sizes from subjects, keeps one frame size and marks unknown scene risk',()=>{
 const p=S.computeShotComposition({...opts,unresolvedContextPolicy:'shared-subject-window'});
 assert.ok(p[0].windowW<1);assert.equal(new Set(p.map(s=>s.windowW)).size,1);assert.equal(new Set(p.map(s=>s.windowH)).size,1);
 assert.equal(p[1].contextStatus,'unresolved-review-required');assert.match(p[1].uncertainty||'',/unresolved/);
 assert.equal(p[1].keyframes[0].centerX,.5,'unknown shot resets to center, not previous person');
});
test('all-unknown evidence never invents a subject-sized crop',()=>{
 const p=S.computeShotComposition({...opts,rawSamples:rawSamples.map(s=>({...s,faces:[]})),unresolvedContextPolicy:'shared-subject-window'});
 assert.ok(p.every(s=>s.windowW===1&&s.windowH===1&&s.contextStatus==='unresolved-preserved'));
});
test('crowd evidence stays full scene, not an unresolved shot to discard',()=>{
 const crowd=Array.from({length:8},(_,i)=>({time:i*.25+2,faces:Array.from({length:9},(_,j)=>({...face,track_id:'crowd'+j,x:j*.105,center_x:j*.105+.02,width:.035,height:.055,area:.001925}))}));
 const samples=[...rawSamples.filter(s=>s.time<2||s.time>=4),...crowd].sort((a,b)=>a.time-b.time);
 const p=S.computeShotComposition({...opts,rawSamples:samples,unresolvedContextPolicy:'shared-subject-window'});
 assert.equal(p[1].contextStatus,'crowd-preserved');assert.ok(p.every(s=>s.windowW===1&&s.windowH===1));
});
