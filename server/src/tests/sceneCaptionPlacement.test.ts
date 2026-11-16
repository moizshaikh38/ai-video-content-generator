import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applySceneCaptionPlacement,autoCaptionAnchor,captionSceneLayout} from '../shared/sceneCaptionPlacement.js';
import {buildPresetAssScript,getPreviewFrame,resolveCaptionPreset} from '../shared/captionPresets.js';
import {assFontsDirArg} from '../services/editorFontFiles.js';
import fs from 'node:fs';
const project:any={canvas:{aspect_ratio:'9:16'},tracks:[{type:'VIDEO',items:[{timeline_start:0,timeline_end:2,crop:{mode:'blur'}},{timeline_start:2,timeline_end:4,layout_mode:'split'},{timeline_start:4,timeline_end:6,layout_mode:'track',crop_config:{layout_mode_source:'user'}}]},{type:'CAPTION',items:[{timeline_start:0,timeline_end:6,caption:{position:'bottom'},transform:{position_y:500}}]}]};
const ctx={project,sourceWidth:1920,sourceHeight:1080,fontSize:64};
const cue={id:'cue',start:1,end:5,text:'ONE TWO THREE',words:[{text:'ONE',start:1,end:2.2},{text:'TWO',start:2.2,end:3.5},{text:'THREE',start:4,end:5}]};
test('cue crosses layout boundaries using edited timeline, clips word windows without retiming',()=>{
 const out=applySceneCaptionPlacement([cue],ctx);assert.equal(out.length,3);assert.deepEqual(out.map(c=>[c.start,c.end]),[[1,2],[2,4],[4,5]]);assert.equal(out[0].words?.[0].end,2);assert.equal(out[1].words?.[0].start,2);assert.equal((out[1] as any).position_y,.5);assert.equal((out[1] as any).position_anchor,'center');assert.equal((out[2] as any).position_y,.88);
});
test('fit and blur use measured reference center, independent of words/band/font size',()=>{
 for(const layout of ['fit','blur'] as const) for(const text of ['ONE','ONE TWO THREE FOUR FIVE SIX']) {
  assert.equal(autoCaptionAnchor(layout,ctx,{},text),585/720);
  const p=structuredClone(project);p.tracks[0].items=[{timeline_start:0,timeline_end:6,crop:{mode:layout}}];
  const c=applySceneCaptionPlacement([cue],{...ctx,project:p})[0];
  assert.equal(c.position_y,.8125);assert.equal(c.position_anchor,'center');
 }
});
test('cue explicit coordinates remain untouched',()=>{const c={...cue,position_y:.23};assert.equal(applySceneCaptionPlacement([c],ctx)[0],c)});
test('caption item explicit bottom and dragged transform block auto placement',()=>{for(const overrides of [{caption:{position:'bottom',position_explicit:true}},{transform:{position_y:301}}]){const p=structuredClone(project);Object.assign(p.tracks[1].items[0],overrides);assert.equal((applySceneCaptionPlacement([cue],{...ctx,project:p})[0] as any).position_y,undefined)}});
test('config explicit position blocks automatic anchors',()=>{assert.equal(applySceneCaptionPlacement([cue],{...ctx,explicitConfigPosition:true})[0],cue)});
test('user fill overrides automatic split; item fit wins',()=>{assert.equal(captionSceneLayout(project.tracks[0].items[2],'split'),'fill');assert.equal(captionSceneLayout(project.tracks[0].items[0],'split'),'blur')});
test('split center anchor identical in preview frame and ASS tags',()=>{const style=resolveCaptionPreset('beasty',{},'9:16');const c=applySceneCaptionPlacement([cue],ctx)[1];const frame=getPreviewFrame(c,2.4,style);assert.equal(frame.positionY,.5);assert.equal(frame.positionAnchor,'center');assert.match(buildPresetAssScript([c],style),/\\an5\\pos\(540,960\)/)});
test('ASS font directory includes nested bundled families, not only empty root',()=>{const arg=assFontsDirArg();const dir=arg.slice(11,-1);assert.ok(fs.readdirSync(dir).some(n=>n==='Inter-Bold.ttf'));assert.ok(fs.readdirSync(dir).some(n=>n==='Montserrat-Black.ttf'))});

test('fit/blur center position is identical in preview frame and export tags',()=>{const style=resolveCaptionPreset('beasty',{},'9:16');const c=applySceneCaptionPlacement([cue],ctx)[0];assert.equal(getPreviewFrame(c,1.5,style).positionY,.8125);assert.equal(getPreviewFrame(c,1.5,style).positionAnchor,'center');assert.match(buildPresetAssScript([c],style),/\\an5\\pos\(540,1560\)/)});

test('Soft Cut layered glyph passes preserve scene center and a single position tag',()=>{const style=resolveCaptionPreset('soft_cut',{},'9:16');const c=applySceneCaptionPlacement([cue],ctx)[0];const ass=buildPresetAssScript([c],style);const events=ass.split('\n').filter(l=>l.startsWith('Dialogue:'));assert.ok(events.length>=3);for(const e of events){assert.match(e,/\\an5\\pos\(540,1560\)/);assert.equal((e.match(/\\pos\(/g)||[]).length,1)}});
test('ASS staging includes new Figtree Semibold family',()=>{const dir=assFontsDirArg().slice(11,-1);assert.ok(fs.readdirSync(dir).includes('Figtree-SemiBold.ttf'))});
