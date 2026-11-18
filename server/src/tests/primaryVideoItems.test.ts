import test from 'node:test';
import assert from 'node:assert/strict';
import { primaryVisibleVideoItems } from '../shared/primaryVideoItems.js';
import { singleItemSourceWindow } from '../shared/automaticSourceClock.js';

// Pure selection/clock helpers only. No service imports, hooks or subprocesses.
const item=(id:string,start=31.62,end=33.62,hidden=false)=>({id,source_start:start,source_end:end,timeline_start:0,timeline_end:end-start,hidden,speed:{speed:1}});
const track=(items:ReturnType<typeof item>[],hidden=false,type='VIDEO')=>({type,hidden,items});

test('hidden cuts and B-roll overlays cannot turn one main slice into a multi-source window',()=>{
 const main=item('main'),hidden=item('hidden',60,70,true),broll=item('overlay',0,2);
 for(const project of[{tracks:[track([main,hidden])]}, {tracks:[track([main]),track([broll])]}, {tracks:[track([main,hidden]),track([broll])]}]){
  const selected=primaryVisibleVideoItems(project);
  assert.deepEqual(selected,[main]);assert.equal(selected.length>1,false);
  const window=singleItemSourceWindow(selected[0],31.62,2)!;
  assert.equal(window.sourceStart,31.62);assert.ok(Math.abs(window.sourceDuration-2)<1e-9);assert.ok(Math.abs(window.outputDuration-2)<1e-9);
  assert.equal(project.tracks.flatMap(t=>t.items).includes(main),true);
 }
});

test('actual visible cuts remain ordered multi-slice without changing persisted order',()=>{
 const later={...item('later',20,22),timeline_start:2},earlier=item('earlier',10,12);
 const project={tracks:[track([later,earlier])]};
 const selected=primaryVisibleVideoItems(project);
 assert.deepEqual(selected.map(i=>i.id),['earlier','later']);assert.equal(selected.length>1,true);
 assert.deepEqual(project.tracks[0].items.map(i=>i.id),['later','earlier']);
});

test('hidden tracks and non-video lanes do not claim primary ownership',()=>{
 const main=item('main'),hidden=item('hidden-track');
 const selected=primaryVisibleVideoItems({tracks:[track([hidden],true),track([hidden],false,'AUDIO'),track([main])]});
 assert.deepEqual(selected,[main]);
 assert.deepEqual(primaryVisibleVideoItems({tracks:[]}),[]);
 // An empty/fully hidden main lane does not promote overlays into base cuts.
 assert.deepEqual(primaryVisibleVideoItems({tracks:[track([{...main,hidden:true}]),track([item('broll')])]}),[]);
});

test('primary source clock still honors fast and slow playback with overlays present',()=>{
 for(const speed of[.5,2]){
  const main={...item('main',6,18),speed:{speed},timeline_end:12/speed};
  const selected=primaryVisibleVideoItems({tracks:[track([main]),track([item('overlay')])]});
  assert.deepEqual(singleItemSourceWindow(selected[0],0,12/speed),{sourceStart:6,sourceDuration:12,outputDuration:12/speed});
 }
});
