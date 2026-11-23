import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ProEditorService} from '../services/proEditorService.js';
import {CaptionService} from '../services/captionService.js';
import {NEW_CAPTION_PRESET_ID} from '../shared/captionPresets.js';
const splitClip=()=>({id:'test',project_id:'p',user_id:'u',start_seconds:0,end_seconds:8,source_storage_path:'test.mp4',aspect_ratio:'9:16',crop_config:{mode:'smart',layout_mode:'split',split:{speaker1X:.25,speaker2X:.75,fit:'contain',dividerX:.498}}});
const build=(clip:any,producer:any=null)=>(ProEditorService as any).buildInitialProject(clip,'u',producer,null,{clip_id:'test'});
const caption=(p:any)=>p.tracks.find((t:any)=>t.type==='CAPTION')?.items[0]?.caption;
test('new editor preserves split contain config and matches the current Quick caption default',()=>{
 const clip=splitClip(),p=build(clip);
 const v=p.tracks.find((t:any)=>t.type==='VIDEO').items[0];assert.equal(v.layout_mode,'split');assert.deepEqual(v.crop_config,clip.crop_config);assert.notEqual(v.crop_config,clip.crop_config);
 const c=caption(p);assert.ok(c,'caption item must exist');
 assert.equal(c.style,NEW_CAPTION_PRESET_ID);
 assert.equal(c.style,CaptionService.resolveDefaultCaptionStyle(clip as any).captionStyle);
});
test('split initialization preserves saved legacy style and config-only preset over fresh default',()=>{
 for(const saved of [{caption_style:'clean'},{caption_config:{presetId:'mozi'}}]){
  const clip={...splitClip(),...saved},before=structuredClone(clip),c=caption(build(clip));assert.ok(c);assert.equal(c.style,'caption_style' in saved?'clean':'mozi');assert.deepEqual(clip,before);
 }
});
test('explicit producer caption operation still overrides fresh default in split initialization',()=>{
 const p=build(splitClip(),{operations:[{type:'CAPTION_STYLE',parameters:{style:'simple'}}]});assert.equal(caption(p).style,'simple');
});
test('new editor preserves explicit full-frame blur fallback instead of center crop',()=>{
 const clip:any={id:'test',project_id:'p',user_id:'u',start_seconds:0,end_seconds:8,source_storage_path:'test.mp4',aspect_ratio:'9:16',crop_config:{mode:'fit_blur'}};
 const p=build(clip);
 assert.equal(p.tracks.find((t:any)=>t.type==='VIDEO').items[0].crop.mode,'blur');
});
