import test from 'node:test';
import assert from 'node:assert/strict';
import { ProEditorService as P } from '../services/proEditorService.js';
const build=(mode:string,scale:any,cold=false)=>{
  const clip:any={id:'c',project_id:'p',user_id:'u',start_seconds:0,end_seconds:8,source_storage_path:'test.mp4',aspect_ratio:'16:9',crop_config:{mode,focusX:.8,focusY:.2,scale},...(cold?{cold_open:{enabled:true,start_seconds:1,end_seconds:3,duration_seconds:2}}:{})};
  return (P as any).buildInitialProject(clip,'u',null,null,{clip_id:'c'},{});
};
const videos=(p:any)=>p.tracks.find((t:any)=>t.type==='VIDEO').items;
for(const mode of ['manual','fit','fit_blur'])test(`first editor seed keeps ${mode} zoom and focus with default audio intact`,()=>{
  const items=videos(build(mode,1.7));assert.equal(items.length,1);
  assert.equal(items[0].crop.scale,1.7);assert.equal(items[0].crop.focusX,.8);assert.equal(items[0].crop.focusY,.2);
  assert.equal(items[0].audio.fade_in,.15);assert.equal(items[0].audio.fade_out,.25);
});
test('cold-open and main item both retain seeded zoom',()=>{const v=videos(build('manual',1.7,true));assert.equal(v.length,2);assert(v.every((i:any)=>i.crop.scale===1.7));});
for(const [input,want] of [[undefined,1],[NaN,1],[Infinity,1],[0,1],[-1,1],[10,4]])test(`seed scale safely normalizes ${String(input)}`,()=>{assert.equal(videos(build('manual',input))[0].crop.scale,want);});
test('smart/center crops do not gain an explicit manual zoom',()=>{for(const mode of ['smart','center'])assert.equal(videos(build(mode))[0].crop,undefined);});

test('missing crop scale defaults to one',()=>{assert.equal(videos(build('manual',null))[0].crop.scale,1);});
