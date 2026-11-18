import {test} from 'node:test';import assert from 'node:assert/strict';import {freezeAutomaticPlan,freezeAutomaticKeyframes} from '../shared/automaticFraming.js';
const plan=[{start:0,end:12,windowW:.25,windowH:.8,keyframes:[{time:0,centerX:.3,centerY:.4},{time:12,centerX:.7,centerY:.6}]},{start:12,end:24,windowW:.7,windowH:1,keyframes:[{time:12,centerX:.4,centerY:.5},{time:24,centerX:.6,centerY:.5}]},{start:24,end:36,split:{dividerX:.5},keyframes:[{time:24,centerX:.5,centerY:.5}]}];
test('default/ON preserves original plan identity',()=>{assert.equal(freezeAutomaticPlan(plan,undefined,0),plan);assert.equal(freezeAutomaticPlan(plan,{enabled:true},0),plan)});
test('OFF freezes at source clock and never flattens shot layout/dimensions',()=>{const p=freezeAutomaticPlan(plan,{enabled:false,freeze_source_time:16},10);assert.deepEqual(p[0].keyframes,[{time:0,centerX:.5,centerY:.5}]);assert.equal(p[0].windowW,.25);assert.equal(p[1].windowW,.7);assert.deepEqual(p[2].split,{dividerX:.5});assert.equal(plan[0].keyframes.length,2)});

test('legacy OFF uses interpolated source-clock hold; ON leaves path unchanged',()=>{const k=[{time:0,centerX:.2,centerY:.4},{time:12,centerX:.8,centerY:.6}];assert.equal(freezeAutomaticKeyframes(k,{enabled:true},10),k);assert.deepEqual(freezeAutomaticKeyframes(k,{enabled:false,freeze_source_time:16},10),[{time:0,centerX:.5,centerY:.5}]);assert.equal(k.length,2)});

test('static smart crop keeps requested canvas scale and shares dynamic center-X convention',async()=>{const {SmartReframeService:S}=await import('../services/smartReframeService.js');const graph=S.buildSmartCropFilter([{time:0,centerX:.35,centerY:.4}],'9:16',854,480,12,2/3);assert.match(graph,/scale=720:1280/);assert.match(graph,/in_w\*0.35-out_w\/2/);assert.ok(!graph.includes('1080:1920'))});

test('OFF retains brief edge shots and cut times while clamping the hold inside each shot',()=>{
 const p=[
  {start:0,end:.133467,kind:'fit',windowW:.75,windowH:1,keyframes:[{time:0,centerX:.5,centerY:.5}]},
  {start:.133467,end:3.069733,kind:'solo',windowW:.316,windowH:1,keyframes:[{time:.133467,centerX:.3,centerY:.5},{time:3,centerX:.6,centerY:.5}]},
  {start:3.069733,end:5.94,kind:'group',windowW:1,windowH:1,split:{speaker1X:.22,speaker2X:.75,dividerX:.457},keyframes:[{time:3.069733,centerX:.5,centerY:.5}]},
  {start:5.94,end:6,kind:'fit',windowW:.75,windowH:1,keyframes:[{time:5.94,centerX:.5,centerY:.5}]}
 ];
 const before=JSON.stringify(p);const result=freezeAutomaticPlan(p,{enabled:false,freeze_source_time:12},10);
 assert.equal(result.length,4);assert.deepEqual(result.map(({start,end,kind,windowW,windowH})=>({start,end,kind,windowW,windowH})),p.map(({start,end,kind,windowW,windowH})=>({start,end,kind,windowW,windowH})));
 assert.deepEqual(result[2].split,p[2].split);assert.ok(result.every(s=>s.keyframes.length===1&&s.keyframes[0].time===s.start));assert.ok(result[1].keyframes[0].centerX>.3&&result[1].keyframes[0].centerX<.6);assert.equal(JSON.stringify(p),before);
});

test('OFF without a finite hold uses each shot start, never a previous-shot camera',()=>{
 const p=[{start:0,end:1,keyframes:[{time:0,centerX:.2,centerY:.4},{time:1,centerX:.8,centerY:.6}]},{start:1,end:2,keyframes:[{time:1,centerX:.7,centerY:.3},{time:2,centerX:.4,centerY:.5}]}];
 for(const state of [{enabled:false},{enabled:false,freeze_source_time:NaN},{enabled:false,freeze_source_time:Infinity}]){
  const result=freezeAutomaticPlan(p,state,10);assert.deepEqual(result[0].keyframes,[p[0].keyframes[0]]);assert.deepEqual(result[1].keyframes,[p[1].keyframes[0]]);
 }
});
