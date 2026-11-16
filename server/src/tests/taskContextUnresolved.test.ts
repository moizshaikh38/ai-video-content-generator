import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {SmartReframeService as S} from '../services/smartReframeService.js';
for(const name of ['basketball','kothu'])test(`real ${name} task context stays unresolved, not promoted by bodies alone`,()=>{
 const e=JSON.parse(fs.readFileSync(new URL(`./fixtures/${name}-unresolved-detections.json`,import.meta.url),'utf8'));
 assert.ok(e.samples.some((s:any)=>(s.persons||[]).length>0));
 for(const unresolvedContextPolicy of [undefined,'shared-subject-window'] as const){
  const p=S.computeShotComposition({rawSamples:e.samples,sceneCuts:e.scene_cuts,duration:e.duration,sourceWidth:e.source_width,sourceHeight:e.source_height,unresolvedContextPolicy});
  assert.ok(p.length>0);assert.ok(p.every(s=>s.contextStatus==='unresolved-preserved'&&s.windowW===1&&s.windowH===1));
 }
});
