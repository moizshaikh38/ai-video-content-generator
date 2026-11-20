import {hookPresetLinked,hookMode,applyHookPreset,hookProjectExportIssue} from '../shared/hookDisplayMode.js';
import {resolveCaptionPreset,FONT_EM_PER_ASS_SIZE} from '../shared/captionPresets.js';
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

test('new Auto Hook title initialization stays inside each aspect without moving saved manual layers',()=>{
 for(const [aspect,previewH,canvasH] of [['9:16',640,1920],['1:1',480,1080],['16:9',360,1080]] as const){
  const clip:any={id:'fixture',project_id:'fixture',user_id:'fixture',start_seconds:0,end_seconds:20,duration_seconds:20,aspect_ratio:aspect,title:'Legacy',auto_hook_title_enabled:true,auto_hook_title_text:'Real candidate hook title in two lines'};
  const editor=P.buildInitialCandidateEditor(clip,'fixture',null);
  const title=editor.tracks.filter(t=>t.type==='TEXT').flatMap(t=>t.items).find(i=>i.text?.auto_headline)!;
  const center=(previewH/2+title.transform.position_y)*(canvasH/previewH);
  assert.equal(center,211.5);
  assert(title.text!.font_size!>=12);
  if(aspect==='9:16')assert.equal(title.transform.position_y,-249.5);
  title.transform.position_y=42;title.text!.text='My manual edit';
  P.compileRenderGraph(editor,'fixture.mp4','unused.mp4','/tmp',{mode:'manual',aspectRatio:aspect,clipStartSec:0,cropConfig:null,layoutMode:'manual',track:null},'off');
  assert.equal(title.transform.position_y,42);assert.equal(title.text!.text,'My manual edit');
 }
});

test('new Configure Auto Hook reuses selected caption preset, retains5s and links later restyling without enabling captions',()=>{
 for(const captions of [true,false]){
  const clip:any={id:'fixture',project_id:'fixture',user_id:'fixture',start_seconds:0,end_seconds:20,duration_seconds:20,aspect_ratio:'9:16',title:'Legacy',caption_style:'vireo_comic_default',caption_enabled:captions,auto_hook_title_enabled:true,auto_hook_title_text:'Real candidate hook'};
  const editor=P.buildInitialCandidateEditor(clip,'fixture',null);
  const title=editor.tracks.filter(t=>t.type==='TEXT').flatMap(t=>t.items).find(i=>i.text?.auto_headline)!;
  assert.equal(title.text?.font_family,'Bangers');assert.equal(title.text?.hook_caption_preset,'vireo_comic_default');assert.equal(hookPresetLinked(editor),true);
  assert.equal(title.timeline_end,5);assert.equal(title.transform.position_y,-249.5);
  assert.equal(editor.tracks.find(t=>t.type==='CAPTION')?.hidden,!captions);
  assert.equal(hookMode(editor),captions?'hook_captions':null);
  const style=resolveCaptionPreset('simple',undefined,'9:16');const changed=applyHookPreset(editor,style,FONT_EM_PER_ASS_SIZE[style.fontFamily]);
  const after=changed.tracks.filter(t=>t.type==='TEXT').flatMap(t=>t.items).find(i=>i.text?.auto_headline)!;
  assert.equal(after.text?.hook_caption_preset,'simple');assert.equal(after.timeline_end,5);assert.equal(changed.tracks.find(t=>t.type==='CAPTION')?.hidden,!captions);
  assert.equal(title.text?.hook_caption_preset,'vireo_comic_default','restyling must not mutate saved input');
  title.text!.text='a'.repeat(101);assert.match(hookProjectExportIssue(editor)!,/1 to 100/);
 }
});

test('fresh wide hook fitting preserves every glyph, style, placement and saved manual titles',()=>{
 const base:any={id:'fixture',project_id:'fixture',user_id:'fixture',start_seconds:0,end_seconds:20,duration_seconds:20,aspect_ratio:'9:16',caption_style:'vireo_comic_default',caption_enabled:false,auto_hook_title_enabled:true,auto_hook_title_text:'W'.repeat(80)};
 for(const aspect_ratio of ['9:16','1:1','16:9']){
  const editor=P.buildInitialCandidateEditor({...base,aspect_ratio},'fixture',null);const hook=editor.tracks.find(t=>t.type==='TEXT')!.items[0];
  assert.equal(hook.text!.text.replace(/\s/g,''),'W'.repeat(80));assert(hook.text!.text.length<=100);assert(hook.text!.text.split('\n').length<=4);assert(hook.text!.font_size!>=16);assert.equal(hook.text!.hook_caption_preset,'vireo_comic_default');assert.equal(hook.timeline_end,5);assert.equal(hookProjectExportIssue(editor),null);
  hook.transform.position_x=23;hook.transform.position_y=41;const before=JSON.stringify(editor);P.compileRenderGraph(editor,'fixture.mp4','unused.mp4','/tmp',{mode:'manual',aspectRatio:aspect_ratio,clipStartSec:0,cropConfig:null,layoutMode:'manual',track:null},'off');assert.equal(JSON.stringify(editor),before);
 }
 const plain=P.buildInitialCandidateEditor({...base,auto_hook_title_enabled:false,overlay_config:{enabled:true,text:'W'.repeat(80)}},'fixture',null);const manual=plain.tracks.find(t=>t.type==='TEXT')!.items[0];assert.equal(manual.text!.text,'W'.repeat(80));assert.equal(manual.text!.hook_style_linked,undefined);
});
