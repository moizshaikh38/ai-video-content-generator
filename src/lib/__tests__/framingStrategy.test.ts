import test from 'node:test';import assert from 'node:assert/strict';import {applyFramingStrategy} from '../itemLayout.js';
const make=():any=>({canvas:{aspect_ratio:'9:16'},tracks:[{type:'VIDEO',items:[{id:'v',crop_mode:'center',crop:{mode:'fill',focusX:.8,focusY:.7,scale:2},tracker:{enabled:true},panels:{layout:'split2'},framing_window:{version:1},layout_mode:'split',crop_config:{layout_mode:'split',layout_mode_source:'user',split:{speaker1X:.2},other:'keep'},effects:[{id:'effect'}]},{id:'v2',crop:{mode:'fit'}}]},{type:'AUDIO',items:[{id:'audio'}]}]});
test('Smart releases all manual framing channels across video scenes without touching other edits',()=>{
 const p=make(),r=applyFramingStrategy(p,'smart');
 for(const i of r.tracks[0].items){assert.equal((i as any).crop_mode,'smart');for(const key of ['crop','tracker','panels','framing_window','layout_mode'])assert.equal((i as any)[key],undefined);assert.equal((i as any).crop_config.layout_mode_source,undefined)}
 assert.equal((r.tracks[0].items[0] as any).crop_config.other,'keep');assert.deepEqual(r.tracks[0].items[0].effects,p.tracks[0].items[0].effects);assert.equal(r.tracks[1],p.tracks[1]);assert.equal(p.tracks[0].items[0].crop.scale,2);
});
test('Center Fill means center and unzoomed, not previous manual focus',()=>{const r=applyFramingStrategy(make(),'center');for(const i of r.tracks[0].items){assert.deepEqual(i.crop,{mode:'fill',focusX:.5,focusY:.5,scale:1});assert.equal((i as any).layout_mode,'track');assert.equal((i as any).crop_config.layout_mode_source,'user')}});
