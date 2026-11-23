import test from 'node:test';
import assert from 'node:assert/strict';
import { explicitCropScaleUpdate as update } from '../shared/explicitCropScaleUpdate.js';
import { ClipRenderService as C } from '../services/clipRenderService.js';
for (const scale of [1,1.1,1.7,4]) test(`explicit scale ${scale} is retained`,()=>{assert.deepEqual(update({scale}),{scale});});
test('omitted scale does not reset existing zoom on unrelated saves',()=>{const old={mode:'manual',scale:1.7},before=structuredClone(old);assert.deepEqual({...old,...update({})},old);assert.deepEqual(old,before);assert.deepEqual(update({scale:undefined}),{});});
test('finite scale clamps at native renderer bounds',()=>{assert.deepEqual(update({scale:0}),{scale:1});assert.deepEqual(update({scale:10}),{scale:4});});
for (const scale of [null,'1.7',false,{},NaN,Infinity,-Infinity]) test(`invalid scale ${String(scale)} is rejected`,()=>{assert.throws(()=>update({scale}),(e:any)=>e.code==='INVALID_CROP_SCALE'&&e.statusCode===400);});
test('updated stored config drives actual Quick blur and manual render decisions',async()=>{for(const mode of ['fit_blur','manual']){const crop_config={mode,focusX:.8,focusY:.5,...update({scale:1.7})},d=await C.resolveReframeDecision({crop_config,aspect_ratio:'16:9'}as any,1,.25);assert.match(d.cropFilter,mode==='fit_blur'?/iw\*1.7/:/1.7/);}});
