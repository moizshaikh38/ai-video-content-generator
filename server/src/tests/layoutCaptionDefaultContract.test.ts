import{test}from'node:test';import assert from'node:assert/strict';
import{applySceneCaptionPlacement}from'../shared/sceneCaptionPlacement.js';
import{resolveCaptionPreset,getPreviewFrame,buildPresetAssScript,getCaptionMovingOrigin,getCaptionBackdropGeometry,getCaptionRollingGeometry}from'../shared/captionPresets.js';
import{applyPresetToEditorCaption}from'../../../src/lib/captionPresets.js';
const cue:any={id:'c',start:0,end:2,text:'KEEP THIS POSITION',words:[{text:'KEEP',start:0,end:.5},{text:'THIS',start:.5,end:1},{text:'POSITION',start:1,end:2}]};
const project=(item:any)=>({canvas:{aspect_ratio:'9:16'},tracks:[{type:'VIDEO',items:[{id:'v',timeline_start:0,timeline_end:2,...item}]},{type:'CAPTION',items:[{timeline_start:0,timeline_end:2,caption:{position:'bottom'},transform:{position_x:0,position_y:500}}]}]});
test('userlayout default contract:Fit/Fill lowercenter;allpaneltypes center',()=>{for(const [item,y]of[[{crop:{mode:'fit'}},.8125],[{crop:{mode:'fill'}},.8125],[{crop:{mode:'blur'}},.8125],[{layout_mode:'split'},.5],...['gameplay','game_screen_first','watch_party','streaming','three','four','screenshare'].map(layout=>[{panels:{layout,slots:[]}},layout==='game_screen_first'?.6:['gameplay','watch_party','streaming'].includes(layout)?.3:.5]) ]as any){const c=applySceneCaptionPlacement([cue],{project:project(item)})[0];assert.equal(c.position_y,y);assert.equal(c.position_anchor,'center')}});
test('preset changes retain exactmanualXYandexplicitbottomprovenance,cues untouched',()=>{for(const id of['vireo_comic_punch','beasty','glide','chip_background','with_backdrop','crossline']as any[]){const prev:any={cues:[cue],position:'bottom',position_x:.37,position_y:.62,position_explicit:true};const out:any=applyPresetToEditorCaption(prev,id);assert.equal(out.position_x,.37);assert.equal(out.position_y,.62);assert.equal(out.position_explicit,true);assert.equal(out.cues,prev.cues)}});
test('specialgeometries honor centeranchorand retainmanualbottomsemantics',()=>{const c={position_x:.5,position_y:.5,position_anchor:'center' as const},s=resolveCaptionPreset('glide'),l={width:300,height:100}as any;assert.equal(getCaptionMovingOrigin(c,s,l).y,s.playResY*.5-50);assert.equal(getCaptionMovingOrigin({...c,position_anchor:'bottom'},s,l).y,s.playResY*.5-100);assert.equal(getCaptionBackdropGeometry(c,s,1).y,s.playResY*.5);const r=getCaptionRollingGeometry(c,s);assert.equal(r.bottomY-r.height/2,s.playResY*.5)});
test('all specialpreviewframes retain derivedanchorandactualASSuses adjustedorigin',()=>{for(const id of['glide','chip_background','crossline','with_backdrop','vireo_comic_punch','soft_cut']as const){const s=resolveCaptionPreset(id),c={...cue,position_y:.5,position_anchor:'center'as const};const f=getPreviewFrame(c,1.1,s);assert.equal(f.positionAnchor,'center',id);assert.equal(f.positionY,.5,id);assert.ok(buildPresetAssScript([c],s).includes('Dialogue:'),id)}});

import {CaptionService} from '../services/captionService.js';
test('editor item numeric drag reaches export cues without mirrored clip config',()=>{
 const cap=(x:number,y:number,start=0)=>({timeline_start:start,timeline_end:start+2,caption:{position:'bottom',position_explicit:true,position_x:x,position_y:y,cues:[{id:String(start),start:0,end:2,text:'POSITION CHECK'}]}});
 const single=CaptionService.extractEditorCuesFromProject({tracks:[{type:'CAPTION',items:[cap(.37,.62)]}]})!;
 assert.equal(single.cues[0].position_x,.37);assert.equal(single.cues[0].position_y,.62);assert.equal(single.cues[0].position_anchor,'bottom');
 const items=[cap(.37,.62),cap(.7,.4,2)];
 const multi=CaptionService.extractEditorCuesFromProject({tracks:[{type:'CAPTION',items}]})!;
 assert.deepEqual(multi.cues.map(c=>[c.start,c.position_x,c.position_y]),[[0,.37,.62],[2,.7,.4]]);
 Object.assign(items[0].caption.cues[0],{position_x:.6,position_y:.5,position_anchor:'center'});
 const specific=CaptionService.extractEditorCuesFromProject({tracks:[{type:'CAPTION',items}]})!;
 assert.deepEqual([specific.cues[0].position_x,specific.cues[0].position_y,specific.cues[0].position_anchor],[.6,.5,'center']);
});
