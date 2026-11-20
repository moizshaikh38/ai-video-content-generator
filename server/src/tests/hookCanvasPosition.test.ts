import {test} from 'node:test';import assert from 'node:assert/strict';
import {ProEditorService as P} from '../services/proEditorService.js';
import {reviewHookCanvasPosition,centerProjectHook} from '../shared/hookCanvasPosition.js';
const fixture=()=>P.buildInitialCandidateEditor({id:'fixture',project_id:'fixture',user_id:'fixture',start_seconds:0,end_seconds:20,duration_seconds:20,aspect_ratio:'9:16',caption_style:'vireo_comic_default',auto_hook_title_enabled:true,auto_hook_title_text:'A retained hook title'} as any,'fixture',null);
const hook=(p:any)=>p.tracks.find((t:any)=>t.type==='TEXT').items.find((i:any)=>i.text?.auto_headline);
test('ratio-change review detects missing anchor without normalizing saved transforms',()=>{
 const p=fixture(),before=JSON.stringify(p);assert.equal(reviewHookCanvasPosition(p).status,'anchor-on-canvas');assert.equal(JSON.stringify(p),before);
 for(const aspect of ['1:1','16:9']){const q=structuredClone(p);q.canvas.aspect_ratio=aspect as any;assert.equal(reviewHookCanvasPosition(q).status,'anchor-outside-canvas');assert.equal(hook(q).transform.position_y,-249.5);}
});
test('explicit center recovers anchor but preserves manual words, size, timing, style and all other layers',()=>{
 const p=fixture();p.canvas.aspect_ratio='16:9';const h=hook(p);h.text.text='My manual words';h.text.font_size=47;h.transform.position_x=123;h.transform.scale=1.7;h.transform.rotation=7;h.timeline_end=13;
 const before=JSON.stringify(p),q=centerProjectHook(p),after=hook(q);assert.notEqual(q,p);assert.equal(JSON.stringify(p),before);assert.equal(after.transform.position_x,0);assert.equal(after.transform.position_y,0);assert.deepEqual(after,{...h,transform:{...h.transform,position_x:0,position_y:0}});assert.equal(reviewHookCanvasPosition(q).status,'anchor-on-canvas');
 for(const t of p.tracks)if(t.type!=='TEXT')assert.equal(q.tracks.find(x=>x.id===t.id),t);
 assert.equal(centerProjectHook(q),q);
});
test('ambiguous, hidden, locked and animated hooks are not silently rewritten',()=>{
 for(const kind of ['duplicate','hidden','track-hidden','locked','track-locked','keyframe','animation']){const p=fixture(),h=hook(p),t=p.tracks.find(t=>t.type==='TEXT')!;
 if(kind==='duplicate')t.items.push({...h,id:'duplicate'});if(kind==='hidden')h.hidden=true;if(kind==='track-hidden')t.hidden=true;if(kind==='locked')h.locked=true;if(kind==='track-locked')t.locked=true;if(kind==='keyframe')h.keyframes=[{time:0} as any];if(kind==='animation')h.text.animation='fade';
 const before=JSON.stringify(p);assert.throws(()=>centerProjectHook(p));assert.equal(JSON.stringify(p),before);if(['keyframe','animation'].includes(kind))assert.equal(reviewHookCanvasPosition(p).status,'animated-review-required');
 }
});
test('on-canvas anchor is never a glyph-bound or collision clearance',()=>{
 const p=fixture(),h=hook(p);h.transform.position_y=-319;h.text.font_size=100;
 const r=reviewHookCanvasPosition(p);assert.equal(r.status,'anchor-on-canvas');assert.match(r.reason,/does not verify/);
 h.transform.position_x=181;assert.equal(reviewHookCanvasPosition(p).status,'anchor-outside-canvas');
 h.transform.position_y=NaN;assert.equal(reviewHookCanvasPosition(p).status,'unavailable');
});
