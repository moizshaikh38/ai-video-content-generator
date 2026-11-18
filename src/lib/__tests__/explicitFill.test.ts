import test from 'node:test';import assert from 'node:assert/strict';import {applyItemLayout} from '../itemLayout.js';
const project:any={canvas:{aspect_ratio:'9:16'},tracks:[{id:'t',type:'VIDEO',items:[{id:'v',crop:{mode:'blur',band:'4:3',focusX:.4,focusY:.6,scale:1.2},framing_window:{version:1}}]}]};
test('manual Fill writes explicit cover crop so auto fallback cannot override its meaning',()=>{const i=applyItemLayout(project,'v','fill').tracks[0].items[0];assert.deepEqual(i.crop,{mode:'fill',focusX:.4,focusY:.6,scale:1.2});assert.equal(i.framing_window,undefined);assert.equal((i.crop_config as any)?.layout_mode_source,'user')});
test('Split still clears crop for split renderer',()=>assert.equal(applyItemLayout(project,'v','split').tracks[0].items[0].crop,undefined));
import {boxFromCrop} from '../cropBox.js';
import {applySceneLayout} from '../itemLayout.js';
const make=():any=>({canvas:{aspect_ratio:'9:16',width:1080,height:1920},tracks:[{id:'t',type:'VIDEO',items:[{id:'v',source_start:40,source_end:52,timeline_start:0,timeline_end:12,crop_config:{layout_mode_source:'auto'}}]}]});
test('new Fill centers a measured source subject using exact object-position conversion',()=>{
 const i=applyItemLayout(make(),'v','fill',[{time:40,centerX:.7,centerY:.35},{time:46,centerX:.72,centerY:.36}],{width:1920,height:1080}).tracks[0].items[0];
 const b=boxFromCrop(1920,1080,9/16,i.crop as any);assert.ok(Math.abs(b.left+b.w/2-.72)<1e-7);assert.equal(i.crop?.focusY,.5);
});
test('missing dimensions, irrelevant-time measurements and absent tracks keep center fallback',()=>{
 const k=[{time:0,centerX:.9}];for(const [keys,size]of [[k,undefined],[k,{width:1920,height:1080}],[null,{width:1920,height:1080}]] as any){const i=applyItemLayout(make(),'v','fill',keys,size).tracks[0].items[0];assert.equal(i.crop?.focusX,.5)}
});
test('existing manual focal point and zoom are never replaced by a measured seed',()=>{const p=make();p.tracks[0].items[0].crop={mode:'custom',focusX:.12,focusY:.8,scale:2};const i=applyItemLayout(p,'v','fill',[{time:40,centerX:.8}],{width:1920,height:1080}).tracks[0].items[0];assert.deepEqual(i.crop,{mode:'fill',focusX:.12,focusY:.8,scale:2})});
test('scene Fill uses only selected source window, preserving adjacent scenes and timeline',()=>{const p=make(),q=applySceneLayout(p,'v',46,50,'fill',[{time:41,centerX:.1},{time:47,centerX:.8}],{width:1920,height:1080});const i:any=q.tracks[0].items[0];assert.equal(i.crop,undefined);assert.equal(i.scene_layout_overrides.length,1);assert.ok(i.scene_layout_overrides[0].patch.crop.focusX>.8);assert.equal(i.source_start,40);assert.equal(i.timeline_end,12)});
