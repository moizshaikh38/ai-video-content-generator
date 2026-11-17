import test from 'node:test';import assert from 'node:assert/strict';import {applyItemLayout} from '../itemLayout.js';
const project:any={canvas:{aspect_ratio:'9:16'},tracks:[{id:'t',type:'VIDEO',items:[{id:'v',crop:{mode:'blur',band:'4:3',focusX:.4,focusY:.6,scale:1.2},framing_window:{version:1}}]}]};
test('manual Fill writes explicit cover crop so auto fallback cannot override its meaning',()=>{const i=applyItemLayout(project,'v','fill').tracks[0].items[0];assert.deepEqual(i.crop,{mode:'fill',focusX:.4,focusY:.6,scale:1.2});assert.equal(i.framing_window,undefined);assert.equal((i.crop_config as any)?.layout_mode_source,'user')});
test('Split still clears crop for split renderer',()=>assert.equal(applyItemLayout(project,'v','split').tracks[0].items[0].crop,undefined));
