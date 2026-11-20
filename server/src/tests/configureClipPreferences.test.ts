import {test}from'node:test';import assert from'node:assert/strict';
import {GenreIntelligenceService as G}from'../services/genreIntelligenceService.js';
import {effectiveClipDurationBounds}from'../shared/clipDurationPreferences.js';
import {candidateAutoHookTitle,automaticHeadlineText}from'../shared/autoHookTitle.js';
import {ProEditorService as P}from'../services/proEditorService.js';
import {ClipRenderService as C}from'../services/clipRenderService.js';
test('new and legacy duration ids normalize without a zero editorial floor',()=>{
 const expected={'0-30':[15,30,24],'15-30':[15,30,24],'30-60':[30,60,45],'60-90':[60,90,75],'60-120':[60,120,90],'120-180':[120,180,150]};
 for(const [id,range]of Object.entries(expected)){const prefs=G.normalizePreferences({preferredDurations:id as any});assert.equal(prefs.preferredDurations,id);const t=G.resolveEffectiveConfig({userPreferences:prefs}).targetDuration;assert.deepEqual([t.min,t.max,t.optimal],range);assert.equal(G.normalizePreferences(undefined,`[Duration: ${id}s]`).preferredDurations,id);}
 assert.equal(G.normalizePreferences().preferredDurations,'auto');assert.throws(()=>G.normalizePreferences({preferredDurations:'0-999' as any}),/supported clip duration/);
});
test('source constraints and short-source review do not weaken requested minute buckets',()=>{
 assert.deepEqual(effectiveClipDurationBounds({min:120,max:180},200),{min:120,max:180});
 assert.deepEqual(effectiveClipDurationBounds({min:60,max:120},90),{min:60,max:90});
 assert.deepEqual(effectiveClipDurationBounds({min:60,max:120},8),{min:60,max:8});
 assert.deepEqual(effectiveClipDurationBounds({min:15,max:30},8),{min:2,max:8});
 assert.deepEqual(effectiveClipDurationBounds({min:15,max:30},100),{min:15,max:30});
});
test('Auto Hook is explicitly off for new clips and reuses candidate hook when on',()=>{
 const c={title:'Different candidate title',hook:'Here is the actual hook!'};
 assert.equal(G.normalizePreferences().autoHookTitle,false);assert.doesNotThrow(()=>candidateAutoHookTitle({autoHookTitle:false},{hook:'x'.repeat(5000)}));assert.doesNotThrow(()=>candidateAutoHookTitle({autoHookTitle:false},{}));assert.deepEqual(candidateAutoHookTitle({},c),{auto_hook_title_enabled:false,auto_hook_title_text:null});
 assert.deepEqual(candidateAutoHookTitle({autoHookTitle:true},c),{auto_hook_title_enabled:true,auto_hook_title_text:c.hook});
 assert.throws(()=>candidateAutoHookTitle({autoHookTitle:true},{title:'No hook'}),/no authored hook/);
 assert.throws(()=>candidateAutoHookTitle({autoHookTitle:true},{hook:'a'.repeat(101)}),/100-character/);
});
test('actual Studio and Quick hook initialization use the same title; manual overlays and legacy controls win',()=>{
 const base={id:'fixture',project_id:'fixture',user_id:'fixture',start_seconds:0,end_seconds:20,duration_seconds:20,aspect_ratio:'9:16',title:'Legacy title',caption_style:'vireo_comic_default'};
 for(const on of [false,true]){
  const clip={...base,...candidateAutoHookTitle({autoHookTitle:on},{hook:'Real candidate hook'})};
  const project=P.buildInitialCandidateEditor(clip as any,'fixture',null);
  const items=project.tracks.filter(t=>t.type==='TEXT').flatMap(t=>t.items).filter(i=>i.text?.auto_headline);
  assert.equal(items.length,on?1:0);if(on){assert.equal(items[0].text?.text,'Real candidate hook');assert(items[0].transform.position_y<0);assert.equal(items[0].timeline_end,5);assert.equal(C.buildHeadlineSpec(clip as any)?.text,'Real candidate hook');}
 }
 assert.equal(automaticHeadlineText(base),'Legacy title');
 assert.equal(automaticHeadlineText({...base,auto_hook_title_enabled:true,auto_hook_title_text:'Real hook',overlay_config:{enabled:false}}),null);
 const manual=P.buildInitialCandidateEditor({...base,auto_hook_title_enabled:false,overlay_config:{enabled:true,text:'Manual title'}} as any,'fixture',null);
 assert.equal(manual.tracks.filter(t=>t.type==='TEXT').flatMap(t=>t.items).find(i=>i.text?.auto_headline)?.text?.text,'Manual title');
});
