import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SmartReframeService as S} from '../services/smartReframeService.js';
const evidence=JSON.parse(fs.readFileSync(new URL('./fixtures/stk-race-false-detections.json',import.meta.url),'utf8'));
// Measured local benchmark frames, not proof that detectors understand gameplay.
// Visual review placed the two face boxes on scenery/HUD, not real people.
test('transient scenery/HUD detections do not invent a person crop in real game footage',()=>{
 assert.equal(evidence.samples.length,48);
 assert.equal(evidence.samples.flatMap((s:any)=>s.faces).length,2);
 assert.equal(evidence.samples.flatMap((s:any)=>s.persons).length,20);
 for(const unresolvedContextPolicy of [undefined,'shared-subject-window'] as const){
  const plan=S.computeShotComposition({rawSamples:evidence.samples,sceneCuts:evidence.scene_cuts,duration:evidence.duration,sourceWidth:evidence.source_width,sourceHeight:evidence.source_height,unresolvedContextPolicy});
  assert.ok(plan.length>0);assert.ok(plan.every(s=>s.kind==='fit'&&s.windowW===1&&s.windowH===1&&s.contextStatus==='unresolved-preserved'));
 }
});
