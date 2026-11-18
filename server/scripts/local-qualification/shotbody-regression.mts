import fs from'node:fs';import assert from'node:assert/strict';import{SmartReframeService as S}from'../../src/services/smartReframeService.js';
for(const [folder,duration,expect]of [
 ['vireo-game-broll-whole-0731',10,'fit'],['vireo-panel-contain-mixed-0716',12,'fit'],['vireo-shotbody-mixed-0746',24,'fit'],['vireo-shotbody-uniform-0748',24,'solo']
]as const){const t=JSON.parse(fs.readFileSync('/downloads/'+folder+'/fresh-normal-track.json','utf8'));const p=S.explicitAutoLayoutPlan(t,{layout_mode_source:'auto'},duration)!;assert.equal(p[0].kind,expect);if(expect==='fit')assert.ok(p.every(s=>!s.split&&s.kind==='fit'));console.log(folder,p.map(s=>({start:s.start,end:s.end,kind:s.kind,split:!!s.split})));}
