import {test} from 'node:test';import assert from 'node:assert/strict';
import {PauseSettle} from '../../../src/lib/pauseSettle.js';
import {commitPresentationClock} from '../../../src/lib/presentationSeek.js';
const mk=(t:number,o:any={})=>({currentTime:t,paused:false,seeking:false,ended:false,...o});
const ctx=(o:any={})=>({key:'K1',slices:[],offset:24.24,hint:4.4,duration:39.658,...o});
const bound=(v:any,k='K1')=>{commitPresentationClock(v,k);return v;};
test('toolbar pause settles once from the playing video; delayed native pause after the adjusted frame publishes nothing',()=>{
 const s=new PauseSettle(),v=bound(mk(28.8603));s.onPlay(v);
 assert.equal(s.onToolbarPause(v,true,ctx()),4.62);
 v.paused=true;v.currentTime=28.868; // canvas presented the adjusted frame (+8ms)
 assert.equal(s.onNativePause(v,ctx({hint:4.62})),null,'native pause after toolbar must not rebase');});
test('duplicate native pause: first settles, second publishes nothing',()=>{
 const s=new PauseSettle(),v=bound(mk(28.8603));s.onPlay(v);v.paused=true;
 assert.equal(s.onNativePause(v,ctx()),4.62);v.currentTime=28.9;assert.equal(s.onNativePause(v,ctx()),null);});
test('native-only pause settles once from the playing video (no toolbar)',()=>{
 const s=new PauseSettle(),v=bound(mk(30.0));s.onPlay(v);v.paused=true;assert.equal(s.onNativePause(v,ctx()),5.76);});
test('pause on an already paused presented frame never settles (not armed)',()=>{
 const s=new PauseSettle(),v=bound(mk(28.9,{paused:true}));s.onPlay(v);
 assert.equal(s.onNativePause(v,ctx()),null);assert.equal(s.onToolbarPause(v,false,ctx()),null);});
test('stale play event after toolbar pause does not arm a second receipt',()=>{
 const s=new PauseSettle(),v=bound(mk(28.8603));s.onPlay(v);s.onToolbarPause(v,true,ctx());v.paused=true;
 s.onPlay(v);assert.equal(s.onNativePause(v,ctx()),null);});
test('toolbar pause before the play event arrived still settles once and the late play event cannot re-arm',()=>{
 const s=new PauseSettle(),v=bound(mk(28.8603));
 assert.equal(s.onToolbarPause(v,true,ctx()),4.62);v.paused=true;s.onPlay(v);assert.equal(s.onNativePause(v,ctx()),null);});
test('next play run arms again',()=>{
 const s=new PauseSettle(),v=bound(mk(28.8));s.onPlay(v);v.paused=true;s.onNativePause(v,ctx());
 v.paused=false;v.currentTime=30;s.onPlay(v);v.paused=true;assert.equal(s.onNativePause(v,ctx()),5.76);});
test('seeking, non-finite, ended, bad duration: null (caller keeps playhead); the run is still consumed',()=>{
 for(const [v,c] of [[mk(28.8,{seeking:true}),ctx()],[mk(NaN),ctx()],[mk(39.9,{ended:true}),ctx()],[mk(28.8),ctx({duration:0})]] as any[]){
  bound(v);const s=new PauseSettle();s.onPlay(v);v.paused=true;assert.equal(s.onNativePause(v,c),null);v.seeking=false;assert.equal(s.onNativePause(v,ctx()),null);}});
test('committed mapping identity: a context whose key is not the video\'s committed clock is not used',()=>{
 const s=new PauseSettle(),v=bound(mk(28.8603),'K2');s.onPlay(v);v.paused=true;
 assert.equal(s.onNativePause(v,ctx({key:'K1'})),null,'speculative/stale generation rejected');
 const u=mk(28.8603);s.onPlay(u);u.paused=true;assert.equal(s.onNativePause(u,ctx()),null,'uncommitted video');
 const w=bound(mk(28.8603),'K2');s.onPlay(w);w.paused=true;assert.equal(s.onNativePause(w,ctx({key:'K2'})),4.62,'matching committed generation settles');});
test('ripple slices and offset come from ctx, not globals',()=>{
 const sl=[{timeline_start:0,timeline_end:2,source_start:20,source_end:22},{timeline_start:2,timeline_end:4,source_start:10,source_end:12}];
 const s=new PauseSettle(),v=bound(mk(10.5));s.onPlay(v);v.paused=true;assert.equal(s.onNativePause(v,ctx({slices:sl,offset:0,hint:3,duration:4})),2.5);});
test('delayed OLD pause after resume does not consume run 2 or publish; true run-2 pause then settles once',()=>{
 const s=new PauseSettle(),v=bound(mk(28.8603));s.onPlay(v);
 assert.equal(s.onToolbarPause(v,true,ctx()),4.62);v.paused=true;   // run 1 settled by toolbar
 v.paused=false;v.currentTime=29.0;s.onPlay(v);                      // resume: run 2 armed
 assert.equal(s.onNativePause(v,ctx()),null,'old run-1 pause event while playing: nothing published');
 v.currentTime=30.0;v.paused=true;                                   // true run-2 pause
 assert.equal(s.onNativePause(v,ctx()),5.76,'run 2 still armed and settles once');
 assert.equal(s.onNativePause(v,ctx()),null);});
test('source lifecycle reset disarms the run',()=>{
 const s=new PauseSettle(),v=bound(mk(28.8));s.onPlay(v);s.reset();v.paused=true;assert.equal(s.onNativePause(v,ctx()),null);});
test('pauseForEdit path: run ended by the explicit receipt owner; adjusted frame then delayed native pause and a duplicate publish nothing',()=>{
 const s=new PauseSettle(),v=bound(mk(28.8603));s.onPlay(v);
 v.paused=true;s.endRun();                 // pauseForEdit: v.pause() then endRun, publishes its own receipt
 v.currentTime=28.868;                      // canvas presented the adjusted frame
 assert.equal(s.onNativePause(v,ctx({hint:4.62})),null);assert.equal(s.onNativePause(v,ctx({hint:4.62})),null);
 v.paused=false;v.currentTime=30;s.onPlay(v);v.paused=true;assert.equal(s.onNativePause(v,ctx()),5.76,'next run arms normally');});
