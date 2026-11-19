import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const compile = code => ts.transpileModule(code, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const load = code => import('data:text/javascript;base64,' + Buffer.from(compile(code)).toString('base64'));
function declarations(path, wanted) {
  const source=fs.readFileSync(path,'utf8'), ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true, path.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS), out={};
  function visit(n){if(ts.isVariableDeclaration(n)&&wanted.includes(n.name.getText(ast)))out[n.name.getText(ast)]=n.initializer.getText(ast);ts.forEachChild(n,visit);}visit(ast);return out;
}
const {SAFE_EDITOR_FONTS:fonts}=declarations('server/src/types/index.ts',['SAFE_EDITOR_FONTS']);
const helperSource=fs.readFileSync('server/src/shared/hookDisplayMode.ts','utf8').replace(/^import\b.*;\n/gm,'');
const helpers=await load(`const SAFE_EDITOR_FONTS=${fonts};\n${helperSource}`);
const {projectHook,hookMode,applyHookDisplayMode,applyHookPreset,normalizeHookTiming,hookPresetSupported}=helpers;
function fixture(duration=24) {
  return {id:'editor',clip_id:'clip',canvas:{duration,aspect_ratio:'9:16'},tracks:[
    {id:'video',type:'VIDEO',hidden:false,items:[{id:'main',type:'VIDEO',source_start:10,source_end:34,hidden:false}]},
    {id:'text',type:'TEXT',hidden:false,locked:false,items:[
      {id:'hook',type:'TEXT',timeline_start:0,timeline_end:3.5,source_start:0,source_end:3.5,locked:false,hidden:false,text:{auto_headline:true,text:'Keep the original hook',font_family:'Arial',font_size:20},transform:{position_x:0,position_y:-200,scale:1,opacity:1},keyframes:[],effects:[]},
      {id:'manual',type:'TEXT',timeline_start:12,timeline_end:17,hidden:false,text:{text:'Do not change this'},transform:{position_y:50}},
    ]},
    {id:'caps',type:'CAPTION',hidden:false,items:[{id:'cue',hidden:false,caption:{style:'simple',position:'bottom',cues:[{id:'words',text:'Subtitles stay saved',start:0,end:24}]}}]},
    {id:'audio',type:'AUDIO',hidden:false,items:[{id:'audio',gain:0.7}]},
  ]};
}
const staticStyle={presetId:'simple',fontFamily:'Arial',fontSize:62,fontWeight:700,bold:true,playResX:1080,textColor:'#FFFFFF',outlineColor:'#000000',outlineWidth:4,box:null};
test('Hook only spans full current clip, hides but never deletes caption cues or changes unrelated tracks',()=>{
  const before=fixture(),copy=structuredClone(before),after=applyHookDisplayMode(before,'hook_only');
  assert.equal(projectHook(after).timeline_end,24);assert.equal(projectHook(after).timeline_start,0);assert.equal(hookMode(after),'hook_only');
  assert.equal(after.tracks[2].hidden,true);assert.deepEqual(after.tracks[2].items,before.tracks[2].items);
  for(const index of [0,3])assert.strictEqual(after.tracks[index],before.tracks[index]);
  assert.strictEqual(after.tracks[1].items[1],before.tracks[1].items[1]);assert.deepEqual(before,copy);
});
test('fullclip and intro mode survive JSON save/reload without creating duplicate hook layers',()=>{
  const only=JSON.parse(JSON.stringify(applyHookDisplayMode(fixture(),'hook_only')));
  const intro=applyHookDisplayMode(only,'hook_captions');assert.equal(projectHook(intro).timeline_end,3.5);assert.equal(intro.tracks[2].hidden,false);
  const again=applyHookDisplayMode(intro,'hook_only');assert.equal(projectHook(again).timeline_end,24);assert.equal(again.tracks[1].items.length,2);
  assert.deepEqual(applyHookDisplayMode(again,'hook_only'),again);
});
test('custom intro duration is retained across modes, and short clips are capped without exceeding their end',()=>{
  const p=fixture();p.tracks[1].items[0].timeline_end=4.75;
  assert.equal(projectHook(applyHookDisplayMode(applyHookDisplayMode(p,'hook_only'),'hook_captions')).timeline_end,4.75);
  const short=applyHookDisplayMode(fixture(0.4),'hook_captions');assert.equal(projectHook(short).timeline_end,0.4);
});
test('fullclip marker follows duration extension and trimming, while unmarked manual layers remain unchanged',()=>{
  const only=applyHookDisplayMode(fixture(),'hook_only');
  for(const duration of [2,77,300]){const changed=normalizeHookTiming({...only,canvas:{...only.canvas,duration}});assert.equal(projectHook(changed).timeline_end,duration);assert.strictEqual(changed.tracks[1].items[1],only.tracks[1].items[1]);}
  const manual=fixture();assert.strictEqual(normalizeHookTiming(manual),manual);
});
test('a manual duration override can clear the marker without later normalization undoing that edit',()=>{
  const p=applyHookDisplayMode(fixture(),'hook_only');const h=p.tracks[1].items[0];h.timeline_end=8;delete h.text.hook_display_mode;
  assert.equal(projectHook(normalizeHookTiming(p)).timeline_end,8);
});
test('missing/ambiguous/locked/too-long hook and invalid duration fail without editing the document',()=>{
  for(const mutate of [p=>p.tracks[1].items.shift(),p=>p.tracks[1].items.push({...p.tracks[1].items[0],id:'duplicate'}),p=>p.tracks[1].locked=true,p=>p.tracks[1].items[0].locked=true,p=>p.tracks[1].items[0].text.text='x'.repeat(101),p=>p.canvas.duration=NaN]){
    const p=fixture();mutate(p);const before=structuredClone(p);assert.throws(()=>applyHookDisplayMode(p,'hook_only'));assert.deepEqual(p,before);
  }
});
test('Hook + captions requires actual saved caption cues and cannot report a subtitle-free document as that mode',()=>{
  const p=fixture();p.tracks[2].items[0].caption.cues=[];assert.throws(()=>applyHookDisplayMode(p,'hook_captions'),/caption cues/);
});
test('unhiding a hook track does not expose unrelated text that was hidden by the track',()=>{
  const p=fixture();p.tracks[1].hidden=true;const only=applyHookDisplayMode(p,'hook_only');assert.equal(only.tracks[1].hidden,false);assert.equal(only.tracks[1].items[0].hidden,false);assert.equal(only.tracks[1].items[1].hidden,true);
});
test('static preset mapping preserves words, fullclip timing and subtitle-off state, without word animation',()=>{
  const only=applyHookDisplayMode(fixture(),'hook_only');const styled=applyHookPreset(only,staticStyle,1);
  const h=projectHook(styled);assert.equal(h.text.text,'Keep the original hook');assert.equal(h.timeline_end,24);assert.equal(styled.tracks[2].hidden,true);assert.equal(h.text.animation,'none');assert.equal(h.text.color,'#FFFFFF');assert.equal(h.text.font_family,'Arial');
  assert.equal(h.text.hook_caption_preset,'simple');assert.strictEqual(styled.tracks[1].items[1],only.tracks[1].items[1]);
});
test('unsupported fonts and weights are rejected, never silently substituted',()=>{
  const only=applyHookDisplayMode(fixture(),'hook_only');
  for(const style of [{...staticStyle,fontFamily:'Komika Axis'},{...staticStyle,fontWeight:800}]){assert.equal(hookPresetSupported(style),false);assert.throws(()=>applyHookPreset(only,style,1),/not supported/);}
});
test('manual caption visibility or hook visibility leaves the explicit mode without reversing the user edit',()=>{
  const only=applyHookDisplayMode(fixture(),'hook_only');only.tracks[2].hidden=false;assert.equal(hookMode(only),null);
  const p=applyHookDisplayMode(fixture(),'hook_only');p.tracks[1].items[0].hidden=true;assert.equal(hookMode(p),null);
});

