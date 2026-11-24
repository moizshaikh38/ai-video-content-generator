import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as placement from '../shared/sceneCaptionPlacement.js';
import {resolveCaptionPreset,regroupCuesForPreset,getPreviewFrame,buildPresetAssScript} from '../shared/captionPresets.js';
const style=resolveCaptionPreset('vireo_comic_default',{},'9:16');
const project:any={canvas:{aspect_ratio:'9:16'},tracks:[{type:'VIDEO',items:[{id:'v',source_start:0,source_end:3,timeline_start:0,timeline_end:3}]}]};
const cue:any={id:'q',start:0,end:2,text:'The whole inspiration',words:[{text:'The',start:0,end:.4},{text:'whole',start:.4,end:.8},{text:'inspiration',start:.8,end:2}]};
const windows=placement.captionCompositionWindows(project,[{start:0,end:3,windowW:1,windowH:1}],0,1280,720);
const finish=placement.finalizeAutomaticFitCaptionGrowth;
const run=(c:any=cue,context:any={})=>{const p=placement.applySceneCaptionPlacement([c],{project,automaticWindows:windows,...context});return finish(regroupCuesForPreset(p,style).cues,style)};

test('automatic Fit keeps first line at the existing single-line anchor instead of growing upward into source subtitles',()=>{
 const before=JSON.stringify({cue,project,windows}),c=run()[0];assert.equal(c.text,'THE WHOLE\\NINSPIRATION');assert.equal(c.position_y,windows[0].anchorY!+style.fontSize/(2*style.playResY));assert.equal(c.position_y*1920-style.fontSize/2,windows[0].anchorY!*1920);assert.equal(JSON.stringify({cue,project,windows}),before);assert.deepEqual(c.words?.map((w:any)=>[w.start,w.end]),cue.words.map((w:any)=>[w.start,w.end]));
});
test('automatic Fit single-line center is unchanged',()=>{const c=run({...cue,text:'Love',words:[{text:'Love',start:0,end:2}]})[0];assert.equal(c.position_y,windows[0].anchorY);});
test('finalization is idempotent and preview/export use the same corrected center',()=>{const c=run()[0];assert.deepEqual(finish([c],style),[c]);assert.equal(getPreviewFrame(c,1.1,style).positionY,c.position_y);assert.ok(buildPresetAssScript([c],style).includes('1628.000'));});
test('manual cue coordinates, explicit config and explicit caption-item intent remain unchanged',()=>{
 for(const values of [{position_y:.23},{position_x:.4},{position_x:.4,position_y:.7}]){const c=run({...cue,...values})[0];for(const [key,value]of Object.entries(values))assert.equal(c[key],value);assert.equal(Object.getOwnPropertySymbols(c).length,0);}
 assert.equal(run(cue,{explicitConfigPosition:true})[0].position_y,undefined);
 const p=structuredClone(project);p.tracks.push({type:'CAPTION',items:[{timeline_start:0,timeline_end:3,caption:{position:'bottom',position_explicit:true}}]});assert.equal(run(cue,{project:p})[0].position_y,undefined);
});
test('Split stays centered, Comic gameplay keeps first-line seam, and manual Fit stays unchanged',()=>{
 for(const [layout,anchor]of [['split',.5],['panel_gameplay',.4]]as const){const c=run(cue,{automaticWindows:[{itemId:'v',start:0,end:3,layout,anchorY:anchor}]})[0];assert.equal(c.position_y,layout==='panel_gameplay'?anchor+style.fontSize/(2*style.playResY):anchor);assert.equal(Object.getOwnPropertySymbols(c).length,layout==='panel_gameplay'?1:0);}
 const p=structuredClone(project);p.tracks[0].items[0].crop={mode:'fit'};const c=run(cue,{project:p,automaticWindows:[]})[0];assert.equal(c.position_y,.8125);assert.equal(Object.getOwnPropertySymbols(c).length,0);
});
test('only source-geometry automatic Fit gains growth metadata, including4:3, not Fill',()=>{
 const w=placement.captionCompositionWindows(project,[{start:0,end:3,windowW:1,windowH:1}],0,4,3);const c=run(cue,{automaticWindows:w})[0];assert.equal(c.position_y,w[0].anchorY!+style.fontSize/(2*style.playResY));
 const fill=run(cue,{automaticWindows:[{itemId:'v',start:0,end:3,layout:'fill'}]})[0];assert.equal(fill.position_y,.8125);assert.equal(Object.getOwnPropertySymbols(fill).length,0);
});
test('explicit cue preset overrides and special layouts are not moved by the bounded comic correction',()=>{
 const c=run({...cue,presetOverride:'vireo_comic_red_green',styleOverrides:{fontSize:100}})[0];assert.equal(c.position_y,windows[0].anchorY);
 const placed=placement.applySceneCaptionPlacement([cue],{project,automaticWindows:windows});const plain=resolveCaptionPreset('beasty');const p=regroupCuesForPreset(placed,plain).cues;assert.deepEqual(finish(p,plain),p);
});
test('line height uses resolved font size and does not push a lower caption block off canvas',()=>{
 const positioned=(anchorY:number)=>regroupCuesForPreset(placement.applySceneCaptionPlacement([cue],{project,automaticWindows:[{...windows[0],anchorY}]}),style).cues[0];
 const p=positioned(.6),small={...style,fontSize:80};assert.equal(finish([p],small)[0].position_y,.6+40/1920);
 const styled={...p,styleOverrides:{fontSize:100}};assert.deepEqual(finish([styled],style),[styled]);
 const low=positioned(.91);assert.deepEqual(finish([low],style),[low]);assert.deepEqual(finish([{...p,auto_position:false}],style),[{...p,auto_position:false}]);
 const manual={...cue,text:'THE WHOLE\\NINSPIRATION',position_y:.3,auto_position:true,auto_fit_boundary_y:.6};assert.deepEqual(finish([manual],style),[manual]);
 assert.equal(JSON.stringify(p).includes('automaticFit'),false);
});