// Actual editor callback with fake project/history and a fake preset resolver.
// This establishes state mutation only, not mounted React, network save or pixels.
const bodies=declarations('src/components/editor/EditorShell.tsx',['handleApplyCaptionPreset']);
const names=['resolvePlanAllowedPreset','hookMode','allowedCaptionPresets','setActionNotice','resolveCaptionPreset','freshPresetTypography','hookModeUnavailable','hookPresetSupported','hookPresetIssue','setLastCaptionPreset','setExportStale','onUpdateProject','applyPresetToEditorCaption','applyHookPreset','FONT_EM_PER_ASS_SIZE','project'];
const {make}=await load(`export function make(d:any){const {${names}}=d;return ${bodies.handleApplyCaptionPreset};}`);
function callbackFixture(project){let row=project;const notices=[],events=[];
  const deps={project,allowedCaptionPresets:['*'],resolvePlanAllowedPreset:id=>id,...helpers,
    resolveCaptionPreset:(id,o)=>({...staticStyle,presetId:id,fontFamily:id==='unsupported'?'Komika Axis':'Arial',textColor:o?.textColor??(id==='new'?'#00FF00':'#FFFFFF'),outlineColor:o?.outlineColor??'#000000'}),
    freshPresetTypography:()=>undefined,FONT_EM_PER_ASS_SIZE:{Arial:1},setActionNotice:n=>notices.push(n),setLastCaptionPreset:()=>{},setExportStale:()=>events.push('stale'),
    onUpdateProject:f=>{row=f(row);events.push('history');},applyPresetToEditorCaption:(prev,id)=>({...prev,style:id,primary_color:id==='new'?'#00FF00':'#FFFFFF'}),
  };
  return{run:make(deps),notices,events,get row(){return row}};
}
test('actual editor preset change updates both hook and saved caption style while Hook only keeps subtitles hidden',()=>{
  const s=callbackFixture(applyHookDisplayMode(fixture(),'hook_only'));s.run('new');assert.equal(projectHook(s.row).text.color,'#00FF00');assert.equal(projectHook(s.row).timeline_end,24);assert.equal(s.row.tracks[2].hidden,true);assert.equal(s.row.tracks[2].items[0].caption.style,'new');assert.deepEqual(s.events,['stale','history']);
});
test('actual preset change preserves intro timing in Hook + captions, and preserves colors when requested',()=>{
  const s=callbackFixture(applyHookDisplayMode(fixture(),'hook_captions'));s.row.tracks[2].items[0].caption.primary_color='#FF00FF';s.run('new',{keepColors:true});assert.equal(projectHook(s.row).text.color,'#FF00FF');assert.equal(projectHook(s.row).timeline_end,3.5);assert.equal(s.row.tracks[2].hidden,false);
});
test('actual unsupported preset choice refuses without partial caption changes or history',()=>{
  const p=applyHookDisplayMode(fixture(),'hook_only'),s=callbackFixture(p);s.run('unsupported');assert.strictEqual(s.row,p);assert.deepEqual(s.events,[]);assert.match(s.notices[0],/not supported/);
});
test('legacy caption preset behavior remains unchanged when no hook mode is selected',()=>{
  const p=fixture();p.tracks[2].hidden=true;const s=callbackFixture(p);s.run('new');assert.equal(s.row.tracks[2].hidden,false);assert.deepEqual(projectHook(s.row),projectHook(p));
});

test('edited TS and TSX sources parse without syntax errors',()=>{
  for(const path of ['server/src/shared/hookDisplayMode.ts','src/components/editor/HookModeControls.tsx','src/components/editor/EditorShell.tsx','src/components/editor/ContextualInspector.tsx','src/components/editor/ExportDialog.tsx','src/hooks/useEditorProject.ts','server/src/services/proEditorService.ts']){
    const source=fs.readFileSync(path,'utf8');const result=ts.transpileModule(source,{reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
    assert.deepEqual((result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).map(d=>d.messageText),[],path);
  }
});

// Read the real pure caption catalogue and resolver with unused motion/metric
// imports removed. No style definition, font ratio or preset ID is invented.
const realPresets=await load(fs.readFileSync('server/src/shared/captionPresets.ts','utf8').replace(/^import\b.*;\n/gm,''));
const {freshPresetTypography}=await load(fs.readFileSync('server/src/shared/freshPresetTypography.ts','utf8').replace(/^import\b.*;\n/gm,''));
const supportedCatalogue=Object.keys(realPresets.CAPTION_PRESETS).filter(id=>hookPresetSupported(realPresets.resolveCaptionPreset(id,freshPresetTypography(id))));
test('actual caption catalogue maps supported fonts without fallback across portrait, square and landscape',()=>{
  assert(supportedCatalogue.includes('simple'));
  assert(!supportedCatalogue.includes('vireo_comic_default'));
  for(const id of supportedCatalogue) for(const aspect of ['9:16','1:1','16:9']){
    const p=fixture();p.canvas.aspect_ratio=aspect;
    const resolved=realPresets.resolveCaptionPreset(id,freshPresetTypography(id),aspect);
    const ratio=realPresets.FONT_EM_PER_ASS_SIZE[resolved.fontFamily];assert(Number.isFinite(ratio),id);
    const after=applyHookPreset(applyHookDisplayMode(p,'hook_only'),resolved,ratio);const text=projectHook(after).text;
    assert.equal(text.font_family,resolved.fontFamily,id);assert.equal(text.color,resolved.textColor,id);
    assert.equal(text.text,'Keep the original hook',id);assert.equal(projectHook(after).timeline_end,24,id);
    assert(Number.isFinite(text.font_size)&&text.font_size>=16&&text.font_size<=28,id);
    assert(Number.isFinite(text.stroke_width)&&text.stroke_width>=0,id);
  }
});
test('static hook contrast card follows light versus dark preset text without claiming ASS background fidelity',()=>{
  assert.equal(helpers.hookContrastCard('#FFFFFF'),'#0B0D12');assert.equal(helpers.hookContrastCard('#000000'),'#F8FAFC');
  const p=applyHookDisplayMode(fixture(),'hook_only');const after=applyHookPreset(p,{...staticStyle,textColor:'#000000'},1);
  assert.equal(projectHook(after).text.background_color,'#F8FAFC');
});
test('mode switching preserves a manually moved hook after initial opt-in',()=>{
  const p=applyHookDisplayMode(fixture(),'hook_only');projectHook(p).transform.position_y=90;
  assert.equal(projectHook(applyHookDisplayMode(p,'hook_captions')).transform.position_y,90);
});
console.log('Static hook preset catalogue supported IDs:',supportedCatalogue.join(', '));

function methodSource(path, name) {
  const source=fs.readFileSync(path,'utf8'),ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true);let body;
  function visit(n){if(ts.isMethodDeclaration(n)&&n.name.getText(ast)===name)body=n.getText(ast).replace(/^public static async /,'async function ');ts.forEachChild(n,visit);}visit(ast);assert(body);return body;
}
test('actual Hook Lab overlay operation identifies new hook text for mode controls without a database call',async()=>{
  const source=methodSource('server/src/services/hookLab/hookEditorIntegration.ts','applyCandidateToProject');
  const {make}=await load(`export function make(d:any){const {ownerContext,ProEditorService,crypto,logger}=d;${source};return applyCandidateToProject;}`);
  const p=fixture();p.tracks[1].items.shift();let seq=0;
  const call=make({ownerContext:{run:async(_u,fn)=>fn()},ProEditorService:{getEditorProject:async()=>p,updateEditorProject:async(_id,_u,dto)=>({...p,...dto})},crypto:{randomUUID:()=>String(++seq)},logger:{info:()=>{}}});
  const result=await call('owner','editor',{id:'candidate',delivery_mode:'TEXT_OVERLAY',text:'A new chosen hook'});
  assert.equal(projectHook(result.updatedProject).text.text,'A new chosen hook');
  assert.equal(projectHook(applyHookDisplayMode(result.updatedProject,'hook_only')).timeline_end,24);
  assert.equal(projectHook(p),null);
});
function saveFixture(project){let writes=0,last;
  const source=methodSource('server/src/services/proEditorService.ts','updateEditorProject');
  const names=['isValidUUID','AppError','ProEditorService','EDITOR_RESOURCE_LIMITS','isKnownCaptionStyle','EDITOR_TRANSITION_TYPES','validateAutomaticLayoutCropConfig','validateSceneLayoutOverrides','validateClientEditorSourcePath','validateEditorSourcePath','normalizeEditorCanvasAspect','normalizeHookTiming','hookProjectExportIssue','saveEditorRevision','getMongoClient','getMongoDb'];
  return load(`export function make(d:any){const {${names}}=d;${source};return updateEditorProject;}`).then(({make})=>{
    class AppError extends Error{constructor(m,status,code){super(m);this.statusCode=status;this.code=code;}}
    const fn=make({isValidUUID:()=>true,AppError,ProEditorService:{assertItemFramingWindow:()=>{}},EDITOR_RESOURCE_LIMITS:{MAX_TRACKS:16,MAX_TIMELINE_ITEMS:120,MAX_TEXT_LAYERS:25,MAX_EFFECTS_PER_ITEM:5,MAX_KEYFRAMES_PER_ITEM:30},isKnownCaptionStyle:()=>true,EDITOR_TRANSITION_TYPES:[],validateAutomaticLayoutCropConfig:()=>{},validateSceneLayoutOverrides:()=>{},validateClientEditorSourcePath:async()=>{},validateEditorSourcePath:async()=>{},normalizeEditorCanvasAspect:c=>c,...helpers,
      saveEditorRevision:async(_client,_db,input)=>{writes++;last=input;return {...project,...input.updates}},getMongoClient:async()=>({}),getMongoDb:async()=>({}),
    });
    const self={getEditorProject:async()=>project,validateFont:f=>f,assertItemFramingWindow:()=>{}};
    return {run:dto=>fn.call(self,'editor','owner',dto),get writes(){return writes},get last(){return last}};
  });
}
test('actual server save preparation persists fullclip hook timing on duration-only changes',async()=>{
  const p=applyHookDisplayMode(fixture(),'hook_only');p.version=1;const s=await saveFixture(p);
  const saved=await s.run({version:1,canvas:{duration:48}});assert.equal(projectHook(saved).timeline_end,48);assert.equal(saved.tracks[2].hidden,true);assert.equal(s.writes,1);assert.equal(s.last.expectedVersion,1);
});
test('actual server save rejects explicit hook text that TEXT export would truncate before any fake DB write',async()=>{
  for(const text of ['x'.repeat(101),'one\ntwo\nthree\nfour\nfive']){
    const p=applyHookDisplayMode(fixture(),'hook_only');p.version=1;const tracks=structuredClone(p.tracks);tracks[1].items[0].text.text=text;
    const s=await saveFixture(p);await assert.rejects(s.run({version:1,tracks}),{code:'INVALID_HOOK_TEXT',statusCode:400});assert.equal(s.writes,0);assert.equal(projectHook(p).text.text,'Keep the original hook');
  }
});
test('static preset admission refuses overlong wrapped text or invalid metrics without a partial edit',()=>{
  const p=applyHookDisplayMode(fixture(),'hook_only');projectHook(p).text.text='one\ntwo\nthree\nfour\nfive';const before=structuredClone(p);
  assert.throws(()=>applyHookPreset(p,staticStyle,1),/four-line/);assert.deepEqual(p,before);
  const valid=applyHookDisplayMode(fixture(),'hook_only');assert.throws(()=>applyHookPreset(valid,staticStyle,NaN),/font metrics/);
});
